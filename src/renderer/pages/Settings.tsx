import { useEffect, useState } from 'react';
import {
  Check,
  Database,
  Image as ImageIcon,
  Palette,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Sliders,
  User,
} from 'lucide-react';
import type { AppSettings, PeriodPreset } from '../../shared/types';
import { DEFAULT_SETTINGS, PERIOD_LABEL } from '../../shared/types';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import { useToast } from '../lib/toast';
import { useConfirm, Field } from '../components/ui';
import { navigate } from '../lib/router';
import { fmtNumber } from '../lib/format';

const AVATARS = ['🎯', '🧠', '📊', '⚽', '🏀', '🎮', '🎾', '🥊', '🏐', '🦅', '🐺', '🔥'];
const ACCENTS: { value: AppSettings['accent']; color: string; label: string }[] = [
  { value: 'green', color: '#10b981', label: 'Verde' },
  { value: 'blue', color: '#3b82f6', label: 'Azul' },
  { value: 'violet', color: '#8b5cf6', label: 'Violeta' },
  { value: 'amber', color: '#f59e0b', label: 'Âmbar' },
];
const THEMES: { value: AppSettings['theme']; label: string; bg: string; panel: string }[] = [
  { value: 'dark', label: 'Escuro', bg: '#07090b', panel: '#12181d' },
  { value: 'midnight', label: 'Meia-noite', bg: '#050b14', panel: '#0e1c2d' },
  { value: 'light', label: 'Claro', bg: '#f2f5f8', panel: '#ffffff' },
];

