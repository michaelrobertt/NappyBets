import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type {
  AppSettings,
  BackupInfo,
  BankrollTransaction,
  BankrollTransactionInput,
  ImportReport,
  Prediction,
  PredictionInput,
  PredictionStatus,
  PredictionQuery,
} from '../src/shared/types';
import { DEFAULT_SETTINGS, STATUS_LABEL } from '../src/shared/types';
import {
  buildBankroll,
  normalizeTransactionInput,
  roundMoney,
  type BankrollOverview,
} from '../src/shared/bankroll';
import {
  fingerprint,
  queryPredictions,
  validatePrediction,
} from '../src/shared/stats';
import {
  createExportBundle,
  csvToPredictions,
  parseImportJson,
  predictionsToCsv,
} from '../src/shared/csv';
import { buildSeedPredictions } from './seed';
import { ExternalStore } from './external-store';

const SCHEMA_VERSION = 3;
const MAX_BACKUPS = 25;

const COLUMNS = [
  'id',
  'sport',
  'competition',
  'subject_type',
  'subject',
  'event',
  'event_date',
  'category',
  'predicted_result',
  'probability',
  'stake',
  'odds',
  'status',
  'actual_result',
  'bookmaker',
  'notes',
  'is_demo',
  'created_at',
  'updated_at',
] as const;

type Row = Record<string, unknown>;

