import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Store } from '../electron/store';
import { createHttpClient, HttpError } from '../electron/http';
import {
  externalPnlTimeline,
  groupExternalMarkets,
  normalizeKalshiEvent,
  normalizePolymarketEvent,
  summarizeExternalPositions,
  type ExternalPosition,
} from '../src/shared/external';

const dirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nappybets-ext-'));
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  dirs.forEach((dir) => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
});

function polymarketEvent() {
  return {
    id: 'evt-1',
    title: 'LOUD vs paiN Gaming (CBLOL)',
    slug: 'loud-vs-pain',
    category: 'Esports',
    endDate: '2026-03-01T18:00:00Z',
    markets: [
      {
        id: 'm-1',
        question: 'Will LOUD win the match?',
        conditionId: 'cond-1',
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.64', '0.36']),
        clobTokenIds: JSON.stringify(['tok-yes', 'tok-no']),
        closed: false,
        active: true,
        volume: 12000,
        groupItemTitle: 'Match winner',
        updatedAt: '2026-02-20T12:00:00Z',
      },
      {
        id: 'm-2',
        question: 'Total maps over 2.5',
        conditionId: 'cond-2',
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.41","0.59"]',
        closed: false,
        active: true,
      },
    ],
  };
}

describe('Normalização — Polymarket', () => {
  it('extrai mercados, preços, esporte e tipo', () => {
    const markets = normalizePolymarketEvent(polymarketEvent());
    expect(markets).toHaveLength(2);
    const [winner, total] = markets;
    expect(winner!.platform).toBe('polymarket');
    expect(winner!.sport).toBe('League of Legends');
    expect(winner!.isEsports).toBe(true);
    expect(winner!.kind).toBe('winner');
    expect(winner!.status).toBe('live');
    expect(winner!.outcomes[0]).toMatchObject({ name: 'Yes', price: 0.64, tokenId: 'tok-yes' });
    expect(winner!.url).toContain('polymarket.com/event/loud-vs-pain');
    expect(total!.kind).toBe('total');
  });

  it('marca mercados encerrados com resultado vencedor', () => {
    const raw: any = polymarketEvent();
    raw.markets = [
      {
        id: 'm-3',
        question: 'Will LOUD win?',
        outcomes: '["Yes","No"]',
        outcomePrices: '["1","0"]',
        closed: true,
        active: false,
      },
    ];
    const [market] = normalizePolymarketEvent(raw);
    expect(market!.status).toBe('resolved');
    expect(market!.result).toBe('Yes');
  });
});

describe('Normalização — Kalshi', () => {
  it('converte eventos abertos com preço sim/não', () => {
    const [market] = normalizeKalshiEvent({
      event_ticker: 'KXLOL-26',
      series_ticker: 'KXLOL',
      title: 'LOUD vs paiN',
      sub_title: 'CBLOL Split 1',
      category: 'Esports',
      markets: [
        {
          ticker: 'KXLOL-26-LOUD',
          title: 'Will LOUD win?',
          status: 'active',
          yes_bid: 55,
          yes_ask: 59,
          last_price: 57,
          volume: 900,
          close_time: '2026-03-02T00:00:00Z',
        },
      ],
    });
    expect(market).toBeDefined();
    expect(market!.status).toBe('live');
    expect(market!.outcomes[0]!.price).toBeCloseTo(0.57, 5);
    expect(market!.outcomes[1]!.price).toBeCloseTo(0.43, 5);
    expect(market!.sport).toBe('League of Legends');
  });

  it('marca encerrados e define o resultado', () => {
    const [market] = normalizeKalshiEvent({
      event_ticker: 'KXCS2-26',
      title: 'CS2 Major final',
      markets: [
        {
          ticker: 'KXCS2-26-FURIA',
          title: 'Will FURIA win the Major?',
          status: 'finalized',
          result: 'yes',
          close_time: '2026-01-20T00:00:00Z',
        },
      ],
    });
    expect(market!.status).toBe('resolved');
    expect(market!.result).toBe('Sim');
    expect(market!.outcomes[0]!.price).toBe(1);
    expect(market!.sport).toBe('CS2');
  });
});

