import path from 'node:path';
import fs from 'node:fs';
import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  shell,
} from 'electron';
import { Store } from './store';
import { ExternalSyncService } from './external-sync';
import type { ExternalMarketsQuery, ExternalPlatform } from '../src/shared/external';
import { IPC } from '../src/shared/ipc';
import { buildAnalytics } from '../src/shared/analytics';
import type {
  AppSettings,
  BankrollTransactionInput,
  Filters,
  ImportReport,
  PredictionInput,
  PredictionQuery,
  PredictionStatus,
} from '../src/shared/types';

app.commandLine.appendSwitch('lang', 'pt-BR');
app.setName('Nappy Bets');
app.setAppUserModelId('com.nappybets.analytics');
const dataDirArg = process.argv.find((arg) => arg.startsWith('--data-dir='))?.split('=')[1];
app.setPath('userData', dataDirArg ? path.resolve(dataDirArg) : path.join(app.getPath('appData'), 'NappyBets'));

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const screenshotArg = process.argv.find((arg) => arg.startsWith('--screenshot='))?.split('=')[1];
const routeArg = process.argv.find((arg) => arg.startsWith('--route='))?.split('=')[1];
const sizeArg = process.argv.find((arg) => arg.startsWith('--size='))?.split('=')[1];
const scrollArg = Number(process.argv.find((arg) => arg.startsWith('--scroll='))?.split('=')[1] ?? 0);
const evalArg = process.argv.find((arg) => arg.startsWith('--eval='))?.slice('--eval='.length);
const [winWidth, winHeight] = (sizeArg ?? '1500x940').split('x').map((value) => Number(value));

let store: Store;
let externalSync: ExternalSyncService;
let mainWindow: BrowserWindow | null = null;

function assertPlatform(value: unknown): ExternalPlatform {
  if (value === 'polymarket' || value === 'kalshi') return value;
  throw new Error('Plataforma inválida.');
}

function broadcastExternalStatus(): void {
  if (!externalSync) return;
  const status = externalSync.status();
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(IPC.externalUpdated, status);
  });
}

