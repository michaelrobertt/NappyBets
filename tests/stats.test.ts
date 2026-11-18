import { describe, expect, it } from 'vitest';
import type { Prediction } from '../src/shared/types';
import { EMPTY_FILTERS, DEFAULT_SETTINGS } from '../src/shared/types';
import {
  calibration,
  filterPredictions,
  fingerprint,
  groupBy,
  predictionBrier,
  queryPredictions,
  resolveRange,
  summarize,
  timeline,
  validatePrediction,
} from '../src/shared/stats';
import { buildAnalytics, pickHighlights } from '../src/shared/analytics';

let counter = 0;
function makePrediction(overrides: Partial<Prediction> = {}): Prediction {
  counter += 1;
  return {
    id: `p-${counter}`,
    sport: 'League of Legends',
    competition: 'CBLOL',
    subjectType: 'team',
    subject: 'LOUD',
    event: 'LOUD vs paiN Gaming',
    eventDate: '2026-02-10T18:00',
    category: 'Vencedor da partida',
    predictedResult: 'Vitória LOUD',
    probability: 60,
    status: 'pending',
    actualResult: '',
    bookmaker: 'Betano',
    notes: '',
    isDemo: false,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    ...overrides,
    stake: overrides.stake ?? 0,
    odds: overrides.odds ?? null,
  };
}

describe('resumo estatístico', () => {
  it('calcula taxa de acerto apenas com acertos e erros', () => {
    const rows = [
      makePrediction({ status: 'hit' }),
      makePrediction({ status: 'hit' }),
      makePrediction({ status: 'hit' }),
      makePrediction({ status: 'miss' }),
      makePrediction({ status: 'pending' }),
      makePrediction({ status: 'pending' }),
      makePrediction({ status: 'void' }),
    ];
    const summary = summarize(rows);
    expect(summary.total).toBe(7);
    expect(summary.settled).toBe(4);
    expect(summary.hits).toBe(3);
    expect(summary.misses).toBe(1);
    expect(summary.pending).toBe(2);
    expect(summary.voids).toBe(1);
    expect(summary.hitRate).toBe(75);
  });

  it('retorna null quando não há previsões concluídas', () => {
    const summary = summarize([makePrediction({ status: 'pending' })]);
    expect(summary.hitRate).toBeNull();
    expect(summary.brier).toBeNull();
  });

  it('calcula o Brier Score ignorando pendentes e anuladas', () => {
    const rows = [
      makePrediction({ status: 'hit', probability: 80 }), // (0.8-1)^2 = 0.04
      makePrediction({ status: 'hit', probability: 60 }), // (0.6-1)^2 = 0.16
      makePrediction({ status: 'miss', probability: 70 }), // (0.7-0)^2 = 0.49
      makePrediction({ status: 'miss', probability: 50 }), // 0.25
      makePrediction({ status: 'pending', probability: 99 }),
      makePrediction({ status: 'void', probability: 10 }),
    ];
    const summary = summarize(rows);
    expect(summary.brierSample).toBe(4);
    expect(summary.brier).toBeCloseTo(0.235, 5);
    expect(predictionBrier(rows[0]!)).toBeCloseTo(0.04, 5);
    expect(predictionBrier(rows[4]!)).toBeNull();
  });

  it('calcula desvio de calibração', () => {
    const rows = [
      makePrediction({ status: 'hit', probability: 70 }),
      makePrediction({ status: 'miss', probability: 70 }),
      makePrediction({ status: 'miss', probability: 70 }),
      makePrediction({ status: 'hit', probability: 70 }),
    ];
    const summary = summarize(rows);
    expect(summary.avgProbability).toBe(70);
    expect(summary.hitRate).toBe(50);
    expect(summary.calibrationGap).toBe(-20);
  });
});

describe('calibração por faixas', () => {
  it('agrupa probabilidades nas faixas corretas', () => {
    const rows = [
      makePrediction({ status: 'hit', probability: 71 }),
      makePrediction({ status: 'hit', probability: 79 }),
      makePrediction({ status: 'miss', probability: 74 }),
      makePrediction({ status: 'hit', probability: 100 }),
      makePrediction({ status: 'pending', probability: 55 }),
    ];
    const bands = calibration(rows);
    const band70 = bands.find((band) => band.from === 70)!;
    expect(band70.count).toBe(3);
    expect(band70.hits).toBe(2);
    expect(band70.hitRate).toBeCloseTo(66.67, 1);
    expect(band70.expected).toBeCloseTo(74.67, 1);
    const band90 = bands.find((band) => band.from === 90)!;
    expect(band90.count).toBe(1);
    expect(band90.hitRate).toBe(100);
    expect(bands.find((band) => band.from === 50)!.count).toBe(0);
  });

  it('não considera 100% em faixa inexistente', () => {
    const bands = calibration([makePrediction({ status: 'hit', probability: 100 })]);
    expect(bands.at(-1)!.from).toBe(90);
    expect(bands.at(-1)!.count).toBe(1);
    expect(bands).toHaveLength(10);
  });
});

