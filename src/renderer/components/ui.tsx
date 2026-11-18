import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, Search, X } from 'lucide-react';
import type { PredictionStatus } from '../../shared/types';
import { STATUS_LABEL } from '../../shared/types';
import { statusMeta } from '../lib/format';

/* ---------------- Modal ---------------- */
export function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  size = 'md',
  closeOnBackdrop = true,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h3 className="modal-title">{title}</h3>
            {subtitle ? <p className="card-desc">{subtitle}</p> : null}
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Confirm ---------------- */
interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolver: (value: boolean) => void }) | null>(
    null,
  );

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setState({ ...options, resolver: resolve });
      }),
    [],
  );

  const close = (value: boolean) => {
    state?.resolver(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state
        ? createPortal(
            <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close(false)}>
              <div className="modal modal-sm" role="alertdialog" aria-modal="true">
                <div className="modal-head">
                  <div className="row" style={{ gap: 10 }}>
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        display: 'grid',
                        placeItems: 'center',
                        background: state.danger ? 'var(--danger-soft)' : 'var(--accent-soft)',
                        color: state.danger ? '#fb7185' : 'var(--accent-2)',
                        flex: 'none',
                      }}
                    >
                      <AlertTriangle size={17} />
                    </span>
                    <h3 className="modal-title" style={{ fontSize: 15 }}>
                      {state.title}
                    </h3>
                  </div>
                </div>
                <div className="modal-body">
                  <div className="small muted" style={{ lineHeight: 1.6 }}>
                    {state.message}
                  </div>
                </div>
                <div className="modal-foot">
                  <button className="btn" onClick={() => close(false)}>
                    {state.cancelLabel ?? 'Cancelar'}
                  </button>
                  <button
                    className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`}
                    onClick={() => close(true)}
                    autoFocus
                  >
                    {state.confirmLabel ?? 'Confirmar'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm precisa estar dentro de ConfirmProvider.');
  return context;
}

/* ---------------- small pieces ---------------- */
export function StatusBadge({ status }: { status: PredictionStatus }) {
  const meta = statusMeta(status);
  return (
    <span className={meta.className}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  danger = false,
  height,
}: {
  value: number | null;
  max?: number;
  danger?: boolean;
  height?: number;
}) {
  const width = value === null || !Number.isFinite(value) ? 0 : Math.min(100, Math.max(1.5, (value / max) * 100));
  return (
    <div className={`progress ${danger ? 'danger' : ''}`} style={height ? { height } : undefined}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Search size={20} />}</div>
      <div className="empty-title">{title}</div>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ height = 14, width = '100%', style }: { height?: number; width?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} />;
}

export function InfoTip({ text }: { text: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      <HelpCircle size={12} style={{ color: 'var(--text-3)' }} />
      {open ? <span className="tooltip">{text}</span> : null}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  full,
  tip,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  full?: boolean;
  tip?: ReactNode;
}) {
  return (
    <div className={`field ${full ? 'col-span-2' : ''}`}>
      <label className="field-label">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </label>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Pesquisar...',
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      <Search
        size={14}
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
      />
      <input
        id={id}
        className="input"
        style={{ paddingLeft: 30 }}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function KpiCard({
  label,
  value,
  suffix,
  sub,
  icon,
  accent = false,
  tip,
  tone,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: boolean;
  tip?: ReactNode;
  tone?: 'pos' | 'neg';
}) {
  return (
    <div className={`kpi ${accent ? 'accent' : ''}`}>
      {icon ? <span className="kpi-icon">{icon}</span> : null}
      <div className="kpi-label">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </div>
      <div className={`kpi-value ${tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''}`}>
        {value}
        {suffix ? <small>{suffix}</small> : null}
      </div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const element = ref.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}
