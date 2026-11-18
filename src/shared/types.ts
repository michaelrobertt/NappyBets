/**
 * Tipos compartilhados entre processo principal (Electron/Node) e renderer (React).
 * Nenhum import de Electron aqui: este módulo é puro e testável.
 */

export type PredictionStatus = 'pending' | 'hit' | 'miss' | 'void';

export const STATUS_LABEL: Record<PredictionStatus, string> = {
  pending: 'Pendente',
  hit: 'Acertou',
  miss: 'Errou',
  void: 'Anulada',
};

export type SubjectType = 'team' | 'player';

export const SUBJECT_LABEL: Record<SubjectType, string> = {
  team: 'Time',
  player: 'Jogador',
};

export interface Prediction {
  id: string;
  sport: string;
  competition: string;
  subjectType: SubjectType;
  /** Time ou jogador relacionado à previsão. */
  subject: string;
  /** Nome do evento / partida. */
  event: string;
  /** Data e horário do evento em ISO local: YYYY-MM-DDTHH:mm. */
  eventDate: string;
  /** Categoria / mercado da previsão. */
  category: string;
  predictedResult: string;
  /** Probabilidade estimada, 0..100. */
  probability: number;
  /** Valor apostado em reais. 0 significa previsão sem valor financeiro. */
  stake: number;
  /** Odds decimais (ex.: 1.85). Null quando não informadas. */
  odds: number | null;
  status: PredictionStatus;
  actualResult: string;
  /** Casa de referência usada no registro da aposta. */
  bookmaker: string;
  notes: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PredictionInput = Omit<
  Prediction,
  'id' | 'createdAt' | 'updatedAt' | 'stake' | 'odds'
> & {
  stake?: number;
  odds?: number | null;
};

export type BankrollTransactionType = 'deposit' | 'withdrawal';

/** Movimentação manual da banca: depósito ou saque. */
export interface BankrollTransaction {
  id: string;
  type: BankrollTransactionType;
  /** Valor absoluto em reais, sempre positivo. */
  amount: number;
  /** Data local no formato YYYY-MM-DD. */
  date: string;
  note: string;
  createdAt: string;
}

export interface BankrollTransactionInput {
  type: BankrollTransactionType;
  amount: number;
  date: string;
  note?: string;
}

export type PeriodPreset =
  | 'all'
  | '7d'
  | '30d'
  | '90d'
  | 'this-month'
  | 'last-month'
  | 'custom';

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  all: 'Todo o período',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  'this-month': 'Este mês',
  'last-month': 'Mês anterior',
  custom: 'Período personalizado',
};

export interface Filters {
  period: PeriodPreset;
  from: string | null;
  to: string | null;
  sport: string | null;
  competition: string | null;
  category: string | null;
  status: PredictionStatus | 'all';
  bookmaker: string | null;
  subject: string | null;
  subjectType: SubjectType | null;
  search: string;
}

export const EMPTY_FILTERS: Filters = {
  period: 'all',
  from: null,
  to: null,
  sport: null,
  competition: null,
  category: null,
  status: 'all',
  bookmaker: null,
  subject: null,
  subjectType: null,
  search: '',
};

export type SortKey =
  | 'eventDate'
  | 'sport'
  | 'competition'
  | 'category'
  | 'probability'
  | 'status'
  | 'createdAt';

export interface PredictionQuery extends Filters {
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface Summary {
  total: number;
  settled: number;
  hits: number;
  misses: number;
  voids: number;
  pending: number;
  /** Acertos / (acertos + erros) em %, ou null quando não há amostra. */
  hitRate: number | null;
  /** Brier Score médio (0..1), quanto menor melhor. */
  brier: number | null;
  avgProbability: number | null;
  /** Hit rate realizado - probabilidade média estimada (em pontos percentuais). */
  calibrationGap: number | null;
  /** Previsões que entraram no cálculo do Brier. */
  brierSample: number;
  withoutCategory: number;
}

export interface Aggregate extends Summary {
  key: string;
  label: string;
  sports: string[];
}

export interface CalibrationBand {
  from: number;
  to: number;
  label: string;
  count: number;
  hits: number;
  misses: number;
  /** Taxa de acerto observada na faixa, em %. */
  hitRate: number | null;
  /** Média real das probabilidades estimadas na faixa, em %. */
  expected: number;
}

export interface TimelinePoint {
  date: string;
  settled: number;
  hits: number;
  hitRate: number | null;
  cumulativeSettled: number;
  cumulativeHitRate: number | null;
  cumulativeBrier: number | null;
}

export interface Highlights {
  dimension: 'competition' | 'sport' | 'category';
  minSample: number;
  positive: Aggregate[];
  negative: Aggregate[];
  excludedForSample: number;
}

export interface Facets {
  sports: string[];
  competitions: string[];
  categories: string[];
  bookmakers: string[];
  competitionsBySport: Record<string, string[]>;
  teams: string[];
  players: string[];
}

export interface Analytics {
  summary: Summary;
  range: { from: string | null; to: string | null };
  byCompetition: Aggregate[];
  bySport: Aggregate[];
  byCategory: Aggregate[];
  byBookmaker: Aggregate[];
  byTeam: Aggregate[];
  byPlayer: Aggregate[];
  calibration: { bands: CalibrationBand[]; settled: number };
  timeline: TimelinePoint[];
  highlights: Highlights;
  upcoming: Prediction[];
  warnings: string[];
  facets: Facets;
}

export interface AppSettings {
  profileName: string;
  avatar: string;
  avatarColor: string;
  theme: 'dark' | 'midnight' | 'light';
  accent: 'green' | 'blue' | 'violet' | 'amber';
  favoriteSport: string | null;
  defaultPeriod: PeriodPreset;
  minSample: number;
  dashboardDimension: 'competition' | 'sport' | 'category';
  /** Banca inicial em reais, considerada no início da série. */
  initialBankroll: number;
  /** Data em que a banca inicial foi definida (YYYY-MM-DD). */
  bankrollStartDate: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  profileName: 'Analista',
  avatar: '🎯',
  avatarColor: '#10b981',
  theme: 'dark',
  accent: 'green',
  favoriteSport: 'League of Legends',
  defaultPeriod: 'all',
  minSample: 5,
  dashboardDimension: 'competition',
  initialBankroll: 0,
  bankrollStartDate: '',
};

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ImportReport {
  imported: number;
  duplicatesSkipped: number;
  invalid: number;
  errors: string[];
  mode: 'merge' | 'replace';
  /** Movimentações de banca importadas junto ao JSON, quando houver. */
  bankrollImported?: number;
}

export interface BackupInfo {
  fileName: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  reason: string;
}

export interface StorageInfo {
  databasePath: string;
  databaseBytes: number;
  backupDir: string;
  backupCount: number;
  lastBackupAt: string | null;
  totalPredictions: number;
  demoPredictions: number;
  schemaVersion: number;
  appVersion: string;
  userDataPath: string;
}

export interface AppInfo extends StorageInfo {
  platform: string;
  versions: { electron: string; chrome: string; node: string };
  integrity: 'ok' | 'recovered' | 'error';
  integrityMessage: string | null;
}
