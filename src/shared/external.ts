/**
 * Domínio de mercados externos (Polymarket / Kalshi).
 * Apenas leitura: nenhuma ordem é enviada às plataformas.
 */

export type ExternalPlatform = 'polymarket' | 'kalshi';
export type ExternalMarketStatus = 'live' | 'pending' | 'resolved';
export type ExternalPositionStatus = 'open' | 'closed';
export type MarketKind = 'winner' | 'handicap' | 'total' | 'player' | 'other';

export const PLATFORM_LABEL: Record<ExternalPlatform, string> = {
  polymarket: 'Polymarket',
  kalshi: 'Kalshi',
};

export const MARKET_STATUS_LABEL: Record<ExternalMarketStatus, string> = {
  live: 'Ao vivo',
  pending: 'Pendente',
  resolved: 'Encerrado',
};

export const MARKET_KIND_LABEL: Record<MarketKind, string> = {
  winner: 'Vencedor',
  handicap: 'Handicap',
  total: 'Totais',
  player: 'Jogadores',
  other: 'Outros',
};

export interface ExternalOutcome {
  name: string;
  price: number | null;
  tokenId?: string;
}

export interface ExternalMarket {
  platform: ExternalPlatform;
  id: string;
  conditionId: string;
  tokenIds: string[];
  eventId: string;
  eventTitle: string;
  eventSubtitle: string;
  eventSlug: string;
  title: string;
  subtitle: string;
  sport: string;
  isEsports: boolean;
  kind: MarketKind;
  status: ExternalMarketStatus;
  outcomes: ExternalOutcome[];
  volume: number | null;
  liquidity: number | null;
  openInterest: number | null;
  closesAt: string | null;
  result: string | null;
  url: string;
  image: string;
  updatedAt: string;
}

export interface ExternalPosition {
  platform: ExternalPlatform;
  id: string;
  marketId: string;
  tokenId: string;
  eventTitle: string;
  marketTitle: string;
  outcome: string;
  status: ExternalPositionStatus;
  stake: number;
  currentValue: number;
  pnl: number;
  size: number;
  avgPrice: number | null;
  curPrice: number | null;
  won: boolean | null;
  openedAt: string | null;
  closedAt: string | null;
  url: string;
  updatedAt: string;
}

export interface ExternalEventGroup {
  key: string;
  platform: ExternalPlatform;
  eventId: string;
  title: string;
  subtitle: string;
  sport: string;
  isEsports: boolean;
  closesAt: string | null;
  markets: ExternalMarket[];
  live: number;
  pending: number;
  resolved: number;
}

export interface ExternalPlatformStatus {
  platform: ExternalPlatform;
  configured: boolean;
  marketsConfigured: boolean;
  walletMasked: string | null;
  environment: 'production' | 'demo';
  lastSyncAt: string | null;
  lastError: string | null;
  marketCount: number;
  positionCount: number;
}

export interface ExternalSettings {
  autoSync: boolean;
  intervalMinutes: number;
  esportsOnly: boolean;
}

export interface ExternalStatus {
  polymarket: ExternalPlatformStatus;
  kalshi: ExternalPlatformStatus;
  settings: ExternalSettings;
  syncing: ExternalPlatform[];
}

export interface ExternalSummary {
  staked: number;
  returned: number;
  pnl: number;
  returnPct: number | null;
  openCount: number;
  closedCount: number;
  wins: number;
  losses: number;
  undecided: number;
  winRate: number | null;
  byPlatform: Record<ExternalPlatform, { staked: number; pnl: number; open: number; closed: number }>;
}

export interface ExternalPnlPoint {
  date: string;
  pnl: number;
  cumulativePnl: number;
}

export interface ExternalMarketsQuery {
  platform: ExternalPlatform | 'all';
  status: ExternalMarketStatus | 'all';
  sport: string | null;
  esportsOnly?: boolean;
  search: string;
  limit: number;
}

export interface ExternalPositionsQuery {
  platform: ExternalPlatform | 'all';
  status: ExternalPositionStatus | 'all';
  search: string;
  limit: number;
}

export interface SyncReport {
  platform: ExternalPlatform;
  markets: number;
  positions: number;
  errors: string[];
  finishedAt: string;
}

