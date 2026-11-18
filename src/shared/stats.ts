import type {
  Aggregate,
  CalibrationBand,
  Filters,
  Prediction,
  PredictionQuery,
  PredictionStatus,
  Summary,
  TimelinePoint,
  ValidationIssue,
  PredictionInput,
} from './types';

const DAY_MS = 86_400_000;

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** YYYY-MM-DD no fuso local. */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now = new Date()): string {
  return toDateKey(now);
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function startOfMonthKey(date: Date): string {
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function endOfMonthKey(date: Date): string {
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function resolveRange(
  filters: Pick<Filters, 'period' | 'from' | 'to'>,
  now = new Date(),
): { from: string | null; to: string | null } {
  const today = toDateKey(now);
  switch (filters.period) {
    case '7d':
      return { from: toDateKey(new Date(now.getTime() - 6 * DAY_MS)), to: today };
    case '30d':
      return { from: toDateKey(new Date(now.getTime() - 29 * DAY_MS)), to: today };
    case '90d':
      return { from: toDateKey(new Date(now.getTime() - 89 * DAY_MS)), to: today };
    case 'this-month':
      return { from: startOfMonthKey(now), to: endOfMonthKey(now) };
    case 'last-month': {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      return { from: startOfMonthKey(last), to: endOfMonthKey(last) };
    }
    case 'custom':
      return { from: filters.from ?? null, to: filters.to ?? null };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

export function isSettled(p: Prediction): boolean {
  return p.status === 'hit' || p.status === 'miss';
}

export function isHit(p: Prediction): boolean {
  return p.status === 'hit';
}

export function probabilityFraction(p: Prediction): number {
  return Math.min(100, Math.max(0, p.probability)) / 100;
}

/** Brier Score de uma previsão. Retorna null quando não há resultado observável. */
export function predictionBrier(p: Prediction): number | null {
  if (!isSettled(p) || !Number.isFinite(p.probability)) return null;
  const phat = probabilityFraction(p);
  const observed = p.status === 'hit' ? 1 : 0;
  return (phat - observed) ** 2;
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function summarize(rows: Prediction[]): Summary {
  let hits = 0;
  let misses = 0;
  let voids = 0;
  let pending = 0;
  let withoutCategory = 0;
  let brierSum = 0;
  let brierCount = 0;
  let probSum = 0;
  let probCount = 0;

  for (const row of rows) {
    if (row.status === 'hit') hits += 1;
    else if (row.status === 'miss') misses += 1;
    else if (row.status === 'void') voids += 1;
    else pending += 1;

    if (!row.category || !row.category.trim()) withoutCategory += 1;

    if (Number.isFinite(row.probability)) {
      probSum += row.probability;
      probCount += 1;
      if (isSettled(row)) {
        brierSum += predictionBrier(row) ?? 0;
        brierCount += 1;
      }
    }
  }

  const settled = hits + misses;
  const hitRate = settled > 0 ? round((hits / settled) * 100) : null;
  const avgProbability = probCount > 0 ? round(probSum / probCount) : null;
  const brier = brierCount > 0 ? round(brierSum / brierCount, 4) : null;

  return {
    total: rows.length,
    settled,
    hits,
    misses,
    voids,
    pending,
    hitRate,
    brier,
    avgProbability,
    calibrationGap:
      hitRate !== null && avgProbability !== null ? round(hitRate - avgProbability) : null,
    brierSample: brierCount,
    withoutCategory,
  };
}

export interface GroupSpec {
  key: (p: Prediction) => string;
  label?: (p: Prediction) => string;
}

export function groupBy(rows: Prediction[], spec: GroupSpec): Aggregate[] {
  const buckets = new Map<string, Prediction[]>();
  const labels = new Map<string, string>();
  for (const row of rows) {
    const key = spec.key(row);
    if (!key) continue;
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
    if (!labels.has(key)) labels.set(key, spec.label ? spec.label(row) : key);
  }
  return [...buckets.entries()].map(([key, list]) => {
    const summary = summarize(list);
    const sports = [...new Set(list.map((p) => p.sport).filter(Boolean))].sort();
    return { ...summary, key, label: labels.get(key) ?? key, sports };
  });
}

export function byCompetition(rows: Prediction[]): Aggregate[] {
  return sortAggregates(
    groupBy(rows, {
      key: (p) => (p.competition ? `${p.sport}::${p.competition}` : ''),
      label: (p) => p.competition,
    }),
  );
}

export function bySport(rows: Prediction[]): Aggregate[] {
  return sortAggregates(groupBy(rows, { key: (p) => p.sport, label: (p) => p.sport }));
}

export function byCategory(rows: Prediction[]): Aggregate[] {
  return sortAggregates(groupBy(rows, { key: (p) => p.category, label: (p) => p.category }));
}

export function byBookmaker(rows: Prediction[]): Aggregate[] {
  return sortAggregates(groupBy(rows, { key: (p) => p.bookmaker, label: (p) => p.bookmaker }));
}

export function byTeam(rows: Prediction[]): Aggregate[] {
  return sortAggregates(
    groupBy(
      rows.filter((p) => p.subjectType === 'team'),
      { key: (p) => p.subject, label: (p) => p.subject },
    ),
  );
}

export function byPlayer(rows: Prediction[]): Aggregate[] {
  return sortAggregates(
    groupBy(
      rows.filter((p) => p.subjectType === 'player'),
      { key: (p) => p.subject, label: (p) => p.subject },
    ),
  );
}

export function sortAggregates(list: Aggregate[]): Aggregate[] {
  return [...list].sort((a, b) => {
    if ((b.hitRate ?? -1) !== (a.hitRate ?? -1)) return (b.hitRate ?? -1) - (a.hitRate ?? -1);
    return b.settled - a.settled;
  });
}

/** Faixas de probabilidade e calibração observada. */
export function calibration(rows: Prediction[], bandSize = 10): CalibrationBand[] {
  const bands: CalibrationBand[] = [];
  for (let from = 0; from < 100; from += bandSize) {
    const to = Math.min(100, from + bandSize);
    bands.push({
      from,
      to,
      label: `${from}% – ${to}%`,
      count: 0,
      hits: 0,
      misses: 0,
      hitRate: null,
      expected: 0,
    });
  }
  const probSums = new Array(bands.length).fill(0) as number[];

  for (const row of rows) {
    if (!isSettled(row) || !Number.isFinite(row.probability)) continue;
    const idx = Math.min(bands.length - 1, Math.max(0, Math.floor(row.probability / bandSize)));
    const band = bands[idx]!;
    band.count += 1;
    if (row.status === 'hit') band.hits += 1;
    else band.misses += 1;
    probSums[idx] = (probSums[idx] ?? 0) + row.probability;
  }

  return bands.map((band, idx) => ({
    ...band,
    hitRate: band.count > 0 ? round((band.hits / band.count) * 100) : null,
    expected: band.count > 0 ? round((probSums[idx] ?? 0) / band.count) : round((band.from + band.to) / 2),
  }));
}

/** Evolução diária: volume registrado + taxa acumulada + Brier acumulado. */
export function timeline(rows: Prediction[]): TimelinePoint[] {
  const buckets = new Map<string, Prediction[]>();
  for (const row of rows) {
    const day = (row.eventDate || row.createdAt).slice(0, 10);
    const list = buckets.get(day);
    if (list) list.push(row);
    else buckets.set(day, [row]);
  }
  const days = [...buckets.keys()].sort();
  let cumSettled = 0;
  let cumHits = 0;
  let cumBrier = 0;
  return days.map((day) => {
    const list = buckets.get(day)!;
    const s = summarize(list);
    cumSettled += s.settled;
    cumHits += s.hits;
    for (const row of list) {
      const b = predictionBrier(row);
      if (b !== null) cumBrier += b;
    }
    return {
      date: day,
      settled: s.settled,
      hits: s.hits,
      hitRate: s.hitRate,
      cumulativeSettled: cumSettled,
      cumulativeHitRate: cumSettled > 0 ? round((cumHits / cumSettled) * 100) : null,
      cumulativeBrier: cumSettled > 0 ? round(cumBrier / cumSettled, 4) : null,
    };
  });
}

export function matchesSearch(row: Prediction, term: string): boolean {
  if (!term) return true;
  const haystack = [
    row.sport,
    row.competition,
    row.subject,
    row.event,
    row.category,
    row.predictedResult,
    row.actualResult,
    row.notes,
    row.bookmaker,
  ]
    .join(' ')
    .toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

/** Filtros aplicados de forma consistente em toda a aplicação. */
export function filterPredictions(rows: Prediction[], filters: Filters, now = new Date()): Prediction[] {
  const { from, to } = resolveRange(filters, now);
  const term = filters.search.trim();
  return rows.filter((row) => {
    const day = row.eventDate.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (filters.sport && row.sport !== filters.sport) return false;
    if (filters.competition && row.competition !== filters.competition) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.status !== 'all' && row.status !== filters.status) return false;
    if (filters.bookmaker && row.bookmaker !== filters.bookmaker) return false;
    if (filters.subjectType && row.subjectType !== filters.subjectType) return false;
    if (filters.subject && row.subject !== filters.subject) return false;
    return matchesSearch(row, term);
  });
}

const SORTERS: Record<PredictionQuery['sortBy'], (p: Prediction) => string | number> = {
  eventDate: (p) => p.eventDate,
  sport: (p) => p.sport.toLowerCase(),
  competition: (p) => p.competition.toLowerCase(),
  category: (p) => p.category.toLowerCase(),
  probability: (p) => p.probability,
  status: (p) => statusRank(p.status),
  createdAt: (p) => p.createdAt,
};

export function queryPredictions(
  rows: Prediction[],
  query: PredictionQuery,
  now = new Date(),
): { rows: Prediction[]; total: number; page: number; pageCount: number } {
  const filtered = filterPredictions(rows, query, now);
  const getter = SORTERS[query.sortBy] ?? SORTERS.eventDate;
  const dir = query.sortDir === 'asc' ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    const va = getter(a);
    const vb = getter(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return b.eventDate.localeCompare(a.eventDate);
  });
  const pageSize = Math.max(1, query.pageSize);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(1, query.page), pageCount);
  return {
    rows: sorted.slice((page - 1) * pageSize, page * pageSize),
    total: sorted.length,
    page,
    pageCount,
  };
}

export function uniqueSorted(rows: Prediction[], pick: (p: Prediction) => string): string[] {
  return [...new Set(rows.map(pick).filter((v) => v && v.trim()))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function validatePrediction(input: Partial<PredictionInput>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const required: [keyof PredictionInput, string][] = [
    ['sport', 'Informe a modalidade esportiva.'],
    ['competition', 'Informe a competição.'],
    ['subject', 'Informe o time ou jogador relacionado.'],
    ['event', 'Informe o evento.'],
    ['category', 'Informe a categoria do mercado.'],
    ['predictedResult', 'Informe o resultado previsto.'],
  ];
  for (const [field, message] of required) {
    const value = input[field];
    if (typeof value !== 'string' || !value.trim()) issues.push({ field, message });
  }
  if (!input.eventDate || !ISO_DATE.test(input.eventDate) || Number.isNaN(Date.parse(input.eventDate))) {
    issues.push({ field: 'eventDate', message: 'Informe data e horário válidos (AAAA-MM-DDTHH:mm).' });
  }
  if (input.probability === undefined || input.probability === null) {
    issues.push({ field: 'probability', message: 'Informe a probabilidade estimada.' });
  } else if (!Number.isFinite(input.probability) || input.probability < 0 || input.probability > 100) {
    issues.push({ field: 'probability', message: 'A probabilidade deve estar entre 0% e 100%.' });
  }
  if (input.stake !== undefined && input.stake !== null) {
    if (!Number.isFinite(input.stake) || input.stake < 0) {
      issues.push({ field: 'stake', message: 'O valor apostado não pode ser negativo.' });
    } else if (input.stake > 100_000_000) {
      issues.push({ field: 'stake', message: 'Valor apostado acima do limite permitido.' });
    }
  }
  if (input.odds !== undefined && input.odds !== null) {
    if (!Number.isFinite(input.odds) || input.odds <= 1) {
      issues.push({ field: 'odds', message: 'As odds decimais devem ser maiores que 1,00.' });
    } else if (input.odds > 10_000) {
      issues.push({ field: 'odds', message: 'Odds acima do limite permitido.' });
    }
  }
  if ((input.stake ?? 0) > 0 && (!input.odds || input.odds <= 1)) {
    issues.push({ field: 'odds', message: 'Informe as odds para calcular o retorno da aposta.' });
  }
  if (input.subjectType && input.subjectType !== 'team' && input.subjectType !== 'player') {
    issues.push({ field: 'subjectType', message: 'Tipo de sujeito inválido.' });
  }
  if (input.status && !['pending', 'hit', 'miss', 'void'].includes(input.status)) {
    issues.push({ field: 'status', message: 'Status inválido.' });
  }
  if (input.notes && input.notes.length > 4000) {
    issues.push({ field: 'notes', message: 'Observações muito longas (máx. 4000 caracteres).' });
  }
  return issues;
}

/** Chave natural usada para evitar duplicações em importações. */
export function fingerprint(p: Pick<Prediction, 'sport' | 'competition' | 'subject' | 'event' | 'eventDate' | 'category' | 'predictedResult'>): string {
  return [p.sport, p.competition, p.subject, p.event, p.eventDate, p.category, p.predictedResult]
    .map((v) => (v ?? '').trim().toLowerCase())
    .join('|');
}

export function statusRank(status: PredictionStatus): number {
  return { pending: 0, hit: 1, miss: 2, void: 3 }[status];
}
