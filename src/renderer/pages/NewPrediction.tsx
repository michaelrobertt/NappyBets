import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Save, Sparkles } from 'lucide-react';
import type { PredictionInput, PredictionStatus, SubjectType } from '../../shared/types';
import { validatePrediction } from '../../shared/stats';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import { useToast } from '../lib/toast';
import { useRoute, navigate } from '../lib/router';
import { consumePredictionDraft } from '../lib/prefill';
import { useConfirm } from '../components/ui';
import { Field, Segmented, StatusBadge, InfoTip } from '../components/ui';
import { fmtBrier, fmtDateTime, fmtMoney, fmtMoneySigned, fmtOdds, fmtPercent } from '../lib/format';
import { impliedProbability } from '../../shared/bankroll';

interface FormState {
  sport: string;
  competition: string;
  subjectType: SubjectType;
  subject: string;
  event: string;
  date: string;
  time: string;
  category: string;
  predictedResult: string;
  probability: number;
  stake: string;
  odds: string;
  status: PredictionStatus;
  actualResult: string;
  bookmaker: string;
  notes: string;
}

function defaultTime(): string {
  const now = new Date();
  const minutes = now.getMinutes();
  const rounded = Math.min(23, now.getHours() + (minutes > 30 ? 1 : 0));
  const nextMinutes = minutes <= 30 ? 30 : 0;
  const hour = minutes <= 30 ? now.getHours() : rounded;
  const mm = String(nextMinutes).padStart(2, '0');
  return `${String(hour).padStart(2, '0')}:${mm}`;
}

function parseMoney(raw: string): number {
  const clean = raw
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  return clean ? Number(clean) : 0;
}

function parseDecimal(raw: string): number {
  const clean = raw.replace(/\s/g, '').replace(',', '.');
  return clean ? Number(clean) : 0;
}

function emptyForm(favoriteSport: string | null): FormState {
  const now = new Date();
  return {
    sport: favoriteSport ?? '',
    competition: '',
    subjectType: 'team',
    subject: '',
    event: '',
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    time: defaultTime(),
    category: '',
    predictedResult: '',
    probability: 60,
    stake: '',
    odds: '',
    status: 'pending',
    actualResult: '',
    bookmaker: '',
    notes: '',
  };
}