const ESPORTS_KEYWORDS: Array<{ sport: string; patterns: RegExp[] }> = [
  {
    sport: 'League of Legends',
    patterns: [/league of legends/i, /\blol\b/i, /\blec\b/i, /\blck\b/i, /\blpl\b/i, /\blcs\b/i, /cblol/i, /worlds/i, /\bmsi\b/i, /summoner/i, /rift rivals/i],
  },
  {
    sport: 'CS2',
    patterns: [/counter[- ]?strike/i, /\bcs2\b/i, /\bcs:go\b/i, /\bcsgo\b/i, /esl pro league/i, /blast premier/i, /\biem\b/i, /major.*counter/i, /faceit/i, /pgl/i],
  },
  {
    sport: 'Dota 2',
    patterns: [/\bdota\s?2?\b/i, /the international/i, /dreamleague/i, /dota pro circuit/i, /\bdpc\b/i, /esl one/i],
  },
  {
    sport: 'Valorant',
    patterns: [/valorant/i, /\bvct\b/i, /valorant champions/i],
  },
  {
    sport: 'Futebol',
    patterns: [/soccer/i, /football/i, /premier league/i, /la liga/i, /serie a/i, /bundesliga/i, /champions league/i, /europa league/i, /world cup/i, /libertadores/i, /brasileir[ãa]o/i, /\bnba\b/i],
  },
  {
    sport: 'Basquete',
    patterns: [/basketball/i, /\bnba\b/i, /euroleague/i, /\bncaa\b/i],
  },
  {
    sport: 'Tênis',
    patterns: [/tennis/i, /\batp\b/i, /\bwta\b/i, /wimbledon/i, /us open/i],
  },
  {
    sport: 'MMA',
    patterns: [/\bufc\b/i, /\bmma\b/i, /boxing/i, /heavyweight/i],
  },
  {
    sport: 'Vôlei',
    patterns: [/volleyball/i, /volley/i],
  },
];

const ESPORTS_SPORTS = new Set(['League of Legends', 'CS2', 'Dota 2', 'Valorant', 'Rocket League']);

export function classifySport(text: string): { sport: string; isEsports: boolean } {
  for (const entry of ESPORTS_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return { sport: entry.sport, isEsports: ESPORTS_SPORTS.has(entry.sport) };
    }
  }
  return { sport: 'Outros', isEsports: false };
}

