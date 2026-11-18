import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react';
import type { Prediction } from '../../shared/types';
import { toDateKey, summarize } from '../../shared/stats';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import { navigate } from '../lib/router';
import { useToast } from '../lib/toast';
import { fmtNumber, fmtPercent, fmtTime, fmtMonthYear, statusMeta, weekdayNames } from '../lib/format';
import { Segmented, EmptyState, Skeleton } from '../components/ui';
import { PredictionDetailModal } from '../components/predictions';

const WEEK_START = { weekStartsOn: 0 as const };

export function CalendarPage() {
  const { filters, refresh } = useApp();
  const toast = useToast();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string>(() => toDateKey(new Date()));
  const [rows, setRows] = useState<Prediction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Prediction | null>(null);
  const [version, setVersion] = useState(0);

  const range = useMemo(() => {
    if (view === 'month') {
      return { from: toDateKey(startOfMonth(cursor)), to: toDateKey(endOfMonth(cursor)) };
    }
    return {
      from: toDateKey(startOfWeek(cursor, WEEK_START)),
      to: toDateKey(endOfWeek(cursor, WEEK_START)),
    };
  }, [cursor, view]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listPredictions({
        ...filters,
        period: 'custom',
        from: range.from,
        to: range.to,
        status: 'all',
        sortBy: 'eventDate',
        sortDir: 'asc',
        page: 1,
        pageSize: 5000,
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
  }, [range, filters, version]);

  const byDay = useMemo(() => {
    const map = new Map<string, Prediction[]>();
    (rows ?? []).forEach((row) => {
      const key = row.eventDate.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    });
    return map;
  }, [rows]);

  const days = useMemo(() => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(cursor), WEEK_START);
      const end = endOfWeek(endOfMonth(cursor), WEEK_START);
      const list: Date[] = [];
      for (let day = start; day <= end; day = addDays(day, 1)) list.push(day);
      return list;
    }
    const start = startOfWeek(cursor, WEEK_START);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursor, view]);

  const monthSummary = useMemo(() => summarize(rows ?? []), [rows]);
  const selectedRows = byDay.get(selectedDay) ?? [];
  const selectedSummary = summarize(selectedRows);

  const shift = (direction: -1 | 1) => {
    setCursor((prev) => (view === 'month' ? addMonths(prev, direction) : addDays(prev, direction * 7)));
  };

  const goToday = () => {
    const today = new Date();
    setCursor(today);
    setSelectedDay(toDateKey(today));
  };

  const reload = useCallback(() => {
    setVersion((value) => value + 1);
    void refresh();
  }, [refresh]);

  const title =
    view === 'month'
      ? fmtMonthYear(cursor)
      : `${format(startOfWeek(cursor, WEEK_START), 'dd MMM', { locale: ptBR })} – ${format(
          endOfWeek(cursor, WEEK_START),
          'dd MMM yyyy',
          { locale: ptBR },
        )}`;

  return (
    <div className="stack">
      <div className="row-between wrap" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="Anterior">
            <ChevronLeft size={14} />
          </button>
          <strong style={{ fontSize: 15, minWidth: 190, textAlign: 'center' }}>{title}</strong>
          <button className="btn btn-sm" onClick={() => shift(1)} aria-label="Próximo">
            <ChevronRight size={14} />
          </button>
          <button className="btn btn-sm" onClick={goToday}>
            Hoje
          </button>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Segmented
            value={view}
            onChange={(value) => setView(value)}
            options={[
              { value: 'month', label: 'Mês' },
              { value: 'week', label: 'Semana' },
            ]}
          />
          <button className="btn btn-primary btn-sm" onClick={() => navigate('new')}>
            <Plus size={14} /> Nova previsão
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }}>
        <div className="card" style={{ padding: 14 }}>
          {loading && !rows ? (
            <Skeleton height={420} />
          ) : (
            <>
              <div className="calendar-head">
                {weekdayNames().map((day) => (
                  <div key={day} className="calendar-weekday">
                    {day}
                  </div>
                ))}
              </div>
              <div className={`calendar-grid ${view === 'week' ? 'week' : ''}`}>
                {days.map((day) => {
                  const key = toDateKey(day);
                  const list = byDay.get(key) ?? [];
                  const inCurrentMonth = view === 'week' || day.getMonth() === cursor.getMonth();
                  const isToday = key === toDateKey(new Date());
                  const isSelected = key === selectedDay;
                  const daySummary = summarize(list);
                  return (
                    <button
                      key={key}
                      className={`calendar-cell ${inCurrentMonth ? '' : 'muted-cell'} ${isToday ? 'today' : ''} ${
                        isSelected ? 'selected' : ''
                      }`}
                      onClick={() => setSelectedDay(key)}
                    >
                      <div className="calendar-cell-head">
                        <span className="calendar-daynum">{day.getDate()}</span>
                        {list.length > 0 ? (
                          <span
                            className="calendar-count"
                            title={
                              daySummary.settled > 0
                                ? `${fmtPercent(daySummary.hitRate)} de acerto em ${daySummary.settled} concluídas`
                                : `${list.length} previsão(ões)`
                            }
                          >
                            {list.length}
                          </span>
                        ) : null}
                      </div>
                      <div className="calendar-events">
                        {list.slice(0, view === 'week' ? 6 : 2).map((row) => (
                          <span
                            key={row.id}
                            className={`calendar-event badge-${row.status}`}
                            title={`${fmtTime(row.eventDate)} · ${row.event} · ${statusMeta(row.status).label}`}
                          >
                            <span className="dot" />
                            {row.event.length > 16 ? `${row.event.slice(0, 15)}…` : row.event}
                          </span>
                        ))}
                        {list.length > (view === 'week' ? 6 : 2) ? (
                          <span className="calendar-more">+{list.length - (view === 'week' ? 6 : 2)}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="calendar-legend">
            {(['pending', 'hit', 'miss', 'void'] as const).map((status) => (
              <span key={status} className="row" style={{ gap: 5, fontSize: 11, color: 'var(--text-3)' }}>
                <span className={`dot badge-${status}`} style={{ background: 'currentColor', width: 7, height: 7 }} />
                {statusMeta(status).label}
              </span>
            ))}
            <span className="muted-3" style={{ marginLeft: 'auto', fontSize: 11 }}>
              {fmtNumber(rows?.length ?? 0)} previsões no período exibido
            </span>
          </div>
        </div>

        <div className="stack">
          <div className="card card-tight">
            <div className="card-head" style={{ marginBottom: 8 }}>
              <div>
                <div className="card-title" style={{ fontSize: 13.5 }}>
                  <CalendarDays size={14} /> {format(new Date(`${selectedDay}T12:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
                </div>
                <div className="card-desc">
                  {selectedRows.length === 0
                    ? 'Nenhuma previsão nesta data'
                    : `${selectedRows.length} previsão(ões) · ${fmtNumber(selectedSummary.settled)} concluídas`}
                </div>
              </div>
            </div>

            {selectedRows.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={18} />}
                title="Dia sem previsões"
                message="Selecione outro dia ou registre uma previsão para esta data."
                action={
                  <button className="btn btn-sm" onClick={() => navigate('new')}>
                    <Plus size={13} /> Registrar previsão
                  </button>
                }
              />
            ) : (
              <div className="stack-sm">
                {selectedRows.map((row) => (
                  <button key={row.id} className="calendar-detail-item" onClick={() => setDetail(row)}>
                    <div className="row-between">
                      <span className="row small muted-3" style={{ gap: 5 }}>
                        <Clock size={11} /> {fmtTime(row.eventDate)}
                      </span>
                      <span className={`badge badge-${row.status}`}>{statusMeta(row.status).label}</span>
                    </div>
                    <div style={{ fontWeight: 550, fontSize: 12.5, marginTop: 3 }}>{row.event}</div>
                    <div className="small muted-3">
                      {row.sport} · {row.category} · {fmtPercent(row.probability)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card card-tight">
            <div className="card-title" style={{ fontSize: 13.5, marginBottom: 8 }}>
              Resumo do período
            </div>
            <div className="kv">
              <span>Previsões</span>
              <strong>{fmtNumber(monthSummary.total)}</strong>
            </div>
            <div className="kv">
              <span>Concluídas</span>
              <strong>{fmtNumber(monthSummary.settled)}</strong>
            </div>
            <div className="kv">
              <span>Acertos / erros</span>
              <strong>
                <span className="pos">{fmtNumber(monthSummary.hits)}</span> /{' '}
                <span className="neg">{fmtNumber(monthSummary.misses)}</span>
              </strong>
            </div>
            <div className="kv">
              <span>Taxa de acerto</span>
              <strong>{fmtPercent(monthSummary.hitRate)}</strong>
            </div>
            <div className="kv">
              <span>Pendentes</span>
              <strong>{fmtNumber(monthSummary.pending)}</strong>
            </div>
            <div className="kv">
              <span>Anuladas</span>
              <strong>{fmtNumber(monthSummary.voids)}</strong>
            </div>
          </div>
        </div>
      </div>

      {detail ? (
        <PredictionDetailModal
          prediction={detail}
          onClose={() => setDetail(null)}
          onEdit={(prediction) => {
            setDetail(null);
            navigate('new', { id: prediction.id });
          }}
          onDelete={async () => {
            try {
              await api.deletePrediction(detail.id);
              toast.success('Previsão excluída.');
              setDetail(null);
              reload();
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
          onStatus={async (status) => {
            try {
              await api.setStatus([detail.id], status);
              toast.success('Status atualizado.');
              setDetail(null);
              reload();
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        />
      ) : null}
    </div>
  );
}
