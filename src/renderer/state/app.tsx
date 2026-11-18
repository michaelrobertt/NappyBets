import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Analytics, AppInfo, AppSettings, Filters } from '../../shared/types';
import type { BankrollOverview } from '../../shared/bankroll';
import { DEFAULT_SETTINGS, EMPTY_FILTERS } from '../../shared/types';
import { api, cleanError } from '../lib/api';

interface AppContextValue {
  ready: boolean;
  error: string | null;
  settings: AppSettings;
  filters: Filters;
  analytics: Analytics | null;
  bankroll: BankrollOverview | null;
  info: AppInfo | null;
  loading: boolean;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refresh: () => Promise<void>;
  refreshInfo: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [filters, setFiltersState] = useState<Filters>(EMPTY_FILTERS);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [bankroll, setBankroll] = useState<BankrollOverview | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const bankrollSeq = useRef(0);
  const initialized = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedSettings, loadedInfo] = await Promise.all([api.getSettings(), api.appInfo()]);
        if (cancelled) return;
        setSettings(loadedSettings);
        setInfo(loadedInfo);
        setFiltersState((prev) =>
          prev.period === 'all' ? { ...prev, period: loadedSettings.defaultPeriod } : prev,
        );
        setReady(true);
      } catch (loadError) {
        if (!cancelled) {
          setError(cleanError(loadError));
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || error) return;
    const current = ++seq.current;
    const timer = setTimeout(() => {
      api
        .buildAnalytics(filters, settings)
        .then((result) => {
          if (seq.current === current) setAnalytics(result);
        })
        .catch((loadError) => {
          if (seq.current === current) setError(cleanError(loadError));
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [filters, settings, ready, error]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
  }, [settings.theme, settings.accent]);

  const refreshInfo = useCallback(async () => {
    try {
      setInfo(await api.appInfo());
    } catch (refreshError) {
      setError(cleanError(refreshError));
    }
  }, []);

  const refresh = useCallback(async () => {
    const current = ++seq.current;
    const currentBankroll = ++bankrollSeq.current;
    try {
      const [result, , bankrollResult] = await Promise.all([
        api.buildAnalytics(filters, settings),
        api.appInfo().then(setInfo),
        api.getBankrollOverview(),
      ]);
      if (seq.current === current) setAnalytics(result);
      if (bankrollSeq.current === currentBankroll) setBankroll(bankrollResult);
    } catch (refreshError) {
      setError(cleanError(refreshError));
    }
  }, [filters, settings]);

  useEffect(() => {
    if (!ready || error) return;
    const current = ++bankrollSeq.current;
    const timer = setTimeout(() => {
      api
        .getBankrollOverview()
        .then((result) => {
          if (bankrollSeq.current === current) setBankroll(result);
        })
        .catch((loadError) => {
          if (bankrollSeq.current === current) setError(cleanError(loadError));
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [ready, error, settings.initialBankroll, settings.bankrollStartDate]);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.sport !== undefined && patch.sport !== prev.sport && patch.competition === undefined) {
        next.competition = null;
        next.subject = null;
      }
      if (patch.competition !== undefined) next.subject = null;
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({ ...EMPTY_FILTERS, period: settings.defaultPeriod });
  }, [settings.defaultPeriod]);

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const saved = await api.saveSettings(patch);
    setSettings(saved);
  }, []);

  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      error,
      settings,
      filters,
      analytics,
      bankroll,
      info,
      loading: !analytics && !error,
      setFilters,
      resetFilters,
      saveSettings,
      refresh,
      refreshInfo,
    }),
    [ready, error, settings, filters, analytics, bankroll, info, setFilters, resetFilters, saveSettings, refresh, refreshInfo],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp precisa estar dentro de AppProvider.');
  return context;
}

export function activeFilterCount(filters: Filters): number {
  let count = 0;
  if (filters.period !== 'all') count += 1;
  if (filters.sport) count += 1;
  if (filters.competition) count += 1;
  if (filters.category) count += 1;
  if (filters.status !== 'all') count += 1;
  if (filters.bookmaker) count += 1;
  if (filters.subject) count += 1;
  if (filters.search) count += 1;
  return count;
}
