import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CalendarDays,
  CircleDollarSign,
  Plus,
  Settings2,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { BankrollTransaction, BankrollTransactionType } from '../../shared/types';
import { betProfit } from '../../shared/bankroll';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import { useToast } from '../lib/toast';
import { useConfirm, EmptyState, Field, Modal, Segmented, StatusBadge } from '../components/ui';
import { BankrollChart } from '../components/bankroll';
import {
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtMoneySigned,
  fmtNumber,
  fmtOdds,
} from '../lib/format';
import { navigate } from '../lib/router';

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function parseAmount(raw: string): number {
  const clean = raw.replace(/R\$/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  return Number(clean);
}

interface TransactionForm {
  type: BankrollTransactionType;
  amount: string;
  date: string;
  note: string;
}

export function BankrollPage() {
  const { bankroll, refresh, saveSettings, settings } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [transaction, setTransaction] = useState<TransactionForm | null>(null);
  const [initialOpen, setInitialOpen] = useState(false);
  const [initialAmount, setInitialAmount] = useState('');
  const [initialDate, setInitialDate] = useState(settings.bankrollStartDate || localToday());

  const summary = bankroll?.summary;
  const bets = useMemo(() => {
    if (!bankroll) return [];
    return [...bankroll.bets]
      .sort((a, b) => {
        const pendingA = a.status === 'pending' ? 0 : 1;
        const pendingB = b.status === 'pending' ? 0 : 1;
        return pendingA - pendingB || b.eventDate.localeCompare(a.eventDate);
      })
      .slice(0, 10);
  }, [bankroll]);

  if (!bankroll || !summary) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 210 }} />
        <div className="kpi-grid">
          {[0, 1, 2, 3].map((item) => (
            <div className="skeleton" style={{ height: 96 }} key={item} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  const openInitial = () => {
    setInitialAmount(summary.initial > 0 ? String(summary.initial).replace('.', ',') : '');
    setInitialDate(settings.bankrollStartDate || localToday());
    setInitialOpen(true);
  };

  const openTransaction = (type: BankrollTransactionType) => {
    setTransaction({ type, amount: '', date: localToday(), note: '' });
  };

  const saveInitial = async () => {
    const amount = parseAmount(initialAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Informe um valor válido para a banca inicial.');
      return;
    }
    setBusy(true);
    try {
      await saveSettings({
        initialBankroll: amount,
        bankrollStartDate: initialDate || localToday(),
      });
      await refresh();
      setInitialOpen(false);
      toast.success('Banca inicial atualizada. A série foi recalculada.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveTransaction = async () => {
    if (!transaction) return;
    const amount = parseAmount(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Informe um valor maior que zero.');
      return;
    }
    setBusy(true);
    try {
      await api.addBankrollTransaction({
        type: transaction.type,
        amount,
        date: transaction.date,
        note: transaction.note,
      });
      await refresh();
      setTransaction(null);
      toast.success(
        transaction.type === 'deposit' ? 'Depósito registrado na banca.' : 'Saque registrado na banca.',
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeTransaction = async (item: BankrollTransaction) => {
    const ok = await confirm({
      title: item.type === 'deposit' ? 'Excluir depósito' : 'Excluir saque',
      message: `A movimentação de ${fmtMoney(item.amount)} em ${fmtDate(`${item.date}T12:00`)} será removida do gráfico e da banca. Deseja continuar?`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.removeBankrollTransaction(item.id);
      await refresh();
      toast.success('Movimentação excluída.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const needsInitial = summary.initial === 0 && summary.deposits === 0 && summary.totalBets === 0;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {needsInitial ? (
        <div className="alert alert-info">
          <CircleDollarSign size={16} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            Comece definindo sua <strong>banca inicial</strong>. Depois informe o valor apostado e as odds em cada
            previsão para acompanhar lucro, ROI, exposição e saques no gráfico.
          </span>
          <button className="btn btn-primary btn-sm" onClick={openInitial} style={{ marginLeft: 'auto' }}>
            <Settings2 size={13} /> Definir banca inicial
          </button>
        </div>
      ) : null}

      <div className="card bankroll-hero">
        <div className="bankroll-hero-main">
          <div>
            <div className="kpi-label">
              <Wallet size={14} /> Banca disponível
            </div>
            <div className={`bankroll-amount ${summary.available < 0 ? 'neg' : ''}`}>
              {fmtMoney(summary.available)}
            </div>
            <div className="bankroll-sub">
              Banca total {fmtMoney(summary.current)} ·{' '}
              {summary.openBets > 0
                ? `${fmtMoney(summary.exposure)} em ${summary.openBets} aposta(s) em aberto`
                : 'nenhuma aposta em aberto'}
            </div>
          </div>
          <div className="bankroll-actions">
            <button className="btn btn-primary" onClick={() => openTransaction('deposit')} disabled={busy}>
              <ArrowDownToLine size={14} /> Depositar
            </button>
            <button className="btn" onClick={() => openTransaction('withdrawal')} disabled={busy}>
              <ArrowUpFromLine size={14} /> Sacar
            </button>
            <button className="btn btn-ghost" onClick={openInitial} disabled={busy}>
              <Settings2 size={14} /> Banca inicial
            </button>
          </div>
        </div>

        <div className="bankroll-hero-stats">
          <div>
            <span>Inicial</span>
            <strong>{fmtMoney(summary.initial)}</strong>
          </div>
          <div>
            <span>Depósitos</span>
            <strong className="pos">{fmtMoney(summary.deposits)}</strong>
          </div>
          <div>
            <span>Saques</span>
            <strong className="neg">{fmtMoney(summary.withdrawals)}</strong>
          </div>
          <div>
            <span>Lucro realizado</span>
            <strong className={summary.netProfit >= 0 ? 'pos' : 'neg'}>
              {fmtMoneySigned(summary.netProfit)}
            </strong>
          </div>
        </div>

        {summary.available < 0 ? (
          <div className="alert alert-warn" style={{ marginTop: 12 }}>
            <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
            <span>
              A banca disponível está negativa porque as apostas em aberto superam o saldo. Deposite ou reduza a
              exposição para regularizar.
            </span>
          </div>
        ) : null}
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">
            <Wallet size={13} /> Banca total
          </div>
          <div className="kpi-value">{fmtMoney(summary.current)}</div>
          <div className="kpi-sub">inicial + depósitos − saques + resultado</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            {summary.netProfit >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} Lucro realizado
          </div>
          <div className={`kpi-value ${summary.netProfit >= 0 ? 'pos' : 'neg'}`}>
            {fmtMoneySigned(summary.netProfit)}
          </div>
          <div className="kpi-sub">
            ROI {summary.roi === null ? '—' : `${fmtNumber(summary.roi, 1)}%`} sobre {fmtMoney(summary.settledStaked)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <Target size={13} /> Em aberto
          </div>
          <div className="kpi-value">{fmtMoney(summary.exposure)}</div>
          <div className="kpi-sub">
            {fmtNumber(summary.openBets)} pendente(s) · disponível {fmtMoney(summary.available)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <CircleDollarSign size={13} /> Total apostado
          </div>
          <div className="kpi-value">{fmtMoney(summary.totalStaked)}</div>
          <div className="kpi-sub">
            {fmtNumber(summary.totalBets)} apostas · retorno {fmtMoney(summary.returned)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">
              <TrendingUp size={15} /> Evolução da banca
            </div>
            <div className="card-desc">
              Saldo realizado por dia · depósitos e saques entram na data informada
            </div>
          </div>
          <div className="bankroll-legend">
            <span className="bankroll-legend-item">
              <i className="deposit" /> Depósito
            </span>
            <span className="bankroll-legend-item">
              <i className="withdrawal" /> Saque
            </span>
          </div>
        </div>
        <BankrollChart points={bankroll.series} transactions={bankroll.transactions} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.05fr 1.25fr', alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <CalendarDays size={15} /> Movimentações
              </div>
              <div className="card-desc">Depósitos e saques que alteram a banca</div>
            </div>
            <button className="btn btn-sm" onClick={() => openTransaction('deposit')} disabled={busy}>
              <Plus size={13} /> Nova
            </button>
          </div>

          {bankroll.transactions.length === 0 ? (
            <EmptyState
              icon={<ArrowDownToLine size={20} />}
              title="Nenhuma movimentação"
              message="Depósitos e saques aparecem aqui e passam a compor o gráfico da banca."
              action={
                <button className="btn btn-sm" onClick={() => openTransaction('deposit')}>
                  <Plus size={13} /> Registrar depósito
                </button>
              }
            />
          ) : (
            <div className="bankroll-tx-list">
              {bankroll.transactions.map((item) => {
                const incoming = item.type === 'deposit';
                return (
                  <div className="bankroll-tx" key={item.id}>
                    <span className={`bankroll-tx-icon ${incoming ? 'deposit' : 'withdrawal'}`}>
                      {incoming ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />}
                    </span>
                    <div className="bankroll-tx-main">
                      <div className="bankroll-tx-title">{incoming ? 'Depósito' : 'Saque'}</div>
                      <div className="bankroll-tx-meta">
                        {fmtDate(`${item.date}T12:00`)}
                        {item.note ? ` · ${item.note}` : ''}
                      </div>
                    </div>
                    <strong className={`bankroll-tx-value ${incoming ? 'pos' : 'neg'}`}>
                      {fmtMoneySigned(incoming ? item.amount : -item.amount)}
                    </strong>
                    <button
                      className="btn-icon"
                      title="Excluir movimentação"
                      disabled={busy}
                      onClick={() => void removeTransaction(item)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <Target size={15} /> Apostas com valor
              </div>
              <div className="card-desc">Stake, odds e resultado financeiro das últimas apostas</div>
            </div>
            <button className="link-btn" onClick={() => navigate('history')}>
              Ver histórico <ArrowRight size={12} />
            </button>
          </div>

          {bets.length === 0 ? (
            <EmptyState
              icon={<Wallet size={20} />}
              title="Nenhuma aposta com valor"
              message="Informe o valor apostado e as odds em Nova previsão para calcular retorno, lucro e ROI."
              action={
                <button className="btn btn-sm btn-primary" onClick={() => navigate('new')}>
                  <Plus size={13} /> Nova previsão
                </button>
              }
            />
          ) : (
            <div className="bankroll-bet-list">
              {bets.map((bet) => {
                const profit = betProfit(bet);
                const pending = bet.status === 'pending';
                return (
                  <button
                    className="bankroll-bet"
                    key={bet.id}
                    onClick={() => navigate('new', { id: bet.id })}
                  >
                    <div className="bankroll-bet-main">
                      <div className="bankroll-bet-event">{bet.event}</div>
                      <div className="bankroll-bet-meta">
                        {fmtDate(bet.eventDate)} · {bet.category || 'sem categoria'} ·{' '}
                        {fmtMoney(bet.stake)} @ {fmtOdds(bet.odds)}
                      </div>
                    </div>
                    <div className="bankroll-bet-side">
                      <StatusBadge status={bet.status} />
                      {pending ? (
                        <span className="small muted-3">retorno {fmtMoney(bet.stake * (bet.odds ?? 0))}</span>
                      ) : (
                        <strong className={profit >= 0 ? 'pos' : 'neg'}>{fmtMoneySigned(profit)}</strong>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {initialOpen ? (
        <Modal
          title="Definir banca inicial"
          subtitle="Este valor é a base da evolução da banca. Alterá-lo recalcula toda a série."
          onClose={() => setInitialOpen(false)}
          size="sm"
          footer={
            <>
              <button className="btn" onClick={() => setInitialOpen(false)} disabled={busy}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={() => void saveInitial()} disabled={busy}>
                {busy ? 'Salvando...' : 'Salvar banca inicial'}
              </button>
            </>
          }
        >
          <div className="stack">
            <Field label="Valor inicial (R$)" hint="Use o saldo que você tinha ao começar a acompanhar.">
              <input
                className="input"
                inputMode="decimal"
                autoFocus
                value={initialAmount}
                onChange={(event) => setInitialAmount(event.target.value)}
                placeholder="1.000,00"
              />
            </Field>
            <Field label="Data de referência" hint="A série da banca começa nesta data (ou na primeira aposta/movimentação).">
              <input
                type="date"
                className="input"
                value={initialDate}
                max={localToday()}
                onChange={(event) => setInitialDate(event.target.value)}
              />
            </Field>
            <p className="hint" style={{ margin: 0 }}>
              A banca inicial não cria um depósito; ela é o ponto de partida. Depósitos e saques são registrados
              separadamente.
            </p>
          </div>
        </Modal>
      ) : null}

      {transaction ? (
        <Modal
          title={transaction.type === 'deposit' ? 'Registrar depósito' : 'Registrar saque'}
          subtitle={
            transaction.type === 'deposit'
              ? 'O valor será somado à banca na data informada.'
              : `Você pode sacar até ${fmtMoney(summary.available)}.`
          }
          onClose={() => setTransaction(null)}
          size="sm"
          footer={
            <>
              <button className="btn" onClick={() => setTransaction(null)} disabled={busy}>
                Cancelar
              </button>
              <button
                className={`btn ${transaction.type === 'withdrawal' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => void saveTransaction()}
                disabled={busy}
              >
                {busy ? 'Salvando...' : transaction.type === 'deposit' ? 'Registrar depósito' : 'Registrar saque'}
              </button>
            </>
          }
        >
          <div className="stack">
            <Field label="Tipo">
              <Segmented<BankrollTransactionType>
                value={transaction.type}
                onChange={(value) => setTransaction((prev) => (prev ? { ...prev, type: value } : prev))}
                options={[
                  { value: 'deposit', label: 'Depósito' },
                  { value: 'withdrawal', label: 'Saque' },
                ]}
              />
            </Field>
            <Field label="Valor (R$)">
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  inputMode="decimal"
                  autoFocus
                  value={transaction.amount}
                  onChange={(event) =>
                    setTransaction((prev) => (prev ? { ...prev, amount: event.target.value } : prev))
                  }
                  placeholder="100,00"
                />
                {transaction.type === 'withdrawal' ? (
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() =>
                      setTransaction((prev) =>
                        prev ? { ...prev, amount: String(summary.available).replace('.', ',') } : prev,
                      )
                    }
                  >
                    Máximo
                  </button>
                ) : null}
              </div>
            </Field>
            <Field label="Data">
              <input
                type="date"
                className="input"
                value={transaction.date}
                max={localToday()}
                onChange={(event) =>
                  setTransaction((prev) => (prev ? { ...prev, date: event.target.value } : prev))
                }
              />
            </Field>
            <Field label="Observação" hint="Opcional · ex.: bônus, retirada para conta, aporte mensal">
              <input
                className="input"
                value={transaction.note}
                maxLength={500}
                onChange={(event) =>
                  setTransaction((prev) => (prev ? { ...prev, note: event.target.value } : prev))
                }
                placeholder="Retirada mensal"
              />
            </Field>
            <p className="hint" style={{ margin: 0 }}>
              Registrado em {fmtDateTime(new Date().toISOString())}. Saques não podem deixar a banca disponível
              negativa.
            </p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
