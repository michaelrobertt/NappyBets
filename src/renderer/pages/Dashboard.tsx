import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Layers,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Radio,
  Wallet,
} from 'lucide-react';
import type { Aggregate } from '../../shared/types';
import { PERIOD_LABEL } from '../../shared/types';
import { useApp, activeFilterCount } from '../state/app';
import { useNavigate } from '../lib/useNavigate';
import {
  fmtBrier,
  fmtDateTime,
  fmtMoney,
  fmtMoneySigned,
  fmtNumber,
  fmtPercent,
  fmtSigned,
  relativeDay,
  fmtTime,
} from '../lib/format';
import { KpiCard, InfoTip, EmptyState, Skeleton } from '../components/ui';
import { CalibrationChart, DistributionBar, PerformanceChart } from '../components/charts';
import { BankrollSparkline } from '../components/bankroll';
import { api } from '../lib/api';
import type { ExternalStatus } from '../../shared/external';
import { PLATFORM_LABEL } from '../../shared/external';

export function DashboardPage() {
  const { analytics, bankroll, filters, settings, loading, info } = useApp();
  const navigate = useNavigate();

  const worstBand = useMemo(() => {
    if (!analytics) return null;
    const bands = analytics.calibration.bands.filter((band) => band.count > 0 && band.hitRate !== null);
    if (!bands.length) return null;
    return bands.reduce((worst, band) => {
      const gap = Math.abs((band.hitRate ?? 0) - band.expected);
      const worstGap = Math.abs((worst.hitRate ?? 0) - worst.expected);
      return gap > worstGap ? band : worst;
    }, bands[0]!);
  }, [analytics]);

  if (loading || !analytics) {
    return (
      <div className="stack">
        <div className="kpi-grid">
          {[0, 1, 2, 3].map((index) => (
            <div className="kpi" key={index}>
              <Skeleton height={12} width="60%" />
              <div style={{ height: 10 }} />
              <Skeleton height={28} width="70%" />
              <div style={{ height: 8 }} />
              <Skeleton height={10} width="50%" />
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
          <div className="card">
            <Skeleton height={240} />
          </div>
          <div className="card">
            <Skeleton height={240} />
          </div>
        </div>
      </div>
    );
  }

  const { summary, highlights } = analytics;
  const dimensionLabel =
    highlights.dimension === 'competition'
      ? 'competições'
      : highlights.dimension === 'sport'
        ? 'modalidades'
        : 'categorias';
  const hasActiveFilters = activeFilterCount(filters) > 0;

  const openEntity = (item: Aggregate) => {
    if (highlights.dimension === 'competition') {
      navigate('entity', { kind: 'competition', key: `${item.sports[0] ?? ''}::${item.label}` });
    } else {
      navigate('entity', { kind: highlights.dimension, key: item.key });
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {info && info.demoPredictions > 0 ? (
        <div className="alert alert-info">
          <Sparkles size={15} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            {fmtNumber(info.demoPredictions)} previsões de demonstração estão carregadas. Elas existem apenas para
            você explorar os indicadores — apague-as em Configurações ou Gerenciamento de dados quando começar a
            registrar dados reais.
          </span>
        </div>
      ) : null}

      <div className="kpi-grid">
        <KpiCard
          label="Previsões concluídas"
          value={fmtNumber(summary.settled)}
          sub={`${fmtNumber(summary.hits)} acertos · ${fmtNumber(summary.misses)} erros`}
          icon={<CheckCircle2 size={16} />}
          accent
          tip="Somente previsões com resultado confirmado (acertou ou errou). Pendentes e anuladas não entram."
        />
        <KpiCard
          label="Previsões registradas"
          value={fmtNumber(summary.total)}
          sub={`${fmtNumber(summary.pending)} pendentes · ${fmtNumber(summary.voids)} anuladas`}
          icon={<Layers size={16} />}
          tip="Total de previsões no recorte selecionado, incluindo pendentes e anuladas."
        />
        <KpiCard
          label="Brier Score médio"
          value={fmtBrier(summary.brier)}
          sub={`Amostra de ${fmtNumber(summary.brierSample)} · menor é melhor`}
          icon={<Gauge size={16} />}
          tip="Média de (probabilidade estimada − resultado observado)². Acertos valem 1, erros valem 0. 0 é perfeito; 0,25 equivale a prever 50% em tudo."
        />
        <KpiCard
          label="Taxa de acerto"
          value={summary.hitRate === null ? '—' : fmtNumber(summary.hitRate, 1)}
          suffix={summary.hitRate === null ? undefined : '%'}
          sub={`Acertos ÷ (acertos + erros) · ${fmtNumber(summary.hits)}/${fmtNumber(summary.settled)}`}
          icon={<Target size={16} />}
          tip="Acertos divididos por acertos + erros. Pendentes e anuladas são ignoradas no cálculo."
        />
      </div>

      {bankroll ? (
        <div className="card bankroll-dashboard">
          <div className="bankroll-dashboard-main">
            <div className="kpi-label">
              <Wallet size={14} /> Banca disponível
            </div>
            <div className={`bankroll-dashboard-value ${bankroll.summary.available < 0 ? 'neg' : ''}`}>
              {fmtMoney(bankroll.summary.available)}
            </div>
            <div className="bankroll-sub">
              Banca total {fmtMoney(bankroll.summary.current)} · lucro{' '}
              <strong className={bankroll.summary.netProfit >= 0 ? 'pos' : 'neg'}>
                {fmtMoneySigned(bankroll.summary.netProfit)}
              </strong>{' '}
              · ROI {bankroll.summary.roi === null ? '—' : `${fmtNumber(bankroll.summary.roi, 1)}%`}
            </div>
            <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('bankroll')}>
                <Wallet size={13} /> Gerenciar banca
              </button>
              <span className="small muted-3">
                {bankroll.summary.openBets > 0
                  ? `${fmtMoney(bankroll.summary.exposure)} em ${bankroll.summary.openBets} aposta(s) em aberto`
                  : 'Nenhuma aposta em aberto'}
              </span>
            </div>
          </div>
          <div className="bankroll-dashboard-chart">
            <BankrollSparkline points={bankroll.series} height={82} />
          </div>
        </div>
      ) : null}

      <div className="card card-tight">
        <div className="row-between wrap" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="filter-label">
              <Activity size={13} /> Recorte da análise
            </span>
            <span className="chip">{PERIOD_LABEL[filters.period]}</span>
            {filters.sport ? <span className="chip">{filters.sport}</span> : null}
            {filters.competition ? <span className="chip">{filters.competition}</span> : null}
            {filters.category ? <span className="chip">{filters.category}</span> : null}
            {filters.status !== 'all' ? <span className="chip">Status: {filters.status}</span> : null}
            {filters.bookmaker ? <span className="chip">{filters.bookmaker}</span> : null}
            {!hasActiveFilters ? <span className="small muted-3">Sem filtros — histórico completo</span> : null}
          </div>
          <div className="row" style={{ gap: 10 }}>
            <span className="small muted-3">
              {fmtNumber(summary.total)} previsões · {fmtNumber(summary.settled)} concluídas
            </span>
            <button className="link-btn" onClick={() => navigate('bands')}>
              Ver calibração <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {analytics.warnings.length > 0 ? (
          <div className="stack-sm" style={{ marginTop: 10 }}>
            {analytics.warnings.slice(0, 3).map((warning) => (
              <div className="alert alert-warn" key={warning}>
                <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="alert alert-success" style={{ marginTop: 10 }}>
            <CheckCircle2 size={14} style={{ flex: 'none', marginTop: 1 }} />
            <span>Todos os registros do recorte estão classificados e consistentes.</span>
          </div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.25fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <TrendingUp size={15} style={{ color: 'var(--accent-2)' }} /> Destaques
              </div>
              <div className="card-desc">
                Melhores {dimensionLabel} por taxa de acerto · mínimo de {highlights.minSample} resultado(s)
                concluído(s)
              </div>
            </div>
            <span className="tag">top {highlights.positive.length || 5}</span>
          </div>
          {highlights.positive.length === 0 ? (
            <EmptyState
              icon={<BarChart3 size={20} />}
              title="Amostra insuficiente para destaques"
              message={`Nenhuma ${dimensionLabel.replace(/s$/, '')} tem pelo menos ${highlights.minSample} previsões concluídas. Reduza a amostra mínima nas configurações ou registre mais resultados.`}
            />
          ) : (
            <HighlightList items={highlights.positive} onOpen={openEntity} />
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <TrendingDown size={15} style={{ color: '#fb7185' }} /> Destaques negativos
              </div>
              <div className="card-desc">Menor taxa de acerto com amostra confiável</div>
            </div>
            <InfoTip text="Somente entram aqui grupos com pelo menos 1 erro e amostra mínima configurada. Amostra pequena não é sinônimo de desempenho ruim." />
          </div>
          {highlights.negative.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={20} />}
              title="Nenhum destaque negativo"
              message="Nenhum grupo com amostra mínima acumulou erros neste recorte."
            />
          ) : (
            <HighlightList items={highlights.negative} onOpen={openEntity} negative />
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.55fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <Activity size={15} /> Evolução da taxa de acerto
              </div>
              <div className="card-desc">Taxa acumulada por data de evento · barras indicam volume concluído no dia</div>
            </div>
            <span className="badge badge-neutral">{fmtPercent(summary.hitRate)}</span>
          </div>
          <PerformanceChart points={analytics.timeline} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <Gauge size={15} /> Calibração
              </div>
              <div className="card-desc">Probabilidade estimada × acerto observado</div>
            </div>
            <button className="btn btn-sm" onClick={() => navigate('bands')}>
              Detalhar
            </button>
          </div>
          <CalibrationChart bands={analytics.calibration.bands} height={196} />
          <div className="stack-sm" style={{ marginTop: 6 }}>
            <div className="kv">
              <span>Probabilidade média estimada</span>
              <strong>{fmtPercent(summary.avgProbability)}</strong>
            </div>
            <div className="kv">
              <span>Diferença para o acerto real</span>
              <strong className={(summary.calibrationGap ?? 0) >= 0 ? 'pos' : 'neg'}>
                {fmtSigned(summary.calibrationGap)}
              </strong>
            </div>
            {worstBand ? (
              <div className="hint">
                Maior desvio na faixa {worstBand.label}: estimado {fmtPercent(worstBand.expected)}, observado{' '}
                {fmtPercent(worstBand.hitRate)} ({fmtNumber(worstBand.count)} previsões).
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <CalendarClock size={15} /> Próximos eventos pendentes
              </div>
              <div className="card-desc">Previsões aguardando resultado dentro do recorte</div>
            </div>
            <button className="link-btn" onClick={() => navigate('calendar')}>
              Calendário <ArrowRight size={12} />
            </button>
          </div>
          {analytics.upcoming.length === 0 ? (
            <EmptyState
              icon={<CalendarClock size={20} />}
              title="Nenhuma pendência futura"
              message="Todas as previsões do recorte já têm resultado ou não há eventos futuros cadastrados."
            />
          ) : (
            <div className="stack-sm">
              {analytics.upcoming.map((prediction) => (
                <button
                  key={prediction.id}
                  className="bar-row"
                  style={{ gridTemplateColumns: '1fr auto' }}
                  onClick={() => navigate('new', { id: prediction.id })}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="bar-name">{prediction.event}</div>
                    <div className="bar-meta">
                      {prediction.sport} · {prediction.category} · {relativeDay(prediction.eventDate)} às{' '}
                      {fmtTime(prediction.eventDate)}
                    </div>
                  </div>
                  <div className="bar-value">
                    {fmtPercent(prediction.probability)}
                    <small>prob.</small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <Target size={15} /> Distribuição dos registros
              </div>
              <div className="card-desc">Como as {fmtNumber(summary.total)} previsões do recorte estão classificadas</div>
            </div>
          </div>
          <DistributionBar
            hit={summary.hits}
            miss={summary.misses}
            pending={summary.pending}
            voided={summary.voids}
          />
          <div className="divider" />
          <div className="kv">
            <span>Acertos / erros</span>
            <strong>
              <span className="pos">{fmtNumber(summary.hits)}</span> / <span className="neg">{fmtNumber(summary.misses)}</span>
            </strong>
          </div>
          <div className="kv">
            <span>Brier Score médio</span>
            <strong>{fmtBrier(summary.brier)}</strong>
          </div>
          <div className="kv">
            <span>Amostra mínima para destaques</span>
            <strong>{settings.minSample} previsões</strong>
          </div>
          <div className="kv">
            <span>Período padrão</span>
            <strong>{PERIOD_LABEL[settings.defaultPeriod]}</strong>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <TrendingUp size={15} /> Desempenho por modalidade
              </div>
              <div className="card-desc">Taxa de acerto e Brier Score por esporte</div>
            </div>
          </div>
          {analytics.bySport.length === 0 ? (
            <EmptyState title="Sem dados" message="Nenhuma previsão no recorte atual." />
          ) : (
            <div>
              {analytics.bySport.slice(0, 6).map((item) => (
                <button
                  key={item.key}
                  className="bar-row"
                  style={{ gridTemplateColumns: '1.1fr 1.4fr 66px' }}
                  onClick={() => navigate('entity', { kind: 'sport', key: item.key })}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="bar-name">{item.label}</div>
                    <div className="bar-meta">
                      {item.settled} concluídas · Brier {fmtBrier(item.brier)}
                    </div>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${Math.min(100, item.hitRate ?? 0)}%` }} />
                  </div>
                  <div className="bar-value">{fmtPercent(item.hitRate)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <Layers size={15} /> Desempenho por categoria
              </div>
              <div className="card-desc">Mercados com melhor e pior precisão no recorte</div>
            </div>
            <button className="link-btn" onClick={() => navigate('markets')}>
              Ver tudo <ArrowRight size={12} />
            </button>
          </div>
          {analytics.byCategory.length === 0 ? (
            <EmptyState title="Sem dados" message="Registre previsões com categoria para ver esta análise." />
          ) : (
            <div>
              {analytics.byCategory.slice(0, 6).map((item) => (
                <button
                  key={item.key}
                  className="bar-row"
                  style={{ gridTemplateColumns: '1.1fr 1.4fr 66px' }}
                  onClick={() => navigate('entity', { kind: 'category', key: item.key })}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="bar-name">{item.label}</div>
                    <div className="bar-meta">
                      {item.settled} concluídas · Brier {fmtBrier(item.brier)}
                    </div>
                  </div>
                  <div className={`progress ${(item.hitRate ?? 0) < 50 ? 'danger' : ''}`}>
                    <span style={{ width: `${Math.min(100, item.hitRate ?? 0)}%` }} />
                  </div>
                  <div className="bar-value">{fmtPercent(item.hitRate)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ExternalSnapshot />
    </div>
  );
}

function ExternalSnapshot() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ExternalStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await api.getExternalStatus();
        if (alive) setStatus(next);
      } catch {
        /* integração opcional: o dashboard continua funcionando offline */
      }
    };
    void load();
    const off = api.onExternalUpdated((next) => {
      setStatus(next);
      if (next.syncing.length === 0) void load();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!status) return null;
  const platforms = ['polymarket', 'kalshi'] as const;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">
            <Radio size={15} /> Mercados externos
          </div>
          <div className="card-desc">
            Partidas da Polymarket e da Kalshi disponíveis para preencher uma aposta manualmente.
          </div>
        </div>
        <button className="link-btn" onClick={() => navigate('external')}>
          Explorar mercados <ArrowRight size={12} />
        </button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {platforms.map((platform) => {
          const item = status[platform];
          return (
            <button key={platform} className="ext-source" onClick={() => navigate('external')}>
              <div className="ext-source-head">
                <span className="ext-platform">{PLATFORM_LABEL[platform]}</span>
                <span className={`ext-source-dot ${item.lastSyncAt ? 'on' : ''}`} />
              </div>
              <div className="ext-source-value">{fmtNumber(item.marketCount)}</div>
              <div className="ext-source-label">mercados disponíveis</div>
              <div className="ext-source-meta">
                {item.lastSyncAt ? `Sincronizado ${fmtDateTime(item.lastSyncAt)}` : 'Nunca sincronizado'}
              </div>
            </button>
          );
        })}
      </div>
      <div className="ext-snapshot-foot">
        <span>
          <strong>{fmtNumber(status.polymarket.marketCount + status.kalshi.marketCount)}</strong> mercados no total
        </span>
        <span>Clique em uma partida para abrir o formulário já preenchido.</span>
      </div>
    </div>
  );
}

function HighlightList({
  items,
  onOpen,
  negative = false,
}: {
  items: Aggregate[];
  onOpen: (item: Aggregate) => void;
  negative?: boolean;
}) {
  const max = Math.max(1, ...items.map((item) => item.hitRate ?? 0));
  return (
    <div>
      {items.map((item) => (
        <button
          key={item.key}
          className="bar-row"
          onClick={() => onOpen(item)}
          title={`Ver análise detalhada de ${item.label}`}
        >
          <div style={{ minWidth: 0 }}>
            <div className="bar-name">{item.label}</div>
            <div className="bar-meta">
              {item.sports.join(' · ')} · {item.total} previsões · {item.settled} concluídas
            </div>
          </div>
          <div className={`progress ${negative ? 'danger' : ''}`}>
            <span style={{ width: `${Math.max(2, ((item.hitRate ?? 0) / max) * 100)}%` }} />
          </div>
          <div className="bar-value">
            {fmtPercent(item.hitRate, 0)}
            <small>
              {negative ? `${item.misses} erro(s)` : `${item.hits} acerto(s)`}
            </small>
          </div>
        </button>
      ))}
    </div>
  );
}
