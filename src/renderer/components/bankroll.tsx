import { useId, useMemo } from 'react';
import type { BankrollTransaction } from '../../shared/types';
import type { BankrollPoint } from '../../shared/bankroll';
import { fmtMoney, fmtShortDate } from '../lib/format';

interface ChartProps {
  points: BankrollPoint[];
  transactions?: BankrollTransaction[];
  height?: number;
  compact?: boolean;
}

function geometry(points: BankrollPoint[], width: number, height: number, compact: boolean) {
  const pad = compact
    ? { top: 6, right: 4, bottom: 6, left: 4 }
    : { top: 14, right: 14, bottom: 24, left: 54 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const values = points.map((point) => point.balance);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 0;
  }
  if (min === max) {
    const padValue = Math.max(10, Math.abs(max) * 0.1);
    min -= padValue;
    max += padValue;
  } else {
    const range = max - min;
    min -= range * 0.08;
    max += range * 0.08;
  }
  const x = (index: number) =>
    pad.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => pad.top + (1 - (value - min) / (max - min)) * innerHeight;
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(point.balance).toFixed(2)}`).join(' ');
  const area = points.length
    ? `${line} L${x(points.length - 1).toFixed(2)},${(pad.top + innerHeight).toFixed(2)} L${x(0).toFixed(2)},${(pad.top + innerHeight).toFixed(2)} Z`
    : '';
  return { pad, innerWidth, innerHeight, min, max, x, y, line, area };
}

export function BankrollChart({ points, transactions = [], height = 230, compact = false }: ChartProps) {
  const gradientId = useId().replace(/:/g, '');
  const width = compact ? 360 : 820;
  const geo = useMemo(() => geometry(points, width, height, compact), [points, height, compact, width]);
  const transactionMarkers = useMemo(() => {
    if (compact || !transactions.length || !points.length) return [];
    const byDate = new Map(points.map((point, index) => [point.date.slice(0, 10), index]));
    return transactions
      .map((transaction) => {
        const index = byDate.get(transaction.date);
        if (index === undefined) return null;
        return { transaction, index };
      })
      .filter((item): item is { transaction: BankrollTransaction; index: number } => item !== null);
  }, [transactions, points, compact]);

  if (points.length === 0 || (!compact && points.every((point) => point.balance === 0))) {
    return (
      <div className="bankroll-chart-empty">
        Sem histórico ainda. Defina a banca inicial e registre uma aposta para começar.
      </div>
    );
  }

  const last = points[points.length - 1]!;
  const first = points[0]!;
  const gridValues = [0.1, 0.35, 0.6, 0.85].map((ratio) => geo.min + (geo.max - geo.min) * ratio);
  const xTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
    (value, index, list) => list.indexOf(value) === index,
  );

  return (
    <svg
      className={`bankroll-chart ${compact ? 'compact' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ height: 'auto' }}
      role="img"
      aria-label={`Evolução da banca: de ${fmtMoney(first.balance)} para ${fmtMoney(last.balance)}`}
    >
      <defs>
        <linearGradient id={`bankroll-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-2)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {!compact
        ? gridValues.map((value) => (
            <g key={value}>
              <line
                x1={geo.pad.left}
                x2={width - geo.pad.right}
                y1={geo.y(value)}
                y2={geo.y(value)}
                className="bankroll-grid-line"
              />
              <text x={geo.pad.left - 8} y={geo.y(value) + 4} textAnchor="end" className="bankroll-axis-label">
                {fmtMoney(value, 0)}
              </text>
            </g>
          ))
        : null}

      {!compact ? (
        <line
          x1={geo.pad.left}
          x2={width - geo.pad.right}
          y1={geo.y(first.balance)}
          y2={geo.y(first.balance)}
          className="bankroll-start-line"
        />
      ) : null}

      <path d={geo.area} fill={`url(#bankroll-fill-${gradientId})`} />
      <path d={geo.line} className="bankroll-line" />

      {transactionMarkers.map(({ transaction, index }) => (
        <circle
          key={transaction.id}
          cx={geo.x(index)}
          cy={geo.y(points[index]!.balance)}
          r={3.6}
          className={`bankroll-marker ${transaction.type}`}
        >
          <title>
            {transaction.type === 'deposit' ? 'Depósito' : 'Saque'} de {fmtMoney(transaction.amount)} em{' '}
            {fmtShortDate(transaction.date)}
          </title>
        </circle>
      ))}

      <circle cx={geo.x(points.length - 1)} cy={geo.y(last.balance)} r={4} className="bankroll-last-dot" />

      {!compact
        ? xTicks.map((index) => (
            <text
              key={index}
              x={geo.x(index)}
              y={height - 6}
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
              className="bankroll-axis-label"
            >
              {fmtShortDate(points[index]!.date)}
            </text>
          ))
        : null}
    </svg>
  );
}

export function BankrollSparkline({ points, height = 58 }: { points: BankrollPoint[]; height?: number }) {
  return <BankrollChart points={points} height={height} compact />;
}
