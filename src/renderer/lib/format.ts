import type { PredictionStatus } from '../../shared/types';
import { STATUS_LABEL } from '../../shared/types';

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${fmtNumber(value, digits)}%`;
}

export function fmtSigned(value: number | null | undefined, digits = 1, suffix = ' pp'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmtNumber(value, digits)}${suffix}`;
}

export function fmtBrier(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(3).replace('.', ',');
}

export function fmtMoney(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtMoneySigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const formatted = fmtMoney(Math.abs(value), digits);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export function fmtOdds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;

export function parseIso(value: string): Date | null {
  const match = value?.match(DATE_RE);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0));
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseIso(value);
  if (!date) return value;
  return date.toLocaleDateString('pt-BR');
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseIso(value);
  if (!date) return value;
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function fmtTime(value: string | null | undefined): string {
  const date = value ? parseIso(value) : null;
  if (!date) return '—';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtWeekday(value: string): string {
  const date = parseIso(value);
  if (!date) return '';
  return date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

export function fmtMonthYear(date: Date): string {
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function fmtShortDate(value: string): string {
  const date = parseIso(value);
  if (!date) return value;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function relativeDay(value: string, now = new Date()): string {
  const date = parseIso(value);
  if (!date) return '';
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff > 1 && diff <= 7) return `Em ${diff} dias`;
  if (diff < -1 && diff >= -7) return `Há ${Math.abs(diff)} dias`;
  return fmtDate(value);
}

export function statusMeta(status: PredictionStatus): { label: string; className: string } {
  return {
    label: STATUS_LABEL[status],
    className: `badge badge-${status}`,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pctWidth(value: number | null, max = 100): string {
  if (value === null || !Number.isFinite(value)) return '0%';
  return `${clamp((value / max) * 100, 2, 100)}%`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

export function weekdayNames(): string[] {
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
}
