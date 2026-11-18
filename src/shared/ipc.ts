import type {
  Analytics,
  AppInfo,
  AppSettings,
  BackupInfo,
  BankrollTransactionInput,
  Facets,
  Filters,
  ImportReport,
  Prediction,
  PredictionInput,
  PredictionQuery,
  PredictionStatus,
} from './types';
import type { BankrollOverview } from './bankroll';
import type {
  ExternalMarket,
  ExternalMarketsQuery,
  ExternalPlatform,
  ExternalStatus,
  SyncReport,
} from './external';

export const IPC = {
  appInfo: 'app:info',
  openDataFolder: 'app:openDataFolder',
  revealFile: 'app:revealFile',
  list: 'predictions:list',
  get: 'predictions:get',
  create: 'predictions:create',
  update: 'predictions:update',
  remove: 'predictions:remove',
  removeMany: 'predictions:removeMany',
  setStatus: 'predictions:setStatus',
  analytics: 'analytics:build',
  bankrollOverview: 'bankroll:overview',
  bankrollAdd: 'bankroll:add',
  bankrollRemove: 'bankroll:remove',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  listBackups: 'backup:list',
  createBackup: 'backup:create',
  restoreBackup: 'backup:restore',
  restoreBackupFile: 'backup:restoreFile',
  deleteBackup: 'backup:delete',
  exportData: 'data:export',
  importData: 'data:import',
  clearData: 'data:clear',
  seedDemo: 'data:seedDemo',
  chooseAvatar: 'dialog:chooseAvatar',
  externalStatus: 'ext:status',
  externalSync: 'ext:sync',
  externalMarkets: 'ext:markets',
  externalUpdated: 'ext:updated',
} as const;

export interface PagedPredictions {
  rows: Prediction[];
  total: number;
  page: number;
  pageCount: number;
}

export interface ExportResult {
  path: string;
  count: number;
}

export interface AppApi {
  appInfo(): Promise<AppInfo>;
  openDataFolder(): Promise<void>;
  revealFile(path: string): Promise<void>;
  listPredictions(query: PredictionQuery): Promise<PagedPredictions>;
  getPrediction(id: string): Promise<Prediction | null>;
  createPrediction(input: PredictionInput, allowDuplicate?: boolean): Promise<Prediction>;
  updatePrediction(id: string, patch: Partial<PredictionInput>, allowDuplicate?: boolean): Promise<Prediction>;
  deletePrediction(id: string): Promise<void>;
  deletePredictions(ids: string[]): Promise<number>;
  setStatus(ids: string[], status: PredictionStatus, actualResult?: string): Promise<number>;
  buildAnalytics(filters: Filters, settings: AppSettings): Promise<Analytics>;
  getBankrollOverview(): Promise<BankrollOverview>;
  addBankrollTransaction(input: BankrollTransactionInput): Promise<BankrollOverview>;
  removeBankrollTransaction(id: string): Promise<BankrollOverview>;
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  listBackups(): Promise<BackupInfo[]>;
  createBackup(reason?: string): Promise<BackupInfo>;
  restoreBackup(fileName: string): Promise<{ restored: number }>;
  restoreBackupFromFile(): Promise<{ restored: number; path: string } | null>;
  deleteBackup(fileName: string): Promise<void>;
  exportData(kind: 'json' | 'csv'): Promise<ExportResult | null>;
  importData(mode: 'merge' | 'replace'): Promise<ImportReport | null>;
  clearData(mode: 'all' | 'demo'): Promise<number>;
  seedDemo(): Promise<number>;
  chooseAvatar(): Promise<string | null>;
  getExternalStatus(): Promise<ExternalStatus>;
  syncExternal(platform: ExternalPlatform | 'all'): Promise<SyncReport[]>;
  getExternalMarkets(query: ExternalMarketsQuery): Promise<{
    markets: ExternalMarket[];
    status: ExternalStatus;
    sports: string[];
  }>;
  onExternalUpdated(callback: (status: ExternalStatus) => void): () => void;
}

export type { Facets };

declare global {
  interface Window {
    nappy: AppApi;
  }
}
