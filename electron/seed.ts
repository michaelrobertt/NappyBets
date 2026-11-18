import type { PredictionInput } from '../src/shared/types';

/** Gerador determinístico para que o conjunto demonstrativo seja estável. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Plan {
  sport: string;
  competition: string;
  subjectType: 'team' | 'player';
  subjects: string[];
  categories: string[];
  /** Resultados previstos típicos do mercado. */
  results: string[];
  count: number;
  /** Ajuste sistemático de calibração (em pontos percentuais) para variedade realista. */
  bias: number;
  scores: string[];
}

/**
 * O conjunto demonstrativo prioriza League of Legends e CS2, que são o foco do
 * aplicativo; futebol, basquete e tênis aparecem como modalidades secundárias.
 */
const PLANS: Plan[] = [
  // ---------------- League of Legends ----------------
  {
    sport: 'League of Legends',
    competition: 'CBLOL',
    subjectType: 'team',
    subjects: ['LOUD', 'paiN Gaming', 'FURIA', 'RED Canids', 'Vivo Keyd', 'INTZ', 'Fluxo', 'LOS'],
    categories: ['Vencedor da partida', 'Handicap de mapas', 'Total de mapas', 'Vencedor do mapa 1', 'Primeira torre', 'Duração da partida'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mapas 2-0 para {a}', 'Mapas 2-1 para {a}', 'Mais de 2.5 mapas', 'Menos de 32 min'],
    count: 28,
    bias: 6,
    scores: ['2-0', '2-1', '1-2', '0-2', '2-0', '1-2'],
  },
  {
    sport: 'League of Legends',
    competition: 'EMEA Masters',
    subjectType: 'team',
    subjects: ['G2 Esports', 'Fnatic', 'Team Heretics', 'MAD Lions KOI', 'Team BDS', 'Karmine Corp', 'SK Gaming', 'Rogue'],
    categories: ['Vencedor da partida', 'Handicap de mapas', 'Total de mapas', 'Vencedor do mapa 1', 'Total de kills'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mapas 2-0 para {a}', 'Mais de 26.5 kills', 'Menos de 3.5 mapas'],
    count: 20,
    bias: 9,
    scores: ['2-0', '2-1', '1-2', '0-2', '2-0'],
  },
  {
    sport: 'League of Legends',
    competition: 'Worlds 2026',
    subjectType: 'team',
    subjects: ['T1', 'Gen.G', 'JD Gaming', 'Bilibili Gaming', 'Hanwha Life', 'Weibo Gaming', 'G2 Esports', 'FlyQuest'],
    categories: ['Vencedor da partida', 'Handicap de mapas', 'Total de mapas', 'Vencedor do mapa 1', 'Primeira torre'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mapas 2-1 para {a}', 'Mapas 3-1 para {a}', 'Menos de 3.5 mapas'],
    count: 24,
    bias: 3,
    scores: ['2-1', '2-0', '1-2', '3-1', '3-2', '0-2'],
  },
  {
    sport: 'League of Legends',
    competition: 'LCK',
    subjectType: 'team',
    subjects: ['T1', 'Gen.G', 'Hanwha Life', 'KT Rolster', 'Dplus KIA', 'DRX'],
    categories: ['Vencedor da partida', 'Handicap de mapas', 'Total de kills', 'Total de mapas'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mais de 24.5 kills', 'Menos de 2.5 mapas'],
    count: 18,
    bias: -3,
    scores: ['2-0', '2-1', '1-2', '0-2'],
  },
  {
    sport: 'League of Legends',
    competition: 'LEC',
    subjectType: 'team',
    subjects: ['G2 Esports', 'Fnatic', 'MAD Lions KOI', 'Team BDS', 'SK Gaming', 'GiantX'],
    categories: ['Vencedor da partida', 'Handicap de mapas', 'Total de mapas', 'Primeira torre'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mapas 2-0 para {a}', 'Mais de 2.5 mapas'],
    count: 16,
    bias: -7,
    scores: ['2-0', '2-1', '1-2', '0-2', '3-2'],
  },
  {
    sport: 'League of Legends',
    competition: 'MSI 2026',
    subjectType: 'team',
    subjects: ['T1', 'Gen.G', 'JD Gaming', 'G2 Esports', 'Bilibili Gaming', 'Team Liquid'],
    categories: ['Vencedor da partida', 'Handicap de mapas', 'Total de mapas'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mapas 3-2 para {a}'],
    count: 12,
    bias: 5,
    scores: ['3-1', '3-2', '1-3', '0-3'],
  },
  {
    sport: 'League of Legends',
    competition: 'LCS',
    subjectType: 'team',
    subjects: ['Team Liquid', 'Cloud9', '100 Thieves', 'FlyQuest', 'NRG', 'Dignitas'],
    categories: ['Vencedor da partida', 'Total de mapas', 'Handicap de mapas'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mais de 2.5 mapas', 'Menos de 2.5 mapas'],
    count: 12,
    bias: -10,
    scores: ['1-2', '0-2', '2-1', '2-0'],
  },
  {
    sport: 'League of Legends',
    competition: 'Worlds 2026',
    subjectType: 'player',
    subjects: ['Faker', 'Chovy', 'Knight', 'Ruler', 'Caps', 'Zeus'],
    categories: ['Jogador com mais kills', 'Total de kills do jogador', 'MVP da partida'],
    results: ['{a} com mais kills', 'Mais de 5.5 kills para {a}', '{a} MVP do mapa 1'],
    count: 10,
    bias: 1,
    scores: ['6 kills', '4 kills', '8 kills', '5 kills'],
  },

  // ---------------- CS2 ----------------
  {
    sport: 'CS2',
    competition: 'ESL Pro League',
    subjectType: 'team',
    subjects: ['FURIA', 'MIBR', 'NAVI', 'Vitality', 'FaZe', 'Spirit', 'MOUZ', 'Astralis'],
    categories: ['Vencedor da partida', 'Handicap de rounds', 'Total de rounds', 'Total de mapas', 'Vencedor do mapa 1', 'Pistol round'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mapas 2-0 para {a}', 'Mais de 26.5 rounds', 'Menos de 2.5 mapas'],
    count: 24,
    bias: -8,
    scores: ['2-0', '2-1', '1-2', '0-2', '13-9', '16-14'],
  },
  {
    sport: 'CS2',
    competition: 'BLAST Premier',
    subjectType: 'team',
    subjects: ['Vitality', 'NAVI', 'FaZe', 'G2', 'Astralis', 'Heroic', 'Complexity'],
    categories: ['Vencedor da partida', 'Handicap de rounds', 'Total de rounds', 'Vencedor do mapa 1'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mais de 2.5 mapas', 'Menos de 27.5 rounds'],
    count: 18,
    bias: 6,
    scores: ['2-0', '2-1', '1-2', '2-0', '13-7'],
  },
  {
    sport: 'CS2',
    competition: 'IEM Katowice',
    subjectType: 'team',
    subjects: ['Spirit', 'Vitality', 'MOUZ', 'NAVI', 'FaZe', 'Eternal Fire'],
    categories: ['Vencedor da partida', 'Handicap de rounds', 'Total de mapas', 'Pistol round'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mapas 2-1 para {a}', 'Mais de 2.5 mapas'],
    count: 16,
    bias: 4,
    scores: ['2-0', '2-1', '1-2', '3-1', '3-2'],
  },
  {
    sport: 'CS2',
    competition: 'CS2 Major',
    subjectType: 'team',
    subjects: ['Vitality', 'Spirit', 'MOUZ', 'FaZe', 'NAVI', 'G2', 'The MongolZ', 'paiN Gaming'],
    categories: ['Vencedor da partida', 'Handicap de rounds', 'Total de rounds', 'Total de mapas'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mais de 25.5 rounds', 'Menos de 2.5 mapas'],
    count: 14,
    bias: -2,
    scores: ['2-0', '2-1', '1-2', '3-1', '13-11'],
  },
  {
    sport: 'CS2',
    competition: 'CBCS Elite League',
    subjectType: 'team',
    subjects: ['FURIA', 'MIBR', 'paiN Gaming', 'Imperial', 'Sharks', 'ODDIK'],
    categories: ['Vencedor da partida', 'Total de mapas', 'Handicap de rounds'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mais de 2.5 mapas'],
    count: 10,
    bias: 7,
    scores: ['2-0', '2-1', '1-2', '2-0'],
  },
  {
    sport: 'CS2',
    competition: 'BLAST Premier',
    subjectType: 'player',
    subjects: ['ZywOo', 'donk', 's1mple', 'NiKo', 'm0NESY', 'KSCERATO'],
    categories: ['Jogador com mais kills', 'Total de kills do jogador', 'MVP do mapa'],
    results: ['{a} com mais kills', 'Mais de 18.5 kills para {a}', '{a} MVP do mapa 1'],
    count: 12,
    bias: 2,
    scores: ['22 kills', '18 kills', '26 kills', '15 kills'],
  },

  // ---------------- Esportes tradicionais (secundários) ----------------
  {
    sport: 'Futebol',
    competition: 'Brasileirão Série A',
    subjectType: 'team',
    subjects: ['Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo', 'Grêmio', 'Botafogo', 'Fluminense', 'Cruzeiro'],
    categories: ['Resultado final', 'Total de gols', 'Ambas marcam', 'Handicap asiático'],
    results: ['Vitória {a}', 'Vitória {b}', 'Empate', 'Mais de 2.5 gols', 'Ambas marcam: Sim'],
    count: 18,
    bias: 5,
    scores: ['2-1', '1-1', '3-0', '0-0', '2-0', '1-2'],
  },
  {
    sport: 'Futebol',
    competition: 'Premier League',
    subjectType: 'team',
    subjects: ['Arsenal', 'Manchester City', 'Liverpool', 'Chelsea', 'Tottenham', 'Newcastle'],
    categories: ['Resultado final', 'Total de gols', 'Ambas marcam'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mais de 2.5 gols', 'Ambas marcam: Sim'],
    count: 12,
    bias: -4,
    scores: ['2-1', '1-0', '2-2', '3-1', '0-2'],
  },
  {
    sport: 'Futebol',
    competition: 'UEFA Champions League',
    subjectType: 'team',
    subjects: ['Real Madrid', 'Bayern de Munique', 'Barcelona', 'PSG', 'Inter de Milão'],
    categories: ['Resultado final', 'Total de gols', 'Classificação'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mais de 2.5 gols'],
    count: 10,
    bias: 1,
    scores: ['2-1', '3-1', '1-1', '0-0', '2-0'],
  },
  {
    sport: 'Basquete',
    competition: 'NBA',
    subjectType: 'team',
    subjects: ['Boston Celtics', 'Los Angeles Lakers', 'Denver Nuggets', 'Golden State Warriors', 'Miami Heat'],
    categories: ['Vencedor', 'Handicap de pontos', 'Total de pontos'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mais de 220.5 pontos', 'Menos de 215.5 pontos'],
    count: 10,
    bias: 2,
    scores: ['112-104', '98-101', '121-115', '103-99'],
  },
  {
    sport: 'Tênis',
    competition: 'ATP Masters 1000',
    subjectType: 'player',
    subjects: ['Carlos Alcaraz', 'Jannik Sinner', 'Novak Djokovic', 'Alexander Zverev'],
    categories: ['Vencedor da partida', 'Total de games'],
    results: ['Vitória {a}', 'Vitória {b}', 'Mais de 22.5 games'],
    count: 8,
    bias: -9,
    scores: ['2-0', '2-1', '0-2', '1-2'],
  },
];

const BOOKMAKERS = ['Bet365', 'Betano', 'Pinnacle', 'KTO', 'Betfair'];

const NOTES = [
  'Linha aberta cedo, boa margem em relação ao fechamento.',
  'Escalação confirmada antes do registro.',
  'Veto de mapas favorece o pick analisado.',
  'Análise baseada nos últimos cinco confrontos diretos.',
  '',
  '',
  'Fator lado (azul/vermelho) pesou na estimativa.',
  'Patch recente mudou a prioridade de picks.',
  '',
];

function formatDate(offsetDays: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
}

function fill(template: string, a: string, b: string): string {
  return template.replaceAll('{a}', a).replaceAll('{b}', b);
}

export function buildSeedPredictions(now = new Date()): PredictionInput[] {
  const rng = mulberry32(20260217);
  const out: PredictionInput[] = [];
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const range = (min: number, max: number) => min + rng() * (max - min);

  for (const plan of PLANS) {
    for (let i = 0; i < plan.count; i += 1) {
      const dayOffset = Math.round(range(-76, 5));
      const hour = Math.round(range(13, 23));
      const minute = pick([0, 15, 30, 45]);
      const eventDate = formatDate(dayOffset, hour, minute);
      const a = pick(plan.subjects);
      let b = pick(plan.subjects);
      while (b === a) b = pick(plan.subjects);
      const probability = Math.round(range(47, 89) * 2) / 2;
      const category = pick(plan.categories);
      const predictedResult = fill(pick(plan.results), a, b);

      const isFuture = dayOffset > 0;
      const status = isFuture
        ? 'pending'
        : rng() < 0.03
          ? 'void'
          : rng() < Math.min(0.95, Math.max(0.05, (probability + plan.bias) / 100))
            ? 'hit'
            : 'miss';

      const actualResult =
        status === 'pending'
          ? ''
          : status === 'void'
            ? 'Evento adiado'
            : pick(plan.scores);

      out.push({
        sport: plan.sport,
        competition: plan.competition,
        subjectType: plan.subjectType,
        subject: a,
        event:
          plan.subjectType === 'player'
            ? `${a} (${plan.subjects.find((name) => name !== a) ?? b}) vs ${b}`
            : `${a} vs ${b}`,
        eventDate,
        category,
        predictedResult,
        probability,
        status,
        actualResult,
        bookmaker: pick(BOOKMAKERS),
        notes: pick(NOTES),
        isDemo: true,
      });
    }
  }

  // Pendências dos próximos dias — calendário e "próximos eventos".
  const upcoming: Array<[string, string, string, string, string, string, number]> = [
    ['League of Legends', 'CBLOL', 'LOUD', 'paiN Gaming', 'Vencedor da partida', 'team', 62],
    ['League of Legends', 'Worlds 2026', 'T1', 'Gen.G', 'Handicap de mapas', 'team', 58],
    ['League of Legends', 'LEC', 'G2 Esports', 'Fnatic', 'Total de mapas', 'team', 55],
    ['League of Legends', 'Worlds 2026', 'Chovy', 'Faker', 'Jogador com mais kills', 'player', 54],
    ['CS2', 'ESL Pro League', 'FURIA', 'NAVI', 'Handicap de rounds', 'team', 51],
    ['CS2', 'BLAST Premier', 'Vitality', 'FaZe', 'Vencedor da partida', 'team', 64],
    ['CS2', 'CS2 Major', 'Spirit', 'MOUZ', 'Total de rounds', 'team', 57],
    ['CS2', 'ESL Pro League', 'ZywOo', 'donk', 'MVP do mapa', 'player', 59],
    ['Futebol', 'Brasileirão Série A', 'Flamengo', 'Palmeiras', 'Resultado final', 'team', 61],
    ['Basquete', 'NBA', 'Boston Celtics', 'Miami Heat', 'Handicap de pontos', 'team', 63],
  ];
  upcoming.forEach(([sport, competition, a, b, category, type, probability], index) => {
    out.push({
      sport,
      competition,
      subjectType: type === 'player' ? 'player' : 'team',
      subject: a,
      event: type === 'player' ? `${a} (${competition}) vs ${b}` : `${a} vs ${b}`,
      eventDate: formatDate(index + 1, 18 + (index % 4), 0),
      category,
      predictedResult: type === 'player' ? `${a} com mais kills` : `Vitória ${a}`,
      probability,
      status: 'pending',
      actualResult: '',
      bookmaker: BOOKMAKERS[index % BOOKMAKERS.length]!,
      notes: '',
      isDemo: true,
    });
  });

  void now;
  return out;
}
