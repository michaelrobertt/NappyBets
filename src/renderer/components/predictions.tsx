import { useEffect, useState } from 'react';
import { useNavigate } from '../lib/useNavigate';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { Prediction, PredictionStatus } from '../../shared/types';
import { STATUS_LABEL } from '../../shared/types';
import {
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtMoneySigned,
  fmtNumber,
  fmtOdds,
  fmtPercent,
  fmtTime,
  parseIso,
  relativeDay,
} from '../lib/format';
import { api } from '../lib/api';
import { betProfit, impliedProbability } from '../../shared/bankroll';
import { useToast } from '../lib/toast';
import { Modal, StatusBadge, useConfirm } from './ui';

export function predictionBrier(p: Prediction): number | null {
  if (p.status !== 'hit' && p.status !== 'miss') return null;
  const prob = Math.min(100, Math.max(0, p.probability)) / 100;
  const observed = p.status === 'hit' ? 1 : 0;
  return (prob - observed) ** 2;
}

interface TableProps {
  rows: Prediction[];
  onChanged: () => void;
  loading?: boolean;
  page?: number;
  pageCount?: number;
  total?: number;
  onPage?: (page: number) => void;
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
  onSort?: (key: string) => void;
  selectable?: boolean;
  emptyAction?: React.ReactNode;
}

