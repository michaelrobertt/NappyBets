import { useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarDays,
  Database,
  Gauge,
  LayoutDashboard,
  ListFilter,
  Plus,
  Radio,
  Settings as SettingsIcon,
  Tags,
  Trophy,
  User,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type { PredictionStatus } from '../../shared/types';
import { PERIOD_LABEL } from '../../shared/types';
import { useApp, activeFilterCount } from '../state/app';
import { useRoute, navigate, VIEW_TITLES, type ViewName } from '../lib/router';
import { fmtNumber, fmtPercent } from '../lib/format';
import { DashboardPage } from '../pages/Dashboard';
import { HistoryPage } from '../pages/History';
import { CalendarPage } from '../pages/Calendar';
import { NewPredictionPage } from '../pages/NewPrediction';
import { DataPage } from '../pages/Data';
import { SettingsPage } from '../pages/Settings';
import { BandsPage } from '../pages/Bands';
import { EntityPage } from '../pages/Entity';
import { BookmakersPage, LeaguesPage, MarketsPage, PlayersPage, TeamsPage } from '../pages/Insights';
import { ExternalPage } from '../pages/External';
import { BankrollPage } from '../pages/Bankroll';

interface NavItem {
  view: ViewName;
  label: string;
  icon: React.ReactNode;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Registros',
    items: [
      { view: 'dashboard', label: 'Visão geral', icon: <LayoutDashboard size={16} /> },
      { view: 'history', label: 'Histórico de previsões', icon: <ListFilter size={16} /> },
      { view: 'calendar', label: 'Calendário', icon: <CalendarDays size={16} /> },
      { view: 'new', label: 'Nova previsão', icon: <Plus size={16} /> },
      { view: 'bankroll', label: 'Banca', icon: <Wallet size={16} /> },
    ],
  },
  {
    group: 'Desempenho',
    items: [
      { view: 'players', label: 'Jogadores', icon: <User size={16} /> },
      { view: 'teams', label: 'Times', icon: <Users size={16} /> },
      { view: 'leagues', label: 'Ligas', icon: <Trophy size={16} /> },
      { view: 'markets', label: 'Mercados e categorias', icon: <Tags size={16} /> },
      { view: 'bands', label: 'Faixas de probabilidade', icon: <Gauge size={16} /> },
      { view: 'bookmakers', label: 'Casas de referência', icon: <Building2 size={16} /> },
    ],
  },
  {
    group: 'Integrações',
    items: [
      { view: 'external', label: 'Mercados externos', icon: <Radio size={16} /> },
    ],
  },
  {
    group: 'Sistema',
    items: [
      { view: 'data', label: 'Gerenciamento de dados', icon: <Database size={16} /> },
      { view: 'settings', label: 'Configurações', icon: <SettingsIcon size={16} /> },
    ],
  },
];

const PERIODS = Object.keys(PERIOD_LABEL) as (keyof typeof PERIOD_LABEL)[];

