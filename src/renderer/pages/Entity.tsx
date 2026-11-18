import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarRange, Info } from 'lucide-react';
import type { Aggregate, Filters, Prediction } from '../../shared/types';
import { calibration, groupBy, summarize, timeline } from '../../shared/stats';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import { useRoute, navigate, type ViewName } from '../lib/router';
import { useToast } from '../lib/toast';
import { fmtBrier, fmtNumber, fmtPercent } from '../lib/format';
import { EmptyState, KpiCard, Skeleton } from '../components/ui';
import { CalibrationChart, PerformanceChart } from '../components/charts';
import { PredictionTable } from '../components/predictions';

type Kind = 'competition' | 'sport' | 'category' | 'team' | 'player' | 'bookmaker';

const KIND_META: Record<Kind, { label: string; back: ViewName; backLabel: string }> = {
  competition: { label: 'Competição', back: 'leagues', backLabel: 'Ligas' },
  sport: { label: 'Modalidade', back: 'dashboard', backLabel: 'Visão geral' },
  category: { label: 'Categoria', back: 'markets', backLabel: 'Mercados' },
  team: { label: 'Time', back: 'teams', backLabel: 'Times' },
  player: { label: 'Jogador', back: 'players', backLabel: 'Jogadores' },
  bookmaker: { label: 'Casa de referência', back: 'bookmakers', backLabel: 'Casas' },
};

