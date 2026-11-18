import type { HttpClient } from './http';
import { errorMessage } from './http';
import type { ExternalMarket } from '../src/shared/external';
import { classifySport, normalizeKalshiEvent, normalizePolymarketEvent } from '../src/shared/external';

export const POLY_GAMMA = 'https://gamma-api.polymarket.com';
export const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

export interface ProviderResult<T> {
  items: T[];
  errors: string[];
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Polymarket — Gamma API (eventos com mercados aninhados)             */
/* ------------------------------------------------------------------ */

export async function fetchPolymarketMarkets(http: HttpClient): Promise<ProviderResult<ExternalMarket>> {
  const errors: string[] = [];
  const requests: Array<{ label: string; tag: string; status: 'open' | 'closed'; limit: number }> = [
    { label: 'Polymarket esports (abertos)', tag: 'esports', status: 'open', limit: 50 },
    { label: 'Polymarket esports (encerrados)', tag: 'esports', status: 'closed', limit: 50 },
    { label: 'Polymarket LoL', tag: 'league-of-legends', status: 'open', limit: 30 },
    { label: 'Polymarket CS2', tag: 'counter-strike', status: 'open', limit: 30 },
    { label: 'Polymarket Dota 2', tag: 'dota-2', status: 'open', limit: 30 },
    { label: 'Polymarket Valorant', tag: 'valorant', status: 'open', limit: 20 },
    { label: 'Polymarket futebol', tag: 'soccer', status: 'open', limit: 30 },
    { label: 'Polymarket tênis', tag: 'tennis', status: 'open', limit: 20 },
    { label: 'Polymarket basquete', tag: 'nba', status: 'open', limit: 2 },
  ];

  const markets: ExternalMarket[] = [];
  for (const request of requests) {
    const params = new URLSearchParams({
      closed: request.status === 'closed' ? 'true' : 'false',
      limit: String(request.limit),
      tag_slug: request.tag,
      order: request.status === 'open' ? 'volume24hr' : 'endDate',
      ascending: 'false',
    });
    try {
      const body = await http.json<unknown>(`${POLY_GAMMA}/events?${params.toString()}`);
      const events = Array.isArray(body) ? body : [];
      for (const event of events) markets.push(...normalizePolymarketEvent(event));
    } catch (error) {
      errors.push(`${request.label}: ${errorMessage(error)}`);
    }
  }

  return {
    items: dedupe(markets, (market) => market.id),
    errors,
  };
}

/* ------------------------------------------------------------------ */
/* Kalshi — Trade API v2 (eventos com mercados aninhados)              */
/* ------------------------------------------------------------------ */

const KALSHI_ESPORTS_SERIES = [
  'KXLOL',
  'KXLOLGAME',
  'KXLOLMAP',
  'KXLOLTOTAL',
  'KXCS2MAP',
  'KXDOTA2GAME',
  'KXVALORANT',
  'KXRLGAME',
  'KXLEAGUEWORLDS',
];

function kalshiSportsEvent(event: any): boolean {
  const category = String(event?.category ?? '').toLowerCase();
  const series = String(event?.series_ticker ?? '');
  if (KALSHI_ESPORTS_SERIES.includes(series)) return true;
  if (/\bsports?\b/.test(category)) return true;
  const text = `${event?.title ?? ''} ${event?.sub_title ?? ''}`;
  return classifySport(text).sport !== 'Outros';
}

export async function fetchKalshiMarkets(http: HttpClient): Promise<ProviderResult<ExternalMarket>> {
  const errors: string[] = [];
  const requests: Array<{ path: string; label: string; sportsOnly: boolean }> = [
    {
      path: '/events?status=open&limit=100&with_nested_markets=true',
      label: 'Kalshi (esportes abertos)',
      sportsOnly: true,
    },
    {
      path: '/events?status=settled&limit=100&with_nested_markets=true',
      label: 'Kalshi (esportes encerrados)',
      sportsOnly: true,
    },
    ...KALSHI_ESPORTS_SERIES.map((series) => ({
      path: `/events?limit=20&series_ticker=${series}&with_nested_markets=true`,
      label: `Kalshi ${series}`,
      sportsOnly: false,
    })),
  ];
  const markets: ExternalMarket[] = [];

  for (const request of requests) {
    let response: any = null;
    try {
      response = await http.json<any>(`${KALSHI_API}${request.path}`);
    } catch (error) {
      errors.push(`${request.label}: ${errorMessage(error)}`);
      continue;
    }
    const events: any[] = Array.isArray(response?.events) ? response.events : [];
    for (const event of events) {
      if (request.sportsOnly && !kalshiSportsEvent(event)) continue;
      markets.push(...normalizeKalshiEvent(event));
    }
  }

  return {
    items: dedupe(markets, (market) => market.id),
    errors,
  };
}
