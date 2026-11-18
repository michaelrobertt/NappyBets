import type { AppApi } from '../../shared/ipc';

function bridge(): AppApi {
  if (typeof window === 'undefined' || !window.nappy) {
    throw new Error(
      'A ponte com o aplicativo não está disponível. Execute o Nappy Bets pelo aplicativo desktop (npm run dev ou o instalador).',
    );
  }
  return window.nappy;
}

export function cleanError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Ocorreu um erro inesperado.';
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}

export async function call<T>(fn: (api: AppApi) => Promise<T>): Promise<T> {
  try {
    return await fn(bridge());
  } catch (error) {
    throw new Error(cleanError(error));
  }
}

export const api = {
  appInfo: () => call((a) => a.appInfo()),
  listPredictions: (...args: Parameters<AppApi['listPredictions']>) =>
    call((a) => a.listPredictions(...args)),
  getPrediction: (...args: Parameters<AppApi['getPrediction']>) =>
    call((a) => a.getPrediction(...args)),
  createPrediction: (...args: Parameters<AppApi['createPrediction']>) =>
    call((a) => a.createPrediction(...args)),
  updatePrediction: (...args: Parameters<AppApi['updatePrediction']>) =>
    call((a) => a.updatePrediction(...args)),
  deletePrediction: (...args: Parameters<AppApi['deletePrediction']>) =>
    call((a) => a.deletePrediction(...args)),
  deletePredictions: (...args: Parameters<AppApi['deletePredictions']>) =>
    call((a) => a.deletePredictions(...args)),
  setStatus: (...args: Parameters<AppApi['setStatus']>) => call((a) => a.setStatus(...args)),
  buildAnalytics: (...args: Parameters<AppApi['buildAnalytics']>) =>
    call((a) => a.buildAnalytics(...args)),
  getBankrollOverview: () => call((a) => a.getBankrollOverview()),
  addBankrollTransaction: (...args: Parameters<AppApi['addBankrollTransaction']>) =>
    call((a) => a.addBankrollTransaction(...args)),
  removeBankrollTransaction: (...args: Parameters<AppApi['removeBankrollTransaction']>) =>
    call((a) => a.removeBankrollTransaction(...args)),
  getSettings: () => call((a) => a.getSettings()),
  saveSettings: (...args: Parameters<AppApi['saveSettings']>) =>
    call((a) => a.saveSettings(...args)),
  listBackups: () => call((a) => a.listBackups()),
  createBackup: (...args: Parameters<AppApi['createBackup']>) =>
    call((a) => a.createBackup(...args)),
  restoreBackup: (...args: Parameters<AppApi['restoreBackup']>) =>
    call((a) => a.restoreBackup(...args)),
  restoreBackupFromFile: () => call((a) => a.restoreBackupFromFile()),
  deleteBackup: (...args: Parameters<AppApi['deleteBackup']>) =>
    call((a) => a.deleteBackup(...args)),
  exportData: (...args: Parameters<AppApi['exportData']>) => call((a) => a.exportData(...args)),
  importData: (...args: Parameters<AppApi['importData']>) => call((a) => a.importData(...args)),
  clearData: (...args: Parameters<AppApi['clearData']>) => call((a) => a.clearData(...args)),
  seedDemo: () => call((a) => a.seedDemo()),
  chooseAvatar: () => call((a) => a.chooseAvatar()),
  getExternalStatus: () => call((a) => a.getExternalStatus()),
  syncExternal: (...args: Parameters<AppApi['syncExternal']>) => call((a) => a.syncExternal(...args)),
  getExternalMarkets: (...args: Parameters<AppApi['getExternalMarkets']>) =>
    call((a) => a.getExternalMarkets(...args)),
  onExternalUpdated: (callback: Parameters<AppApi['onExternalUpdated']>[0]) => {
    if (typeof window === 'undefined' || !window.nappy) return () => undefined;
    return window.nappy.onExternalUpdated(callback);
  },
  openDataFolder: () => call((a) => a.openDataFolder()),
  revealFile: (...args: Parameters<AppApi['revealFile']>) => call((a) => a.revealFile(...args)),
};
