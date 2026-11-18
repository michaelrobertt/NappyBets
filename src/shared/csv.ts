import type {
  AppSettings,
  BankrollTransaction,
  BankrollTransactionInput,
  Prediction,
  PredictionInput,
  PredictionStatus,
  SubjectType,
} from './types';
import { DEFAULT_SETTINGS, STATUS_LABEL } from './types';

export const CSV_HEADERS = [
  'data',
  'hora',
  'modalidade',
  'competicao',
  'tipo',
  'time_jogador',
  'evento',
  'categoria',
  'resultado_previsto',
  'probabilidade',
  'status',
  'resultado_real',
  'casa_referencia',
  'valor_apostado',
  'odds',
  'observacoes',
] as const;

export const CSV_HEADER_LABELS: Record<(typeof CSV_HEADERS)[number], string> = {
  data: 'Data',
  hora: 'Hora',
  modalidade: 'Modalidade',
  competicao: 'Competição',
  tipo: 'Tipo',
  time_jogador: 'Time/Jogador',
  evento: 'Evento',
  categoria: 'Categoria',
  resultado_previsto: 'Resultado previsto',
  probabilidade: 'Probabilidade (%)',
  status: 'Status',
  resultado_real: 'Resultado real',
  casa_referencia: 'Casa de referência',
  valor_apostado: 'Valor apostado (R$)',
  odds: 'Odds (decimal)',
  observacoes: 'Observações',
};

const STATUS_TO_INT: Record<string, PredictionStatus> = {
  pendente: 'pending',
  pending: 'pending',
  acertou: 'hit',
  acerto: 'hit',
  hit: 'hit',
  win: 'hit',
  green: 'hit',
  errou: 'miss',
  erro: 'miss',
  miss: 'miss',
  loss: 'miss',
  red: 'miss',
  anulada: 'void',
  anulado: 'void',
  void: 'void',
  cancelada: 'void',
};

const SUBJECT_TO_INT: Record<string, SubjectType> = {
  time: 'team',
  equipa: 'team',
  equipe: 'team',
  team: 'team',
  jogador: 'player',
  jogadora: 'player',
  atleta: 'player',
  player: 'player',
};

function brDate(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
}

function validDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