function rowToPrediction(row: Row): Prediction {
  return {
    id: String(row.id),
    sport: String(row.sport ?? ''),
    competition: String(row.competition ?? ''),
    subjectType: row.subject_type === 'player' ? 'player' : 'team',
    subject: String(row.subject ?? ''),
    event: String(row.event ?? ''),
    eventDate: String(row.event_date ?? ''),
    category: String(row.category ?? ''),
    predictedResult: String(row.predicted_result ?? ''),
    probability: Number(row.probability ?? 0),
    stake: Number(row.stake ?? 0),
    odds: row.odds === null || row.odds === undefined ? null : Number(row.odds),
    status: (String(row.status ?? 'pending') as PredictionStatus) ?? 'pending',
    actualResult: String(row.actual_result ?? ''),
    bookmaker: String(row.bookmaker ?? ''),
    notes: String(row.notes ?? ''),
    isDemo: Number(row.is_demo ?? 0) === 1,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export interface LoadReport {
  integrity: 'ok' | 'recovered' | 'error';
  message: string | null;
  seededDemo: boolean;
}

export interface StoreOptions {
  /** Diretório de dados do usuário (app.getPath('userData')). */
  userDataPath: string;
  appVersion: string;
}

export class Store {
  readonly dbPath: string;
  readonly backupDir: string;
  readonly exportDir: string;
  private readonly options: StoreOptions;
  private SQL!: SqlJsStatic;
  private db!: Database;
  private cache: Prediction[] = [];
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private loadReport: LoadReport = { integrity: 'ok', message: null, seededDemo: false };
  private lastBackupAt: string | null = null;
  private persistEnabled = true;
  private meta: { demoSeeded?: boolean } = {};
  private transactions: BankrollTransaction[] = [];
  external!: ExternalStore;

  constructor(options: StoreOptions) {
    this.options = options;
    this.dbPath = path.join(options.userDataPath, 'nappybets.sqlite');
    this.backupDir = path.join(options.userDataPath, 'backups');
    this.exportDir = path.join(options.userDataPath, 'exports');
  }

  async init(): Promise<LoadReport> {
    fs.mkdirSync(this.options.userDataPath, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });
    fs.mkdirSync(this.exportDir, { recursive: true });
    this.SQL = await initSqlJs({ locateFile: (file: string) => this.resolveWasm(file) });

    const loaded = this.loadFromDisk();
    if (!loaded) {
      this.db = new this.SQL.Database();
      this.applySchema();
      this.persist();
      this.loadReport = { integrity: 'ok', message: null, seededDemo: false };
    }

    this.migrate();
    this.bindExternalStore();
    this.refreshCache();
    this.loadTransactions();
    this.loadSettings();
    this.loadMeta();

    if (this.cache.length > 0 && !this.meta.demoSeeded) {
      this.meta.demoSeeded = true;
      this.saveMeta();
    }

    if (this.cache.length === 0 && !this.meta.demoSeeded) {
      const seeded = this.seedDemoInternal();
      this.meta.demoSeeded = true;
      this.saveMeta();
      if (seeded > 0) {
        this.loadReport.seededDemo = true;
        this.loadReport.message =
          'Conjunto de demonstração criado para você explorar o aplicativo. Use "Limpar dados de demonstração" para começar do zero.';
      }
    }

    try {
      this.lastBackupAt = this.latestBackupDate();
      const last = this.lastBackupAt ? new Date(this.lastBackupAt).getTime() : 0;
      if (Date.now() - last > 20 * 60 * 60 * 1000) {
        this.createBackup('automático (inicialização)');
      }
    } catch {
      /* backup é best-effort */
    }

    return this.loadReport;
  }

  private resolveWasm(file: string): string {
    const candidates: string[] = [];
    // Electron empacotado: dist-electron/../node_modules (asar ou unpacked)
    if (typeof __dirname !== 'undefined') {
      candidates.push(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file));
    }
    if (process.resourcesPath) {
      candidates.push(
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file),
        path.join(process.resourcesPath, 'app.asar', 'node_modules', 'sql.js', 'dist', file),
      );
    }
    // Desenvolvimento e testes (Node/vitest)
    candidates.push(path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file));
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return candidates[0]!;
  }

  private loadFromDisk(): boolean {
    if (!fs.existsSync(this.dbPath)) return false;
    const bytes = fs.readFileSync(this.dbPath);
    if (bytes.length === 0) return false;
    try {
      const db = new this.SQL.Database(new Uint8Array(bytes));
      const check = db.exec('PRAGMA integrity_check');
      const result = String(check[0]?.values?.[0]?.[0] ?? 'ok');
      if (result.toLowerCase() !== 'ok') throw new Error(`integrity_check: ${result}`);
      db.exec('SELECT 1 FROM predictions LIMIT 1');
      this.db = db;
      return true;
    } catch (error) {
      const quarantined = `${this.dbPath}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(this.dbPath, quarantined);
      } catch {
        /* ignore */
      }
      const recovered = this.restoreLatestBackup();
      if (recovered) {
        this.loadReport = {
          integrity: 'recovered',
          message: `O banco principal estava danificado (${(error as Error).message}). Os dados foram restaurados da cópia automática mais recente. Arquivo corrompido preservado em ${quarantined}.`,
          seededDemo: false,
        };
        return true;
      }
      this.loadReport = {
        integrity: 'error',
        message: `Não foi possível abrir o banco e não havia cópia automática válida. Um novo banco foi criado (arquivo antigo em ${quarantined}).`,
        seededDemo: false,
      };
      return false;
    }
  }

  private restoreLatestBackup(): boolean {
    const backups = this.listBackups();
    for (const backup of backups) {
      try {
        const bytes = fs.readFileSync(backup.path);
        const db = new this.SQL.Database(new Uint8Array(bytes));
        const check = db.exec('PRAGMA integrity_check');
        if (String(check[0]?.values?.[0]?.[0] ?? '').toLowerCase() !== 'ok') continue;
        db.exec('SELECT 1 FROM predictions LIMIT 1');
        this.db = db;
        this.persist();
        return true;
      } catch {
        /* tenta a próxima */
      }
    }
    return false;
  }

  private bindExternalStore(): void {
    this.external = new ExternalStore(this.db, () => this.persist());
  }

  private applySchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = MEMORY;
      PRAGMA user_version = ${SCHEMA_VERSION};
      CREATE TABLE IF NOT EXISTS predictions (
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
        stake REAL NOT NULL DEFAULT 0,
        odds REAL,
        status TEXT NOT NULL DEFAULT 'pending',
        actual_result TEXT NOT NULL DEFAULT '',
        bookmaker TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_predictions_event_date ON predictions(event_date);
      CREATE INDEX IF NOT EXISTS idx_predictions_sport ON predictions(sport);
      CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bankroll_transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bankroll_date ON bankroll_transactions(date);
      CREATE TABLE IF NOT EXISTS ext_markets (
        platform TEXT NOT NULL,
        id TEXT NOT NULL,
        condition_id TEXT NOT NULL DEFAULT '',
        token_ids TEXT NOT NULL DEFAULT '[]',
        event_id TEXT NOT NULL DEFAULT '',
        event_title TEXT NOT NULL DEFAULT '',
        event_subtitle TEXT NOT NULL DEFAULT '',
        event_slug TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        subtitle TEXT NOT NULL DEFAULT '',
        sport TEXT NOT NULL DEFAULT 'Outros',
        is_esports INTEGER NOT NULL DEFAULT 0,
        kind TEXT NOT NULL DEFAULT 'other',
        status TEXT NOT NULL DEFAULT 'live',
        outcomes TEXT NOT NULL DEFAULT '[]',
        volume REAL,
        liquidity REAL,
        open_interest REAL,
        closes_at TEXT,
        result TEXT,
        url TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (platform, id)
      );
      CREATE INDEX IF NOT EXISTS idx_ext_markets_status ON ext_markets(platform, status);
      CREATE INDEX IF NOT EXISTS idx_ext_markets_sport ON ext_markets(sport);
      CREATE INDEX IF NOT EXISTS idx_ext_markets_event ON ext_markets(platform, event_id);
      CREATE TABLE IF NOT EXISTS ext_positions (
        platform TEXT NOT NULL,
        id TEXT NOT NULL,
        market_id TEXT NOT NULL DEFAULT '',
        token_id TEXT NOT NULL DEFAULT '',
        event_title TEXT NOT NULL DEFAULT '',
        market_title TEXT NOT NULL DEFAULT '',
        outcome TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        stake REAL NOT NULL DEFAULT 0,
        current_value REAL NOT NULL DEFAULT 0,
        pnl REAL NOT NULL DEFAULT 0,
        size REAL NOT NULL DEFAULT 0,
        avg_price REAL,
        cur_price REAL,
        won INTEGER,
        opened_at TEXT,
        closed_at TEXT,
        url TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (platform, id)
      );
      CREATE INDEX IF NOT EXISTS idx_ext_positions_status ON ext_positions(platform, status);
      CREATE TABLE IF NOT EXISTS ext_state (
        platform TEXT PRIMARY KEY,
        last_sync_at TEXT,
        last_error TEXT,
        markets_count INTEGER NOT NULL DEFAULT 0,
        positions_count INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  private migrate(): void {
    const res = this.db.exec('PRAGMA user_version');
    const version = Number(res[0]?.values?.[0]?.[0] ?? 0);
    if (version > SCHEMA_VERSION) {
      throw new Error(
        `Este banco foi criado por uma versão mais nova do Nappy Bets (schema ${version}). Atualize o aplicativo.`,
      );
    }
    if (version < SCHEMA_VERSION) {
      // Migrações incrementais futuras entram aqui, preservando os dados existentes.
      this.applySchema();
      this.ensurePredictionColumns();
      this.persist();
    } else {
      // Garante índices/tabelas ausentes sem alterar dados existentes.
      this.applySchema();
      this.ensurePredictionColumns();
    }
  }

  /** Bancos da versão 2 não têm stake/odds; adiciona sem perder registros. */
  private ensurePredictionColumns(): void {
    const res = this.db.exec('PRAGMA table_info(predictions)');
    const columns = new Set((res[0]?.values ?? []).map((value) => String(value[1])));
    if (!columns.has('stake')) {
      this.db.exec('ALTER TABLE predictions ADD COLUMN stake REAL NOT NULL DEFAULT 0');
    }
    if (!columns.has('odds')) {
      this.db.exec('ALTER TABLE predictions ADD COLUMN odds REAL');
    }
  }

  schemaVersion(): number {
    const res = this.db.exec('PRAGMA user_version');
    return Number(res[0]?.values?.[0]?.[0] ?? SCHEMA_VERSION);
  }

  private refreshCache(): void {
    const res = this.db.exec(`SELECT ${COLUMNS.join(', ')} FROM predictions ORDER BY event_date ASC`);
    if (!res[0]) {
      this.cache = [];
      return;
    }
    const { columns, values } = res[0];
    this.cache = values.map((value) => {
      const row: Row = {};
      columns.forEach((column, index) => {
        row[column] = value[index];
      });
      return rowToPrediction(row);
    });
  }

  private loadTransactions(): void {
    const res = this.db.exec(
      'SELECT id, type, amount, date, note, created_at FROM bankroll_transactions ORDER BY date ASC, created_at ASC',
    );
    if (!res[0]) {
      this.transactions = [];
      return;
    }
    const { columns, values } = res[0];
    this.transactions = values.map((value) => {
      const row: Row = {};
      columns.forEach((column, index) => {
        row[column] = value[index];
      });
      return {
        id: String(row.id),
        type: row.type === 'withdrawal' ? 'withdrawal' : 'deposit',
        amount: Number(row.amount ?? 0),
        date: String(row.date ?? ''),
        note: String(row.note ?? ''),
        createdAt: String(row.created_at ?? ''),
      };
    });
    this.transactions.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  }

  private loadMeta(): void {
    const stmt = this.db.prepare("SELECT value FROM settings WHERE key = '_meta'");
    if (stmt.step()) {
      try {
        this.meta = JSON.parse(String(stmt.getAsObject().value ?? '{}')) as { demoSeeded?: boolean };
      } catch {
        this.meta = {};
      }
    }
    stmt.free();
  }

  private saveMeta(): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(['_meta', JSON.stringify(this.meta)]);
    stmt.free();
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* ignore */
    }
  }

  private loadSettings(): void {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind(['app']);
    if (stmt.step()) {
      const raw = String(stmt.getAsObject().value ?? '{}');
      try {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      } catch {
        this.settings = { ...DEFAULT_SETTINGS };
      }
    }
    stmt.free();
  }

  private persist(): void {
    if (!this.persistEnabled) return;
    const data = this.db.export();
    const tmp = `${this.dbPath}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, data, 0, data.length, 0);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.dbPath);
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  allPredictions(): Prediction[] {
    return this.cache;
  }

  getPrediction(id: string): Prediction | null {
    return this.cache.find((p) => p.id === id) ?? null;
  }

  list(query: PredictionQuery): { rows: Prediction[]; total: number; page: number; pageCount: number } {
    return queryPredictions(this.cache, query);
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  saveSettings(patch: Partial<AppSettings>): AppSettings {
    const next: AppSettings = { ...this.settings, ...patch };
    next.minSample = Math.max(1, Math.min(200, Math.round(next.minSample || 1)));
    next.profileName = (next.profileName || 'Analista').slice(0, 60);
    if (patch.initialBankroll !== undefined) {
      const amount = Number(patch.initialBankroll);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('A banca inicial não pode ser negativa.');
      }
      next.initialBankroll = roundMoney(amount);
      if (!next.bankrollStartDate) next.bankrollStartDate = localDateKey();
    }
    if (patch.bankrollStartDate !== undefined) {
      if (patch.bankrollStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.bankrollStartDate)) {
        throw new Error('Data da banca inicial inválida.');
      }
      next.bankrollStartDate = patch.bankrollStartDate;
    }
    this.settings = next;
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(['app', JSON.stringify(next)]);
    stmt.free();
    this.persist();
    return next;
  }

  // ---------- Banca ----------

  listBankrollTransactions(): BankrollTransaction[] {
    return [...this.transactions].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  }

  bankrollOverview(): BankrollOverview {
    const { summary, series } = buildBankroll(this.cache, this.transactions, this.settings);
    return {
      summary,
      series,
      transactions: this.listBankrollTransactions(),
      bets: this.cache
        .filter((prediction) => (prediction.stake ?? 0) > 0)
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    };
  }

  addBankrollTransaction(input: BankrollTransactionInput): BankrollOverview {
    const normalized = normalizeTransactionInput(input);
    const today = localDateKey();
    if (normalized.date > today) {
      throw new Error('A data da movimentação não pode estar no futuro.');
    }
    if (normalized.type === 'withdrawal') {
      const { summary } = buildBankroll(this.cache, this.transactions, this.settings);
      if (normalized.amount > summary.available + 0.005) {
        throw new Error(
          `Saldo disponível insuficiente. Você pode sacar até ${summary.available.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })}.`,
        );
      }
    }
    const transaction: BankrollTransaction = {
      ...normalized,
      id: crypto.randomUUID(),
      createdAt: this.nowIso(),
    };
    const stmt = this.db.prepare(
      'INSERT INTO bankroll_transactions (id, type, amount, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    stmt.run([
      transaction.id,
      transaction.type,
      transaction.amount,
      transaction.date,
      transaction.note,
      transaction.createdAt,
    ]);
    stmt.free();
    this.transactions.push(transaction);
    this.transactions.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    this.persist();
    return this.bankrollOverview();
  }

  deleteBankrollTransaction(id: string): BankrollOverview {
    const exists = this.transactions.some((item) => item.id === id);
    if (exists) {
      const stmt = this.db.prepare('DELETE FROM bankroll_transactions WHERE id = ?');
      stmt.run([id]);
      stmt.free();
      this.transactions = this.transactions.filter((item) => item.id !== id);
      this.persist();
    }
    return this.bankrollOverview();
  }

  /** Importa movimentações de um bundle JSON, ignorando duplicadas no modo mesclar. */
  importBankrollTransactions(
    inputs: BankrollTransactionInput[],
    mode: 'merge' | 'replace',
  ): number {
    if (!inputs.length && mode === 'merge') return 0;
    if (mode === 'replace') {
      this.db.run('DELETE FROM bankroll_transactions');
      this.transactions = [];
    }
    const seen = new Set(this.transactions.map(transactionFingerprint));
    const toInsert: BankrollTransaction[] = [];
    const now = this.nowIso();
    for (const input of inputs) {
      let normalized: ReturnType<typeof normalizeTransactionInput>;
      try {
        normalized = normalizeTransactionInput(input);
      } catch {
        continue;
      }
      const key = transactionFingerprint(normalized);
      if (mode === 'merge' && seen.has(key)) continue;
      seen.add(key);
      toInsert.push({ ...normalized, id: crypto.randomUUID(), createdAt: now });
    }
    if (!toInsert.length) {
      if (mode === 'replace') this.persist();
      return 0;
    }
    const stmt = this.db.prepare(
      'INSERT INTO bankroll_transactions (id, type, amount, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    this.db.run('BEGIN');
    try {
      for (const transaction of toInsert) {
        stmt.run([
          transaction.id,
          transaction.type,
          transaction.amount,
          transaction.date,
          transaction.note,
          transaction.createdAt,
        ]);
      }
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    } finally {
      stmt.free();
    }
    this.transactions.push(...toInsert);
    this.transactions.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    this.persist();
    return toInsert.length;
  }

  validate(input: Partial<PredictionInput>): string[] {
    return validatePrediction(input).map((issue) => issue.message);
  }

  findByFingerprint(input: Partial<PredictionInput>, excludeId?: string): Prediction | null {
    const key = fingerprint({
      sport: input.sport ?? '',
      competition: input.competition ?? '',
      subject: input.subject ?? '',
      event: input.event ?? '',
      eventDate: input.eventDate ?? '',
      category: input.category ?? '',
      predictedResult: input.predictedResult ?? '',
    });
    return (
      this.cache.find((p) => p.id !== excludeId && fingerprint(p) === key) ?? null
    );
  }

  create(input: PredictionInput, allowDuplicate = false): Prediction {
    const issues = this.validate(input);
    if (issues.length > 0) throw new Error(issues.join(' '));
    if (!allowDuplicate) {
      const dup = this.findByFingerprint(input);
      if (dup) {
        throw new Error(
          `Já existe uma previsão idêntica registrada em ${dup.eventDate.slice(0, 10)} (${dup.event}). Ajuste o evento, o mercado ou confirme a duplicação.`,
        );
      }
    }
    const now = this.nowIso();
    const normalized = normalizeInput(input);
    const prediction: Prediction = {
      ...normalized,
      stake: normalized.stake ?? 0,
      odds: normalized.odds ?? null,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.insertMany([prediction]);
    this.cache.push(prediction);
    this.sortCache();
    this.persist();
    return prediction;
  }

  update(id: string, patch: Partial<PredictionInput>, allowDuplicate = false): Prediction {
    const current = this.getPrediction(id);
    if (!current) throw new Error('Previsão não encontrada.');
    const merged: PredictionInput = normalizeInput({
      sport: patch.sport ?? current.sport,
      competition: patch.competition ?? current.competition,
      subjectType: patch.subjectType ?? current.subjectType,
      subject: patch.subject ?? current.subject,
      event: patch.event ?? current.event,
      eventDate: patch.eventDate ?? current.eventDate,
      category: patch.category ?? current.category,
      predictedResult: patch.predictedResult ?? current.predictedResult,
      probability: patch.probability ?? current.probability,
      stake: patch.stake ?? current.stake,
      odds: patch.odds !== undefined ? patch.odds : current.odds,
      status: patch.status ?? current.status,
      actualResult: patch.actualResult ?? current.actualResult,
      bookmaker: patch.bookmaker ?? current.bookmaker,
      notes: patch.notes ?? current.notes,
      isDemo: patch.isDemo ?? current.isDemo,
    });
    const issues = this.validate(merged);
    if (issues.length > 0) throw new Error(issues.join(' '));
    if (!allowDuplicate) {
      const dup = this.findByFingerprint(merged, id);
      if (dup) throw new Error('Já existe outra previsão com os mesmos dados.');
    }
    const updated: Prediction = {
      ...current,
      ...merged,
      stake: merged.stake ?? 0,
      odds: merged.odds ?? null,
      updatedAt: this.nowIso(),
    };
    const stmt = this.db.prepare(`
      UPDATE predictions SET
        sport = $sport, competition = $competition, subject_type = $subjectType, subject = $subject,
        event = $event, event_date = $eventDate, category = $category, predicted_result = $predictedResult,
        probability = $probability, stake = $stake, odds = $odds, status = $status,
        actual_result = $actualResult, bookmaker = $bookmaker,
        notes = $notes, is_demo = $isDemo, updated_at = $updatedAt
      WHERE id = $id
    `);
    stmt.run(this.bindParams(updated));
    stmt.free();
    this.cache = this.cache.map((p) => (p.id === id ? updated : p));
    this.sortCache();
    this.persist();
    return updated;
  }

  setStatus(ids: string[], status: PredictionStatus, actualResult?: string): number {
    if (!ids.length) return 0;
    const now = this.nowIso();
    const stmt = this.db.prepare(
      'UPDATE predictions SET status = ?, actual_result = COALESCE(?, actual_result), updated_at = ? WHERE id = ?',
    );
    let changed = 0;
    this.db.run('BEGIN');
    try {
      for (const id of ids) {
        const current = this.cache.find((p) => p.id === id);
        if (!current) continue;
        stmt.run([status, actualResult ?? null, now, id]);
        changed += 1;
      }
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    } finally {
      stmt.free();
    }
    this.cache = this.cache.map((p) =>
      ids.includes(p.id)
        ? {
            ...p,
            status,
            actualResult: actualResult ?? p.actualResult,
            updatedAt: now,
          }
        : p,
    );
    this.sortCache();
    this.persist();
    return changed;
  }

  remove(id: string): void {
    const stmt = this.db.prepare('DELETE FROM predictions WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    this.cache = this.cache.filter((p) => p.id !== id);
    this.persist();
  }

  removeMany(ids: string[]): number {
    if (!ids.length) return 0;
    const stmt = this.db.prepare('DELETE FROM predictions WHERE id = ?');
    let removed = 0;
    this.db.run('BEGIN');
    try {
      for (const id of ids) {
        stmt.run([id]);
        removed += 1;
      }
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    } finally {
      stmt.free();
    }
    this.cache = this.cache.filter((p) => !ids.includes(p.id));
    this.persist();
    return removed;
  }

  insertManyPredictions(inputs: PredictionInput[], mode: 'merge' | 'replace'): ImportReport {
    const report: ImportReport = {
      imported: 0,
      duplicatesSkipped: 0,
      invalid: 0,
      errors: [],
      mode,
    };
    const valid: PredictionInput[] = [];
    for (const input of inputs) {
      const issues = this.validate(input);
      if (issues.length > 0) {
        report.invalid += 1;
        if (report.errors.length < 12) report.errors.push(`${input.event || '(sem evento)'} — ${issues.join(' ')}`);
        continue;
      }
      valid.push(input);
    }

    const existing = mode === 'replace' ? [] : this.cache;
    const seen = new Set(existing.map(fingerprint));
    const now = this.nowIso();
    const toInsert: Prediction[] = [];
    for (const input of valid) {
      const key = fingerprint(input);
      if (seen.has(key)) {
        report.duplicatesSkipped += 1;
        continue;
      }
      seen.add(key);
      const normalized = normalizeInput(input);
      toInsert.push({
        ...normalized,
        stake: normalized.stake ?? 0,
        odds: normalized.odds ?? null,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
    }

    if (mode === 'replace') this.createBackup('antes de importação (substituir)');
    this.db.run('BEGIN');
    try {
      if (mode === 'replace') this.db.run('DELETE FROM predictions');
      this.insertMany(toInsert, false);
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw new Error(`Falha ao importar: ${(error as Error).message}`);
    }

    if (mode === 'replace') this.cache = [];
    this.cache.push(...toInsert);
    this.sortCache();
    this.persist();
    report.imported = toInsert.length;
    return report;
  }

  clearData(mode: 'all' | 'demo'): number {
    const ids =
      mode === 'all'
        ? this.cache.map((p) => p.id)
        : this.cache.filter((p) => p.isDemo).map((p) => p.id);
    if (!ids.length) return 0;
    if (mode === 'all') this.createBackup('antes de apagar todos os dados');
    const stmt = this.db.prepare('DELETE FROM predictions WHERE id = ?');
    this.db.run('BEGIN');
    try {
      ids.forEach((id) => stmt.run([id]));
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    } finally {
      stmt.free();
    }
    this.cache = this.cache.filter((p) => !ids.includes(p.id));
    this.persist();
    return ids.length;
  }

  seedDemo(): number {
    const created = this.seedDemoInternal();
    if (created > 0) {
      this.meta.demoSeeded = true;
      this.saveMeta();
    }
    return created;
  }

  private seedDemoInternal(): number {
    const existing = new Set(this.cache.map(fingerprint));
    const now = new Date();
    const drafts = buildSeedPredictions(now);
    const nowIso = this.nowIso();
    const toInsert: Prediction[] = [];
    for (const draft of drafts) {
      if (existing.has(fingerprint(draft))) continue;
      const normalized = normalizeInput(draft);
      toInsert.push({
        ...normalized,
        stake: normalized.stake ?? 0,
        odds: normalized.odds ?? null,
        id: crypto.randomUUID(),
        isDemo: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    if (!toInsert.length) return 0;
    this.db.run('BEGIN');
    try {
      this.insertMany(toInsert);
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
    this.cache.push(...toInsert);
    this.sortCache();
    this.persist();
    return toInsert.length;
  }

  private insertMany(predictions: Prediction[], transaction = false): void {
    if (!predictions.length) return;
    const stmt = this.db.prepare(`
      INSERT INTO predictions (${COLUMNS.join(', ')})
      VALUES (${COLUMNS.map((c) => `$${toCamel(c)}`).join(', ')})
    `);
    if (transaction) this.db.run('BEGIN');
    try {
      for (const prediction of predictions) stmt.run(this.bindParams(prediction));
      if (transaction) this.db.run('COMMIT');
    } catch (error) {
      if (transaction) this.db.run('ROLLBACK');
      throw error;
    } finally {
      stmt.free();
    }
  }

  private bindParams(p: Prediction): Record<string, string | number | null> {
    return {
      $id: p.id,
      $sport: p.sport,
      $competition: p.competition,
      $subjectType: p.subjectType,
      $subject: p.subject,
      $event: p.event,
      $eventDate: p.eventDate,
      $category: p.category,
      $predictedResult: p.predictedResult,
      $probability: p.probability,
      $stake: p.stake,
      $odds: p.odds,
      $status: p.status,
      $actualResult: p.actualResult,
      $bookmaker: p.bookmaker,
      $notes: p.notes,
      $isDemo: p.isDemo ? 1 : 0,
      $createdAt: p.createdAt,
      $updatedAt: p.updatedAt,
    };
  }

  private sortCache(): void {
    this.cache.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }

  // ---------- Backups ----------

  listBackups(): BackupInfo[] {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs
      .readdirSync(this.backupDir)
      .filter((f) => f.endsWith('.sqlite'))
      .map((fileName) => {
        const full = path.join(this.backupDir, fileName);
        const stat = fs.statSync(full);
        return {
          fileName,
          path: full,
          createdAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
          reason: this.reasonFromName(fileName),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private reasonFromName(fileName: string): string {
    const match = fileName.match(/^backup-[\dT-]+-(.+)\.sqlite$/);
    return match?.[1]?.replace(/_/g, ' ') ?? 'manual';
  }

  private latestBackupDate(): string | null {
    const backups = this.listBackups();
    return backups[0]?.createdAt ?? null;
  }

  createBackup(reason = 'manual'): BackupInfo {
    this.persist();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeReason = reason.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'manual';
    const fileName = `backup-${stamp}-${safeReason}.sqlite`;
    const target = path.join(this.backupDir, fileName);
    fs.copyFileSync(this.dbPath, target);
    const stat = fs.statSync(target);
    const info: BackupInfo = {
      fileName,
      path: target,
      createdAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      reason,
    };
    this.lastBackupAt = info.createdAt;
    const all = this.listBackups();
    all.slice(MAX_BACKUPS).forEach((old) => {
      try {
        fs.unlinkSync(old.path);
      } catch {
        /* ignore */
      }
    });
    return info;
  }

  restoreBackup(filePath: string): void {
    if (!fs.existsSync(filePath)) throw new Error('Cópia de segurança não encontrada.');
    const bytes = fs.readFileSync(filePath);
    let restored: Database;
    try {
      restored = new this.SQL.Database(new Uint8Array(bytes));
      const check = restored.exec('PRAGMA integrity_check');
      if (String(check[0]?.values?.[0]?.[0] ?? '').toLowerCase() !== 'ok') {
        throw new Error('integridade inválida');
      }
      restored.exec('SELECT 1 FROM predictions LIMIT 1');
      const version = Number(restored.exec('PRAGMA user_version')[0]?.values?.[0]?.[0] ?? 0);
      if (version > SCHEMA_VERSION) {
        throw new Error(`cópia criada por versão mais nova (schema ${version})`);
      }
    } catch (error) {
      throw new Error(`Arquivo de backup inválido: ${(error as Error).message}`);
    }
    this.createBackup('antes de restauração');
    this.db.close();
    this.db = restored;
    this.migrate();
    this.bindExternalStore();
    this.refreshCache();
    this.loadTransactions();
    this.loadSettings();
    this.persist();
  }

  restoreBackupByName(fileName: string): void {
    const info = this.listBackups().find((b) => b.fileName === fileName);
    if (!info) throw new Error('Cópia de segurança não encontrada.');
    this.restoreBackup(info.path);
  }

  deleteBackup(fileName: string): void {
    const info = this.listBackups().find((b) => b.fileName === fileName);
    if (!info) return;
    fs.unlinkSync(info.path);
  }

  // ---------- Export ----------

  buildExportBundle(): string {
    return JSON.stringify(
      createExportBundle(this.cache, this.settings, this.schemaVersion(), this.listBankrollTransactions()),
      null,
      2,
    );
  }

  buildCsv(): string {
    return predictionsToCsv(this.cache);
  }

  parseImport(content: string, extension: string): {
    inputs: PredictionInput[];
    settings: AppSettings | null;
    transactions: BankrollTransactionInput[];
  } {
    if (extension === '.csv') {
      const result = csvToPredictions(content);
      if (result.inputs.length === 0) {
        throw new Error(result.errors[0] ?? 'Nenhum registro válido encontrado no CSV.');
      }
      return { inputs: result.inputs, settings: null, transactions: [] };
    }
    const parsed = parseImportJson(content);
    if (parsed.inputs.length === 0 && parsed.transactions.length === 0) {
      throw new Error(parsed.errors[0] ?? 'Nenhum registro válido encontrado no JSON.');
    }
    return { inputs: parsed.inputs, settings: parsed.settings, transactions: parsed.transactions };
  }

  dbSizeBytes(): number {
    try {
      return fs.statSync(this.dbPath).size;
    } catch {
      return 0;
    }
  }

  counts(): { total: number; demo: number } {
    return {
      total: this.cache.length,
      demo: this.cache.filter((p) => p.isDemo).length,
    };
  }

  lastBackup(): string | null {
    return this.lastBackupAt;
  }

  exportDirPath(): string {
    return this.exportDir;
  }

  info() {
    return {
      databasePath: this.dbPath,
      databaseBytes: this.dbSizeBytes(),
      backupDir: this.backupDir,
      backupCount: this.listBackups().length,
      lastBackupAt: this.lastBackupAt,
      totalPredictions: this.cache.length,
      demoPredictions: this.cache.filter((p) => p.isDemo).length,
      schemaVersion: this.schemaVersion(),
      appVersion: this.options.appVersion,
      userDataPath: this.options.userDataPath,
      integrity: this.loadReport.integrity,
      integrityMessage: this.loadReport.message,
    };
  }
}

function toCamel(column: string): string {
  return column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function transactionFingerprint(item: Pick<BankrollTransaction, 'type' | 'amount' | 'date' | 'note'>): string {
  return [item.type, roundMoney(item.amount).toFixed(2), item.date, item.note.trim().toLowerCase()].join('|');
}

function normalizeInput(input: PredictionInput): PredictionInput {
  return {
    sport: (input.sport ?? '').trim(),
    competition: (input.competition ?? '').trim(),
    subjectType: input.subjectType === 'player' ? 'player' : 'team',
    subject: (input.subject ?? '').trim(),
    event: (input.event ?? '').trim(),
    eventDate: (input.eventDate ?? '').slice(0, 16),
    category: (input.category ?? '').trim(),
    predictedResult: (input.predictedResult ?? '').trim(),
    probability: Math.min(100, Math.max(0, Number(input.probability))),
    stake: roundMoney(Math.max(0, Math.min(100_000_000, Number(input.stake ?? 0) || 0))),
    odds:
      input.odds === null || input.odds === undefined
        ? null
        : Number(input.odds) > 1
          ? Math.round(Number(input.odds) * 1000) / 1000
          : null,
    status: (input.status ?? 'pending') as PredictionStatus,
    actualResult: (input.actualResult ?? '').trim(),
    bookmaker: (input.bookmaker ?? '').trim(),
    notes: (input.notes ?? '').trim(),
    isDemo: Boolean(input.isDemo),
  };
}

export { STATUS_LABEL };