export function SettingsPage() {
  const { settings, saveSettings, info, analytics } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(settings.profileName);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setName(settings.profileName);
  }, [settings.profileName]);

  const update = async (patch: Partial<AppSettings>) => {
    try {
      await saveSettings(patch);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('O nome do perfil não pode ficar vazio.');
      return;
    }
    setSavingName(true);
    try {
      await saveSettings({ profileName: trimmed });
      toast.success('Perfil atualizado.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const uploadAvatar = async () => {
    try {
      const dataUrl = await api.chooseAvatar();
      if (dataUrl) {
        await saveSettings({ avatar: dataUrl });
        toast.success('Avatar atualizado.');
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const resetPreferences = async () => {
    const ok = await confirm({
      title: 'Restaurar preferências padrão',
      message:
        'Aparência e preferências de análise voltam ao padrão. Nome, avatar e previsões registradas NÃO são afetados.',
      confirmLabel: 'Restaurar padrões',
    });
    if (!ok) return;
    await update({
      ...DEFAULT_SETTINGS,
      profileName: settings.profileName,
      avatar: settings.avatar,
      avatarColor: settings.avatarColor,
    });
    toast.success('Preferências restauradas.');
  };

  const isImageAvatar = settings.avatar.startsWith('data:');

  return (
    <div className="stack">
      <div className="grid" style={{ gridTemplateColumns: '1.15fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>
            <User size={15} /> Perfil
          </div>
          <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
            <div
              className="avatar"
              style={{ borderColor: settings.avatarColor, width: 76, height: 76, margin: 0 }}
            >
              {isImageAvatar ? (
                <img src={settings.avatar} alt="Avatar do perfil" />
              ) : (
                <span style={{ fontSize: 32 }}>{settings.avatar || '🎯'}</span>
              )}
            </div>
            <div className="grow">
              <Field label="Nome do perfil">
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input"
                    value={name}
                    maxLength={60}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveName();
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={savingName || name.trim() === settings.profileName}
                    onClick={saveName}
                  >
                    <Save size={13} /> Salvar
                  </button>
                </div>
              </Field>
              <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                <button className="btn btn-sm" onClick={uploadAvatar}>
                  <ImageIcon size={12} /> Enviar imagem
                </button>
                <span className="small muted-3" style={{ alignSelf: 'center' }}>
                  PNG, JPG ou WEBP · redimensionada para 192px
                </span>
              </div>
            </div>
          </div>

          <div className="divider" />
          <div className="field-label" style={{ marginBottom: 8 }}>
            Avatar rápido
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {AVATARS.map((emoji) => (
              <button
                key={emoji}
                className="btn"
                style={{
                  width: 38,
                  height: 38,
                  padding: 0,
                  fontSize: 18,
                  borderColor: settings.avatar === emoji ? 'var(--accent-line)' : undefined,
                  background: settings.avatar === emoji ? 'var(--accent-soft)' : undefined,
                }}
                onClick={() => update({ avatar: emoji })}
                aria-label={`Usar avatar ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="divider" />
          <div className="field-label" style={{ marginBottom: 8 }}>
            Cor do perfil
          </div>
          <div className="row" style={{ gap: 8 }}>
            {['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e', '#64748b'].map((color) => (
              <button
                key={color}
                onClick={() => update({ avatarColor: color })}
                aria-label={`Cor ${color}`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: color,
                  border: settings.avatarColor === color ? '2px solid var(--text)' : '2px solid transparent',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {settings.avatarColor === color ? <Check size={13} color="#04120c" /> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>
            <Palette size={15} /> Aparência
          </div>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Tema
          </div>
          <div className="row" style={{ gap: 8 }}>
            {THEMES.map((theme) => (
              <button
                key={theme.value}
                onClick={() => update({ theme: theme.value })}
                style={{
                  flex: 1,
                  border: `1px solid ${settings.theme === theme.value ? 'var(--accent-line)' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: 8,
                  background: settings.theme === theme.value ? 'var(--accent-soft)' : 'var(--panel-2)',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    height: 44,
                    borderRadius: 7,
                    background: theme.bg,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    padding: 5,
                    gap: 4,
                  }}
                >
                  <span style={{ background: theme.panel, height: '70%', flex: 1, borderRadius: 3 }} />
                  <span style={{ background: theme.panel, height: '45%', flex: 1, borderRadius: 3 }} />
                </div>
                <span style={{ display: 'block', marginTop: 6 }}>{theme.label}</span>
              </button>
            ))}
          </div>

          <div className="field-label" style={{ margin: '16px 0 8px' }}>
            Cor de destaque
          </div>
          <div className="row" style={{ gap: 8 }}>
            {ACCENTS.map((accent) => (
              <button
                key={accent.value}
                onClick={() => update({ accent: accent.value })}
                style={{
                  flex: 1,
                  borderRadius: 9,
                  border: `1px solid ${settings.accent === accent.value ? accent.color : 'var(--border)'}`,
                  background: settings.accent === accent.value ? `${accent.color}22` : 'var(--panel-2)',
                  padding: '8px 6px',
                  color: 'var(--text-2)',
                  fontSize: 11.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: accent.color }} />
                {accent.label}
              </button>
            ))}
          </div>

          <p className="hint" style={{ marginTop: 14 }}>
            As alterações de aparência são aplicadas e salvas imediatamente.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">
              <Sliders size={15} /> Preferências de análise
            </div>
            <div className="card-desc">Definem o comportamento padrão do dashboard e dos destaques</div>
          </div>
          <button className="btn btn-sm" onClick={resetPreferences}>
            <RotateCcw size={13} /> Restaurar padrões
          </button>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
          <Field label="Modalidade favorita" hint="Pré-selecionada no formulário de previsão">
            <select
              className="select"
              value={settings.favoriteSport ?? ''}
              onChange={(event) => update({ favoriteSport: event.target.value || null })}
            >
              <option value="">Nenhuma</option>
              {(analytics?.facets.sports ?? []).map((sport) => (
                <option key={sport} value={sport}>
                  {sport}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Período padrão" hint="Aplicado ao abrir o aplicativo">
            <select
              className="select"
              value={settings.defaultPeriod}
              onChange={(event) => update({ defaultPeriod: event.target.value as PeriodPreset })}
            >
              {(Object.keys(PERIOD_LABEL) as PeriodPreset[])
                .filter((period) => period !== 'custom')
                .map((period) => (
                  <option key={period} value={period}>
                    {PERIOD_LABEL[period]}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Amostra mínima para destaques" hint="Resultados concluídos necessários por grupo">
            <div className="row" style={{ gap: 8 }}>
              <input
                type="number"
                min={1}
                max={200}
                className="input"
                value={settings.minSample}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) {
                    void update({ minSample: Math.max(1, Math.min(200, Math.round(value))) });
                  }
                }}
              />
              <span className="small muted-3">previsões</span>
            </div>
          </Field>

          <Field label="Destaques por" hint="Dimensão usada no dashboard">
            <select
              className="select"
              value={settings.dashboardDimension}
              onChange={(event) =>
                update({ dashboardDimension: event.target.value as AppSettings['dashboardDimension'] })
              }
            >
              <option value="competition">Competição</option>
              <option value="sport">Modalidade</option>
              <option value="category">Categoria</option>
            </select>
          </Field>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Grupos abaixo de {settings.minSample} resultados concluídos continuam visíveis nas listas completas, mas não
          aparecem como destaques.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>
            <Database size={15} /> Dados
          </div>
          <div className="kv">
            <span>Previsões armazenadas</span>
            <strong>{fmtNumber(info?.totalPredictions ?? 0)}</strong>
          </div>
          <div className="kv">
            <span>Dados de demonstração</span>
            <strong>{fmtNumber(info?.demoPredictions ?? 0)}</strong>
          </div>
          <div className="kv">
            <span>Local do banco</span>
            <strong style={{ fontSize: 11 }}>{info?.databasePath ?? '—'}</strong>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('data')}>
              <ShieldCheck size={13} /> Gerenciar dados e backups
            </button>
            <button className="btn btn-sm" onClick={() => api.openDataFolder()}>
              Abrir pasta
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>
            <SettingsIcon size={15} /> Sobre o aplicativo
          </div>
          <div className="kv">
            <span>Nappy Bets</span>
            <strong>v{info?.appVersion ?? '1.0.0'}</strong>
          </div>
          <div className="kv">
            <span>Electron / Chromium</span>
            <strong>
              {info?.versions.electron ?? '—'} / {info?.versions.chrome ?? '—'}
            </strong>
          </div>
          <div className="kv">
            <span>Schema do banco</span>
            <strong>v{info?.schemaVersion ?? 1}</strong>
          </div>
          <div className="kv">
            <span>Integridade</span>
            <strong className={info?.integrity === 'ok' ? 'pos' : ''}>{info?.integrity ?? '—'}</strong>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Aplicativo desktop de análise estatística. Não executa apostas nem movimenta valores financeiros. Todos os
            dados ficam no seu computador.
          </p>
        </div>
      </div>
    </div>
  );
}