export function NewPredictionPage() {
  const route = useRoute();
  const editingId = route.params.id ?? null;
  const { settings, analytics, bankroll, refresh } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState>(() => emptyForm(settings.favoriteSport));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(editingId));
  const [loaded, setLoaded] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [original, setOriginal] = useState<{ stake: number; status: PredictionStatus }>({
    stake: 0,
    status: 'pending',
  });

  useEffect(() => {
    if (!editingId) {
      const draft = consumePredictionDraft();
      if (draft) {
        const [date, time] = draft.eventDate.split('T');
        setForm((prev) => ({
          ...prev,
          sport: draft.sport || prev.sport,
          competition: draft.competition,
          subjectType: draft.subjectType,
          subject: draft.subject,
          event: draft.event,
          date: date || prev.date,
          time: time || prev.time,
          category: draft.category,
          predictedResult: draft.predictedResult,
          probability: draft.probability,
          bookmaker: draft.bookmaker,
          notes: draft.notes,
        }));
        toast.info('Previsão preenchida com o mercado selecionado. Revise os dados e salve.');
      }
      setLoaded(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getPrediction(editingId)
      .then((prediction) => {
        if (cancelled) return;
        if (!prediction) {
          toast.error('Previsão não encontrada. Ela pode ter sido excluída.');
          navigate('history');
          return;
        }
        const [date, time] = prediction.eventDate.split('T');
        setForm({
          sport: prediction.sport,
          competition: prediction.competition,
          subjectType: prediction.subjectType,
          subject: prediction.subject,
          event: prediction.event,
          date: date ?? '',
          time: time ?? '12:00',
          category: prediction.category,
          predictedResult: prediction.predictedResult,
          probability: prediction.probability,
          stake: prediction.stake > 0 ? String(prediction.stake).replace('.', ',') : '',
          odds: prediction.odds !== null ? String(prediction.odds).replace('.', ',') : '',
          status: prediction.status,
          actualResult: prediction.actualResult,
          bookmaker: prediction.bookmaker,
          notes: prediction.notes,
        });
        setOriginal({ stake: prediction.stake, status: prediction.status });
        setLoaded(true);
      })
      .catch((error) => toast.error((error as Error).message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const facets = analytics?.facets;
  const sports = facets?.sports ?? [];
  const competitionOptions = useMemo(() => {
    if (!facets) return [];
    const list = form.sport ? facets.competitionsBySport[form.sport] ?? [] : facets.competitions;
    return [...list].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [facets, form.sport]);
  const bookmakerOptions = useMemo(() => {
    const defaults = ['1win', 'Betano', 'bet365', 'Superbet', 'Pinnacle'];
    return [...new Set([...(facets?.bookmakers ?? []), ...defaults])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [facets]);

  const subjectOptions = useMemo(() => {
    if (!facets) return [];
    const list = form.subjectType === 'player' ? facets.players : facets.teams;
    return list;
  }, [facets, form.subjectType]);

  const stakeValue = parseMoney(form.stake);
  const oddsValue = parseDecimal(form.odds);
  const potentialReturn = stakeValue > 0 && oddsValue > 1 ? stakeValue * oddsValue : 0;
  const potentialProfit = stakeValue > 0 && oddsValue > 1 ? stakeValue * (oddsValue - 1) : 0;
  const implied = impliedProbability(oddsValue);
  const available = bankroll?.summary.available ?? null;
  const projectedAvailable =
    available === null
      ? null
      : available +
        (editingId && original.status === 'pending' ? original.stake : 0) -
        (form.status === 'pending' ? stakeValue : 0);

  const input: PredictionInput = useMemo(
    () => ({
      ...form,
      eventDate: `${form.date}T${form.time}`,
      probability: Number(form.probability),
      stake: stakeValue,
      odds: form.odds.trim() ? oddsValue : null,
      isDemo: false,
    }),
    [form, stakeValue, oddsValue],
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDuplicateWarning(null);
  };

  const brierPreview =
    form.status === 'hit' || form.status === 'miss'
      ? ((form.probability / 100) - (form.status === 'hit' ? 1 : 0)) ** 2
      : null;

  async function save(keepOpen: boolean, allowDuplicate = false) {
    const issues = validatePrediction(input);
    if (issues.length > 0) {
      const map: Record<string, string> = {};
      issues.forEach((issue) => {
        map[issue.field] = issue.message;
      });
      setErrors(map);
      toast.error('Verifique os campos destacados antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updatePrediction(editingId, input, allowDuplicate);
        toast.success('Previsão atualizada com sucesso.');
      } else {
        await api.createPrediction(input, allowDuplicate);
        toast.success('Previsão registrada com sucesso.');
      }
      await refresh();
      if (editingId) {
        navigate('history');
      } else if (keepOpen) {
        setForm((prev) => ({ ...emptyForm(settings.favoriteSport), sport: prev.sport, competition: prev.competition, date: prev.date, time: prev.time }));
        setDuplicateWarning(null);
      } else {
        navigate('history');
      }
    } catch (error) {
      const message = (error as Error).message;
      if (/já existe|mesmos dados/i.test(message) && !allowDuplicate) {
        setDuplicateWarning(message);
        const ok = await confirm({
          title: 'Registro semelhante encontrado',
          message: (
            <>
              {message}
              <br />
              <br />
              Deseja registrar esta previsão de qualquer forma? Duplicidades distorcem os indicadores
              estatísticos.
            </>
          ),
          confirmLabel: 'Registrar mesmo assim',
        });
        if (ok) {
          setSaving(false);
          await save(keepOpen, true);
          return;
        }
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading && !loaded) {
    return (
      <div className="card">
        <div className="skeleton" style={{ height: 340 }} />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row-between wrap" style={{ gap: 12 }}>
        <span className="small muted-3">
          {editingId
            ? 'Altere os dados e salve: o histórico e os indicadores são recalculados automaticamente.'
            : 'Probabilidade é a sua confiança estimada (0% a 100%) e alimenta o Brier Score.'}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('history')}>
          <ArrowLeft size={13} /> Voltar ao histórico
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.9fr) minmax(260px, 1fr)', alignItems: 'start' }}>
        <div className="card">
          {duplicateWarning ? (
            <div className="alert alert-warn" style={{ marginBottom: 14 }}>
              <AlertTriangle size={15} style={{ flex: 'none', marginTop: 1 }} />
              <span>{duplicateWarning}</span>
            </div>
          ) : null}

          <div className="form-grid">
            <Field label="Modalidade esportiva" error={errors.sport} hint="Ex.: League of Legends, CS2, Futebol">
              <input
                className={`input ${errors.sport ? 'invalid' : ''}`}
                list="sports-list"
                value={form.sport}
                onChange={(event) => update('sport', event.target.value)}
                placeholder="League of Legends"
              />
              <datalist id="sports-list">
                {sports.map((sport) => (
                  <option key={sport} value={sport} />
                ))}
              </datalist>
            </Field>

            <Field label="Competição" error={errors.competition} hint="Liga, torneio ou campeonato">
              <input
                className={`input ${errors.competition ? 'invalid' : ''}`}
                list="competitions-list"
                value={form.competition}
                onChange={(event) => update('competition', event.target.value)}
                placeholder="CBLOL"
              />
              <datalist id="competitions-list">
                {competitionOptions.map((competition) => (
                  <option key={competition} value={competition} />
                ))}
              </datalist>
            </Field>

            <Field label="Relacionado a" tip="Times aparecem no módulo Times; jogadores, no módulo Jogadores.">
              <Segmented<SubjectType>
                value={form.subjectType}
                onChange={(value) => update('subjectType', value)}
                options={[
                  { value: 'team', label: 'Time' },
                  { value: 'player', label: 'Jogador' },
                ]}
              />
            </Field>

            <Field label={form.subjectType === 'team' ? 'Time' : 'Jogador'} error={errors.subject}>
              <input
                className={`input ${errors.subject ? 'invalid' : ''}`}
                list="subjects-list"
                value={form.subject}
                onChange={(event) => update('subject', event.target.value)}
                placeholder={form.subjectType === 'team' ? 'LOUD' : 'Faker'}
              />
              <datalist id="subjects-list">
                {subjectOptions.map((subject) => (
                  <option key={subject} value={subject} />
                ))}
              </datalist>
            </Field>

            <Field label="Evento" error={errors.event} full hint="Nome da partida, luta ou prova analisada">
              <input
                className={`input ${errors.event ? 'invalid' : ''}`}
                value={form.event}
                onChange={(event) => update('event', event.target.value)}
                placeholder="LOUD vs paiN Gaming"
              />
            </Field>

            <Field label="Data do evento" error={errors.eventDate}>
              <input
                type="date"
                className={`input ${errors.eventDate ? 'invalid' : ''}`}
                value={form.date}
                onChange={(event) => update('date', event.target.value)}
              />
            </Field>

            <Field label="Horário">
              <input
                type="time"
                className="input"
                value={form.time}
                onChange={(event) => update('time', event.target.value)}
              />
            </Field>

            <Field
              label="Categoria / mercado"
              error={errors.category}
              hint="Ex.: Vencedor da partida, Handicap de mapas, Total de rounds"
            >
              <input
                className={`input ${errors.category ? 'invalid' : ''}`}
                list="categories-list"
                value={form.category}
                onChange={(event) => update('category', event.target.value)}
                placeholder="Vencedor da partida"
              />
              <datalist id="categories-list">
                {(facets?.categories ?? []).map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </Field>

            <Field label="Casa de referência" hint="Opcional · onde a aposta foi registrada">
              <input
                className="input"
                list="bookmakers-list"
                value={form.bookmaker}
                onChange={(event) => update('bookmaker', event.target.value)}
                placeholder="Betano"
              />
              <datalist id="bookmakers-list">
                {bookmakerOptions.map((bookmaker) => (
                  <option key={bookmaker} value={bookmaker} />
                ))}
              </datalist>
            </Field>

            <Field label="Resultado previsto" error={errors.predictedResult} full>
              <input
                className={`input ${errors.predictedResult ? 'invalid' : ''}`}
                value={form.predictedResult}
                onChange={(event) => update('predictedResult', event.target.value)}
                placeholder="Vitória LOUD"
              />
            </Field>

            <div className="field col-span-2">
              <label className="field-label">
                Probabilidade estimada
                <InfoTip text="Probabilidade subjetiva de o resultado previsto acontecer. É a base do Brier Score e da calibração." />
                <span className="mono" style={{ marginLeft: 'auto', fontWeight: 600 }}>
                  {form.probability}%
                </span>
              </label>
              <div className="row" style={{ gap: 12 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={form.probability}
                  onChange={(event) => update('probability', Number(event.target.value))}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={`input ${errors.probability ? 'invalid' : ''}`}
                  style={{ width: 84 }}
                  value={form.probability}
                  onChange={(event) => update('probability', Number(event.target.value))}
                />
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 2 }}>
                {[40, 50, 60, 70, 80, 90].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`btn btn-sm ${form.probability === value ? 'btn-primary' : ''}`}
                    onClick={() => update('probability', value)}
                  >
                    {value}%
                  </button>
                ))}
              </div>
              {errors.probability ? <span className="field-error">{errors.probability}</span> : null}
            </div>

            <Field
              label="Valor apostado (R$)"
              error={errors.stake}
              hint="Opcional · deixe vazio para uma previsão sem valor financeiro"
            >
              <input
                className={`input ${errors.stake ? 'invalid' : ''}`}
                inputMode="decimal"
                value={form.stake}
                onChange={(event) => update('stake', event.target.value)}
                placeholder="50,00"
              />
              {available !== null && available > 0 ? (
                <div className="row wrap" style={{ gap: 4, marginTop: 5 }}>
                  {[1, 2, 5, 10].map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        update('stake', ((available * percent) / 100).toFixed(2).replace('.', ','))
                      }
                      title={`${percent}% da banca disponível`}
                    >
                      {percent}%
                    </button>
                  ))}
                </div>
              ) : null}
            </Field>

            <Field
              label="Odds decimais"
              error={errors.odds}
              hint={
                implied === null
                  ? 'Ex.: 1,85 · obrigatórias quando há valor apostado'
                  : `Probabilidade implícita: ${fmtPercent(implied)}`
              }
            >
              <input
                className={`input ${errors.odds ? 'invalid' : ''}`}
                inputMode="decimal"
                value={form.odds}
                onChange={(event) => update('odds', event.target.value)}
                placeholder="1,85"
              />
            </Field>

            <div className="field col-span-2">
              <div className="bankroll-form-summary">
                <div>
                  <span>Retorno potencial</span>
                  <strong>{potentialReturn > 0 ? fmtMoney(potentialReturn) : '—'}</strong>
                </div>
                <div>
                  <span>Lucro potencial</span>
                  <strong className={potentialProfit > 0 ? 'pos' : ''}>
                    {potentialProfit > 0 ? fmtMoneySigned(potentialProfit) : '—'}
                  </strong>
                </div>
                <div>
                  <span>Banca disponível</span>
                  <strong className={available !== null && available < 0 ? 'neg' : ''}>
                    {available === null ? '—' : fmtMoney(available)}
                  </strong>
                </div>
                <div>
                  <span>Resultado financeiro</span>
                  <strong
                    className={
                      form.status === 'hit' && potentialProfit > 0
                        ? 'pos'
                        : form.status === 'miss' && stakeValue > 0
                          ? 'neg'
                          : ''
                    }
                  >
                    {form.status === 'hit' && potentialProfit > 0
                      ? fmtMoneySigned(potentialProfit)
                      : form.status === 'miss' && stakeValue > 0
                        ? fmtMoneySigned(-stakeValue)
                        : '—'}
                  </strong>
                </div>
              </div>
              {form.status === 'pending' && stakeValue > 0 && projectedAvailable !== null && projectedAvailable < 0 ? (
                <div className="alert alert-warn" style={{ marginTop: 8 }}>
                  <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
                  <span>
                    Esta aposta deixa a banca disponível em {projectedAvailable === null ? '—' : fmtMoney(projectedAvailable)}.
                    Reduza o valor ou registre um depósito.
                  </span>
                </div>
              ) : null}
            </div>

            <Field label="Status">
              <select
                className="select"
                value={form.status}
                onChange={(event) => update('status', event.target.value as PredictionStatus)}
              >
                <option value="pending">Pendente</option>
                <option value="hit">Acertou</option>
                <option value="miss">Errou</option>
                <option value="void">Anulada</option>
              </select>
            </Field>

            <Field
              label="Resultado real"
              hint={form.status === 'pending' ? 'Disponível após o evento' : 'Opcional, ex.: 2-1'}
            >
              <input
                className="input"
                value={form.actualResult}
                onChange={(event) => update('actualResult', event.target.value)}
                placeholder="2-1"
              />
            </Field>

            <Field label="Observações pessoais" full hint="Contexto da análise, lesões, escalações, linhas de referência...">
              <textarea
                className="textarea"
                value={form.notes}
                onChange={(event) => update('notes', event.target.value)}
                placeholder="Anote o raciocínio usado nesta previsão."
              />
            </Field>
          </div>

          <div className="divider" />
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={saving} onClick={() => save(false)}>
              <Save size={14} /> {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Salvar previsão'}
            </button>
            {!editingId ? (
              <button className="btn" disabled={saving} onClick={() => save(true)}>
                Salvar e registrar outra
              </button>
            ) : null}
            <button className="btn btn-ghost" disabled={saving} onClick={() => navigate('history')}>
              Cancelar
            </button>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head" style={{ marginBottom: 10 }}>
              <div className="card-title" style={{ fontSize: 13.5 }}>
                <Sparkles size={14} /> Resumo da previsão
              </div>
            </div>
            <div className="kv">
              <span>Evento</span>
              <strong>{form.event || '—'}</strong>
            </div>
            <div className="kv">
              <span>Quando</span>
              <strong>{form.date && form.time ? fmtDateTime(`${form.date}T${form.time}`) : '—'}</strong>
            </div>
            <div className="kv">
              <span>Categoria</span>
              <strong>{form.category || '—'}</strong>
            </div>
            <div className="kv">
              <span>Probabilidade</span>
              <strong>{fmtPercent(form.probability, 0)}</strong>
            </div>
            <div className="kv">
              <span>Valor apostado</span>
              <strong>{stakeValue > 0 ? `${fmtMoney(stakeValue)} @ ${fmtOdds(oddsValue)}` : 'Sem valor'}</strong>
            </div>
            <div className="kv">
              <span>Retorno potencial</span>
              <strong>{potentialReturn > 0 ? fmtMoney(potentialReturn) : '—'}</strong>
            </div>
            <div className="kv">
              <span>Status</span>
              <strong>
                <StatusBadge status={form.status} />
              </strong>
            </div>
            <div className="kv">
              <span>Brier (se concluída)</span>
              <strong>{brierPreview === null ? '—' : fmtBrier(brierPreview)}</strong>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              O Brier Score de uma previsão é (probabilidade − resultado)². Quanto mais próxima da certeza for a
              probabilidade, maior o impacto de um erro.
            </p>
          </div>

          <div className="card">
            <div className="card-title" style={{ fontSize: 13.5, marginBottom: 8 }}>
              Boas práticas
            </div>
            <ul className="hint" style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 6 }}>
              <li>Registre a previsão antes do evento começar.</li>
              <li>Use a mesma escala de probabilidade em todas as previsões.</li>
              <li>Atualize o status assim que o evento terminar.</li>
              <li>Anule registros de eventos cancelados em vez de marcá-los como erro.</li>
              <li>Categorias consistentes geram destaques confiáveis.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