function createWindow(): BrowserWindow {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  const win = new BrowserWindow({
    width: winWidth || 1500,
    height: winHeight || 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#080a0c',
    title: 'Nappy Bets',
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.webContents.on('console-message', (...args: any[]) => {
    const details = args[0];
    if (!screenshotArg) return;
    if (details && typeof details === 'object' && 'message' in details) {
      console.log(`[renderer:${details.level}] ${details.message} (${details.sourceId ?? ''}:${details.lineNumber ?? ''})`);
    } else {
      console.log(`[renderer:${args[1]}] ${args[2]} (${args[4] ?? ''}:${args[3] ?? ''})`);
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    if (screenshotArg) {
      setTimeout(async () => {
        try {
          if (evalArg) {
            await win.webContents.executeJavaScript(Buffer.from(evalArg, 'base64').toString('utf8'));
            await new Promise((resolve) => setTimeout(resolve, 1600));
          }
          if (scrollArg > 0) {
            await win.webContents.executeJavaScript(
              `document.querySelector('.content')?.scrollTo(0, ${scrollArg});`,
            );
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          win.show();
          win.focus();
          win.webContents.invalidate();
          await new Promise((resolve) => setTimeout(resolve, 500));
          const image = await win.webContents.capturePage();
          fs.mkdirSync(path.dirname(screenshotArg), { recursive: true });
          fs.writeFileSync(screenshotArg, image.toPNG());
          console.log(`[screenshot] ${screenshotArg}`);
        } catch (error) {
          console.error('[screenshot] failed', error);
        } finally {
          app.quit();
        }
      }, 4000);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    void win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/${routeArg ?? 'dashboard'}`);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      hash: `/${routeArg ?? 'dashboard'}`,
    });
  }
  return win;
}

function registerIpc(): void {
  const handle = (channel: string, fn: (...args: any[]) => unknown) => {
    ipcMain.handle(channel, async (_event, ...args: any[]) => {
      try {
        return await fn(...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      }
    });
  };

  handle(IPC.appInfo, () => ({
    ...store.info(),
    platform: `${process.platform} ${process.arch}`,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  }));
  handle(IPC.openDataFolder, async () => {
    await shell.openPath(app.getPath('userData'));
  });
  handle(IPC.revealFile, (target: string) => {
    if (target && fs.existsSync(target)) shell.showItemInFolder(target);
  });

  handle(IPC.list, (query: PredictionQuery) => store.list(query));
  handle(IPC.get, (id: string) => store.getPrediction(id));
  handle(IPC.create, (input: PredictionInput, allowDuplicate?: boolean) =>
    store.create(input, Boolean(allowDuplicate)),
  );
  handle(IPC.update, (id: string, patch: Partial<PredictionInput>, allowDuplicate?: boolean) =>
    store.update(id, patch, Boolean(allowDuplicate)),
  );
  handle(IPC.remove, (id: string) => store.remove(id));
  handle(IPC.removeMany, (ids: string[]) => store.removeMany(ids));
  handle(IPC.setStatus, (ids: string[], status: PredictionStatus, actualResult?: string) =>
    store.setStatus(ids, status, actualResult),
  );

  handle(IPC.analytics, (filters: Filters, settings: AppSettings) =>
    buildAnalytics(store.allPredictions(), filters, settings),
  );
  handle(IPC.bankrollOverview, () => store.bankrollOverview());
  handle(IPC.bankrollAdd, (input: BankrollTransactionInput) => store.addBankrollTransaction(input));
  handle(IPC.bankrollRemove, (id: string) => store.deleteBankrollTransaction(id));

  handle(IPC.getSettings, () => store.getSettings());
  handle(IPC.saveSettings, (patch: Partial<AppSettings>) => store.saveSettings(patch));

  handle(IPC.listBackups, () => store.listBackups());
  handle(IPC.createBackup, (reason?: string) => store.createBackup(reason ?? 'manual'));
  handle(IPC.restoreBackup, (fileName: string) => {
    store.restoreBackupByName(fileName);
    return { restored: store.allPredictions().length };
  });
  handle(IPC.restoreBackupFile, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Restaurar cópia de segurança',
      filters: [{ name: 'Banco SQLite', extensions: ['sqlite', 'db', 'backup'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    store.restoreBackup(result.filePaths[0]);
    return { restored: store.allPredictions().length, path: result.filePaths[0] };
  });
  handle(IPC.deleteBackup, (fileName: string) => store.deleteBackup(fileName));

  handle(IPC.exportData, async (kind: 'json' | 'csv') => {
    const stamp = new Date().toISOString().slice(0, 10);
    const isJson = kind === 'json';
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: isJson ? 'Exportar backup completo (JSON)' : 'Exportar previsões (CSV)',
      defaultPath: path.join(
        store.exportDirPath(),
        isJson ? `nappybets-backup-${stamp}.json` : `nappybets-previsoes-${stamp}.csv`,
      ),
      filters: isJson
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const content = isJson ? store.buildExportBundle() : store.buildCsv();
    fs.writeFileSync(result.filePath, content, 'utf8');
    return { path: result.filePath, count: store.allPredictions().length };
  });

  handle(IPC.importData, async (mode: 'merge' | 'replace') => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Importar dados',
      filters: [
        { name: 'Dados compatíveis', extensions: ['json', 'csv'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    const extension = path.extname(filePath).toLowerCase();
    const parsed = store.parseImport(content, extension);
    if (mode === 'replace' && parsed.inputs.length === 0 && parsed.transactions.length > 0) {
      store.createBackup('antes de importação (substituir)');
    }
    const report: ImportReport =
      parsed.inputs.length > 0
        ? store.insertManyPredictions(parsed.inputs, mode)
        : { imported: 0, duplicatesSkipped: 0, invalid: 0, errors: [], mode };
    report.bankrollImported = store.importBankrollTransactions(parsed.transactions, mode);
    if (mode === 'replace' && parsed.settings) store.saveSettings(parsed.settings);
    return report;
  });

  handle(IPC.clearData, (mode: 'all' | 'demo') => store.clearData(mode));
  handle(IPC.seedDemo, () => store.seedDemo());

  handle(IPC.externalStatus, () => externalSync.status());
  handle(IPC.externalSync, async (value: unknown) => {
    if (value === 'all') return externalSync.syncAll();
    return [await externalSync.sync(assertPlatform(value))];
  });
  handle(IPC.externalMarkets, (query: ExternalMarketsQuery) => ({
    markets: store.external.listMarkets(query),
    status: externalSync.status(),
    sports: store.external.sports(),
  }));

  handle(IPC.chooseAvatar, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Escolher avatar',
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const image = nativeImage.createFromPath(result.filePaths[0]);
    if (image.isEmpty()) throw new Error('Não foi possível ler a imagem selecionada.');
    const resized = image.resize({ width: 192, quality: 'good' });
    return resized.toDataURL();
  });
}

async function bootstrap(): Promise<void> {
  nativeTheme.themeSource = 'dark';
  await app.whenReady();
  Menu.setApplicationMenu(isDev ? Menu.getApplicationMenu() : null);

  store = new Store({ userDataPath: app.getPath('userData'), appVersion: app.getVersion() });
  try {
    await store.init();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(
      'Falha ao abrir os dados',
      `Não foi possível inicializar o banco de dados.\n\n${message}\n\nPasta: ${app.getPath('userData')}`,
    );
    app.quit();
    return;
  }

  externalSync = new ExternalSyncService(store, broadcastExternalStatus);

  registerIpc();
  mainWindow = createWindow();
  externalSync.restartSchedule();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
}

app.on('before-quit', () => {
  externalSync?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  bootstrap().catch((error) => {
    console.error('Falha fatal na inicialização', error);
    dialog.showErrorBox('Erro ao iniciar', String(error));
    app.quit();
  });
}

process.on('uncaughtException', (error) => {
  console.error('Exceção não tratada', error);
});
