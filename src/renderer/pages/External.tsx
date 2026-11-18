import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CloudDownload,
  Info,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type {
  ExternalEventGroup,
  ExternalMarket,
  ExternalMarketStatus,
  ExternalOutcome,
  ExternalPlatform,
  ExternalStatus,
} from '../../shared/external';
import {
  MARKET_KIND_LABEL,
  MARKET_STATUS_LABEL,
  PLATFORM_LABEL,
  groupExternalMarkets,
  groupMarketsByKind,
} from '../../shared/external';
import { buildPredictionDraft } from '../../shared/market-draft';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime, fmtNumber } from '../lib/format';
import { setPredictionDraft } from '../lib/prefill';
import { useNavigate } from '../lib/useNavigate';
import { useToast } from '../lib/toast';
import { EmptyState, KpiCard, Modal, SearchInput, Segmented, Skeleton } from '../components/ui';

const SPORT_ORDER = [
  'League of Legends',
  'CS2',
  'Dota 2',
  'Valorant',
  'Futebol',
  'Basquete',
  'Tênis',
  'MMA',
  'Vôlei',
  'Outros',
];

const STATUS_OPTIONS: { value: ExternalMarketStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'live', label: 'Ao vivo' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'resolved', label: 'Encerrados' },
];

function compactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1_000_000) return `US$ ${(value / 1_000_000).toFixed(1)} mi`;
  if (value >= 1_000) return `US$ ${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)} mil`;
  return `US$ ${value.toFixed(0)}`;
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function statusTagClass(status: ExternalMarketStatus): string {
  return status === 'live' ? 'badge badge-hit' : status === 'pending' ? 'badge badge-pending' : 'badge badge-neutral';
}

