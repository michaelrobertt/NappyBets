import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { BankrollTransaction, Prediction } from '../src/shared/types';
import { betProfit, betReturn, buildBankroll, impliedProbability } from '../src/shared/bankroll';
import initSqlJs from 'sql.js';
import { Store } from '../electron/store';

let counter = 0;
function prediction(overrides: Partial<Prediction> = {}): Prediction {
  counter += 1;
  return {
    id: `bet-${counter}`,
    sport: 'League of Legends',
    competition: 'CBLOL',
    subjectType: 'team',
    subject: 'LOUD',
    event: 'LOUD vs paiN Gaming',
    eventDate: '2026-02-02T18:00',
    category: 'Vencedor da partida',
    predictedResult: 'Vitória LOUD',
    probability: 60,
    stake: 100,
    odds: 2,
    status: 'hit',
    actualResult: '2-0',
    bookmaker: 'Betano',
    notes: '',
    isDemo: false,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    ...overrides,
  };
}

function transaction(overrides: Partial<BankrollTransaction> = {}): BankrollTransaction {
  return {
    id: 'tx-1',
    type: 'deposit',
    amount: 500,
    date: '2026-02-04',
    note: '',
    createdAt: '2026-02-04T10:00:00.000Z',
    ...overrides,
  };
}

const now = new Date(2026, 1, 10, 12, 0);
const settings = { initialBankroll: 1000, bankrollStartDate: '2026-02-01' };

describe('cálculos da banca', () => {
  it('calcula retorno, lucro, exposição, ROI e saldo', () => {
    const rows = [
      prediction({ id: 'hit', status: 'hit', stake: 100, odds: 2 }),
      prediction({ id: 'miss', status: 'miss', stake: 50, odds: 1.8, eventDate: '2026-02-03T18:00' }),
      prediction({ id: 'open', status: 'pending', stake: 80, odds: 1.7, eventDate: '2026-02-09T18:00' }),
      prediction({ id: 'no-stake', status: 'hit', stake: 0, odds: null }),
    ];
    const transactions = [
      transaction(),
      transaction({ id: 'tx-2', type: 'withdrawal', amount: 200, date: '2026-02-05' }),
    ];
    const { summary, series } = buildBankroll(rows, transactions, settings, now);

    expect(summary.initial).toBe(1000);
    expect(summary.deposits).toBe(500);
    expect(summary.withdrawals).toBe(200);
    expect(summary.netProfit).toBe(50);
    expect(summary.current).toBe(1350);
    expect(summary.exposure).toBe(80);
    expect(summary.available).toBe(1270);
    expect(summary.totalStaked).toBe(230);
    expect(summary.settledStaked).toBe(150);
    expect(summary.returned).toBe(200);
    expect(summary.roi).toBeCloseTo(33.333, 3);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.openBets).toBe(1);
    expect(summary.hitRate).toBe(50);

    const day = (date: string) => series.find((point) => point.date.startsWith(date));
    expect(day('2026-02-01')!.balance).toBe(1000);
    expect(day('2026-02-02')!.balance).toBe(1100);
    expect(day('2026-02-03')!.balance).toBe(1050);
    expect(day('2026-02-04')!.balance).toBe(1550);
    expect(day('2026-02-05')!.balance).toBe(1350);
    expect(day('2026-02-10')!.balance).toBe(1350);
    expect(series[series.length - 1]!.profit).toBe(50);
  });

  it('trata anulada e aposta sem odds sem criar lucro artificial', () => {
    expect(betProfit({ status: 'void', stake: 100, odds: 2 })).toBe(0);
    expect(betReturn({ status: 'void', stake: 100, odds: 2 })).toBe(100);
    expect(betProfit({ status: 'hit', stake: 100, odds: null })).toBe(0);
    expect(betProfit({ status: 'miss', stake: 100, odds: null })).toBe(-100);
    expect(betProfit({ status: 'pending', stake: 100, odds: 2 })).toBe(0);
    expect(betReturn({ status: 'hit', stake: 50, odds: 1.9 })).toBe(95);
    expect(impliedProbability(2)).toBe(50);
    expect(impliedProbability(1)).toBeNull();
  });

  it('mantém a série coerente mesmo sem movimentações', () => {
    const { summary, series } = buildBankroll([], [], { initialBankroll: 250, bankrollStartDate: '2026-02-08' }, now);
    expect(summary.current).toBe(250);
    expect(summary.available).toBe(250);
    expect(series[0]!.balance).toBe(250);
    expect(series[series.length - 1]!.balance).toBe(250);
  });
});

const dirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nappybets-bankroll-'));
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

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('Store — banca persistida', () => {
  it('persiste stake/odds e movimentações entre sessões', async () => {
    const dir = tempDir();
    const store = new Store({ userDataPath: dir, appVersion: 'test' });
    await store.init();
    store.clearData('demo');
    store.saveSettings({ initialBankroll: 1000, bankrollStartDate: today() });
    const bet = store.create({
      sport: 'CS2',
      competition: 'IEM',
      subjectType: 'team',
      subject: 'NAVI',
      event: 'NAVI vs Spirit',
      eventDate: `${today()}T18:00`,
      category: 'Vencedor da partida',
      predictedResult: 'Vitória NAVI',
      probability: 55,
      stake: 100,
      odds: 2.1,
      status: 'hit',
      actualResult: '2-1',
      bookmaker: '1win',
      notes: '',
      isDemo: false,
    });
    store.addBankrollTransaction({ type: 'deposit', amount: 200, date: today(), note: 'Aporte' });
    expect(store.bankrollOverview().summary.current).toBe(1310);
    store.close();

    const reopened = new Store({ userDataPath: dir, appVersion: 'test' });
    await reopened.init();
    const loaded = reopened.allPredictions()[0]!;
    expect(loaded.stake).toBe(100);
    expect(loaded.odds).toBe(2.1);
    expect(reopened.bankrollOverview().transactions).toHaveLength(1);
    expect(reopened.bankrollOverview().summary.current).toBe(1310);
    expect(bet.id).toBe(loaded.id);
    reopened.close();
  });

  it('bloqueia saque acima da banca disponível', async () => {
    const dir = tempDir();
    const store = new Store({ userDataPath: dir, appVersion: 'test' });
    await store.init();
    store.clearData('demo');
    store.saveSettings({ initialBankroll: 100, bankrollStartDate: today() });
    store.addBankrollTransaction({ type: 'deposit', amount: 50, date: today() });
    store.create({
      sport: 'League of Legends',
      competition: 'CBLOL',
      subjectType: 'team',
      subject: 'LOUD',
      event: 'LOUD vs paiN',
      eventDate: `${today()}T18:00`,
      category: 'Vencedor',
      predictedResult: 'Vitória LOUD',
      probability: 60,
      stake: 30,
      odds: 1.8,
      status: 'pending',
      actualResult: '',
      bookmaker: '',
      notes: '',
      isDemo: false,
    });
    expect(store.bankrollOverview().summary.available).toBe(120);
    expect(() => store.addBankrollTransaction({ type: 'withdrawal', amount: 121, date: today() })).toThrow(
      /insuficiente/i,
    );
    store.addBankrollTransaction({ type: 'withdrawal', amount: 20, date: today() });
    expect(store.bankrollOverview().summary.available).toBe(100);
    store.close();
  });


  it('migra banco schema 2 preservando previsões e adicionando stake/odds', async () => {
    const dir = tempDir();
    const SQL = await initSqlJs({
      locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
    });
    const db = new SQL.Database();
    db.exec(`
      PRAGMA user_version = 2;
      CREATE TABLE predictions (
        id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        competition TEXT NOT NULL DEFAULT '',
        subject_type TEXT NOT NULL DEFAULT 'team',
        subject TEXT NOT NULL DEFAULT '',
        event TEXT NOT NULL DEFAULT '',
        event_date TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        predicted_result TEXT NOT NULL DEFAULT '',
        probability REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        actual_result TEXT NOT NULL DEFAULT '',
        bookmaker TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO predictions VALUES (
        'old-1','CS2','IEM','team','NAVI','NAVI vs Spirit','2026-01-10T18:00',
        'Vencedor','Vitória NAVI',55,'pending','','','',0,
        '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'
      );
    `);
    fs.writeFileSync(path.join(dir, 'nappybets.sqlite'), Buffer.from(db.export()));
    db.close();

    const store = new Store({ userDataPath: dir, appVersion: 'test' });
    await store.init();
    expect(store.info().schemaVersion).toBe(3);
    const loaded = store.allPredictions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.event).toBe('NAVI vs Spirit');
    expect(loaded[0]!.stake).toBe(0);
    expect(loaded[0]!.odds).toBeNull();
    expect(store.bankrollOverview().summary.current).toBe(0);
    store.saveSettings({ initialBankroll: 100 });
    expect(store.bankrollOverview().summary.current).toBe(100);
    store.close();
  });

  it('importa movimentações do bundle JSON sem duplicar na mesclagem', async () => {
    const dir = tempDir();
    const store = new Store({ userDataPath: dir, appVersion: 'test' });
    await store.init();
    store.clearData('demo');
    const input = { type: 'deposit' as const, amount: 300, date: today(), note: 'Importado' };
    expect(store.importBankrollTransactions([input], 'merge')).toBe(1);
    expect(store.importBankrollTransactions([input], 'merge')).toBe(0);
    expect(store.bankrollOverview().summary.deposits).toBe(300);
    const bundle = JSON.parse(store.buildExportBundle()) as { bankrollTransactions: unknown[] };
    expect(bundle.bankrollTransactions).toHaveLength(1);
    store.close();
  });
});