export function EntityPage() {
  const route = useRoute();
  const kind = (route.params.kind ?? 'competition') as Kind;
  const key = route.params.key ?? '';
  const { filters, settings, refresh, setFilters } = useApp();
  const toast = useToast();
  const [rows, setRows] = useState<Prediction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const meta = KIND_META[kind] ?? KIND_META.competition;
  const parsed = useMemo(() => {
    if (kind === 'competition') {
      const index = key.indexOf('::');
      return {
        sport: index >= 0 ? key.slice(0, index) : '',
        label: index >= 0 ? key.slice(index + 2) : key,
      };
    }
    return { sport: '', label: key };
  }, [kind, key]);

  const queryFilters: Filters = useMemo(() => {
    const base: Filters = { ...filters, search: '' };
    switch (kind) {
      case 'competition':
        return { ...base, sport: parsed.sport || base.sport, competition: parsed.label };
      case 'sport':
        return { ...base, sport: parsed.label };
      case 'category':
        return { ...base, category: parsed.label };
      case 'team':
        return { ...base, subjectType: 'team', subject: parsed.label };
      case 'player':
        return { ...base, subjectType: 'player', subject: parsed.label };
      case 'bookmaker':
        return { ...base, bookmaker: parsed.label };
      default:
        return base;
    }
  }, [filters, kind, parsed]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listPredictions({
        ...queryFilters,
        sortBy: 'eventDate',
        sortDir: 'desc',
        page: 1,
        pageSize: 100000,
      })
      .then((result) => {
        if (!cancelled) setRows(result.rows);
      })
      .catch((error) => toast.error((error as Error).message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFilters, version]);

  const summary = useMemo(() => summarize(rows ?? []), [rows]);
  const bands = useMemo(() => calibration(rows ?? []), [rows]);
  const series = useMemo(() => timeline(rows ?? []), [rows]);
  const categories = useMemo(() => {
    const list = groupBy(rows ?? [], { key: (p) => p.category, label: (p) => p.category });
    return list.sort((a: Aggregate, b: Aggregate) => {
      const relA = a.settled >= settings.minSample ? 0 : 1;
      const relB = b.settled >= settings.minSample ? 0 : 1;
      if (relA !== relB) return relA - relB;
      return (b.hitRate ?? -1) - (a.hitRate ?? -1);
    });
  }, [rows, settings.minSample]);

  const reload = useCallback(() => {
    setVersion((value) => value + 1);
    void refresh();
  }, [refresh]);

  const lowSample = summary.settled < settings.minSample;

  if (loading && !rows) {
    return (
      <div className="stack">
        <Skeleton height={40} width="40%" />
        <Skeleton height={130} />
        <Skeleton height={260} />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<Info size={20} />}
          title="Nenhum registro para este recorte"
          message="Não existem previsões que correspondam a esta entidade com os filtros globais atuais. Limpe ou ajuste os filtros para ampliar a análise."
          action={
            <button className="btn" onClick={() => navigate(meta.back)}>
              <ArrowLeft size={13} /> Voltar para {meta.backLabel}
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row-between wrap" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <button className="btn btn-sm" onClick={() => navigate(meta.back)}>
            <ArrowLeft size={13} /> {meta.backLabel}
          </button>
          <div>
            <h2 style={{ fontSize: 19 }}>{parsed.label}</h2>
            <p className="small muted-3">
              {meta.label}
              {kind === 'competition' && parsed.sport ? ` · ${parsed.sport}` : ''} · {fmtNumber(summary.total)} previsões no
              recorte
            </p>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {lowSample ? <span className="badge badge-pending">amostra abaixo do mínimo ({settings.minSample})</span> : null}
          <button
            className="btn btn-sm"
            onClick={() => {
              const patch: Partial<Filters> =
                kind === 'competition'
                  ? { sport: parsed.sport || null, competition: parsed.label }
                  : kind === 'sport'
                    ? { sport: parsed.label }
                    : kind === 'category'
                      ? { category: parsed.label }
                      : kind === 'bookmaker'
                        ? { bookmaker: parsed.label }
                        : { subjectType: kind === 'player' ? 'player' : 'team', subject: parsed.label };
              setFilters(patch);
              navigate('history');
            }}
          >
            <CalendarRange size={13} /> Abrir no histórico
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Previsões" value={fmtNumber(summary.total)} sub={`${summary.pending} pendentes · ${summary.voids} anuladas`} />
        <KpiCard label="Concluídas" value={fmtNumber(summary.settled)} sub={`${summary.hits} acertos · ${summary.misses} erros`} accent />
        <KpiCard label="Taxa de acerto" value={fmtPercent(summary.hitRate)} sub="Acertos ÷ (acertos + erros)" />
        <KpiCard label="Brier Score" value={fmtBrier(summary.brier)} sub={`Amostra de ${summary.brierSample}`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Evolução da taxa de acerto</div>
              <div className="card-desc">Acumulado por data de evento neste recorte</div>
            </div>
          </div>
          <PerformanceChart points={series} height={210} />
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Calibração</div>
              <div className="card-desc">Estimado × observado</div>
            </div>
          </div>
          <CalibrationChart bands={bands} height={210} />
        </div>
      </div>

      {categories.length > 1 ? (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Categorias neste recorte</div>
              <div className="card-desc">
                Grupos com menos de {settings.minSample} resultados concluídos aparecem com aviso de amostra baixa
              </div>
            </div>
          </div>
          <div>
            {categories.slice(0, 8).map((item) => (
              <button
                key={item.key}
                className="bar-row"
                onClick={() => navigate('entity', { kind: 'category', key: item.key })}
              >
                <div>
                  <div className="bar-name">{item.label || 'Sem categoria'}</div>
                  <div className="bar-meta">
                    {item.total} previsões · {item.settled} concluídas · Brier {fmtBrier(item.brier)}
                  </div>
                </div>
                <div className="progress">
                  <span style={{ width: `${Math.min(100, item.hitRate ?? 0)}%` }} />
                </div>
                <div className="bar-value">{fmtPercent(item.hitRate)}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <h3 style={{ fontSize: 14 }}>Registros ({fmtNumber(rows.length)})</h3>
          <span className="small muted-3">Os filtros globais continuam aplicados</span>
        </div>
        <PredictionTable rows={rows.slice(0, 200)} onChanged={reload} />
        {rows.length > 200 ? (
          <p className="hint" style={{ marginTop: 8 }}>
            Exibindo os 200 registros mais recentes. Use o histórico com filtros para navegar em todo o conjunto.
          </p>
        ) : null}
      </div>
    </div>
  );
}

