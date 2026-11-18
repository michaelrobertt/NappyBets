import { describe, expect, it } from 'vitest';
import { buildPredictionDraft } from '../src/shared/market-draft';
import type { ExternalMarket, ExternalOutcome } from '../src/shared/external';

function market(overrides: Partial<ExternalMarket> = {}): ExternalMarket {
  return {
    platform: 'polymarket',
    id: 'm-1',
    conditionId: 'cond-1',
    tokenIds: [],
    eventId: 'evt-1',
    eventTitle: 'LOUD vs paiN Gaming (CBLOL)',
    eventSubtitle: 'LOL · CBLOL',
    eventSlug: 'loud-vs-pain',
    title: 'Will LOUD win the match?',
    subtitle: 'Match winner',
    sport: 'League of Legends',
    isEsports: true,
    kind: 'winner',
    status: 'live',
    outcomes: [],
    volume: 1000,
    liquidity: 100,
    openInterest: null,
    closesAt: '2026-03-01T18:00:00Z',
    result: null,
    url: 'https://polymarket.com/event/loud-vs-pain',
    image: '',
    updatedAt: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

function outcome(name: string, price: number | null = 0.64): ExternalOutcome {
  return { name, price };
}

describe('Rascunho a partir de mercado externo', () => {
  it('preenche vencedor de partida com time, competição e probabilidade', () => {
    const draft = buildPredictionDraft(market(), outcome('LOUD', 0.64));
    expect(draft.sport).toBe('League of Legends');
    expect(draft.competition).toBe('CBLOL');
    expect(draft.event).toBe('LOUD vs paiN Gaming');
    expect(draft.subjectType).toBe('team');
    expect(draft.subject).toBe('LOUD');
    expect(draft.category).toBe('Vencedor da partida');
    expect(draft.predictedResult).toBe('Vitória LOUD');
    expect(draft.probability).toBe(64);
    expect(draft.notes).toContain('polymarket.com');
  });

  it('transforma Sim/Não em resultado explícito', () => {
    const totals = market({
      kind: 'total',
      title: 'Total maps over 2.5',
      eventTitle: 'LOUD vs paiN Gaming (CBLOL)',
    });
    const yes = buildPredictionDraft(totals, outcome('Yes', 0.41));
    expect(yes.category).toBe('Total de mapas');
    expect(yes.predictedResult).toBe('Total maps over 2.5');
    expect(yes.probability).toBe(41);

    const no = buildPredictionDraft(totals, outcome('No', 0.59));
    expect(no.predictedResult).toBe('Não — Total maps over 2.5');
  });

  it('reconhece mercado da Kalshi e preenche data local', () => {
    const draft = buildPredictionDraft(
      market({
        platform: 'kalshi',
        eventTitle: 'FURIA vs paiN — CBLOL Split 2',
        eventSubtitle: 'CBLOL Split 2 Sports',
        title: 'Will FURIA win game 2?',
        closesAt: '2026-04-10T20:30:00.000Z',
      }),
      outcome('Sim', 0.72),
    );
    expect(draft.event).toBe('FURIA vs paiN');
    expect(draft.competition).toBe('CBLOL Split 2');
    expect(draft.predictedResult).toBe('Will FURIA win game 2?');
    expect(draft.eventDate).toMatch(/^2026-04-10T\d{2}:\d{2}$/);
    expect(draft.probability).toBe(72);
  });

  it('usa jogador como sujeito em mercados de desempenho', () => {
    const draft = buildPredictionDraft(
      market({
        kind: 'player',
        eventTitle: 'Faker vs Chovy',
        title: 'Will Faker get the most kills?',
        sport: 'League of Legends',
      }),
      outcome('Yes', 0.55),
    );
    expect(draft.subjectType).toBe('player');
    expect(draft.subject).toBe('Faker');
    expect(draft.category).toBe('Desempenho de jogador');
  });

  it('não deixa a probabilidade fora da faixa válida', () => {
    const high = buildPredictionDraft(market(), outcome('LOUD', 0.999));
    expect(high.probability).toBe(99);
    const low = buildPredictionDraft(market(), outcome('LOUD', 0));
    expect(low.probability).toBe(1);
    const unknown = buildPredictionDraft(market(), outcome('LOUD', null));
    expect(unknown.probability).toBe(50);
  });
});
