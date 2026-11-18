import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Store } from '../electron/store';
import type { PredictionInput } from '../src/shared/types';

const dirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nappybets-test-'));
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

async function openStore(dir = tempDir()): Promise<{ store: Store; dir: string }> {
  const store = new Store({ userDataPath: dir, appVersion: 'test' });
  await store.init();
  return { store, dir };
}

function input(overrides: Partial<PredictionInput> = {}): PredictionInput {
  return {
    sport: 'League of Legends',
    competition: 'CBLOL',
    subjectType: 'team',
    subject: 'LOUD',
    event: 'LOUD vs paiN Gaming',
    eventDate: '2026-02-10T18:00',
    category: 'Vencedor da partida',
    predictedResult: 'Vitória LOUD',
    probability: 62,
    status: 'pending',
    actualResult: '',
    bookmaker: 'Betano',
    notes: 'Teste automatizado',
    isDemo: false,
    ...overrides,
  };
}

async function emptyStore(): Promise<{ store: Store; dir: string }> {
  const opened = await openStore();
  opened.store.clearData('demo');
  return opened;
}

describe('Store — persistência', () => {
  it('cria o banco, arquivo SQLite e conjunto demonstrativo no primeiro uso', async () => {
    const { store, dir } = await openStore();
    expect(store.allPredictions().length).toBeGreaterThan(50);
    expect(fs.existsSync(path.join(dir, 'nappybets.sqlite'))).toBe(true);
    const demo = store.allPredictions().filter((row) => row.isDemo);
    expect(demo.length).toBeGreaterThan(50);
    const sports = new Set(demo.map((row) => row.sport));
    expect(sports.has('League of Legends')).toBe(true);
    expect(sports.has('CS2')).toBe(true);
    expect(demo.filter((row) => row.sport === 'League of Legends').length).toBeGreaterThan(
      demo.filter((row) => row.sport === 'Futebol').length,
    );
    expect(store.info().integrity).toBe('ok');
    store.close();
  });

  it('não recria dados demonstrativos depois de apagados', async () => {
    const { store, dir } = await emptyStore();
    expect(store.allPredictions()).toHaveLength(0);
    store.close();
    const reopened = new Store({ userDataPath: dir, appVersion: 'test' });
    await reopened.init();
    expect(reopened.allPredictions()).toHaveLength(0);
    reopened.close();
  });

  it('persiste criação, edição e exclusão entre sessões', async () => {
    const { store, dir } = await emptyStore();
    const created = store.create(input());
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    store.close();

    const reopened = new Store({ userDataPath: dir, appVersion: 'test' });
    await reopened.init();
    const loaded = reopened.allPredictions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.event).toBe('LOUD vs paiN Gaming');
    expect(loaded[0]!.probability).toBe(62);

    reopened.update(created.id, { status: 'hit', actualResult: '2-0', probability: 70 });
    reopened.close();

    const third = new Store({ userDataPath: dir, appVersion: 'test' });
    await third.init();
    expect(third.allPredictions()[0]!.status).toBe('hit');
    expect(third.allPredictions()[0]!.actualResult).toBe('2-0');

    third.remove(created.id);
    third.close();

    const fourth = new Store({ userDataPath: dir, appVersion: 'test' });
    await fourth.init();
    expect(fourth.allPredictions()).toHaveLength(0);
    fourth.close();
  });

  it('rejeita entradas inválidas e duplicadas', async () => {
    const { store } = await emptyStore();
    expect(() => store.create(input({ probability: 120 }))).toThrow(/probabilidade/i);
    expect(() => store.create(input({ sport: '' }))).toThrow(/modalidade/i);
    store.create(input());
    expect(() => store.create(input())).toThrow(/já existe/i);
    expect(() => store.create(input({ event: 'LOUD vs paiN Gaming' }))).toThrow();
    // Semelhança de espaços e maiúsculas também é duplicidade.
    expect(() => store.create(input({ subject: ' loud ', predictedResult: 'VITÓRIA LOUD' }))).toThrow();
    // Duplicação explícita é permitida.
    const duplicate = store.create(input(), true);
    expect(duplicate.id).toBeTruthy();
    expect(store.allPredictions()).toHaveLength(2);
    store.close();
  });

  it('atualiza status em lote e remove vários registros', async () => {
    const { store } = await emptyStore();
    const a = store.create(input());
    const b = store.create(input({ event: 'T1 vs Gen.G', competition: 'LCK' }));
    expect(store.setStatus([a.id, b.id], 'hit')).toBe(2);
    expect(store.allPredictions().every((row) => row.status === 'hit')).toBe(true);
    expect(store.removeMany([a.id])).toBe(1);
    expect(store.allPredictions()).toHaveLength(1);
    store.close();
  });

  it('mantém configurações entre sessões', async () => {
    const { store, dir } = await emptyStore();
    store.saveSettings({ profileName: 'Kelly', minSample: 9, theme: 'light', accent: 'violet' });
    store.close();
    const reopened = new Store({ userDataPath: dir, appVersion: 'test' });
    await reopened.init();
    const settings = reopened.getSettings();
    expect(settings.profileName).toBe('Kelly');
    expect(settings.minSample).toBe(9);
    expect(settings.theme).toBe('light');
    expect(settings.accent).toBe('violet');
    reopened.close();
  });

  it('valida limites da amostra mínima ao salvar configurações', async () => {
    const { store } = await emptyStore();
    expect(store.saveSettings({ minSample: -5 }).minSample).toBe(1);
    expect(store.saveSettings({ minSample: 900 }).minSample).toBe(200);
    store.close();
  });
});

