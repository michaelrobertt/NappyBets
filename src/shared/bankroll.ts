import type {
  AppSettings,
  BankrollTransaction,
  BankrollTransactionInput,
  Prediction,
} from './types';

export interface BankrollSummary {
  /** Valor definido como banca inicial. */
  initial: number;
  deposits: number;
  withdrawals: number;
  /** Lucro/prejuízo realizado apenas com apostas concluídas. */
  netProfit: number;
  /** Banca total: inicial + depósitos − saques + lucro realizado. */
  current: number;
  /** Valor preso em apostas pendentes. */
  exposure: number;
  /** Banca total menos o valor em apostas pendentes. */
  available: number;
  /** Soma de todas as stakes registradas. */
  totalStaked: number;
  /** Soma das stakes já concluídas (acertou/errou). */
  settledStaked: number;
  /** Retorno bruto das apostas concluídas. */
  returned: number;
  /** ROI realizado: lucro ÷ stake concluída, em %. */
  roi: number | null;
  totalBets: number;
  settledBets: number;
  openBets: number;
  wins: number;
  losses: number;
  voids: number;
  hitRate: number | null;
  avgStake: number | null;
  biggestWin: number;
  biggestLoss: number;
}

export interface BankrollPoint {
  /** YYYY-MM-DD */
  date: string;
  balance: number;
  /** Lucro acumulado das apostas (sem depósitos/saques). */
  profit: number;
  deposits: number;
  withdrawals: number;
}

export interface BankrollOverview {
  summary: BankrollSummary;
  series: BankrollPoint[];
  transactions: BankrollTransaction[];
  bets: Prediction[];
}

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function betReturn(prediction: Pick<Prediction, 'status' | 'stake' | 'odds'>): number {
  const stake = Math.max(0, Number(prediction.stake) || 0);
  if (stake <= 0) return 0;
  if (prediction.status === 'void') return stake;
  if (prediction.status !== 'hit') return 0;
  const odds = Number(prediction.odds);
  return Number.isFinite(odds) && odds > 1 ? roundMoney(stake * odds) : 0;
}

export function betProfit(prediction: Pick<Prediction, 'status' | 'stake' | 'odds'>): number {
  const stake = Math.max(0, Number(prediction.stake) || 0);
  if (stake <= 0) return 0;
  if (prediction.status === 'miss') return -stake;
  if (prediction.status === 'void') return 0;
  if (prediction.status !== 'hit') return 0;
  const odds = Number(prediction.odds);
  if (!Number.isFinite(odds) || odds <= 1) return 0;
  return roundMoney(stake * (odds - 1));
}

export function impliedProbability(odds: number | null | undefined): number | null {
  if (!odds || !Number.isFinite(odds) || odds <= 1) return null;
  return 100 / odds;
}

export function isSettledBet(prediction: Pick<Prediction, 'status'>): boolean {
  return prediction.status === 'hit' || prediction.status === 'miss';
}

function dateKey(value: string): string | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function todayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function keyToIso(key: string): string {
  return `${key}T12:00`;
}