function sportBadge(sport: string, isEsports: boolean) {
  return (
    <span className={`ext-sport ${isEsports ? 'is-esports' : ''}`}>
      {isEsports ? 'ESPORT' : 'ESPORTE'} · {sport}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Mercado                                                             */
/* ------------------------------------------------------------------ */

function MarketRow({
  market,
  onPick,
}: {
  market: ExternalMarket;
  onPick: (market: ExternalMarket, outcome: ExternalOutcome) => void;
}) {
  const outcomes = market.outcomes.slice(0, 4);
  const extra = market.outcomes.length - outcomes.length;

  return (
    <div className="ext-market">
      <div className="ext-market-main">
        <div className="ext-market-title">
          {market.title}
          {market.subtitle ? <span className="ext-market-sub">{market.subtitle}</span> : null}
        </div>
        <div className="ext-outcomes">
          {outcomes.map((outcome) => (
            <button
              type="button"
              key={`${outcome.name}-${outcome.tokenId ?? ''}`}
              className={`ext-outcome ${
                market.status === 'resolved' && market.result === outcome.name ? 'winner' : ''
              } ${outcome.price !== null && outcome.price >= 0.5 ? 'leading' : ''}`}
              title={`Registrar aposta em ${outcome.name} (${pct(outcome.price)})`}
              onClick={() => onPick(market, outcome)}
            >
              <span>{outcome.name}</span>
              <b>{pct(outcome.price)}</b>
              <Plus size={10} className="ext-outcome-add" />
            </button>
          ))}
          {extra > 0 ? <span className="ext-more">+{extra}</span> : null}
        </div>
        <div className="ext-market-meta">
          <span>{MARKET_KIND_LABEL[market.kind]}</span>
          <span>Vol. {compactUsd(market.volume)}</span>
          {market.closesAt ? <span>Fecha {fmtDate(market.closesAt)}</span> : null}
          {market.result ? <span className="pos">Resultado: {market.result}</span> : null}
        </div>
      </div>
      <div className="ext-market-side">
        <span className={statusTagClass(market.status)}>{MARKET_STATUS_LABEL[market.status]}</span>
        <button
          className="btn btn-icon"
          title="Abrir mercado na plataforma"
          aria-label={`Abrir ${market.title} em ${PLATFORM_LABEL[market.platform]}`}
          onClick={() => window.open(market.url, '_blank', 'noopener,noreferrer')}
        >
          <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}

function KindSection({
  label,
  markets,
  onPick,
  defaultOpen,
}: {
  label: string;
  markets: ExternalMarket[];
  onPick: (market: ExternalMarket, outcome: ExternalOutcome) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? markets : markets.slice(0, 20);
  return (
    <details className="ext-kind" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span>{label}</span>
        <span className="ext-kind-count">{markets.length}</span>
      </summary>
      {open ? (
        <div className="ext-kind-body">
          {visible.map((market) => (
            <MarketRow key={`${market.platform}:${market.id}`} market={market} onPick={onPick} />
          ))}
          {markets.length > visible.length ? (
            <button className="btn btn-sm ext-more-btn" onClick={() => setExpanded(true)}>
              Mostrar mais {markets.length - visible.length} mercados
            </button>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

function EventCard({
  group,
  defaultOpen,
  onOpenPicker,
  onPick,
}: {
  group: ExternalEventGroup;
  defaultOpen: boolean;
  onOpenPicker: (group: ExternalEventGroup) => void;
  onPick: (market: ExternalMarket, outcome: ExternalOutcome) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sections = useMemo(() => groupMarketsByKind(group.markets), [group.markets]);
  const hasWinner = sections.some((section) => section.kind === 'winner');

  return (
    <div className={`ext-event ${open ? 'open' : ''}`}>
      <div className="ext-event-head">
        <button className="ext-event-toggle" onClick={() => setOpen((prev) => !prev)} aria-expanded={open}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <div className="ext-event-titles">
            <div className="ext-event-title">{group.title || 'Evento sem título'}</div>
            <div className="ext-event-sub">
              {sportBadge(group.sport, group.isEsports)}
              {group.subtitle ? <span>{group.subtitle}</span> : null}
              <span className="ext-platform">{PLATFORM_LABEL[group.platform]}</span>
            </div>
          </div>
          <div className="ext-event-counts">
            {group.live > 0 ? <span className="badge badge-hit">{group.live} ao vivo</span> : null}
            {group.pending > 0 ? <span className="badge badge-pending">{group.pending} pend.</span> : null}
            {group.resolved > 0 ? <span className="badge badge-neutral">{group.resolved} enc.</span> : null}
            {group.closesAt ? <span className="ext-close-date">{fmtDateTime(group.closesAt)}</span> : null}
          </div>
        </button>
        <button
          className="btn btn-sm ext-event-bet"
          title="Escolher um mercado deste evento para registrar uma aposta"
          onClick={() => onOpenPicker(group)}
        >
          <Plus size={12} /> Aposta
        </button>
      </div>
      {open ? (
        <div className="ext-event-body">
          <div className="ext-event-hint">
            <Target size={12} /> Clique em um resultado para abrir a nova previsão já preenchida.
          </div>
          {sections.map((section) => (
            <KindSection
              key={section.kind}
              label={section.label}
              markets={section.markets}
              onPick={onPick}
              defaultOpen={section.kind === 'winner' || !hasWinner}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seletor de mercado do evento                                        */
/* ------------------------------------------------------------------ */

function MarketPicker({
  group,
  onClose,
  onPick,
}: {
  group: ExternalEventGroup;
  onClose: () => void;
  onPick: (market: ExternalMarket, outcome: ExternalOutcome) => void;
}) {
  const sections = useMemo(() => groupMarketsByKind(group.markets), [group.markets]);
  return (
    <Modal
      title={group.title || 'Escolher mercado'}
      subtitle={
        <span className="row wrap" style={{ gap: 8 }}>
          {sportBadge(group.sport, group.isEsports)}
          <span className="ext-platform">{PLATFORM_LABEL[group.platform]}</span>
          {group.closesAt ? <span>Fecha {fmtDateTime(group.closesAt)}</span> : null}
        </span>
      }
      onClose={onClose}
      size="lg"
      footer={
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
      }
    >
      <div className="stack">
        <div className="ext-event-hint">
          <Target size={12} /> Escolha o resultado que você quer registrar. Nada é enviado à plataforma.
        </div>
        {sections.map((section) => (
          <div key={section.kind} className="ext-picker-section">
            <div className="ext-picker-section-title">
              {section.label} <span className="ext-kind-count">{section.markets.length}</span>
            </div>
            {section.markets.map((market) => (
              <div key={`${market.platform}:${market.id}`} className="ext-picker-market">
                <div className="ext-picker-title">
                  {market.title}
                  {market.subtitle ? <span className="ext-market-sub">{market.subtitle}</span> : null}
                </div>
                <div className="ext-picker-outcomes">
                  {market.outcomes.map((outcome) => (
                    <button
                      key={`${outcome.name}-${outcome.tokenId ?? ''}`}
                      type="button"
                      className={`ext-pick-outcome ${
                        market.status === 'resolved' && market.result === outcome.name ? 'winner' : ''
                      }`}
                      onClick={() => onPick(market, outcome)}
                    >
                      <span>{outcome.name}</span>
                      <b>{pct(outcome.price)}</b>
                    </button>
                  ))}
                </div>
                <div className="ext-picker-meta">
                  <span>Vol. {compactUsd(market.volume)}</span>
                  <button className="btn-link" onClick={() => window.open(market.url, '_blank', 'noopener,noreferrer')}>
                    Ver na {PLATFORM_LABEL[market.platform]}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de mercados                                                   */
/* ------------------------------------------------------------------ */

function MarketsView({
  markets,
  loading,
  onSync,
  onPick,
  onOpenPicker,
}: {
  markets: ExternalMarket[];
  loading: boolean;
  onSync: () => void;
  onPick: (market: ExternalMarket, outcome: ExternalOutcome) => void;
  onOpenPicker: (group: ExternalEventGroup) => void;
}) {
  const [platform, setPlatform] = useState<ExternalPlatform | 'all'>('all');
  const [status, setStatus] = useState<ExternalMarketStatus | 'all'>('all');
  const [sport, setSport] = useState<string>('all');
  const [esportsOnly, setEsportsOnly] = useState(false);
  const [includeOther, setIncludeOther] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(24);

  const sports = useMemo(() => {
    const found = new Set(markets.map((market) => market.sport));
    return [...found].sort((a, b) => {
      const indexA = SPORT_ORDER.indexOf(a);
      const indexB = SPORT_ORDER.indexOf(b);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB) || a.localeCompare(b, 'pt-BR');
    });
  }, [markets]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return markets.filter((market) => {
      if (platform !== 'all' && market.platform !== platform) return false;
      if (status !== 'all' && market.status !== status) return false;
      if (sport !== 'all' && market.sport !== sport) return false;
      if (esportsOnly && !market.isEsports) return false;
      if (!includeOther && sport === 'all' && market.sport === 'Outros') return false;
      if (
        term &&
        !`${market.title} ${market.eventTitle} ${market.subtitle} ${market.eventSubtitle} ${market.sport}`
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [markets, platform, status, sport, esportsOnly, includeOther, search]);

  const groups = useMemo(() => groupExternalMarkets(filtered), [filtered]);
  const visible = groups.slice(0, limit);

  useEffect(() => {
    setLimit(24);
  }, [platform, status, sport, esportsOnly, includeOther, search]);

  const counts = useMemo(
    () => ({
      live: filtered.filter((market) => market.status === 'live').length,
      pending: filtered.filter((market) => market.status === 'pending').length,
      resolved: filtered.filter((market) => market.status === 'resolved').length,
    }),
    [filtered],
  );

  return (
    <div className="stack">
      <div className="kpi-grid">
        <KpiCard
          label="Mercados ao vivo"
          value={fmtNumber(counts.live)}
          sub={`${fmtNumber(filtered.length)} mercados no filtro atual`}
          icon={<Radio size={16} />}
        />
        <KpiCard
          label="Pendentes"
          value={fmtNumber(counts.pending)}
          sub="Aguardando início ou resultado"
          icon={<Clock3 size={16} />}
        />
        <KpiCard
          label="Encerrados"
          value={fmtNumber(counts.resolved)}
          sub="Com resultado já definido"
          icon={<CheckCircle2 size={16} />}
        />
        <KpiCard
          label="Eventos monitorados"
          value={fmtNumber(groups.length)}
          sub="Clique em um evento ou resultado para registrar"
          icon={<Target size={16} />}
        />
      </div>

      <div className="card card-tight">
        <div className="ext-filters">
          <select
            className="select"
            value={platform}
            onChange={(event) => setPlatform(event.target.value as typeof platform)}
          >
            <option value="all">Todas as plataformas</option>
            <option value="polymarket">Polymarket</option>
            <option value="kalshi">Kalshi</option>
          </select>
          <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          <select className="select" value={sport} onChange={(event) => setSport(event.target.value)}>
            <option value="all">Todos os esportes</option>
            {sports
              .filter((item) => includeOther || item !== 'Outros')
              .map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
          </select>
          <label className="ext-check">
            <input type="checkbox" checked={esportsOnly} onChange={(event) => setEsportsOnly(event.target.checked)} />
            Só esports
          </label>
          <label className="ext-check">
            <input
              type="checkbox"
              checked={includeOther}
              onChange={(event) => setIncludeOther(event.target.checked)}
            />
            Incluir outros assuntos
          </label>
          <div className="ext-filter-search">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar time, campeonato ou mercado" />
          </div>
        </div>
      </div>

      <div className="ext-banner">
        <Target size={16} />
        <div>
          <strong>Clique em uma partida ou em um resultado para preencher uma aposta manualmente.</strong> O Nappy Bets
          monta a previsão com modalidade, competição, evento, resultado e probabilidade implícita do mercado; você
          revisa e salva. Nenhuma aposta é feita ou enviada às plataformas.
        </div>
      </div>

      {loading ? (
        <div className="card stack">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} height={56} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<CloudDownload size={20} />}
          title="Nenhum mercado encontrado"
          message={
            filtered.length === 0
              ? 'Sincronize para buscar os mercados mais movimentados da Polymarket e da Kalshi, ou ajuste os filtros.'
              : 'Nenhum mercado corresponde aos filtros atuais.'
          }
          action={
            <button className="btn btn-primary" onClick={onSync}>
              <RefreshCw size={14} /> Sincronizar agora
            </button>
          }
        />
      ) : (
        <div className="stack">
          <div className="ext-result-line">
            <span>
              {fmtNumber(groups.length)} eventos · {fmtNumber(filtered.length)} mercados
            </span>
            <span className="small muted-3">Clique em “Aposta” para escolher o mercado do evento.</span>
          </div>
          {visible.map((group, index) => (
            <EventCard
              key={group.key}
              group={group}
              defaultOpen={index < 2}
              onOpenPicker={onOpenPicker}
              onPick={onPick}
            />
          ))}
          {groups.length > visible.length ? (
            <button className="btn" onClick={() => setLimit((prev) => prev + 24)}>
              Mostrar mais eventos ({groups.length - visible.length} restantes)
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export function ExternalPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ExternalStatus | null>(null);
  const [markets, setMarkets] = useState<ExternalMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [picker, setPicker] = useState<ExternalEventGroup | null>(null);
  const seq = useRef(0);
  const syncingRef = useRef(false);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const result = await api.getExternalMarkets({
        platform: 'all',
        status: 'all',
        sport: null,
        esportsOnly: false,
        search: '',
        limit: 4000,
      });
      if (id !== seq.current) return;
      setMarkets(result.markets);
      setStatus(result.status);
      setSyncing(result.status.syncing.length > 0);
      syncingRef.current = result.status.syncing.length > 0;
      setError(null);
    } catch (err) {
      if (id === seq.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = api.onExternalUpdated((next) => {
      setStatus(next);
      const wasSyncing = syncingRef.current;
      syncingRef.current = next.syncing.length > 0;
      setSyncing(next.syncing.length > 0);
      if (wasSyncing && next.syncing.length === 0) void load();
    });
    return off;
  }, [load]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const reports = await api.syncExternal('all');
      const marketCount = reports.reduce((sum, report) => sum + report.markets, 0);
      const errors = reports.flatMap((report) => report.errors);
      if (errors.length > 0) toast.error(errors[0]!);
      else toast.success(`Sincronização concluída: ${marketCount} mercados atualizados.`);
      await load();
      setStatus(await api.getExternalStatus());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }, [load, toast]);

  const handlePick = useCallback(
    (market: ExternalMarket, outcome: ExternalOutcome) => {
      setPredictionDraft(buildPredictionDraft(market, outcome));
      setPicker(null);
      navigate('new');
    },
    [navigate],
  );

  const statusError = status
    ? [status.polymarket.lastError, status.kalshi.lastError].filter(Boolean).join(' • ')
    : null;

  return (
    <div className="stack">
      <div className="ext-toolbar">
        <span className="badge badge-neutral">Somente leitura</span>
        <div className="ext-toolbar-right">
          <span className="ext-sync-state">
            {syncing
              ? 'Sincronizando…'
              : status?.polymarket.lastSyncAt || status?.kalshi.lastSyncAt
                ? `Última sync: ${fmtDateTime(
                    [status.polymarket.lastSyncAt, status.kalshi.lastSyncAt]
                      .filter(Boolean)
                      .sort()
                      .at(-1) ?? null,
                  )}`
                : 'Ainda não sincronizado'}
          </span>
          <button className="btn btn-primary btn-sm" disabled={syncing} onClick={() => void sync()}>
            <RefreshCw size={13} className={syncing ? 'spin' : ''} /> {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="ext-banner danger">
          <Info size={16} />
          <div>{error}</div>
        </div>
      ) : null}
      {statusError ? (
        <div className="ext-banner danger">
          <Info size={16} />
          <div>
            <strong>Falha na última sincronização.</strong> {statusError}
          </div>
        </div>
      ) : null}

      <MarketsView
        markets={markets}
        loading={loading}
        onSync={() => void sync()}
        onPick={handlePick}
        onOpenPicker={setPicker}
      />

      <div className="ext-footnote">
        <ShieldCheck size={14} /> Integração somente leitura via APIs públicas da Polymarket e da Kalshi. Nenhuma
        aposta é realizada pelo Nappy Bets; o registro é manual e usa a probabilidade implícita do mercado como ponto de
        partida.
      </div>

      {picker ? <MarketPicker group={picker} onClose={() => setPicker(null)} onPick={handlePick} /> : null}
    </div>
  );
}