export function Shell() {
  const { settings, filters, setFilters, resetFilters, analytics, info, error, ready } = useApp();
  const route = useRoute();
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [route.name, route.params.key]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        navigate('new');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (error && !analytics) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', padding: 32 }}>
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="row" style={{ gap: 10, marginBottom: 10 }}>
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
            <strong>Não foi possível carregar o aplicativo</strong>
          </div>
          <p className="small muted" style={{ marginBottom: 14 }}>
            {error}
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const entityOrigin: ViewName | null =
    route.name === 'entity'
      ? route.params.kind === 'team'
        ? 'teams'
        : route.params.kind === 'player'
          ? 'players'
          : route.params.kind === 'competition'
            ? 'leagues'
            : route.params.kind === 'category'
              ? 'markets'
              : route.params.kind === 'bookmaker'
                ? 'bookmakers'
                : 'dashboard'
      : null;
  const isActive = (view: ViewName) => route.name === view || entityOrigin === view;

  const competitions = (() => {
    if (!analytics) return [];
    const list = filters.sport
      ? analytics.facets.competitionsBySport[filters.sport] ?? []
      : analytics.facets.competitions;
    return [...list].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  })();

  const filterCount = activeFilterCount(filters);
  const summary = analytics?.summary;
  const showFilters = ['dashboard', 'history', 'players', 'teams', 'leagues', 'markets', 'bands', 'bookmakers', 'entity'].includes(
    route.name,
  );
  const title = VIEW_TITLES[route.name];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <div className="brand-title">Nappy Bets</div>
            <div className="brand-sub">análise esportiva</div>
          </div>
        </div>

        <div className="profile-card">
          <div className="avatar" style={{ borderColor: settings.avatarColor }}>
            {settings.avatar.startsWith('data:') ? (
              <img src={settings.avatar} alt="Avatar" />
            ) : (
              <span>{settings.avatar || '🎯'}</span>
            )}
          </div>
          <div className="profile-name">{settings.profileName}</div>
          <div className="profile-meta">{PERIOD_LABEL[filters.period]}</div>
          <div className="profile-stats">
            <div className="profile-stat">
              <span>Previsões</span>
              <strong>{fmtNumber(summary?.total ?? info?.totalPredictions ?? 0)}</strong>
            </div>
            <div className="profile-stat">
              <span>Acerto</span>
              <strong>{fmtPercent(summary?.hitRate ?? null, 0)}</strong>
            </div>
          </div>
          <button className="profile-link" onClick={() => navigate('settings')}>
            Personalizar perfil
          </button>
        </div>

        <nav className="nav">
          {NAV.map((group) => (
            <div className="nav-group" key={group.group}>
              <div className="nav-group-label">{group.group}</div>
              {group.items.map((item) => (
                <button
                  key={item.view}
                  className={`nav-item ${isActive(item.view) ? 'active' : ''}`}
                  onClick={() => navigate(item.view)}
                >
                  {item.icon}
                  <span className="grow">{item.label}</span>
                  {item.view === 'history' && (summary?.pending ?? 0) > 0 ? (
                    <span className="nav-badge">{summary?.pending}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span>v{info?.appVersion ?? '1.0.0'}</span>
          <button className="link-btn" onClick={() => navigate('data')} title="Gerenciamento de dados">
            <Database size={12} /> banco local
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-row">
            <div>
              <h1 className="page-title">{title?.title ?? 'Visão geral'}</h1>
              <div className="page-sub">{title?.subtitle ?? ''}</div>
            </div>
            <div className="topbar-actions">
              {info && info.demoPredictions > 0 ? <span className="tag">demo</span> : null}
              <span className="badge badge-neutral" title="Atalho: Ctrl+N">
                <Zap size={11} /> Ctrl+N
              </span>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('new')}>
                <Plus size={14} /> Nova previsão
              </button>
            </div>
          </div>

          {showFilters ? (
            <div className="filter-bar">
              <span className="filter-label">
                <Activity size={12} /> Filtros
              </span>

              <select
                className="select small"
                style={{ width: 150 }}
                value={filters.period}
                onChange={(event) =>
                  setFilters({
                    period: event.target.value as typeof filters.period,
                    from: event.target.value === 'custom' ? filters.from : null,
                    to: event.target.value === 'custom' ? filters.to : null,
                  })
                }
                aria-label="Período"
              >
                {PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {PERIOD_LABEL[period]}
                  </option>
                ))}
              </select>

              {filters.period === 'custom' ? (
                <>
                  <input
                    type="date"
                    className="input small"
                    style={{ width: 132 }}
                    value={filters.from ?? ''}
                    onChange={(event) => setFilters({ from: event.target.value || null })}
                    aria-label="Data inicial"
                  />
                  <input
                    type="date"
                    className="input small"
                    style={{ width: 132 }}
                    value={filters.to ?? ''}
                    onChange={(event) => setFilters({ to: event.target.value || null })}
                    aria-label="Data final"
                  />
                </>
              ) : null}

              <select
                className="select small"
                style={{ width: 150 }}
                value={filters.sport ?? ''}
                onChange={(event) => setFilters({ sport: event.target.value || null })}
                aria-label="Modalidade"
              >
                <option value="">Todas as modalidades</option>
                {(analytics?.facets.sports ?? []).map((sport) => (
                  <option key={sport} value={sport}>
                    {sport}
                  </option>
                ))}
              </select>

              <select
                className="select small"
                style={{ width: 180 }}
                value={filters.competition ?? ''}
                onChange={(event) => setFilters({ competition: event.target.value || null })}
                aria-label="Competição"
              >
                <option value="">Todas as competições</option>
                {competitions.map((competition) => (
                  <option key={competition} value={competition}>
                    {competition}
                  </option>
                ))}
              </select>

              <select
                className="select small"
                style={{ width: 160 }}
                value={filters.category ?? ''}
                onChange={(event) => setFilters({ category: event.target.value || null })}
                aria-label="Categoria"
              >
                <option value="">Todas as categorias</option>
                {(analytics?.facets.categories ?? []).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <select
                className="select small"
                style={{ width: 130 }}
                value={filters.status}
                onChange={(event) =>
                  setFilters({ status: event.target.value as PredictionStatus | 'all' })
                }
                aria-label="Status"
              >
                <option value="all">Todos os status</option>
                <option value="pending">Pendente</option>
                <option value="hit">Acertou</option>
                <option value="miss">Errou</option>
                <option value="void">Anulada</option>
              </select>

              {filterCount > 0 ? (
                <button className="btn btn-ghost btn-sm" onClick={resetFilters}>
                  Limpar filtros ({filterCount})
                </button>
              ) : null}

              <span className="small muted-3" style={{ marginLeft: 'auto' }}>
                {ready && summary ? `${fmtNumber(summary.total)} registros no recorte` : 'Carregando…'}
              </span>
            </div>
          ) : null}
        </header>

        <div className="content" ref={contentRef}>
          {!ready ? (
            <div className="stack">
              <div className="skeleton" style={{ height: 110 }} />
              <div className="skeleton" style={{ height: 260 }} />
            </div>
          ) : (
            <RouteContent route={route} />
          )}
        </div>
      </div>
    </div>
  );
}

function RouteContent({ route }: { route: ReturnType<typeof useRoute> }) {
  switch (route.name) {
    case 'history':
      return <HistoryPage />;
    case 'calendar':
      return <CalendarPage />;
    case 'new':
      return <NewPredictionPage key={route.params.id ?? 'new'} />;
    case 'bankroll':
      return <BankrollPage />;
    case 'data':
      return <DataPage />;
    case 'settings':
      return <SettingsPage />;
    case 'players':
      return <PlayersPage />;
    case 'teams':
      return <TeamsPage />;
    case 'leagues':
      return <LeaguesPage />;
    case 'markets':
      return <MarketsPage />;
    case 'bands':
      return <BandsPage />;
    case 'bookmakers':
      return <BookmakersPage />;
    case 'entity':
      return <EntityPage key={`${route.params.kind}-${route.params.key}`} />;
    case 'external':
      return <ExternalPage />;
    case 'dashboard':
    default:
      return <DashboardPage />;
  }
}