function escapeCell(value: string): string {
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV com ; (padrão Excel pt-BR), BOM para acentuação correta. */
export function predictionsToCsv(rows: Prediction[]): string {
  const header = CSV_HEADERS.map((h) => CSV_HEADER_LABELS[h]).join(';');
  const lines = rows.map((row) => {
    const [date, time] = row.eventDate.split('T');
    const cells: string[] = [
      brDate(date ?? ''),
      time ?? '',
      row.sport,
      row.competition,
      row.subjectType === 'player' ? 'Jogador' : 'Time',
      row.subject,
      row.event,
      row.category,
      row.predictedResult,
      String(row.probability),
      STATUS_LABEL[row.status],
      row.actualResult,
      row.bookmaker,
      row.stake > 0 ? String(row.stake).replace('.', ',') : '',
      row.odds === null ? '' : String(row.odds).replace('.', ','),
      row.notes,
    ];
    return cells.map((c) => escapeCell(c ?? '')).join(';');
  });
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

/** Parser CSV tolerante: aspas, quebras de linha internas, ; ou , como separador. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n') >= 0 ? clean.indexOf('\n') : clean.length);
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseDecimal(raw: string): number | null {
  const clean = raw.replace(/R\$/gi, '').replace(/\s/g, '').replace(',', '.');
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

function parseMoney(raw: string): number | null {
  const clean = raw
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

const HEADER_ALIASES: Record<string, (typeof CSV_HEADERS)[number]> = {
  data: 'data',
  date: 'data',
  dia: 'data',
  evento_data: 'data',
  hora: 'hora',
  time: 'hora',
  horario: 'hora',
  modalidade: 'modalidade',
  esporte: 'modalidade',
  sport: 'modalidade',
  competicao: 'competicao',
  campeonato: 'competicao',
  liga: 'competicao',
  competition: 'competicao',
  league: 'competicao',
  tipo: 'tipo',
  tipo_sujeito: 'tipo',
  subject_type: 'tipo',
  time_jogador: 'time_jogador',
  jogador: 'time_jogador',
  time_ou_jogador: 'time_jogador',
  sujeito: 'time_jogador',
  subject: 'time_jogador',
  team: 'time_jogador',
  player: 'time_jogador',
  evento: 'evento',
  partida: 'evento',
  jogo: 'evento',
  event: 'evento',
  match: 'evento',
  categoria: 'categoria',
  mercado: 'categoria',
  market: 'categoria',
  category: 'categoria',
  resultado_previsto: 'resultado_previsto',
  previsao: 'resultado_previsto',
  predicted: 'resultado_previsto',
  predicted_result: 'resultado_previsto',
  prediction: 'resultado_previsto',
  pick: 'resultado_previsto',
  probabilidade: 'probabilidade',
  probabilidade_pct: 'probabilidade',
  prob: 'probabilidade',
  probability: 'probabilidade',
  status: 'status',
  resultado_real: 'resultado_real',
  resultado: 'resultado_real',
  actual_result: 'resultado_real',
  casa_referencia: 'casa_referencia',
  casa: 'casa_referencia',
  bookmaker: 'casa_referencia',
  valor_apostado: 'valor_apostado',
  valor_apostado_r: 'valor_apostado',
  valor_apostado_rs: 'valor_apostado',
  valor: 'valor_apostado',
  stake: 'valor_apostado',
  aposta: 'valor_apostado',
  amount: 'valor_apostado',
  odds: 'odds',
  odds_decimal: 'odds',
  odd: 'odds',
  cotacao: 'odds',
  valor_odd: 'odds',
  observacoes: 'observacoes',
  obs: 'observacoes',
  notas: 'observacoes',
  notes: 'observacoes',
};

export interface CsvParseResult {
  inputs: PredictionInput[];
  errors: string[];
}

export function csvToPredictions(text: string): CsvParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { inputs: [], errors: ['Arquivo CSV vazio ou sem cabeçalho.'] };
  const header = rows[0]!.map((h) => {
    const normalized = normalizeHeader(h);
    return HEADER_ALIASES[normalized] ?? (normalized as (typeof CSV_HEADERS)[number]);
  });
  const errors: string[] = [];
  const inputs: PredictionInput[] = [];

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (key: (typeof CSV_HEADERS)[number]): string => {
      const idx = header.indexOf(key);
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };
    const rawDate = get('data');
    const rawTime = get('hora') || '00:00';
    const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const brMatch = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    let eventDate = '';
    if (isoMatch && validDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))) {
      eventDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${rawTime.slice(0, 5)}`;
    } else if (brMatch && validDateParts(Number(brMatch[3]), Number(brMatch[2]), Number(brMatch[1]))) {
      const [, d, m, y] = brMatch;
      eventDate = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}T${rawTime.slice(0, 5)}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(eventDate)) {
      errors.push(`Linha ${line}: data inválida ("${rawDate}").`);
      return;
    }
    const probRaw = get('probabilidade').replace('%', '').replace(',', '.');
    const probability = Number(probRaw);
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      errors.push(`Linha ${line}: probabilidade inválida ("${get('probabilidade')}").`);
      return;
    }
    const status = STATUS_TO_INT[normalizeHeader(get('status'))] ?? 'pending';
    const subjectType = SUBJECT_TO_INT[normalizeHeader(get('tipo'))] ?? 'team';
    const stake = parseMoney(get('valor_apostado'));
    const odds = parseDecimal(get('odds'));
    if (stake !== null && stake < 0) {
      errors.push(`Linha ${line}: valor apostado inválido ("${get('valor_apostado')}").`);
      return;
    }
    if (odds !== null && odds <= 1) {
      errors.push(`Linha ${line}: odds devem ser maiores que 1,00 ("${get('odds')}").`);
      return;
    }
    if ((stake ?? 0) > 0 && odds === null) {
      errors.push(`Linha ${line}: informe as odds para o valor apostado.`);
      return;
    }
    const input: PredictionInput = {
      sport: get('modalidade'),
      competition: get('competicao'),
      subject: get('time_jogador'),
      subjectType,
      event: get('evento'),
      eventDate,
      category: get('categoria'),
      predictedResult: get('resultado_previsto'),
      probability,
      stake: stake ?? 0,
      odds,
      status,
      actualResult: get('resultado_real'),
      bookmaker: get('casa_referencia'),
      notes: get('observacoes'),
      isDemo: false,
    };
    if (!input.sport || !input.competition || !input.event || !input.predictedResult) {
      errors.push(`Linha ${line}: campos obrigatórios ausentes (modalidade, competição, evento, resultado previsto).`);
      return;
    }
    inputs.push(input);
  });

  return { inputs, errors };
}

export interface ExportBundle {
  app: 'NappyBets';
  schemaVersion: number;
  exportedAt: string;
  count: number;
  predictions: Prediction[];
  settings: AppSettings;
  bankrollTransactions: BankrollTransaction[];
}

export function createExportBundle(
  predictions: Prediction[],
  settings: AppSettings,
  schemaVersion: number,
  transactionsOrNow: BankrollTransaction[] | Date = [],
  now = new Date(),
): ExportBundle {
  const transactions = Array.isArray(transactionsOrNow) ? transactionsOrNow : [];
  const exportedAt = transactionsOrNow instanceof Date ? transactionsOrNow : now;
  return {
    app: 'NappyBets',
    schemaVersion,
    exportedAt: exportedAt.toISOString(),
    count: predictions.length,
    predictions,
    settings,
    bankrollTransactions: transactions,
  };
}

export interface JsonParseResult {
  inputs: PredictionInput[];
  settings: AppSettings | null;
  transactions: BankrollTransactionInput[];
  errors: string[];
  skipped: number;
}

/** Aceita tanto o bundle completo quanto um array de previsões. */
export function parseImportJson(text: string): JsonParseResult {
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { inputs: [], settings: null, transactions: [], errors: ['JSON inválido.'], skipped: 0 };
  }
  let list: unknown[] = [];
  let settings: AppSettings | null = null;
  let transactions: BankrollTransactionInput[] = [];
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.predictions)) list = obj.predictions;
    else if (Array.isArray(obj.rows)) list = obj.rows;
    else errors.push('O arquivo não contém a lista "predictions".');
    if (obj.settings && typeof obj.settings === 'object') {
      settings = { ...DEFAULT_SETTINGS, ...(obj.settings as Partial<AppSettings>) };
    }
    const rawTransactions = Array.isArray(obj.bankrollTransactions)
      ? obj.bankrollTransactions
      : Array.isArray(obj.transactions)
        ? obj.transactions
        : [];
    transactions = rawTransactions.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const item = raw as Record<string, unknown>;
      const type = item.type === 'withdrawal' ? 'withdrawal' : item.type === 'deposit' ? 'deposit' : null;
      const amount = Number(item.amount);
      const date = typeof item.date === 'string' ? item.date.slice(0, 10) : '';
      if (!type || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
      return [{ type, amount, date, note: typeof item.note === 'string' ? item.note : '' }];
    });
  } else {
    errors.push('Formato não reconhecido.');
  }

  const inputs: PredictionInput[] = [];
  let skipped = 0;
  list.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      skipped += 1;
      return;
    }
    const r = raw as Record<string, unknown>;
    const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
    const probability = Number(r.probability);
    const status = typeof r.status === 'string' && r.status in STATUS_LABEL ? (r.status as PredictionStatus) : 'pending';
    const subjectType = r.subjectType === 'player' ? 'player' : 'team';
    let eventDate = str(r.eventDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) eventDate = `${eventDate}T00:00`;
    else eventDate = eventDate.slice(0, 16);
    if (!str(r.sport) || !str(r.event) || !str(r.predictedResult) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(eventDate) || !Number.isFinite(probability)) {
      skipped += 1;
      errors.push(`Registro #${index + 1} ignorado: dados obrigatórios inválidos.`);
      return;
    }
    inputs.push({
      sport: str(r.sport).trim(),
      competition: str(r.competition).trim(),
      subject: str(r.subject).trim(),
      subjectType,
      event: str(r.event).trim(),
      eventDate,
      category: str(r.category).trim(),
      predictedResult: str(r.predictedResult).trim(),
      probability: Math.min(100, Math.max(0, probability)),
      stake: Number.isFinite(Number(r.stake)) ? Math.max(0, Number(r.stake)) : 0,
      odds: r.odds === null || r.odds === undefined || !Number.isFinite(Number(r.odds)) ? null : Number(r.odds),
      status,
      actualResult: str(r.actualResult),
      bookmaker: str(r.bookmaker),
      notes: str(r.notes),
      isDemo: Boolean(r.isDemo),
    });
  });

  return { inputs, settings, transactions, errors, skipped };
}

export { DEFAULT_SETTINGS };