export function buildBankroll(
  predictions: Prediction[],
  transactions: BankrollTransaction[],
  settings: Pick<AppSettings, 'initialBankroll' | 'bankrollStartDate'>,
  now = new Date(),
): { summary: BankrollSummary; series: BankrollPoint[] } {
  const bets = predictions.filter((prediction) => (prediction.stake ?? 0) > 0);
  const settled = bets.filter((prediction) => isSettledBet(prediction));
  const pending = bets.filter((prediction) => prediction.status === 'pending');
  const wins = settled.filter((prediction) => prediction.status === 'hit');
  const losses = settled.filter((prediction) => prediction.status === 'miss');

  const deposits = roundMoney(
    transactions.filter((item) => item.type === 'deposit').reduce((sum, item) => sum + item.amount, 0),
  );
  const withdrawals = roundMoney(
    transactions.filter((item) => item.type === 'withdrawal').reduce((sum, item) => sum + item.amount, 0),
  );
  const netProfit = roundMoney(settled.reduce((sum, prediction) => sum + betProfit(prediction), 0));
  const exposure = roundMoney(pending.reduce((sum, prediction) => sum + prediction.stake, 0));
  const totalStaked = roundMoney(bets.reduce((sum, prediction) => sum + prediction.stake, 0));
  const settledStaked = roundMoney(settled.reduce((sum, prediction) => sum + prediction.stake, 0));
  const returned = roundMoney(settled.reduce((sum, prediction) => sum + betReturn(prediction), 0));
  const initial = roundMoney(Math.max(0, settings.initialBankroll ?? 0));
  const current = roundMoney(initial + deposits - withdrawals + netProfit);
  const available = roundMoney(current - exposure);

  const summary: BankrollSummary = {
    initial,
    deposits,
    withdrawals,
    netProfit,
    current,
    exposure,
    available,
    totalStaked,
    settledStaked,
    returned,
    roi: settledStaked > 0 ? (netProfit / settledStaked) * 100 : null,
    totalBets: bets.length,
    settledBets: settled.length,
    openBets: pending.length,
    wins: wins.length,
    losses: losses.length,
    voids: bets.filter((prediction) => prediction.status === 'void').length,
    hitRate: wins.length + losses.length > 0 ? (wins.length / (wins.length + losses.length)) * 100 : null,
    avgStake: bets.length > 0 ? totalStaked / bets.length : null,
    biggestWin: roundMoney(Math.max(0, ...wins.map((prediction) => betProfit(prediction)))),
    biggestLoss: roundMoney(Math.min(0, ...losses.map((prediction) => betProfit(prediction)))),
  };

  const end = todayKey(now);
  const candidates: string[] = [];
  const configuredStart = dateKey(settings.bankrollStartDate ?? '');
  if (configuredStart) candidates.push(configuredStart);
  transactions.forEach((item) => {
    const key = dateKey(item.date);
    if (key) candidates.push(key);
  });
  settled.forEach((prediction) => {
    const key = dateKey(prediction.eventDate);
    if (key) candidates.push(key);
  });
  const earliest = candidates.sort()[0] ?? end;
  let start = earliest < end ? earliest : end;
  // Mantém a série navegável mesmo se alguém importar uma data muito antiga.
  const horizon = todayKey(addDays(parseDay(end), -3650));
  if (start < horizon) start = horizon;

  const activity = new Map<string, { deposits: number; withdrawals: number; profit: number }>();
  const bucket = (key: string) => {
    let currentBucket = activity.get(key);
    if (!currentBucket) {
      currentBucket = { deposits: 0, withdrawals: 0, profit: 0 };
      activity.set(key, currentBucket);
    }
    return currentBucket;
  };
  transactions.forEach((item) => {
    const key = dateKey(item.date);
    if (!key) return;
    const target = bucket(key < start ? start : key > end ? end : key);
    if (item.type === 'deposit') target.deposits += item.amount;
    else target.withdrawals += item.amount;
  });
  settled.forEach((prediction) => {
    const key = dateKey(prediction.eventDate);
    if (!key) return;
    bucket(key < start ? start : key > end ? end : key).profit += betProfit(prediction);
  });

  const series: BankrollPoint[] = [];
  let balance = initial;
  let profit = 0;
  let cursor = parseDay(start);
  const last = parseDay(end);
  // Um ponto por dia mantém o gráfico fiel a saques e resultados; o limite
  // evita séries absurdas caso alguém importe uma data muito antiga.
  let guard = 0;
  while (cursor <= last && guard < 5000) {
    const key = todayKey(cursor);
    const day = activity.get(key);
    if (day) {
      balance += day.deposits - day.withdrawals + day.profit;
      profit += day.profit;
    }
    series.push({
      date: keyToIso(key),
      balance: roundMoney(balance),
      profit: roundMoney(profit),
      deposits: roundMoney(day?.deposits ?? 0),
      withdrawals: roundMoney(day?.withdrawals ?? 0),
    });
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  if (series.length === 0) {
    series.push({
      date: keyToIso(end),
      balance: current,
      profit: netProfit,
      deposits: 0,
      withdrawals: 0,
    });
  }

  return { summary, series };
}

export function normalizeTransactionInput(input: BankrollTransactionInput): {
  type: 'deposit' | 'withdrawal';
  amount: number;
  date: string;
  note: string;
} {
  if (input.type !== 'deposit' && input.type !== 'withdrawal') {
    throw new Error('Tipo de movimentação inválido.');
  }
  const amount = roundMoney(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }
  if (amount > 100_000_000) {
    throw new Error('Valor acima do limite permitido.');
  }
  const date = dateKey(input.date);
  if (!date) throw new Error('Informe uma data válida.');
  return {
    type: input.type,
    amount,
    date,
    note: (input.note ?? '').trim().slice(0, 500),
  };
}
