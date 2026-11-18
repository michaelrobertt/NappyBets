import { describe, expect, it } from 'vitest';
import type { Prediction } from '../src/shared/types';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import {
  createExportBundle,
  csvToPredictions,
  parseCsv,
  parseImportJson,
  predictionsToCsv,
} from '../src/shared/csv';

const row: Prediction = {
  id: 'abc',
  sport: 'League of Legends',
  competition: 'CBLOL',
  subjectType: 'team',
  subject: 'LOUD',
  event: 'LOUD vs paiN Gaming',
  eventDate: '2026-02-10T18:30',
  category: 'Vencedor da partida',
  predictedResult: 'Vitória LOUD',
  probability: 62.5,
  stake: 50,
  odds: 1.85,
  status: 'hit',
  actualResult: '2-1',
  bookmaker: 'Betano',
  notes: 'Observação com "aspas"; ponto e vírgula\ne quebra de linha.',
  isDemo: false,
  createdAt: '2026-02-01T10:00:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
};

describe('CSV', () => {
  it('exporta com cabeçalho em português e BOM', () => {
    const csv = predictionsToCsv([row]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Data;Hora;Modalidade;Competição');
    expect(csv).toContain('10/02/2026');
    expect(csv).toContain('18:30');
  });

  it('faz round-trip preservando campos, aspas e quebras de linha', () => {
    const csv = predictionsToCsv([row]);
    const parsed = csvToPredictions(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.inputs).toHaveLength(1);
    const [input] = parsed.inputs;
    expect(input!.eventDate).toBe('2026-02-10T18:30');
    expect(input!.probability).toBe(62.5);
    expect(input!.stake).toBe(50);
    expect(input!.odds).toBe(1.85);
    expect(input!.status).toBe('hit');
    expect(input!.actualResult).toBe('2-1');
    expect(input!.notes).toBe(row.notes);
    expect(input!.subjectType).toBe('team');
  });

  it('aceita CSV com vírgula e cabeçalhos em inglês', () => {
    const csv = [
      'date,time,sport,competition,subject,event,market,prediction,probability,status',
      '2026-03-01,20:00,CS2,BLAST Premier,Vitality,Vitality vs FaZe,Total de rounds,Mais de 26.5,58,Acertou',
      '2026-03-02,21:00,CS2,IEM,NAVI,NAVI vs MOUZ,Vencedor,Vitória NAVI,71,Pendente',
    ].join('\n');
    const parsed = csvToPredictions(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.inputs).toHaveLength(2);
    expect(parsed.inputs[0]!.sport).toBe('CS2');
    expect(parsed.inputs[0]!.status).toBe('hit');
    expect(parsed.inputs[1]!.probability).toBe(71);
    expect(parsed.inputs[1]!.status).toBe('pending');
  });

  it('rejeita linhas com data ou probabilidade inválidas sem interromper as válidas', () => {
    const csv = [
      'Data;Hora;Modalidade;Competição;Tipo;Time/Jogador;Evento;Categoria;Resultado previsto;Probabilidade (%);Status;Resultado real;Casa de referência;Observações',
      '31/02/2026;18:00;CS2;IEM;Time;NAVI;NAVI vs MOUZ;Vencedor;Vitória NAVI;60;Pendente;;;',
      '2026-02-10;18:00;CS2;IEM;Time;NAVI;NAVI vs Spirit;Vencedor;Vitória NAVI;150;Pendente;;;',
      '2026-02-11;18:00;CS2;IEM;Time;NAVI;NAVI vs G2;Vencedor;Vitória NAVI;64;Pendente;;;',
    ].join('\n');
    const parsed = csvToPredictions(csv);
    expect(parsed.inputs).toHaveLength(1);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.inputs[0]!.event).toBe('NAVI vs G2');
  });

  it('interpreta CSV simples com campos vazios', () => {
    const parsed = parseCsv('a;b;c\r\n1;;3\r\n');
    expect(parsed).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('JSON', () => {
  it('exporta e reimporta bundle com configurações', () => {
    const bundle = JSON.parse(
      JSON.stringify(
        createExportBundle(
          [row],
          { ...DEFAULT_SETTINGS, profileName: 'Kelly', minSample: 12, initialBankroll: 1000 },
          1,
          [
            {
              id: 'tx-1',
              type: 'withdrawal',
              amount: 200,
              date: '2026-02-01',
              note: 'Saque',
              createdAt: '2026-02-01T12:00:00.000Z',
            },
          ],
          new Date('2026-02-01T00:00:00.000Z'),
        ),
      ),
    );
    const parsed = parseImportJson(JSON.stringify(bundle));
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.inputs).toHaveLength(1);
    expect(parsed.inputs[0]!.sport).toBe('League of Legends');
    expect(parsed.inputs[0]!.status).toBe('hit');
    expect(parsed.settings?.profileName).toBe('Kelly');
    expect(parsed.settings?.minSample).toBe(12);
    expect(parsed.settings?.initialBankroll).toBe(1000);
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0]!.type).toBe('withdrawal');
    expect(parsed.transactions[0]!.amount).toBe(200);
  });

  it('aceita array simples e ignora registros inválidos', () => {
    const parsed = parseImportJson(
      JSON.stringify([
        {
          sport: 'CS2',
          competition: 'Major',
          subject: 'Spirit',
          event: 'Spirit vs MOUZ',
          eventDate: '2026-04-01T12:00',
          category: 'Mapas',
          predictedResult: 'Vitória Spirit',
          probability: 55,
          status: 'miss',
        },
        { sport: 'CS2' },
      ]),
    );
    expect(parsed.inputs).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
    expect(parsed.errors).toHaveLength(1);
  });

  it('rejeita JSON inválido com mensagem clara', () => {
    const parsed = parseImportJson('{ não é json');
    expect(parsed.inputs).toHaveLength(0);
    expect(parsed.errors[0]).toMatch(/JSON inválido/);
  });
});
