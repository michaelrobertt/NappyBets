import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import type { BackupInfo, ImportReport } from '../../shared/types';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import { useToast } from '../lib/toast';
import { useConfirm } from '../components/ui';
import { fmtBytes, fmtDateTime, fmtNumber } from '../lib/format';
import { navigate } from '../lib/router';

export function DataPage() {
  const { info, refresh, refreshInfo } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      setBackups(await api.listBackups());
    } catch (error) {
      toast.error((error as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const afterChange = useCallback(async () => {
    await Promise.all([refresh(), refreshInfo()]);
    await loadBackups();
  }, [refresh, refreshInfo, loadBackups]);

  const run = async (key: string, action: () => Promise<void>, successMessage?: string) => {
    setBusy(key);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      await afterChange();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const exportData = (kind: 'json' | 'csv') =>
    run(`export-${kind}`, async () => {
      const result = await api.exportData(kind);
      if (!result) return;
      toast.success(
        kind === 'json'
          ? `Backup completo com ${fmtNumber(result.count)} previsões salvo em ${result.path}`
          : `CSV com ${fmtNumber(result.count)} previsões salvo em ${result.path}`,
      );
    });

  const importData = async (mode: 'merge' | 'replace') => {
    const ok = await confirm({
      title: mode === 'replace' ? 'Substituir todos os dados' : 'Importar e mesclar dados',
      message:
        mode === 'replace'
          ? 'A importação substituirá TODAS as previsões atuais pelas do arquivo. Uma cópia de segurança automática será criada antes da operação. Deseja continuar?'
          : 'As previsões do arquivo serão adicionadas ao histórico existente. Registros duplicados são ignorados automaticamente.',
      confirmLabel: mode === 'replace' ? 'Substituir dados' : 'Importar',
      danger: mode === 'replace',
    });
    if (!ok) return;
    setBusy(`import-${mode}`);
    try {
      const result = await api.importData(mode);
      if (!result) return;
      setReport(result);
      toast.success(
        `${result.imported} previsão(ões) importadas · ${result.duplicatesSkipped} duplicadas ignoradas${
          result.bankrollImported ? ` · ${result.bankrollImported} movimentação(ões) de banca` : ''
        }`,
      );
      await afterChange();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const restore = async (backup: BackupInfo) => {
    const ok = await confirm({
      title: 'Restaurar cópia de segurança',
      message: `Os dados atuais serão substituídos pelo conteúdo de ${fmtDateTime(backup.createdAt)}. Uma cópia do estado atual é criada automaticamente antes da restauração.`,
      confirmLabel: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    await run(
      `restore-${backup.fileName}`,
      async () => {
        const result = await api.restoreBackup(backup.fileName);
        toast.success(`${fmtNumber(result.restored)} previsões restauradas.`);
      },
    );
  };

  const restoreFromFile = async () => {
    setBusy('restore-file');
    try {
      const result = await api.restoreBackupFromFile();
      if (!result) return;
      toast.success(`${fmtNumber(result.restored)} previsões restauradas de ${result.path}`);
      await afterChange();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeBackup = async (backup: BackupInfo) => {
    const ok = await confirm({
      title: 'Excluir cópia de segurança',
      message: `O arquivo ${backup.fileName} será removido permanentemente do disco.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    await run(`delete-${backup.fileName}`, () => api.deleteBackup(backup.fileName), 'Cópia excluída.');
  };

  const clearData = async (mode: 'all' | 'demo') => {
    const ok = await confirm({
      title: mode === 'all' ? 'Apagar todos os dados' : 'Limpar dados de demonstração',
      message:
        mode === 'all'
          ? 'Todas as previsões serão apagadas permanentemente. Uma cópia de segurança automática será criada antes. Deseja continuar?'
          : 'Somente as previsões marcadas como demonstração serão removidas. Seus registros reais serão mantidos.',
      confirmLabel: mode === 'all' ? 'Apagar tudo' : 'Limpar demonstração',
      danger: true,
    });
    if (!ok) return;
    setBusy(`clear-${mode}`);
    try {
      const removed = await api.clearData(mode);
      toast.success(
        removed === 0
          ? 'Nenhum registro para remover.'
          : `${fmtNumber(removed)} previsão(ões) removida(s).`,
      );
      await afterChange();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      {info?.integrity === 'recovered' || info?.integrity === 'error' ? (
        <div className="alert alert-danger">
          <AlertTriangle size={15} style={{ flex: 'none', marginTop: 1 }} />
          <span>{info.integrityMessage}</span>
        </div>
      ) : null}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">
            <Database size={13} /> Banco de dados
          </div>
          <div className="kpi-value">{fmtNumber(info?.totalPredictions ?? 0)}</div>
          <div className="kpi-sub">previsões persistidas · schema v{info?.schemaVersion ?? 1}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <HardDrive size={13} /> Tamanho do arquivo
          </div>
          <div className="kpi-value">{fmtBytes(info?.databaseBytes ?? 0)}</div>
          <div className="kpi-sub">SQLite com integridade verificada na abertura</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <Archive size={13} /> Cópias de segurança
          </div>
          <div className="kpi-value">{fmtNumber(info?.backupCount ?? 0)}</div>
          <div className="kpi-sub">{info?.lastBackupAt ? `Última: ${fmtDateTime(info.lastBackupAt)}` : 'Nenhuma cópia ainda'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <CheckCircle2 size={13} /> Dados de demonstração
          </div>
          <div className="kpi-value">{fmtNumber(info?.demoPredictions ?? 0)}</div>
          <div className="kpi-sub">identificados e removíveis sem afetar seus dados</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>
            <Download size={15} /> Exportar
          </div>
          <p className="hint" style={{ marginBottom: 12 }}>
            O backup em JSON preserva previsões, banca, movimentações e configurações do perfil, permitindo
            restauração completa em outra instalação. O CSV é compatível com Excel e planilhas (separador ;) e
            inclui valor apostado e odds.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => exportData('json')}>
              <Download size={14} /> Backup completo (JSON)
            </button>
            <button className="btn" disabled={busy !== null} onClick={() => exportData('csv')}>
              <Download size={14} /> Previsões em CSV
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>
            <Upload size={15} /> Importar
          </div>
          <p className="hint" style={{ marginBottom: 12 }}>
            Importe um arquivo JSON exportado pelo Nappy Bets ou um CSV com as colunas do histórico. Na mesclagem,
            registros duplicados são ignorados; em JSON, os depósitos e saques da banca também são importados.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" disabled={busy !== null} onClick={() => importData('merge')}>
              <Upload size={14} /> Mesclar dados
            </button>
            <button className="btn btn-danger" disabled={busy !== null} onClick={() => importData('replace')}>
              <RotateCcw size={14} /> Substituir tudo
            </button>
          </div>
          {report ? (
            <div className="alert alert-success" style={{ marginTop: 12 }}>
              <ShieldCheck size={14} style={{ flex: 'none', marginTop: 1 }} />
              <span>
                Importação {report.mode === 'replace' ? 'com substituição' : 'com mesclagem'}:{' '}
                {fmtNumber(report.imported)} importadas, {fmtNumber(report.duplicatesSkipped)} duplicadas ignoradas,{' '}
                {fmtNumber(report.invalid)} inválidas.
                {report.errors.length > 0 ? ` Primeiro erro: ${report.errors[0]}` : ''}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">
              <Archive size={15} /> Cópias de segurança
            </div>
            <div className="card-desc">
              Cópias automáticas na inicialização (uma a cada 20 horas) e antes de operações destrutivas · mantidas as
              25 mais recentes
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-sm"
              disabled={busy !== null}
              onClick={() =>
                run('backup', async () => {
                  await api.createBackup('manual');
                }, 'Cópia de segurança criada.')
              }
            >
              <RefreshCw size={13} /> Criar cópia agora
            </button>
            <button className="btn btn-sm" disabled={busy !== null} onClick={restoreFromFile}>
              <RotateCcw size={13} /> Restaurar de arquivo
            </button>
          </div>
        </div>

        {backups.length === 0 ? (
          <p className="hint">Nenhuma cópia disponível. Crie uma agora para proteger o histórico.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Motivo</th>
                  <th className="num">Tamanho</th>
                  <th className="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {backups.slice(0, 12).map((backup) => (
                  <tr key={backup.fileName}>
                    <td className="nowrap">{fmtDateTime(backup.createdAt)}</td>
                    <td className="muted">{backup.reason}</td>
                    <td className="num muted">{fmtBytes(backup.sizeBytes)}</td>
                    <td className="actions">
                      <button className="btn btn-sm" disabled={busy !== null} onClick={() => restore(backup)}>
                        Restaurar
                      </button>
                      <button
                        className="btn-icon"
                        title="Mostrar no Explorer"
                        onClick={() => api.revealFile(backup.path).catch((error) => toast.error((error as Error).message))}
                      >
                        <FolderOpen size={13} />
                      </button>
                      <button className="btn-icon" title="Excluir cópia" onClick={() => removeBackup(backup)}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>
            <HardDrive size={15} /> Armazenamento
          </div>
          <div className="kv">
            <span>Banco de dados</span>
            <strong style={{ fontSize: 11.5 }}>{info?.databasePath ?? '—'}</strong>
          </div>
          <div className="kv">
            <span>Pasta de cópias</span>
            <strong style={{ fontSize: 11.5 }}>{info?.backupDir ?? '—'}</strong>
          </div>
          <div className="kv">
            <span>Versão do aplicativo</span>
            <strong>
              {info?.appVersion ?? '—'} · Electron {info?.versions.electron ?? '—'}
            </strong>
          </div>
          <div className="kv">
            <span>Integridade na abertura</span>
            <strong className={info?.integrity === 'ok' ? 'pos' : ''}>
              {info?.integrity === 'ok'
                ? 'OK (PRAGMA integrity_check)'
                : info?.integrity === 'recovered'
                  ? 'Recuperado de cópia'
                  : 'Falha'}
            </strong>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm" onClick={() => api.openDataFolder()}>
              <FolderOpen size={13} /> Abrir pasta de dados
            </button>
            <button className="btn btn-sm" onClick={() => navigate('settings')}>
              Configurações
            </button>
          </div>
        </div>

        <div className="card" style={{ borderColor: 'rgba(244,63,94,0.25)' }}>
          <div className="card-title" style={{ marginBottom: 6, color: '#fb7185' }}>
            <AlertTriangle size={15} /> Zona de risco
          </div>
          <p className="hint" style={{ marginBottom: 12 }}>
            Estas operações são permanentes. Antes de apagar tudo, uma cópia automática do banco é criada na pasta de
            backups.
          </p>
          <div className="stack-sm">
            <button
              className="btn"
              disabled={busy !== null || (info?.demoPredictions ?? 0) === 0}
              onClick={() => clearData('demo')}
            >
              <Trash2 size={13} /> Limpar apenas dados de demonstração
            </button>
            <button className="btn btn-danger" disabled={busy !== null} onClick={() => clearData('all')}>
              <Trash2 size={13} /> Apagar todas as previsões
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
