import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider } from './state/app';
import { ToastProvider } from './lib/toast';
import { ConfirmProvider } from './components/ui';
import { Shell } from './components/Shell';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro de renderização', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ height: '100vh', display: 'grid', placeItems: 'center', padding: 32 }}>
          <div className="card" style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Ocorreu um erro na interface</h2>
            <p className="small muted" style={{ marginBottom: 6 }}>
              {this.state.error.message}
            </p>
            <p className="hint" style={{ marginBottom: 14 }}>
              Seus dados continuam salvos no banco local. Recarregue a interface para continuar; se o erro persistir,
              abra o gerenciamento de dados a partir de uma nova janela do aplicativo.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                Recarregar interface
              </button>
              <button
                className="btn"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.hash = '#/dashboard';
                }}
              >
                Voltar à visão geral
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <AppProvider>
            <Shell />
          </AppProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