describe('filtros', () => {
  const rows = [
    makePrediction({ sport: 'League of Legends', competition: 'CBLOL', category: 'Vencedor da partida', status: 'hit', eventDate: '2026-02-01T18:00' }),
    makePrediction({ sport: 'CS2', competition: 'ESL Pro League', category: 'Total de rounds', status: 'miss', eventDate: '2026-02-15T18:00', bookmaker: 'Pinnacle' }),
    makePrediction({ sport: 'CS2', competition: 'BLAST Premier', category: 'Vencedor da partida', status: 'pending', eventDate: '2026-03-01T18:00' }),
    makePrediction({ sport: 'Futebol', competition: 'Brasileirão Série A', category: 'Total de gols', status: 'void', eventDate: '2026-01-20T18:00' }),
  ];

  it('filtra por período inclusive', () => {
    const filtered = filterPredictions(rows, { ...EMPTY_FILTERS, period: 'custom', from: '2026-02-01', to: '2026-02-28' });
    expect(filtered).toHaveLength(2);
    expect(filtered.map((row) => row.competition)).toEqual(['CBLOL', 'ESL Pro League']);
  });

  it('filtra por modalidade, competição, categoria, status e casa', () => {
    expect(filterPredictions(rows, { ...EMPTY_FILTERS, sport: 'CS2' })).toHaveLength(2);
    expect(filterPredictions(rows, { ...EMPTY_FILTERS, competition: 'BLAST Premier' })).toHaveLength(1);
    expect(filterPredictions(rows, { ...EMPTY_FILTERS, category: 'Total de rounds' })).toHaveLength(1);
    expect(filterPredictions(rows, { ...EMPTY_FILTERS, status: 'void' })).toHaveLength(1);
    expect(filterPredictions(rows, { ...EMPTY_FILTERS, bookmaker: 'Pinnacle' })).toHaveLength(1);
  });

  it('busca textual por múltiplos termos', () => {
    expect(filterPredictions(rows, { ...EMPTY_FILTERS, search: 'esl rounds' })).toHaveLength(1);
    expect(filterPredictions(rows, { ...EMPTY_FILTERS, search: 'nada-a-ver' })).toHaveLength(0);
    expect(filterPredictions(rows, { ...EMPTY_FILTERS, search: 'loud' })).toHaveLength(4);
  });

  it('resolve períodos relativos', () => {
    const now = new Date(2026, 1, 20, 12, 0, 0); // 20/02/2026
    expect(resolveRange({ period: '7d', from: null, to: null }, now)).toEqual({ from: '2026-02-14', to: '2026-02-20' });
    expect(resolveRange({ period: 'this-month', from: null, to: null }, now)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolveRange({ period: 'last-month', from: null, to: null }, now)).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(resolveRange({ period: 'all', from: null, to: null }, now)).toEqual({ from: null, to: null });
  });

  it('ordena e pagina resultados', () => {
    const result = queryPredictions(rows, {
      ...EMPTY_FILTERS,
      sortBy: 'eventDate',
      sortDir: 'desc',
      page: 1,
      pageSize: 2,
    });
    expect(result.total).toBe(4);
    expect(result.pageCount).toBe(2);
    expect(result.rows.map((row) => row.eventDate)).toEqual(['2026-03-01T18:00', '2026-02-15T18:00']);
    const page2 = queryPredictions(rows, { ...EMPTY_FILTERS, sortBy: 'eventDate', sortDir: 'desc', page: 2, pageSize: 2 });
    expect(page2.rows.map((row) => row.eventDate)).toEqual(['2026-02-01T18:00', '2026-01-20T18:00']);
    const clamped = queryPredictions(rows, { ...EMPTY_FILTERS, sortBy: 'eventDate', sortDir: 'desc', page: 90, pageSize: 2 });
    expect(clamped.page).toBe(2);
  });

  it('separa competições com o mesmo nome em modalidades diferentes', () => {
    const rowsWithSameName = [
      makePrediction({ sport: 'CS2', competition: 'Major' }),
      makePrediction({ sport: 'League of Legends', competition: 'Major' }),
    ];
    const aggregates = groupBy(rowsWithSameName, { key: (p) => `${p.sport}::${p.competition}`, label: (p) => p.competition });
    expect(aggregates).toHaveLength(2);
  });
});