describe('Ordenação de eventos', () => {
  it('coloca partidas antes de eventos sem confronto', () => {
    const base = {
      platform: 'polymarket' as const,
      conditionId: '',
      tokenIds: [],
      eventSubtitle: 'Esports',
      eventSlug: 'x',
      title: 'Will it happen?',
      subtitle: '',
      sport: 'League of Legends',
      isEsports: true,
      kind: 'winner' as const,
      status: 'live' as const,
      outcomes: [],
      volume: 0,
      liquidity: 0,
      openInterest: null,
      closesAt: '2026-12-01T00:00:00Z',
      result: null,
      url: 'https://polymarket.com',
      image: '',
      updatedAt: '2026-11-01T00:00:00Z',
    };
    const match = {
      ...base,
      id: 'm-match',
      eventId: 'evt-match',
      eventTitle: 'LOUD vs paiN Gaming',
      closesAt: '2026-11-20T00:00:00Z',
    };
    const prop = {
      ...base,
      id: 'm-prop',
      eventId: 'evt-prop',
      eventTitle: "Will Humzh's subathon end?",
      closesAt: '2027-01-01T00:00:00Z',
    };
    const groups = groupExternalMarkets([prop, match]);
    expect(groups[0]!.title).toBe('LOUD vs paiN Gaming');
  });
});

describe('Cliente HTTP', () => {
  it('repete após 429 e devolve o JSON', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const client = createHttpClient({ minIntervalMs: 0, maxRetries: 2 });
    await expect(client.json('https://example.com/api')).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
    vi.unstubAllGlobals();
  });

  it('traduz erros de autenticação', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    const client = createHttpClient({ minIntervalMs: 0, maxRetries: 0 });
    const error = await client.json('https://example.com/private').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).message).toMatch(/credenciais/i);
    vi.unstubAllGlobals();
  });
});

describe('Integrações — armazenamento e agregações', () => {
  it('persiste mercados e posições e resume o P&L', async () => {
    const dir = tempDir();
    const store = new Store({ userDataPath: dir, appVersion: 'test' });
    await store.init();
    store.clearData('demo');

    const markets = normalizePolymarketEvent(polymarketEvent());
    expect(store.external.upsertMarkets(markets)).toBe(2);
    expect(store.external.counts('polymarket').markets).toBe(2);

    const [winner] = markets;
    const positions: ExternalPosition[] = [
      {
        platform: 'polymarket',
        id: 'pos-1',
        marketId: 'cond-1',
        tokenId: 'tok-yes',
        eventTitle: winner!.eventTitle,
        marketTitle: winner!.title,
        outcome: 'Yes',
        status: 'closed',
        stake: 20,
        currentValue: 0,
        pnl: 12,
        size: 31,
        avgPrice: 0.64,
        curPrice: 1,
        won: true,
        openedAt: '2026-02-01T10:00:00Z',
        closedAt: '2026-03-01T20:00:00Z',
        url: winner!.url,
        updatedAt: '2026-03-01T20:00:00Z',
      },
      {
        platform: 'kalshi',
        id: 'pos-2',
        marketId: 'KXTEST',
        tokenId: '',
        eventTitle: 'Teste',
        marketTitle: 'Teste',
        outcome: 'Sim',
        status: 'open',
        stake: 10,
        currentValue: 8,
        pnl: -2,
        size: 10,
        avgPrice: null,
        curPrice: null,
        won: null,
        openedAt: '2026-03-02T10:00:00Z',
        closedAt: null,
        url: 'https://kalshi.com',
        updatedAt: '2026-03-02T10:00:00Z',
      },
    ];
    expect(store.external.upsertPositions(positions)).toBe(2);

    const stored = store.external.listPositions({ platform: 'all', status: 'all', search: '', limit: 10 });
    expect(stored).toHaveLength(2);
    const summary = summarizeExternalPositions(stored);
    expect(summary.staked).toBe(30);
    expect(summary.pnl).toBe(10);
    expect(summary.winRate).toBe(100);
    expect(summary.openCount).toBe(1);
    expect(summary.byPlatform.polymarket.pnl).toBe(12);

    const timeline = externalPnlTimeline(stored);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]!.cumulativePnl).toBe(12);

    expect(
      store.external.listMarkets({ platform: 'all', status: 'live', sport: null, search: 'Total maps', limit: 10 }),
    ).toHaveLength(1);
    expect(store.external.sports()).toContain('League of Legends');

    store.external.setState('polymarket', {
      lastSyncAt: '2026-03-03T00:00:00Z',
      lastError: null,
      marketsCount: 2,
      positionsCount: 1,
    });

    const reopened = new Store({ userDataPath: dir, appVersion: 'test' });
    await reopened.init();
    expect(reopened.external.counts('polymarket').markets).toBe(2);
    expect(reopened.external.getState('polymarket').lastSyncAt).toBe('2026-03-03T00:00:00Z');
    expect(reopened.external.listPositions({ platform: 'all', status: 'all', search: '', limit: 10 })).toHaveLength(2);
  });

  it('mantém o esquema novo ao abrir um banco existente', async () => {
    const dir = tempDir();
    const store = new Store({ userDataPath: dir, appVersion: 'test' });
    await store.init();
    expect(store.info().schemaVersion).toBeGreaterThanOrEqual(2);
    expect(store.external.counts('kalshi').markets).toBe(0);
  });
});
