/**
 * Converte um mercado externo (Polymarket/Kalshi) em um rascunho de previsão
 * local. O usuário revisa e salva manualmente — nada é enviado às plataformas.
 */
import type { ExternalMarket, ExternalOutcome } from './external';
import { PLATFORM_LABEL } from './external';
import type { PredictionInput, SubjectType } from './types';

export type PredictionDraft = Pick<
  PredictionInput,
  | 'sport'
  | 'competition'
  | 'subjectType'
  | 'subject'
  | 'event'
  | 'eventDate'
  | 'category'
  | 'predictedResult'
  | 'probability'
  | 'bookmaker'
  | 'notes'
>;

const YES_NO = /^(yes|no|sim|não|nao)$/i;
const GENERIC_TAG = /^(esports?|sports?|games?|lol|league of legends|cs2|counter-strike(?:\s*2)?|dota\s*2?|valorant|rocket league)$/i;

function isYesNo(name: string): boolean {
  return YES_NO.test(name.trim());
}

function cleanEventTitle(title: string): string {
  return title
    .replace(/^(league of legends|cs2|dota\s*2?|valorant|counter-strike(?:\s*2)?|rocket league|lol)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchTeams(title: string): [string, string] | null {
  const cleaned = cleanEventTitle(title).replace(/\s*\([^)]*\)\s*$/, '');
  const parts = cleaned.split(/\s+vs\.?\s+/i);
  if (parts.length < 2) return null;
  const strip = (value: string) => value.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const left = strip(parts[0]!);
  const right = strip(parts.slice(1).join(' vs ').split(/\s+[-—–]\s+/)[0]!);
  if (!left || !right) return null;
  return [left, right];
}

function competitionFor(market: ExternalMarket): string {
  const afterDash = market.eventTitle.split(/\s+-\s+/).slice(1).join(' - ').trim();
  if (afterDash) {
    return afterDash.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }
  const parts = market.eventSubtitle
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !GENERIC_TAG.test(part))
    .map((part) => part.replace(/\s+(sports?|esports?)$/i, '').trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  return market.sport !== 'Outros' ? market.sport : market.eventSubtitle.trim();
}

function categoryFor(market: ExternalMarket): string {
  if (market.kind === 'winner') return 'Vencedor da partida';
  if (market.kind === 'handicap') return 'Handicap';
  if (market.kind === 'player') return 'Desempenho de jogador';
  if (market.kind === 'total') {
    if (/round/i.test(market.title)) return 'Total de rounds';
    if (/\bmap/i.test(market.title)) return 'Total de mapas';
    if (/kill/i.test(market.title)) return 'Total de kills';
    return 'Totais';
  }
  return 'Outro mercado';
}

function subjectFor(
  market: ExternalMarket,
  outcome: ExternalOutcome,
): { subjectType: SubjectType; subject: string } {
  const teams = matchTeams(market.eventTitle);
  const namedOutcome = !isYesNo(outcome.name) && !/^(over|under|mais|menos)\b/i.test(outcome.name.trim());

  if ((market.kind === 'winner' || market.kind === 'handicap') && namedOutcome) {
    return { subjectType: 'team', subject: outcome.name.trim() };
  }

  if (market.kind === 'player') {
    const match = market.title.match(/^will\s+(.+?)\s+(?:win|score|get|record|have|play|lead|make)\b/i);
    return { subjectType: 'player', subject: match?.[1]?.trim() || market.title.trim() };
  }

  if (teams) return { subjectType: 'team', subject: teams[0] };
  return { subjectType: 'team', subject: cleanEventTitle(market.eventTitle) || market.title };
}

function resultFor(market: ExternalMarket, outcome: ExternalOutcome): string {
  const name = outcome.name.trim();
  if (isYesNo(name)) {
    return /^(yes|sim)$/i.test(name) ? market.title : `Não — ${market.title}`;
  }
  if (market.kind === 'winner') return `Vitória ${name}`;
  return `${name} — ${market.title}`;
}

function localDateTime(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date(Date.now() + 2 * 60 * 60 * 1000);
  const valid = Number.isNaN(date.getTime()) ? new Date(Date.now() + 2 * 60 * 60 * 1000) : date;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}T${pad(valid.getHours())}:${pad(valid.getMinutes())}`;
}

export function buildPredictionDraft(market: ExternalMarket, outcome: ExternalOutcome): PredictionDraft {
  const teams = matchTeams(market.eventTitle);
  const probability =
    outcome.price !== null && Number.isFinite(outcome.price)
      ? Math.min(99, Math.max(1, Math.round(outcome.price * 100)))
      : 50;
  const subject = subjectFor(market, outcome);
  const event = teams ? teams.join(' vs ') : cleanEventTitle(market.eventTitle) || market.title;

  return {
    sport: market.sport === 'Outros' ? '' : market.sport,
    competition: competitionFor(market),
    subjectType: subject.subjectType,
    subject: subject.subject,
    event,
    eventDate: localDateTime(market.closesAt),
    category: categoryFor(market),
    predictedResult: resultFor(market, outcome),
    probability,
    bookmaker: '',
    notes: [
      `Mercado: ${market.title}${market.subtitle ? ` (${market.subtitle})` : ''}`,
      `Fonte: ${PLATFORM_LABEL[market.platform]} — ${market.url}`,
      `Probabilidade implícita no mercado: ${probability}%`,
    ].join('\n'),
  };
}
