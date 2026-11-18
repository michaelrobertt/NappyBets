import { useMemo, useState } from 'react';
import { ArrowRight, BarChart3, ChevronDown, ChevronUp, Users } from 'lucide-react';
import type { Aggregate } from '../../shared/types';
import { useApp } from '../state/app';
import { useNavigate } from '../lib/useNavigate';
import { fmtBrier, fmtNumber, fmtPercent } from '../lib/format';
import { EmptyState, SearchInput } from '../components/ui';

type SortKey = 'rate' | 'sample' | 'name' | 'brier';

interface ExplorerProps {
  aggregates: Aggregate[];
  kind: 'competition' | 'sport' | 'category' | 'team' | 'player' | 'bookmaker';
  nameHeader: string;
  emptyTitle: string;
  emptyMessage: string;
  showSport?: boolean;
}

export function AggregateExplorer({
  aggregates,
  kind,
  nameHeader,
  emptyTitle,
  emptyMessage,
  showSport = true,
}: ExplorerProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('rate');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [hideLowSample, setHideLowSample] = useState(false);
  const { settings } = useApp();
  const minSample = settings.minSample;
  const navigate = useNavigate();

  const lowSampleCount = useMemo(
    () => aggregates.filter((item) => item.settled > 0 && item.settled < minSample).length,
    [aggregates, minSample],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = aggregates.filter(
      (item) =>
        (!term ||
          item.label.toLowerCase().includes(term) ||
          item.sports.some((sport) => sport.toLowerCase().includes(term))) &&
        (!hideLowSample || item.settled >= minSample),
    );
    return [...filtered].sort((a, b) => {
      if (sort !== 'name') {
        // Grupos com amostra insuficiente nunca aparecem como melhores desempenhos.
        const reliabA = a.settled >= minSample ? 0 : 1;
        const reliabB = b.settled >= minSample ? 0 : 1;
        if (reliabA !== reliabB) return reliabA - reliabB;
      }
      let cmp = 0;
      switch (sort) {
        case 'name':
          cmp = a.label.localeCompare(b.label, 'pt-BR');
          break;
        case 'sample':
          cmp = a.settled - b.settled;
          break;
        case 'brier':
          cmp = (b.brier ?? 1) - (a.brier ?? 1);
          break;
        case 'rate':
        default:
          cmp = (a.hitRate ?? -1) - (b.hitRate ?? -1);
          break;
      }
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [aggregates, search, sort, dir, hideLowSample, minSample]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const header = (label: string, key: SortKey, className = '') => (
    <th className={`sortable ${className}`} onClick={() => toggleSort(key)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {sort === key ? dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} /> : null}
      </span>
    </th>
  );

  const open = (item: Aggregate) => {
    if (kind === 'competition') {
      navigate('entity', { kind, key: `${item.sports[0] ?? ''}::${item.label}` });
    } else {
      navigate('entity', { kind, key: item.key });
    }
  };

  const maxRate = Math.max(100, ...rows.map((row) => row.hitRate ?? 0));

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="row wrap" style={{ gap: 10, padding: 14 }}>
        <SearchInput value={search} onChange={setSearch} placeholder={`Buscar em ${nameHeader.toLowerCase()}...`} />
        <span className="small muted-3">{fmtNumber(rows.length)} grupo(s)</span>
        {lowSampleCount > 0 ? (
          <label className="check-row" style={{ fontSize: 11.5 }}>
            <input
              type="checkbox"
              checked={hideLowSample}
              onChange={(event) => setHideLowSample(event.target.checked)}
            />
            Ocultar amostra baixa (&lt; {minSample})
          </label>
        ) : null}
        <span className="small muted-3" style={{ marginLeft: 'auto' }}>
          Ordenado por {sort === 'rate' ? 'taxa de acerto' : sort === 'sample' ? 'amostra' : sort === 'brier' ? 'Brier' : 'nome'}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<BarChart3 size={20} />} title={emptyTitle} message={emptyMessage} />
      ) : (
        <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="table">
            <thead>
              <tr>
                {header(nameHeader, 'name')}
                {showSport ? <th>Modalidade</th> : null}
                {header('Previsões', 'sample', 'num')}
                <th className="num">Acertos</th>
                <th className="num">Erros</th>
                {header('Taxa de acerto', 'rate')}
                {header('Brier', 'brier', 'num')}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.key} className="clickable" onClick={() => open(item)}>
                  <td>
                    <div className="cell-title row" style={{ gap: 6 }}>
                      {item.label}
                      {item.settled > 0 && item.settled < minSample ? (
                        <span className="badge badge-pending" title={`Menos de ${minSample} resultados concluídos`}>
                          amostra baixa
                        </span>
                      ) : null}
                    </div>
                    <div className="cell-sub">
                      {item.settled} concluídas · {item.pending} pendentes
                      {item.voids > 0 ? ` · ${item.voids} anuladas` : ''}
                    </div>
                  </td>
                  {showSport ? <td className="muted nowrap">{item.sports.join(' · ') || '—'}</td> : null}
                  <td className="num">{fmtNumber(item.total)}</td>
                  <td className="num pos">{fmtNumber(item.hits)}</td>
                  <td className="num neg">{fmtNumber(item.misses)}</td>
                  <td style={{ minWidth: 170 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <div className={`progress ${(item.hitRate ?? 0) < 50 ? 'danger' : ''}`} style={{ flex: 1 }}>
                        <span style={{ width: `${((item.hitRate ?? 0) / maxRate) * 100}%` }} />
                      </div>
                      <strong className="mono" style={{ minWidth: 48, textAlign: 'right', fontSize: 12.5 }}>
                        {fmtPercent(item.hitRate)}
                      </strong>
                    </div>
                  </td>
                  <td className="num muted">{fmtBrier(item.brier)}</td>
                  <td className="actions">
                    <ArrowRight size={13} style={{ color: 'var(--text-3)' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AnalyticsHeader({
  title,
  description,
  extra,
}: {
  title: string;
  description: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="row-between wrap" style={{ gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 16 }}>{title}</h2>
        <p className="small muted-3" style={{ marginTop: 2, maxWidth: 720 }}>
          {description}
        </p>
      </div>
      {extra}
    </div>
  );
}

export function PlayersPage() {
  const { analytics, settings } = useApp();
  return (
    <div className="stack">
      <AnalyticsHeader
        title="Desempenho por jogador"
        description={`Jogadores de League of Legends, CS2 e demais modalidades com previsões registradas, respeitando os filtros globais. Amostra mínima configurada: ${settings.minSample}. Clique em um jogador para abrir a análise detalhada.`}
      />
      <AggregateExplorer
        aggregates={analytics?.byPlayer ?? []}
        kind="player"
        nameHeader="Jogador"
        showSport={false}
        emptyTitle="Nenhum jogador analisado"
        emptyMessage="Registre previsões com o tipo 'Jogador' para ver o desempenho individual. Você pode começar pelo formulário de nova previsão."
      />
    </div>
  );
}

export function TeamsPage() {
  const { analytics, settings } = useApp();
  return (
    <div className="stack">
      <AnalyticsHeader
        title="Desempenho por time"
        description={`Comparativo entre equipes de League of Legends, CS2 e esportes tradicionais. Amostra mínima para destaques: ${settings.minSample}. Selecione um time para ver a análise completa.`}
        extra={
          <span className="row small muted-3" style={{ gap: 5 }}>
            <Users size={13} /> {analytics?.byTeam.length ?? 0} times
          </span>
        }
      />
      <AggregateExplorer
        aggregates={analytics?.byTeam ?? []}
        kind="team"
        nameHeader="Time"
        showSport={false}
        emptyTitle="Nenhum time analisado"
        emptyMessage="Registre previsões com o tipo 'Time' para comparar o desempenho das equipes."
      />
    </div>
  );
}

export function LeaguesPage() {
  const { analytics, settings } = useApp();
  return (
    <div className="stack">
      <AnalyticsHeader
        title="Desempenho por liga e competição"
        description={`Competições com o mesmo nome em modalidades diferentes permanecem separadas. Amostra mínima para destaques: ${settings.minSample}.`}
      />
      <AggregateExplorer
        aggregates={analytics?.byCompetition ?? []}
        kind="competition"
        nameHeader="Competição"
        emptyTitle="Nenhuma competição analisada"
        emptyMessage="Preencha o campo competição ao registrar previsões para acompanhar o desempenho por liga."
      />
    </div>
  );
}

export function MarketsPage() {
  const { analytics, settings } = useApp();
  return (
    <div className="stack">
      <AnalyticsHeader
        title="Mercados e categorias"
        description={`Precisão por tipo de mercado. Categorias com amostra menor que ${settings.minSample} resultados concluídos não devem ser tratadas como tendência.`}
      />
      <AggregateExplorer
        aggregates={analytics?.byCategory ?? []}
        kind="category"
        nameHeader="Categoria"
        emptyTitle="Nenhuma categoria registrada"
        emptyMessage="Toda previsão possui uma categoria/mercado. Registre previsões para comparar a precisão de cada tipo de mercado."
      />
    </div>
  );
}

export function BookmakersPage() {
  const { analytics } = useApp();
  return (
    <div className="stack">
      <div className="alert alert-info">
        <span>
          Esta área é apenas um registro histórico de referência. O Nappy Bets não executa apostas nem se conecta a
          plataformas: a banca e as movimentações são registradas manualmente por você.
        </span>
      </div>
      <AnalyticsHeader
        title="Casas de referência"
        description="Compare a precisão das previsões associadas a cada casa usada como referência de linha. A casa não interfere no cálculo do resultado: acertos e erros vêm do status que você registra."
      />
      <AggregateExplorer
        aggregates={analytics?.byBookmaker ?? []}
        kind="bookmaker"
        nameHeader="Casa de referência"
        showSport={false}
        emptyTitle="Nenhuma casa cadastrada"
        emptyMessage="Informe a casa de referência (opcional) ao registrar uma previsão para preencher esta análise."
      />
    </div>
  );
}