describe('Store — importação e exportação', () => {
  it('mescla importações ignorando duplicados', async () => {
    const { store } = await emptyStore();
    store.create(input());
    const report = store.insertManyPredictions(
      [input(), input({ event: 'FURIA vs MIBR', competition: 'ESL Pro League', sport: 'CS2' })],
      'merge',
    );
    expect(report.imported).toBe(1);
    expect(report.duplicatesSkipped).toBe(1);
    expect(report.invalid).toBe(0);
    expect(store.allPredictions()).toHaveLength(2);
    store.close();
  });

  it('substitui todos os dados e preserva um backup automático', async () => {
    const { store } = await emptyStore();
    store.create(input());
    const report = store.insertManyPredictions(
      [input({ sport: 'CS2', competition: 'IEM Katowice', event: 'Spirit vs NAVI' })],
      'replace',
    );
    expect(report.imported).toBe(1);
    expect(store.allPredictions()).toHaveLength(1);
    expect(store.allPredictions()[0]!.sport).toBe('CS2');
    expect(store.listBackups().length).toBeGreaterThan(0);
    store.close();
  });

  it('gera bundle JSON e CSV com todos os registros', async () => {
    const { store } = await emptyStore();
    store.create(input());
    const bundle = JSON.parse(store.buildExportBundle()) as { predictions: unknown[]; settings: unknown };
    expect(bundle.predictions).toHaveLength(1);
    expect(bundle.settings).toBeTruthy();
    const csv = store.buildCsv();
    expect(csv.split('\r\n')[0]).toContain('Modalidade');
    expect(csv).toContain('League of Legends');
    const parsed = store.parseImport(csv, '.csv');
    expect(parsed.inputs).toHaveLength(1);
    expect(parsed.inputs[0]!.eventDate).toBe('2026-02-10T18:00');
    store.close();
  });

  it('importa registros inválidos sem derrubar o processo', async () => {
    const { store } = await emptyStore();
    const report = store.insertManyPredictions(
      [
        input({ probability: 300, event: 'Inválido' }),
        input({ event: 'Válido', competition: 'LCK' }),
      ],
      'merge',
    );
    expect(report.invalid).toBe(1);
    expect(report.imported).toBe(1);
    expect(report.errors[0]).toMatch(/Inválido|probabilidade/);
    store.close();
  });
});

describe('Store — backups e integridade', () => {
  it('cria, lista, restaura e exclui cópias de segurança', async () => {
    const { store } = await emptyStore();
    store.create(input());
    const backup = store.createBackup('teste');
    expect(store.listBackups().some((item) => item.fileName === backup.fileName)).toBe(true);
    expect(backup.sizeBytes).toBeGreaterThan(0);

    store.create(input({ event: 'T1 vs Gen.G', competition: 'LCK' }));
    expect(store.allPredictions()).toHaveLength(2);
    store.restoreBackupByName(backup.fileName);
    expect(store.allPredictions()).toHaveLength(1);

    const before = store.listBackups().length;
    store.deleteBackup(backup.fileName);
    expect(store.listBackups().length).toBe(before - 1);
    store.close();
  });

  it('recupera automaticamente de cópia quando o banco está corrompido', async () => {
    const { store, dir } = await emptyStore();
    store.create(input());
    store.createBackup('proteção');
    store.close();

    const dbPath = path.join(dir, 'nappybets.sqlite');
    fs.writeFileSync(dbPath, 'isto não é um banco sqlite');

    const reopened = new Store({ userDataPath: dir, appVersion: 'test' });
    const report = await reopened.init();
    expect(report.integrity).toBe('recovered');
    expect(reopened.allPredictions()).toHaveLength(1);
    expect(reopened.info().integrity).toBe('recovered');
    expect(reopened.listBackups().length).toBeGreaterThan(0);
    reopened.close();
  });

  it('apaga todos os dados mediante backup automático', async () => {
    const { store, dir } = await emptyStore();
    store.create(input());
    expect(store.clearData('all')).toBe(1);
    expect(store.allPredictions()).toHaveLength(0);
    expect(store.listBackups().some((backup) => backup.reason.includes('apagar todos'))).toBe(true);
    store.close();
    const reopened = new Store({ userDataPath: dir, appVersion: 'test' });
    await reopened.init();
    expect(reopened.allPredictions()).toHaveLength(0);
    reopened.close();
  });
});
