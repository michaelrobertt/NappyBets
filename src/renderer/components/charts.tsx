import { useState } from 'react';
import type { CalibrationBand, TimelinePoint } from '../../shared/types';
import { fmtNumber, fmtPercent, fmtShortDate } from '../lib/format';
import { useSize } from './ui';

const AXIS = 'var(--text-3)';
const GRID = 'var(--border-soft)';

function linePath(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function PerformanceChart({ points, height = 230 }: { points: TimelinePoint[]; height?: number }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = Math.max(320, size.width || 520);
  const padding = { top: 14, right: 16, bottom: 26, left: 38 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const visible = points.filter((p) => p.cumulativeHitRate !== null);
  if (visible.length === 0) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 12 }}>
        Sem resultados concluídos no período para desenhar a evolução.
      </div>
    );
  }

  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const xFor = (index: number) => padding.left + (points.length === 1 ? innerW / 2 : index * step);
  const yFor = (value: number) => padding.top + innerH - (value / 100) * innerH;

  const coords = points.map((point, index) => ({
    x: xFor(index),
    y: yFor(point.cumulativeHitRate ?? 0),
    point,
  }));
  const series = coords.filter((c) => c.point.cumulativeHitRate !== null);
  const area = `${linePath(series)} L${series[series.length - 1]!.x.toFixed(1)},${(padding.top + innerH).toFixed(1)} L${series[0]!.x.toFixed(1)},${(padding.top + innerH).toFixed(1)} Z`;

  const maxDaily = Math.max(1, ...points.map((p) => p.settled));
  const barW = Math.max(2, Math.min(10, innerW / Math.max(points.length, 1) - 4));

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const index = Math.round((x - padding.left) / (step || 1));
    setHover(Math.max(0, Math.min(points.length - 1, index)));
  };

  const active = hover !== null ? coords[hover] : null;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} role="img" aria-label="Evolução da taxa de acerto">
        <defs>
          <linearGradient id="perf-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke={GRID}
              strokeDasharray={tick === 50 ? '3 4' : undefined}
            />
            <text x={padding.left - 8} y={yFor(tick) + 4} textAnchor="end" fontSize="10" fill={AXIS}>
              {tick}%
            </text>
          </g>
        ))}

        {points.map((point, index) =>
          point.settled > 0 ? (
            <rect
              key={`bar-${point.date}`}
              x={xFor(index) - barW / 2}
              y={padding.top + innerH - (point.settled / maxDaily) * (innerH * 0.16)}
              width={barW}
              height={(point.settled / maxDaily) * (innerH * 0.16)}
              rx={1.5}
              fill="var(--accent)"
              opacity={0.18}
            />
          ) : null,
        )}

        <path d={area} fill="url(#perf-fill)" />
        <path d={linePath(series)} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" />

        {active ? (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={padding.top}
              y2={padding.top + innerH}
              stroke="var(--accent-line)"
              strokeDasharray="3 3"
            />
            {active.point.cumulativeHitRate !== null ? (
              <>
                <circle cx={active.x} cy={active.y} r="5" fill="var(--accent)" opacity="0.25" />
                <circle cx={active.x} cy={active.y} r="3.2" fill="var(--accent-2)" stroke="var(--panel)" strokeWidth="1.5" />
              </>
            ) : null}
          </g>
        ) : null}

        {points.length > 0 ? (
          <>
            <text x={padding.left} y={height - 8} fontSize="10" fill={AXIS}>
              {fmtShortDate(points[0]!.date)}
            </text>
            <text x={width - padding.right} y={height - 8} fontSize="10" fill={AXIS} textAnchor="end">
              {fmtShortDate(points[points.length - 1]!.date)}
            </text>
          </>
        ) : null}

        <rect
          x={padding.left}
          y={padding.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {active ? (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(active.x - 70, 4), width - 150),
            top: 4,
            width: 146,
            background: 'var(--panel-3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '7px 9px',
            fontSize: 11,
            pointerEvents: 'none',
            boxShadow: 'var(--shadow)',
            zIndex: 5,
          }}
        >
          <div style={{ color: 'var(--text-2)', marginBottom: 2 }}>{fmtShortDate(active.point.date)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted-3">Acumulado</span>
            <strong>{fmtPercent(active.point.cumulativeHitRate)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted-3">Concluídas</span>
            <strong>{fmtNumber(active.point.cumulativeSettled)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted-3">Brier</span>
            <strong>{active.point.cumulativeBrier?.toFixed(3) ?? '—'}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CalibrationChart({
  bands,
  height = 250,
}: {
  bands: CalibrationBand[];
  height?: number;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<CalibrationBand | null>(null);
  const width = Math.max(320, size.width || 480);
  const padding = { top: 14, right: 16, bottom: 38, left: 38 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xFor = (value: number) => padding.left + (value / 100) * innerW;
  const yFor = (value: number) => padding.top + innerH - (value / 100) * innerH;
  const withData = bands.filter((b) => b.count > 0);
  const maxCount = Math.max(1, ...withData.map((b) => b.count));

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} role="img" aria-label="Calibração das previsões">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} stroke={GRID} />
            <line x1={xFor(tick)} x2={xFor(tick)} y1={padding.top} y2={padding.top + innerH} stroke={GRID} />
            <text x={padding.left - 8} y={yFor(tick) + 4} textAnchor="end" fontSize="10" fill={AXIS}>
              {tick}%
            </text>
            <text x={xFor(tick)} y={height - 18} textAnchor="middle" fontSize="10" fill={AXIS}>
              {tick}%
            </text>
          </g>
        ))}
        <line
          x1={xFor(0)}
          y1={yFor(0)}
          x2={xFor(100)}
          y2={yFor(100)}
          stroke="var(--text-3)"
          strokeDasharray="4 4"
          strokeWidth="1.2"
        />

        {withData.map((band) => {
          const radius = 4 + Math.sqrt(band.count / maxCount) * 6;
          const gap =
            band.hitRate !== null && band.expected ? band.hitRate - band.expected : null;
          const color =
            gap === null
              ? 'var(--text-3)'
              : Math.abs(gap) <= 5
                ? 'var(--accent)'
                : Math.abs(gap) <= 12
                  ? 'var(--warn)'
                  : 'var(--danger)';
          return (
            <g
              key={band.label}
              onMouseEnter={() => setHover(band)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={xFor(band.expected)}
                cy={yFor(band.hitRate ?? 0)}
                r={radius}
                fill={color}
                fillOpacity={0.22}
                stroke={color}
                strokeWidth="1.6"
              />
              <circle cx={xFor(band.expected)} cy={yFor(band.hitRate ?? 0)} r="2" fill={color} />
            </g>
          );
        })}

        <text x={width / 2} y={height - 2} textAnchor="middle" fontSize="9.5" fill={AXIS}>
          probabilidade estimada
        </text>
      </svg>

      {hover ? (
        <div
          style={{
            position: 'absolute',
            right: 4,
            top: 4,
            width: 170,
            background: 'var(--panel-3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '7px 9px',
            fontSize: 11,
            pointerEvents: 'none',
            boxShadow: 'var(--shadow)',
            zIndex: 5,
          }}
        >
          <div style={{ color: 'var(--text-2)', marginBottom: 2 }}>Faixa {hover.label}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted-3">Estimado médio</span>
            <strong>{fmtPercent(hover.expected)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted-3">Acerto real</span>
            <strong>{fmtPercent(hover.hitRate)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted-3">Amostra</span>
            <strong>{fmtNumber(hover.count)}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DistributionBar({
  hit,
  miss,
  pending,
  voided,
}: {
  hit: number;
  miss: number;
  pending: number;
  voided: number;
}) {
  const total = Math.max(1, hit + miss + pending + voided);
  const segments = [
    { value: hit, color: 'var(--accent)', label: 'Acertos' },
    { value: miss, color: 'var(--danger)', label: 'Erros' },
    { value: pending, color: 'var(--warn)', label: 'Pendentes' },
    { value: voided, color: 'var(--text-3)', label: 'Anuladas' },
  ].filter((s) => s.value > 0);

  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 20, overflow: 'hidden', background: 'var(--panel-3)' }}>
        {segments.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            style={{ width: `${(segment.value / total) * 100}%`, background: segment.color, opacity: 0.85 }}
          />
        ))}
      </div>
      <div className="pill-row" style={{ marginTop: 10 }}>
        {segments.map((segment) => (
          <span key={segment.label} className="row" style={{ gap: 5, fontSize: 11.5, color: 'var(--text-2)' }}>
            <span className="dot" style={{ background: segment.color, width: 7, height: 7 }} />
            {segment.label}
            <strong style={{ color: 'var(--text)' }}>{fmtNumber(segment.value)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