describe('destaques', () => {
  const aggregates = [
    { key: 'a', label: 'A', settled: 10, hits: 8, misses: 2, hitRate: 80, total: 10, pending: 0, voids: 0, brier: 0.2, avgProbability: 60, calibrationGap: 20, brierSample: 10, withoutCategory: 0, sports: ['CS2'] },
    { key: 'b', label: 'B', settled: 3, hits: 3, misses: 0, hitRate: 100, total: 3, pending: 0, voids: 0, brier: 0.1, avgProbability: 60, calibrationGap: 40, brierSample: 3, withoutCategory: 0, sports: ['CS2'] },
    { key: 'c', label: 'C', settled: 8, hits: 2, misses: 6, hitRate: 25, total: 8, pending: 0, voids: 0, brier: 0.4, avgProbability: 60, calibrationGap: -35, brierSample: 8, withoutCategory: 0, sports: ['CS2'] },
  ];

  it('exclui amostras insuficientes e ordena as listas', () => {
    const result = pickHighlights(aggregates, 5, 5);
    expect(result.positive.map((item) => item.key)).toEqual(['a']);
    expect(result.negative.map((item) => item.key)).toEqual(['c']);
    expect(result.excludedForSample).toBe(1);
  });
});

describe('analytics do dashboard', () => {
  it('mantém consistência entre resumo, destaques e avisos', () => {
    const rows = [
      makePrediction({ status: 'hit', probability: 70, competition: 'CBLOL' }),
      makePrediction({ status: 'miss', probability: 70, competition: 'CBLOL' }),
      makePrediction({ status: 'hit', probability: 80, competition: 'LCK' }),
      makePrediction({ status: 'hit', probability: 60, competition: 'LCK' }),
      makePrediction({ status: 'hit', probability: 55, competition: 'LCK' }),
      makePrediction({ status: 'pending', competition: 'LEC' }),
      makePrediction({ status: 'void', competition: 'LEC' }),
      makePrediction({ status: 'hit', probability: 65, competition: 'LCK', category: '' }),
    ];
    const analytics = buildAnalytics(rows, { ...EMPTY_FILTERS }, { ...DEFAULT_SETTINGS, minSample: 2 }, new Date(2026, 1, 20));
    expect(analytics.summary.settled).toBe(6);
    expect(analytics.summary.hitRate).toBeCloseTo(83.33, 1);
    expect(analytics.highlights.positive.map((item) => item.label)).toEqual(['LCK']);
    expect(analytics.highlights.negative.map((item) => item.label)).toEqual(['CBLOL']);
    expect(analytics.warnings.some((warning) => warning.includes('pendente'))).toBe(true);
    expect(analytics.warnings.some((warning) => warning.includes('anulada'))).toBe(true);
    expect(analytics.warnings.some((warning) => warning.includes('sem categoria'))).toBe(true);
    expect(analytics.calibration.bands.reduce((total, band) => total + band.count, 0)).toBe(6);
    expect(analytics.byCompetition).toHaveLength(3);
    expect(analytics.facets.sports.length).toBeGreaterThan(0);
  });

  it('calcula série temporal acumulada', () => {
    const points = timeline([
      makePrediction({ status: 'hit', eventDate: '2026-02-01T10:00' }),
      makePrediction({ status: 'miss', eventDate: '2026-02-02T10:00' }),
      makePrediction({ status: 'hit', eventDate: '2026-02-02T12:00' }),
    ]);
    expect(points).toHaveLength(2);
    expect(points[1]!.cumulativeSettled).toBe(3);
    expect(points[1]!.cumulativeHitRate).toBeCloseTo(66.67, 1);
  });
});

describe('validação e duplicidade', () => {
  it('rejeita campos obrigatórios e probabilidade inválida', () => {
    const issues = validatePrediction({
      sport: '',
      competition: '',
      subject: '',
      event: '',
      category: '',
      predictedResult: '',
      eventDate: '2026-02-10T18:00',
      probability: 150,
    });
    const fields = issues.map((issue) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(['sport', 'competition', 'subject', 'event', 'category', 'predictedResult', 'probability']));
  });

  it('aceita entrada válida', () => {
    expect(
      validatePrediction({
        sport: 'CS2',
        competition: 'BLAST Premier',
        subject: 'Vitality',
        subjectType: 'team',
        event: 'Vitality vs FaZe',
        eventDate: '2026-02-10T18:00',
        category: 'Vencedor da partida',
        predictedResult: 'Vitória Vitality',
        probability: 62,
        status: 'pending',
        actualResult: '',
        bookmaker: 'Betano',
        notes: '',
        isDemo: false,
      }),
    ).toHaveLength(0);
  });

  it('gera impressão digital normalizada', () => {
    const key = fingerprint({ sport: ' CS2 ', competition: 'BLAST', subject: 'Vitality', event: ' V vs F ', eventDate: '2026-02-10T18:00', category: 'Mapas', predictedResult: 'VITÓRIA VITALITY' });
    expect(key).toBe('cs2|blast|vitality|v vs f|2026-02-10t18:00|mapas|vitória vitality');
  });
});