const PLAYER_PATTERNS = [
  /\bmvp\b/i,
  /most kills/i,
  /top fragger/i,
  /player (to|with|prop)/i,
  /\d+\+ (kills|assists|rebounds|points|damage)/i,
  /(kills|assists|rebounds|damage|headshots|aces|goals|points) (by|for) /i,
  /to score/i,
  /first (blood|kill)/i,
];
const TOTAL_PATTERNS = [/\btotal\b/i, /\bover\b/i, /\bunder\b/i, /\bo\/u\b/i, /more than/i, /less than/i, /at least/i, /\bhandicap\b.*total/i];
const HANDICAP_PATTERNS = [/spread/i, /handicap/i, /\(\s*[-+]\d/, /[-+]\d+(\.\d+)?\s*(maps|rounds|kills|points|goals|games|sets)\b/i];
const WINNER_PATTERNS = [/will .* win/i, /winner/i, /to win/i, /champion/i, /advance/i, /qualify/i, /\bbeat\b/i, /\bvs\.?\b/i, /victory/i];

export function classifyMarketKind(title: string, subtitle = ''): MarketKind {
  const text = `${title} ${subtitle}`;
  if (PLAYER_PATTERNS.some((pattern) => pattern.test(text))) return 'player';
  if (TOTAL_PATTERNS.some((pattern) => pattern.test(text))) return 'total';
  if (HANDICAP_PATTERNS.some((pattern) => pattern.test(text))) return 'handicap';
  if (WINNER_PATTERNS.some((pattern) => pattern.test(text))) return 'winner';
  return 'other';
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function safeIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function baseMarketFields(
  platform: ExternalPlatform,
  eventTitle: string,
  eventSubtitle: string,
  eventSlug: string,
  title: string,
  context = '',
): Pick<
  ExternalMarket,
  'platform' | 'eventTitle' | 'eventSubtitle' | 'eventSlug' | 'title' | 'sport' | 'isEsports' | 'kind' | 'updatedAt'
> {
  const classified = classifySport(`${eventTitle} ${eventSubtitle} ${context} ${title}`);
  return {
    platform,
    eventTitle: eventTitle.trim(),
    eventSubtitle: eventSubtitle.trim(),
    eventSlug,
    title: title.trim(),
    sport: classified.sport,
    isEsports: classified.isEsports,
    kind: classifyMarketKind(title, eventSubtitle),
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Polymarket — Gamma API (events com mercados aninhados)              */
/* ------------------------------------------------------------------ */

export function normalizePolymarketEvent(raw: any): ExternalMarket[] {
  if (!raw || typeof raw !== 'object') return [];
  const eventTitle = String(raw.title ?? '');
  const eventSlug = String(raw.slug ?? '');
  const tags: string[] = Array.isArray(raw.tags) ? raw.tags.map((tag: any) => String(tag?.label ?? '')) : [];
  const category = String(raw.category ?? tags[0] ?? '');
  const eventId = String(raw.id ?? eventSlug);
  const relevantTags = tags.filter(
    (tag) => tag && !['Sports', 'Games', 'All', 'Politics', 'Crypto'].includes(tag),
  );
  const eventSubtitle = relevantTags.length > 0 ? relevantTags.slice(0, 2).join(' · ') : category;
  const tagContext = tags.join(' ');
  const eventDate = safeIso(raw.endDate) ?? null;
  const markets: any[] = Array.isArray(raw.markets) ? raw.markets : [];
  const out: ExternalMarket[] = [];

  for (const market of markets) {
    if (!market || market.id === undefined || market.id === null) continue;
    const title = String(market.question ?? market.title ?? '').trim();
    if (!title) continue;
    const outcomes = parseJsonArray(market.outcomes);
    const prices = parseJsonArray(market.outcomePrices);
    const tokens = parseJsonArray(market.clobTokenIds);
    const normalizedOutcomes: ExternalOutcome[] = outcomes.map((name, index) => ({
      name,
      price: asNumber(prices[index]),
      tokenId: tokens[index],
    }));
    const closed = Boolean(market.closed);
    const active = market.active ?? !closed;
    const winningIndex = closed
      ? normalizedOutcomes.findIndex((outcome) => outcome.price !== null && outcome.price >= 0.99)
      : -1;
    const status: ExternalMarketStatus = closed
      ? winningIndex >= 0
        ? 'resolved'
        : 'pending'
      : active
        ? 'live'
        : 'pending';
    const subtitle = String(market.groupItemTitle ?? market.subtitle ?? '');
    const fields = baseMarketFields('polymarket', eventTitle, eventSubtitle, eventSlug, title, tagContext);
    out.push({
      ...fields,
      subtitle,
      kind: classifyMarketKind(title, subtitle),
      id: String(market.id),
      conditionId: String(market.conditionId ?? market.condition_id ?? ''),
      tokenIds: tokens,
      eventId,
      status,
      outcomes: normalizedOutcomes,
      volume: asNumber(market.volume),
      liquidity: asNumber(market.liquidity),
      openInterest: asNumber(market.openInterest),
      closesAt: safeIso(market.endDate) ?? eventDate,
      result: winningIndex >= 0 ? normalizedOutcomes[winningIndex]!.name : null,
      url: eventSlug ? `https://polymarket.com/event/${eventSlug}` : 'https://polymarket.com',
      image: String(market.image ?? raw.icon ?? raw.image ?? ''),
      updatedAt: safeIso(market.updatedAt) ?? new Date().toISOString(),
    });
  }
  return out;
}

export function normalizePolymarketPosition(raw: any): ExternalPosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? '').trim();
  if (!title) return null;
  const status: ExternalPositionStatus = String(raw.status ?? '').toUpperCase() === 'CLOSED' ? 'closed' : 'open';
  const stake = asNumber(raw.total_cost_usdc) ?? asNumber(raw.entry_cost_usdc) ?? 0;
  const pnl = asNumber(raw.total_pnl) ?? 0;
  const currentValue = asNumber(raw.current_value) ?? 0;
  const outcome = String(raw.outcome ?? '');
  const marketId = String(raw.condition_id ?? raw.conditionId ?? raw.token_id ?? '');
  const slug = String(raw.slug ?? raw.event_slug ?? '');
  return {
    platform: 'polymarket',
    id: String(raw.token_id ?? `${marketId}:${outcome}`),
    marketId,
    tokenId: String(raw.token_id ?? ''),
    eventTitle: String(raw.event_slug ?? ''),
    marketTitle: title,
    outcome,
    status,
    stake,
    currentValue,
    pnl,
    size: asNumber(raw.current_size) ?? asNumber(raw.total_size) ?? 0,
    avgPrice: asNumber(raw.avg_price),
    curPrice: asNumber(raw.current_price),
    won: status === 'closed' ? (Math.abs(pnl) > 0.004 ? pnl > 0 : null) : null,
    openedAt: safeIso(raw.first_entry_at) ?? safeIso(raw.end_date),
    closedAt: status === 'closed' ? safeIso(raw.last_event_at) ?? safeIso(raw.end_date) : null,
    url: slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com',
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Kalshi — Trade API v2 (eventos com mercados aninhados)              */
/* ------------------------------------------------------------------ */

function kalshiSeriesSport(series: string): string | null {
  const ticker = series.toUpperCase();
  if (/^KXLOL|^KXLEAGUEWORLDS/.test(ticker)) return 'League of Legends';
  if (/^KXCS2/.test(ticker)) return 'CS2';
  if (/^KXDOTA2/.test(ticker)) return 'Dota 2';
  if (/^KXVALORANT/.test(ticker)) return 'Valorant';
  if (/^KXRL/.test(ticker)) return 'Rocket League';
  return null;
}

export function normalizeKalshiEvent(raw: any): ExternalMarket[] {
  if (!raw || typeof raw !== 'object') return [];
  const eventTitle = String(raw.title ?? '');
  const eventId = String(raw.event_ticker ?? '');
  const rawSubtitle = String(raw.sub_title ?? '').trim();
  const category = String(raw.category ?? '');
  const eventSubtitle =
    rawSubtitle && rawSubtitle.toLowerCase() !== eventTitle.trim().toLowerCase()
      ? `${rawSubtitle} ${category}`.trim()
      : category;
  const series = String(raw.series_ticker ?? '');
  const markets: any[] = Array.isArray(raw.markets) ? raw.markets : [];
  const out: ExternalMarket[] = [];

  for (const market of markets) {
    const ticker = String(market?.ticker ?? '');
    if (!ticker) continue;
    const title = String(market.title ?? '').trim();
    if (!title) continue;
    const result = String(market.result ?? '').toLowerCase();
    const rawStatus = String(market.status ?? '').toLowerCase();
    const resolved = result === 'yes' || result === 'no' || rawStatus === 'finalized' || rawStatus === 'settled';
    const status: ExternalMarketStatus = resolved
      ? 'resolved'
      : rawStatus === 'active' || rawStatus === 'open'
        ? 'live'
        : 'pending';

    const yesBid = asNumber(market.yes_bid);
    const yesAsk = asNumber(market.yes_ask);
    const noBid = asNumber(market.no_bid);
    const noAsk = asNumber(market.no_ask);
    const last = asNumber(market.last_price);
    const yesPrice =
      yesBid !== null && yesAsk !== null && (yesBid > 0 || yesAsk > 0)
        ? (yesBid + yesAsk) / 200
        : last !== null
          ? last / 100
          : null;
    const noPrice =
      noBid !== null && noAsk !== null && (noBid > 0 || noAsk > 0)
        ? (noBid + noAsk) / 200
        : yesPrice !== null
          ? 1 - yesPrice
          : null;

    const subtitle = String(market.subtitle ?? market.yes_sub_title ?? '');
    const fields = baseMarketFields(
      'kalshi',
      eventTitle,
      `${eventSubtitle} ${category}`.trim(),
      series,
      title,
      `${series} ${raw.series_ticker ?? ''}`,
    );
    const seriesSport = kalshiSeriesSport(series);
    if (seriesSport) {
      fields.sport = seriesSport;
      fields.isEsports = true;
    }
    out.push({
      ...fields,
      subtitle,
      kind: classifyMarketKind(title, subtitle),
      id: ticker,
      conditionId: ticker,
      tokenIds: [],
      eventId,
      status,
      outcomes: [
        { name: 'Sim', price: status === 'resolved' ? (result === 'yes' ? 1 : 0) : yesPrice },
        { name: 'Não', price: status === 'resolved' ? (result === 'no' ? 1 : 0) : noPrice },
      ],
      volume: asNumber(market.volume),
      liquidity: asNumber(market.liquidity),
      openInterest: asNumber(market.open_interest),
      closesAt: safeIso(market.close_time) ?? safeIso(market.expiration_time),
      result: status === 'resolved' ? (result === 'yes' ? 'Sim' : result === 'no' ? 'Não' : null) : null,
      url: series
        ? `https://kalshi.com/markets/${series.toLowerCase()}`
        : `https://kalshi.com/markets/${eventId.toLowerCase()}`,
      image: String(raw.image_url ?? ''),
      updatedAt: new Date().toISOString(),
    });
  }
  return out;
}

export interface KalshiPositionContext {
  market?: ExternalMarket;
  resolvedResult?: string | null;
}

export function normalizeKalshiPosition(raw: any, context: KalshiPositionContext = {}): ExternalPosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const ticker = String(raw.ticker ?? '').trim();
  if (!ticker) return null;
  const contracts = asNumber(raw.position) ?? 0;
  const exposureCents = asNumber(raw.market_exposure) ?? 0;
  const realizedCents = asNumber(raw.realized_pnl) ?? 0;
  const tradedCents = asNumber(raw.total_traded) ?? Math.abs(contracts) * 100;
  const resolved = context.market?.status === 'resolved';
  const result = (context.resolvedResult ?? context.market?.result ?? '').toLowerCase();
  const side = contracts > 0 ? 'yes' : contracts < 0 ? 'no' : '';
  const won =
    resolved && contracts !== 0 && result && side
      ? (side === 'yes' && result === 'sim') ||
        (side === 'yes' && result === 'yes') ||
        (side === 'no' && (result === 'não' || result === 'no'))
      : resolved && contracts === 0 && realizedCents !== 0
        ? realizedCents > 0
        : null;
  const status: ExternalPositionStatus = contracts !== 0 && !resolved ? 'open' : 'closed';
  return {
    platform: 'kalshi',
    id: String(raw.ticker ?? ticker),
    marketId: ticker,
    tokenId: '',
    eventTitle: context.market?.eventTitle ?? ticker,
    marketTitle: context.market?.title ?? ticker,
    outcome: contracts > 0 ? 'Sim' : contracts < 0 ? 'Não' : '—',
    status,
    stake: tradedCents / 100,
    currentValue: exposureCents / 100,
    pnl: realizedCents / 100,
    size: Math.abs(contracts),
    avgPrice: null,
    curPrice: null,
    won,
    openedAt: null,
    closedAt: resolved ? context.market?.closesAt ?? null : null,
    url: context.market?.url ?? `https://kalshi.com/markets/${ticker.toLowerCase()}`,
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Agregações                                                         */
/* ------------------------------------------------------------------ */

export function groupExternalMarkets(markets: ExternalMarket[]): ExternalEventGroup[] {
  const map = new Map<string, ExternalEventGroup>();
  for (const market of markets) {
    const key = `${market.platform}:${market.eventId}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        platform: market.platform,
        eventId: market.eventId,
        title: market.eventTitle,
        subtitle: market.eventSubtitle,
        sport: market.sport,
        isEsports: market.isEsports,
        closesAt: market.closesAt,
        markets: [],
        live: 0,
        pending: 0,
        resolved: 0,
      };
      map.set(key, group);
    }
    group.markets.push(market);
    group.live += market.status === 'live' ? 1 : 0;
    group.pending += market.status === 'pending' ? 1 : 0;
    group.resolved += market.status === 'resolved' ? 1 : 0;
    if (!group.isEsports && market.isEsports) {
      group.isEsports = true;
      group.sport = market.sport;
    }
    if (market.closesAt && (!group.closesAt || market.closesAt < group.closesAt)) group.closesAt = market.closesAt;
  }
  const groups = [...map.values()];
  groups.forEach((group) => {
    group.markets.sort((a, b) => {
      const order: Record<ExternalMarketStatus, number> = { live: 0, pending: 1, resolved: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.title.localeCompare(b.title, 'pt-BR');
    });
  });
  const resolvedOnly = (group: ExternalEventGroup) => group.live === 0 && group.pending === 0;
  const isMatch = (group: ExternalEventGroup) =>
    /\bvs\.?\b/i.test(group.title) || /\bvs\.?\b/i.test(group.markets[0]?.title ?? '');
  return groups.sort((a, b) => {
    if (a.isEsports !== b.isEsports) return a.isEsports ? -1 : 1;
    if (isMatch(a) !== isMatch(b)) return isMatch(a) ? -1 : 1;
    if ((a.live > 0) !== (b.live > 0)) return a.live > 0 ? -1 : 1;
    if (resolvedOnly(a) !== resolvedOnly(b)) return resolvedOnly(a) ? 1 : -1;
    const closeA = a.closesAt ?? '9999';
    const closeB = b.closesAt ?? '9999';
    if (closeA !== closeB) {
      return resolvedOnly(a) ? closeB.localeCompare(closeA) : closeA.localeCompare(closeB);
    }
    if (a.live !== b.live) return b.live - a.live;
    return b.pending - a.pending;
  });
}

function emptyPlatformSummary() {
  return { staked: 0, pnl: 0, open: 0, closed: 0 };
}

export function summarizeExternalPositions(positions: ExternalPosition[]): ExternalSummary {
  const byPlatform = { polymarket: emptyPlatformSummary(), kalshi: emptyPlatformSummary() };
  let staked = 0;
  let returned = 0;
  let pnl = 0;
  let openCount = 0;
  let closedCount = 0;
  let wins = 0;
  let losses = 0;
  let undecided = 0;

  for (const position of positions) {
    staked += position.stake;
    pnl += position.pnl;
    returned += position.status === 'closed' ? position.stake + position.pnl : position.currentValue;
    const platform = byPlatform[position.platform];
    platform.staked += position.stake;
    platform.pnl += position.pnl;
    if (position.status === 'open') {
      openCount += 1;
      platform.open += 1;
    } else {
      closedCount += 1;
      platform.closed += 1;
      if (position.won === true) wins += 1;
      else if (position.won === false) losses += 1;
      else undecided += 1;
    }
  }

  const decided = wins + losses;
  return {
    staked: round2(staked),
    returned: round2(returned),
    pnl: round2(pnl),
    returnPct: staked > 0 ? round2((pnl / staked) * 100) : null,
    openCount,
    closedCount,
    wins,
    losses,
    undecided,
    winRate: decided > 0 ? round2((wins / decided) * 100) : null,
    byPlatform,
  };
}

export function externalPnlTimeline(positions: ExternalPosition[]): ExternalPnlPoint[] {
  const closed = positions
    .filter((position) => position.status === 'closed')
    .map((position) => ({
      position,
      date: (position.closedAt ?? position.updatedAt).slice(0, 10),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const buckets = new Map<string, number>();
  for (const entry of closed) {
    buckets.set(entry.date, (buckets.get(entry.date) ?? 0) + entry.position.pnl);
  }
  let cumulative = 0;
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayPnl]) => {
    cumulative = round2(cumulative + dayPnl);
    return { date, pnl: round2(dayPnl), cumulativePnl: cumulative };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function marketOutcomeText(market: ExternalMarket): string {
  if (market.result) return `Resultado: ${market.result}`;
  const parts = market.outcomes
    .filter((outcome) => outcome.price !== null)
    .slice(0, 2)
    .map((outcome) => `${outcome.name} ${Math.round((outcome.price ?? 0) * 100)}%`);
  return parts.join(' · ') || 'Sem cotação';
}

export function groupMarketsByKind(markets: ExternalMarket[]): Array<{ kind: MarketKind; label: string; markets: ExternalMarket[] }> {
  const order: MarketKind[] = ['winner', 'handicap', 'total', 'player', 'other'];
  return order
    .map((kind) => ({
      kind,
      label: MARKET_KIND_LABEL[kind],
      markets: markets.filter((market) => market.kind === kind),
    }))
    .filter((section) => section.markets.length > 0);
}
