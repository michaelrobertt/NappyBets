import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { SortKey } from '../../shared/types';
import { PERIOD_LABEL } from '../../shared/types';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import { useToast } from '../lib/toast';
import { navigate } from '../lib/router';
import { fmtNumber } from '../lib/format';
import { SearchInput, EmptyState } from '../components/ui';
import { PredictionTable } from '../components/predictions';

const SORT_KEYS: SortKey[] = ['eventDate', 'sport', 'competition', 'category', 'probability', 'status'];

export function HistoryPage() {
  const { filters, setFilters, resetFilters, analytics, refresh } = useApp();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.listPredictions>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<SortKey>('eventDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [version, setVersion] = useState(0);
  const toast = useToast();

  const query = useMemo(
    () => ({ ...filters, sortBy, sortDir, page, pageSize }),
    [filters, sortBy, sortDir, page, pageSize],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listPredictions(query)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((error) => toast.error((error as Error).message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, version]);

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize, sortBy, sortDir]);

  const onSort = (key: string) => {
    if (!SORT_KEYS.includes(key as SortKey)) return;
    if (sortBy === key) setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key as SortKey);
      setSortDir(key === 'eventDate' ? 'desc' : 'asc');
    }
  };

  const reload = useCallback(() => {
    setVersion((value) => value + 1);
    void refresh();
  }, [refresh]);

  const exportCsv = async () => {
    try {
      const result = await api.exportData('csv');
      if (result) toast.success(`${fmtNumber(result.count)} previsões exportadas para ${result.path}`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const summary = analytics?.summary;
  const chips = [
    filters.period !== 'all' ? PERIOD_LABEL[filters.period] : null,
    filters.sport,
    filters.competition,
    filters.category,
    filters.status !== 'all' ? filters.status : null,
    filters.bookmaker,
  ].filter(Boolean) as string[];

  return (
    <div className="stack">
      <div className="card card-tight">
        <div className="row wrap" style={{ gap: 10 }}>
          <SearchInput
            value={filters.search}
            onChange={(value) => setFilters({ search: value })}
            placeholder="Buscar por evento, time, jogador, competição, categoria..."
          />
          <div className="row" style={{ gap: 6 }}>
            <SlidersHorizontal size={13} style={{ color: 'var(--text-3)' }} />
            <select
              className="select small"
              style={{ width: 94 }}
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              aria-label="Registros por página"
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / pág.
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-sm" onClick={reload} title="Recarregar lista">
            <RefreshCw size={13} /> Atualizar
          </button>
          <button className="btn btn-sm" onClick={exportCsv}>
            <Download size={13} /> Exportar CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('new')}>
            <Plus size={14} /> Nova previsão
          </button>
        </div>

        {(chips.length > 0 || filters.search) && (
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            <span className="small muted-3">Filtros ativos:</span>
            {chips.map((chip) => (
              <span className="chip" key={chip}>
                {chip}
              </span>
            ))}
            {filters.search ? <span className="chip">busca: “{filters.search}”</span> : null}
            <button
              className="link-btn"
              onClick={() => {
                resetFilters();
                setPage(1);
              }}
            >
              <Trash2 size={12} /> Limpar tudo
            </button>
          </div>
        )}
      </div>

      {summary ? (
        <div className="row wrap" style={{ gap: 18, padding: '0 4px', fontSize: 12, color: 'var(--text-3)' }}>
          <span>
            <strong style={{ color: 'var(--text)' }}>{fmtNumber(summary.total)}</strong> previsões no recorte
          </span>
          <span>
            <strong style={{ color: 'var(--text)' }}>{fmtNumber(summary.settled)}</strong> concluídas
          </span>
          <span>
            <strong className="pos">{fmtNumber(summary.hits)}</strong> acertos
          </span>
          <span>
            <strong className="neg">{fmtNumber(summary.misses)}</strong> erros
          </span>
          <span>
            <strong style={{ color: 'var(--text)' }}>{fmtNumber(summary.pending)}</strong> pendentes
          </span>
          <span style={{ marginLeft: 'auto' }}>
            Clique em uma linha para ver todos os detalhes, editar ou atualizar o resultado.
          </span>
        </div>
      ) : null}

      {rows && rows.total === 0 && !loading ? (
        <div className="card">
          <EmptyState
            title="Nenhuma previsão encontrada"
            message="Ajuste os filtros ou registre a primeira previsão para começar a acompanhar seu desempenho."
            action={
              <button className="btn btn-primary" onClick={() => navigate('new')}>
                <Plus size={14} /> Registrar previsão
              </button>
            }
          />
        </div>
      ) : (
        <PredictionTable
          rows={rows?.rows ?? []}
          total={rows?.total}
          page={rows?.page}
          pageCount={rows?.pageCount}
          onPage={setPage}
          sort={{ key: sortBy, dir: sortDir }}
          onSort={onSort}
          onChanged={reload}
          loading={loading}
        />
      )}
    </div>
  );
}
