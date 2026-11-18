import { useEffect, useState } from 'react';

export type ViewName =
  | 'dashboard'
  | 'history'
  | 'calendar'
  | 'new'
  | 'bankroll'
  | 'data'
  | 'players'
  | 'teams'
  | 'leagues'
  | 'markets'
  | 'bands'
  | 'bookmakers'
  | 'settings'
  | 'entity'
  | 'external';

export interface Route {
  name: ViewName;
  params: Record<string, string>;
}

const KNOWN: ViewName[] = [
  'dashboard',
  'history',
  'calendar',
  'new',
  'bankroll',
  'data',
  'players',
  'teams',
  'leagues',
  'markets',
  'bands',
  'bookmakers',
  'settings',
  'entity',
  'external',
];

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [path, queryString] = clean.split('?');
  const candidate = (path || 'dashboard') as ViewName;
  const name = KNOWN.includes(candidate) ? candidate : 'dashboard';
  const params: Record<string, string> = {};
  if (queryString) {
    new URLSearchParams(queryString).forEach((value, key) => {
      params[key] = value;
    });
  }
  return { name, params };
}

export function toHash(route: Route): string {
  const query = new URLSearchParams(route.params ?? {}).toString();
  return `#/${route.name}${query ? `?${query}` : ''}`;
}

export function navigate(name: ViewName, params: Record<string, string> = {}): void {
  const hash = toHash({ name, params });
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = hash;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route;
}

export const VIEW_TITLES: Record<ViewName, { title: string; subtitle: string }> = {
  dashboard: { title: 'Visão geral', subtitle: 'Indicadores, destaques e calibração das suas previsões' },
  history: { title: 'Histórico de previsões', subtitle: 'Todas as previsões registradas, com filtros e detalhes' },
  calendar: { title: 'Calendário', subtitle: 'Eventos e previsões organizados por data' },
  new: { title: 'Nova previsão', subtitle: 'Registre a previsão, o valor apostado e as odds' },
  bankroll: {
    title: 'Banca',
    subtitle: 'Banca inicial, apostas, depósitos, saques e evolução do saldo',
  },
  data: { title: 'Gerenciamento de dados', subtitle: 'Exportação, importação, cópias de segurança e integridade' },
  players: { title: 'Jogadores', subtitle: 'Desempenho individual por jogador' },
  teams: { title: 'Times', subtitle: 'Comparativo estatístico entre equipes' },
  leagues: { title: 'Ligas', subtitle: 'Desempenho por competição' },
  markets: { title: 'Mercados e categorias', subtitle: 'Precisão por tipo de previsão' },
  bands: { title: 'Faixas de probabilidade', subtitle: 'Calibração entre a confiança estimada e o resultado real' },
  bookmakers: { title: 'Casas de referência', subtitle: 'Registro histórico por casa, sem qualquer operação de aposta' },
  settings: { title: 'Configurações', subtitle: 'Perfil, aparência e preferências de análise' },
  entity: { title: 'Análise detalhada', subtitle: 'Recorte específico do seu histórico' },
  external: {
    title: 'Mercados externos',
    subtitle: 'Partidas da Polymarket e da Kalshi para preencher uma aposta manualmente',
  },
};
