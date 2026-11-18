import type {
  Aggregate,
  Analytics,
  AppSettings,
  Facets,
  Filters,
  Prediction,
  Summary,
} from './types';
import {
  byBookmaker,
  byCategory,
  byCompetition,
  byPlayer,
  bySport,
  byTeam,
  calibration,
  filterPredictions,
  resolveRange,
  round,
  sortAggregates,
  summarize,
  timeline,
  uniqueSorted,
} from './stats';

export function buildFacets(all: Prediction[]): Facets {
  return {
    sports: uniqueSorted(all, (p) => p.sport),
    competitions: uniqueSorted(all, (p) => p.competition),
    categories: uniqueSorted(all, (p) => p.category),
    bookmakers: uniqueSorted(all, (p) => p.bookmaker),
    competitionsBySport: all.reduce<Record<string, string[]>>((acc, p) => {
      if (!p.sport || !p.competition) return acc;
      const list = acc[p.sport] ?? (acc[p.sport] = []);
      if (!list.includes(p.competition)) list.push(p.competition);
      return acc;
    }, {}),
    teams: uniqueSorted(
      all.filter((p) => p.subjectType === 'team'),
      (p) => p.subject,
    ),
    players: uniqueSorted(
      all.filter((p) => p.subjectType === 'player'),
      (p) => p.subject,
    ),
  };
}

export function pickHighlights(
  aggregates: Aggregate[],
  minSample: number,
  limit = 5,
): { positive: Aggregate[]; negative: Aggregate[]; excludedForSample: number } {
  const eligible = aggregates.filter((a) => a.settled >= minSample);
  const excludedForSample = aggregates.filter((a) => a.settled < minSample && a.total > 0).length;
  const ranked = [...eligible].sort((a, b) => {
    const diff = (b.hitRate ?? -1) - (a.hitRate ?? -1);
    return diff !== 0 ? diff : b.settled - a.settled;
  });
  // Destaques positivos exigem desempenho acima de 50%; os negativos nunca
  // repetem um grupo já apresentado como destaque positivo.
  const positive = ranked.filter((a) => (a.hitRate ?? 0) > 50).slice(0, limit);
  const taken = new Set(positive.map((a) => a.key));
  const negative = [...ranked]
    .filter((a) => a.misses > 0 && !taken.has(a.key))
    .sort((a, b) => {
      const diff = (a.hitRate ?? 101) - (b.hitRate ?? 101);
      return diff !== 0 ? diff : b.misses - a.misses;
    })
    .slice(0, limit);
  return { positive, negative, excludedForSample };
}

export function buildAnalytics(
  all: Prediction[],
  filters: Filters,
  settings: AppSettings,
  now = new Date(),
): Analytics {
  const rows = filterPredictions(all, filters, now);
  const summary = summarize(rows);
  const dimension = settings.dashboardDimension;
  const byComp = byCompetition(rows);
  const bySprt = bySport(rows);
  const byCat = byCategory(rows);
  const dimensionAggregates =
    dimension === 'sport' ? bySprt : dimension === 'category' ? byCat : byComp;
  const highlights = pickHighlights(dimensionAggregates, settings.minSample);
  const range = resolveRange(filters, now);

  const upcoming = rows
    .filter((p) => p.status === 'pending' && p.eventDate >= now.toISOString().slice(0, 16))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .slice(0, 8);

  const warnings: string[] = [];
  if (summary.pending > 0) {
    warnings.push(
      `${summary.pending} previsão(ões) pendente(s) fora dos indicadores de acerto e Brier — atualize o resultado quando o evento terminar.`,
    );
  }
  if (summary.voids > 0) {
    warnings.push(
      `${summary.voids} previsão(ões) anulada(s) não entram na taxa de acerto nem no Brier Score.`,
    );
  }
  if (summary.withoutCategory > 0) {
    warnings.push(
      `${summary.withoutCategory} previsão(ões) sem categoria preenchida não aparecem nos destaques por categoria.`,
    );
  }
  if (highlights.excludedForSample > 0) {
    warnings.push(
      `${highlights.excludedForSample} categoria(s) não atingiram a amostra mínima de ${settings.minSample} resultados concluídos e ficam fora dos destaques.`,
    );
  }
  if (summary.settled > 0 && summary.settled < settings.minSample) {
    warnings.push(
      `Amostra atual de ${summary.settled} resultado(s) concluído(s) é pequena: interprete os percentuais com cautela.`,
    );
  }
  if (summary.total > 0 && summary.settled === 0) {
    warnings.push('Nenhuma previsão concluída no recorte atual: não há taxa de acerto a exibir.');
  }

  return {
    summary,
    range,
    byCompetition: byComp,
    bySport: bySprt,
    byCategory: byCat,
    byBookmaker: byBookmaker(rows),
    byTeam: byTeam(rows),
    byPlayer: byPlayer(rows),
    calibration: { bands: calibration(rows), settled: summary.settled },
    timeline: timeline(rows),
    highlights: {
      dimension,
      minSample: settings.minSample,
      positive: highlights.positive,
      negative: highlights.negative,
      excludedForSample: highlights.excludedForSample,
    },
    upcoming,
    warnings,
    facets: buildFacets(all),
  };
}

export function emptySummary(): Summary {
  return {
    total: 0,
    settled: 0,
    hits: 0,
    misses: 0,
    voids: 0,
    pending: 0,
    hitRate: null,
    brier: null,
    avgProbability: null,
    calibrationGap: null,
    brierSample: 0,
    withoutCategory: 0,
  };
}

export function aggregateFor(
  rows: Prediction[],
  predicate: (p: Prediction) => boolean,
): Aggregate {
  const list = rows.filter(predicate);
  const s = summarize(list);
  return {
    ...s,
    key: 'custom',
    label: 'custom',
    sports: [...new Set(list.map((p) => p.sport))].sort(),
  };
}

export function rankedAggregates(list: Aggregate[]): Aggregate[] {
  return sortAggregates(list);
}

export { round };