export function PredictionTable({
  rows,
  onChanged,
  loading,
  page,
  pageCount,
  total,
  onPage,
  sort,
  onSort,
  selectable = true,
  emptyAction,
}: TableProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  useEffect(() => {
    setSelected((prev) => prev.filter((id) => rows.some((row) => row.id === id)));
  }, [rows]);

  const allSelected = rows.length > 0 && selected.length === rows.length;
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((row) => row.id));
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));

  const sortIndicator = (key: string) =>
    sort && sort.key === key ? sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : null;

  const header = (label: string, key?: string, className = '') => (
    <th
      className={`${key && onSort ? 'sortable' : ''} ${className}`}
      onClick={key && onSort ? () => onSort(key) : undefined}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {key ? sortIndicator(key) : null}
      </span>
    </th>
  );

  async function setStatus(ids: string[], status: PredictionStatus) {
    if (!ids.length) return;
    setBusy(true);
    try {
      await api.setStatus(ids, status);
      toast.success(
        ids.length === 1
          ? `Status atualizado para "${STATUS_LABEL[status]}".`
          : `${ids.length} previsões atualizadas para "${STATUS_LABEL[status]}".`,
      );
      setSelected([]);
      if (detail && ids.includes(detail.id)) setDetail(null);
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(ids: string[]) {
    const ok = await confirm({
      title: ids.length === 1 ? 'Excluir previsão' : `Excluir ${ids.length} previsões`,
      message:
        ids.length === 1
          ? 'Esta ação remove o registro permanentemente do banco de dados. Deseja continuar?'
          : `Esta ação remove ${ids.length} registros permanentemente. Deseja continuar?`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (ids.length === 1) await api.deletePrediction(ids[0]!);
      else await api.deletePredictions(ids);
      toast.success(ids.length === 1 ? 'Previsão excluída.' : `${ids.length} previsões excluídas.`);
      setSelected([]);
      setDetail(null);
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = selected.length;

  return (
    <>
      {selectable && selectedCount > 0 ? (
        <div
          className="row wrap"
          style={{
            gap: 8,
            padding: '9px 12px',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent-line)',
            borderRadius: 10,
            marginBottom: 8,
            fontSize: 12.5,
          }}
        >
          <strong>{selectedCount} selecionada(s)</strong>
          <span className="muted-3">•</span>
          <button className="btn btn-sm" disabled={busy} onClick={() => setStatus(selected, 'hit')}>
            <Check size={12} /> Acertou
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => setStatus(selected, 'miss')}>
            <X size={12} /> Errou
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => setStatus(selected, 'void')}>
            Anulada
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => setStatus(selected, 'pending')}>
            Pendente
          </button>
          <button
            className="btn btn-sm"
            style={{ marginLeft: 'auto', color: 'var(--danger)' }}
            disabled={busy}
            onClick={() => remove(selected)}
          >
            <Trash2 size={12} /> Excluir
          </button>
          <button className="btn-icon" onClick={() => setSelected([])} aria-label="Limpar seleção">
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {selectable ? (
                <th style={{ width: 34 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todas" />
                </th>
              ) : null}
              {header('Data', 'eventDate')}
              {header('Evento')}
              {header('Modalidade / competição', 'competition')}
              {header('Categoria', 'category')}
              {header('Resultado')}
              {header('Prob.', 'probability', 'num')}
              {header('Aposta', undefined, 'num')}
              {header('Status', 'status')}
              {header('Ações', undefined, 'actions')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={selectable ? 10 : 9} style={{ padding: 0 }}>
                  <div style={{ padding: '34px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                    {loading ? 'Carregando previsões...' : 'Nenhuma previsão corresponde aos filtros atuais.'}
                    {!loading && emptyAction ? <div style={{ marginTop: 12 }}>{emptyAction}</div> : null}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="clickable" onClick={() => setDetail(row)}>
                  {selectable ? (
                    <td onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={`Selecionar ${row.event}`}
                      />
                    </td>
                  ) : null}
                  <td className="nowrap">
                    <div className="cell-title">{fmtDate(row.eventDate)}</div>
                    <div className="cell-sub">
                      {fmtTime(row.eventDate)}
                      {row.isDemo ? ' · demo' : ''}
                    </div>
                  </td>
                  <td style={{ minWidth: 170 }}>
                    <div className="cell-title">{row.event}</div>
                    <div className="cell-sub">
                      {row.subject}
                      {row.bookmaker ? ` · ${row.bookmaker}` : ''}
                    </div>
                  </td>
                  <td className="muted" style={{ maxWidth: 165 }}>
                    <div className="cell-title">{row.competition || '—'}</div>
                    <div className="cell-sub">{row.sport}</div>
                  </td>
                  <td className="muted" style={{ maxWidth: 120 }}>{row.category || '—'}</td>
                  <td style={{ minWidth: 140 }}>
                    <div className="cell-title">{row.predictedResult}</div>
                    <div className="cell-sub">{row.actualResult ? `Real: ${row.actualResult}` : 'Real: —'}</div>
                  </td>
                  <td className="num nowrap">{fmtPercent(row.probability)}</td>
                  <td className="num nowrap">
                    {row.stake > 0 ? (
                      <>
                        <div className="cell-title">{fmtMoney(row.stake)}</div>
                        <div className={`cell-sub ${betProfit(row) >= 0 ? 'pos' : 'neg'}`}>
                          {fmtOdds(row.odds)}
                          {row.status === 'pending'
                            ? ' · aberta'
                            : row.status === 'void'
                              ? ' · anulada'
                              : ` · ${fmtMoneySigned(betProfit(row))}`}
                        </div>
                      </>
                    ) : (
                      <span className="muted-3">—</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="btn-icon"
                      title="Marcar como acertou"
                      disabled={busy || row.status === 'hit'}
                      onClick={() => setStatus([row.id], 'hit')}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      className="btn-icon"
                      title="Marcar como errou"
                      disabled={busy || row.status === 'miss'}
                      onClick={() => setStatus([row.id], 'miss')}
                    >
                      <X size={14} />
                    </button>
                    <button
                      className="btn-icon"
                      title="Editar"
                      onClick={() => navigate('new', { id: row.id })}
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {onPage && total !== undefined && page !== undefined && pageCount !== undefined ? (
        <div className="row-between" style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
          <span>
            {fmtNumber(total)} registro(s) · página {page} de {pageCount}
          </span>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              <ChevronLeft size={13} /> Anterior
            </button>
            <button className="btn btn-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
              Próxima <ChevronRight size={13} />
            </button>
          </div>
        </div>
      ) : null}

      {detail ? (
        <PredictionDetailModal
          prediction={detail}
          onClose={() => setDetail(null)}
          onEdit={(prediction) => {
            setDetail(null);
            navigate('new', { id: prediction.id });
          }}
          onDelete={() => remove([detail.id])}
          onStatus={(status) => setStatus([detail.id], status)}
        />
      ) : null}
    </>
  );
}

export function PredictionDetailModal({
  prediction,
  onClose,
  onEdit,
  onDelete,
  onStatus,
}: {
  prediction: Prediction;
  onClose: () => void;
  onEdit: (prediction: Prediction) => void;
  onDelete: () => void;
  onStatus: (status: PredictionStatus) => void;
}) {
  const brier = predictionBrier(prediction);
  const date = parseIso(prediction.eventDate);
  return (
    <Modal
      title={prediction.event}
      subtitle={`${prediction.sport} · ${prediction.competition || 'sem competição'}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button className="btn btn-danger" onClick={onDelete} style={{ marginRight: 'auto' }}>
            <Trash2 size={13} /> Excluir
          </button>
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
          <button className="btn btn-primary" onClick={() => onEdit(prediction)}>
            <Pencil size={13} /> Editar
          </button>
        </>
      }
    >
      <div className="row-between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <StatusBadge status={prediction.status} />
          {prediction.isDemo ? <span className="tag">demonstração</span> : null}
        </div>
        <span className="muted-3 small">{relativeDay(prediction.eventDate)}</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
        <DetailRow label="Data e horário" value={date ? fmtDateTime(prediction.eventDate) : prediction.eventDate} />
        <DetailRow label="Time / jogador" value={`${prediction.subject} (${prediction.subjectType === 'player' ? 'jogador' : 'time'})`} />
        <DetailRow label="Categoria" value={prediction.category || '—'} />
        <DetailRow label="Casa de referência" value={prediction.bookmaker || '—'} />
        <DetailRow label="Resultado previsto" value={prediction.predictedResult} />
        <DetailRow label="Resultado real" value={prediction.actualResult || '—'} />
        <DetailRow label="Probabilidade estimada" value={fmtPercent(prediction.probability)} />
        <DetailRow
          label="Valor apostado"
          value={prediction.stake > 0 ? `${fmtMoney(prediction.stake)} @ ${fmtOdds(prediction.odds)}` : 'Sem valor'}
        />
        <DetailRow
          label="Retorno potencial"
          value={
            prediction.stake > 0 && prediction.odds
              ? fmtMoney(prediction.stake * prediction.odds)
              : '—'
          }
        />
        <DetailRow
          label="Lucro / prejuízo"
          value={
            prediction.stake <= 0
              ? '—'
              : prediction.status === 'pending'
                ? 'Em aberto'
                : prediction.status === 'void'
                  ? 'Anulada'
                  : fmtMoneySigned(betProfit(prediction))
          }
        />
        <DetailRow
          label="Probabilidade implícita da odd"
          value={impliedProbability(prediction.odds) === null ? '—' : fmtPercent(impliedProbability(prediction.odds))}
        />
        <DetailRow
          label="Contribuição no Brier"
          value={brier === null ? 'Não se aplica (não concluída)' : brier.toFixed(4).replace('.', ',')}
        />
        <DetailRow label="Registrada em" value={fmtDateTime(prediction.createdAt)} />
        <DetailRow label="Última atualização" value={fmtDateTime(prediction.updatedAt)} />
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="field-label" style={{ marginBottom: 4 }}>
          Observações
        </div>
        <div
          className="small muted"
          style={{
            background: 'var(--panel-2)',
            border: '1px solid var(--border-soft)',
            borderRadius: 9,
            padding: '10px 12px',
            minHeight: 52,
            whiteSpace: 'pre-wrap',
          }}
        >
          {prediction.notes || 'Sem observações registradas.'}
        </div>
      </div>

      <div className="divider" />
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="small muted-3" style={{ marginRight: 4 }}>
          Atualizar resultado:
        </span>
        {(['hit', 'miss', 'void', 'pending'] as PredictionStatus[]).map((status) => (
          <button
            key={status}
            className={`btn btn-sm ${prediction.status === status ? 'btn-primary' : ''}`}
            onClick={() => onStatus(status)}
          >
            {STATUS_LABEL[status]}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function NewPredictionButton({ className = 'btn btn-primary' }: { className?: string }) {
  const navigate = useNavigate();
  return (
    <button className={className} onClick={() => navigate('new')}>
      <Plus size={14} /> Nova previsão
    </button>
  );
}
