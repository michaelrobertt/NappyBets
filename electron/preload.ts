import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../src/shared/ipc';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api = {
  appInfo: () => invoke(IPC.appInfo),
  openDataFolder: () => invoke(IPC.openDataFolder),
  revealFile: (target: string) => invoke(IPC.revealFile, target),
  listPredictions: (query: unknown) => invoke(IPC.list, query),
  getPrediction: (id: string) => invoke(IPC.get, id),
  createPrediction: (input: unknown, allowDuplicate?: boolean) =>
    invoke(IPC.create, input, allowDuplicate),
  updatePrediction: (id: string, patch: unknown, allowDuplicate?: boolean) =>
    invoke(IPC.update, id, patch, allowDuplicate),
  deletePrediction: (id: string) => invoke(IPC.remove, id),
  deletePredictions: (ids: string[]) => invoke(IPC.removeMany, ids),
  setStatus: (ids: string[], status: string, actualResult?: string) =>
    invoke(IPC.setStatus, ids, status, actualResult),
  buildAnalytics: (filters: unknown, settings: unknown) => invoke(IPC.analytics, filters, settings),
  getBankrollOverview: () => invoke(IPC.bankrollOverview),
  addBankrollTransaction: (input: unknown) => invoke(IPC.bankrollAdd, input),
  removeBankrollTransaction: (id: string) => invoke(IPC.bankrollRemove, id),
  getSettings: () => invoke(IPC.getSettings),
  saveSettings: (patch: unknown) => invoke(IPC.saveSettings, patch),
  listBackups: () => invoke(IPC.listBackups),
  createBackup: (reason?: string) => invoke(IPC.createBackup, reason),
  restoreBackup: (fileName: string) => invoke(IPC.restoreBackup, fileName),
  restoreBackupFromFile: () => invoke(IPC.restoreBackupFile),
  deleteBackup: (fileName: string) => invoke(IPC.deleteBackup, fileName),
  exportData: (kind: string) => invoke(IPC.exportData, kind),
  importData: (mode: string) => invoke(IPC.importData, mode),
  clearData: (mode: string) => invoke(IPC.clearData, mode),
  seedDemo: () => invoke(IPC.seedDemo),
  chooseAvatar: () => invoke(IPC.chooseAvatar),
  getExternalStatus: () => invoke(IPC.externalStatus),
  syncExternal: (platform: string) => invoke(IPC.externalSync, platform),
  getExternalMarkets: (query: unknown) => invoke(IPC.externalMarkets, query),
  onExternalUpdated: (callback: (status: unknown) => void) => {
    const listener = (_event: unknown, status: unknown) => callback(status);
    ipcRenderer.on(IPC.externalUpdated, listener);
    return () => ipcRenderer.removeListener(IPC.externalUpdated, listener);
  },
};

contextBridge.exposeInMainWorld('nappy', api);
