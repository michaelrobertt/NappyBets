import type { Database } from 'sql.js';
import type {
  ExternalMarket,
  ExternalMarketStatus,
  ExternalMarketsQuery,
  ExternalPlatform,
  ExternalPosition,
  ExternalPositionsQuery,
} from '../src/shared/external';

type Row = Record<string, any>;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToMarket(row: Row): ExternalMarket {
  return {
    platform: row.platform,
    id: String(row.id),
    conditionId: String(row.condition_id ?? ''),
    tokenIds: parseJson<string[]>(row.token_ids, []),
    eventId: String(row.event_id ?? ''),
    eventTitle: String(row.event_title ?? ''),
    eventSubtitle: String(row.event_subtitle ?? ''),
    eventSlug: String(row.event_slug ?? ''),
    title: String(row.title ?? ''),
    subtitle: String(row.subtitle ?? ''),
    sport: String(row.sport ?? 'Outros'),
    isEsports: Number(row.is_esports ?? 0) === 1,
    kind: row.kind ?? 'other',
    status: row.status ?? 'live',
    outcomes: parseJson(row.outcomes, []),
    volume: row.volume === null ? null : Number(row.volume),
    liquidity: row.liquidity === null ? null : Number(row.liquidity),
    openInterest: row.open_interest === null ? null : Number(row.open_interest),
    closesAt: row.closes_at ?? null,
    result: row.result ?? null,
    url: String(row.url ?? ''),
    image: String(row.image ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function rowToPosition(row: Row): ExternalPosition {
  return {
    platform: row.platform,
    id: String(row.id),
    marketId: String(row.market_id ?? ''),
    tokenId: String(row.token_id ?? ''),
    eventTitle: String(row.event_title ?? ''),
    marketTitle: String(row.market_title ?? ''),
    outcome: String(row.outcome ?? ''),
    status: row.status === 'closed' ? 'closed' : 'open',
    stake: Number(row.stake ?? 0),
    currentValue: Number(row.current_value ?? 0),
    pnl: Number(row.pnl ?? 0),
    size: Number(row.size ?? 0),
    avgPrice: row.avg_price === null ? null : Number(row.avg_price),
    curPrice: row.cur_price === null ? null : Number(row.cur_price),
    won: row.won === null ? null : Number(row.won) === 1,
    openedAt: row.opened_at ?? null,
    closedAt: row.closed_at ?? null,
    url: String(row.url ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export interface ExternalStateRow {
  platform: ExternalPlatform;
  lastSyncAt: string | null;
  lastError: string | null;
  marketsCount: number;
  positionsCount: number;
}

export class ExternalStore {
  constructor(
    private readonly db: Database,
    private readonly flush: () => void,
  ) {}

  upsertMarkets(markets: ExternalMarket[]): number {
    if (!markets.length) return 0;
    const stmt = this.db.prepare(`
      INSERT INTO ext_markets (
        platform, id, condition_id, token_ids, event_id, event_title, event_subtitle, event_slug,
        title, subtitle, sport, is_esports, kind, status, outcomes, volume, liquidity, open_interest,
        closes_at, result, url, image, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(platform, id) DO UPDATE SET
        condition_id = excluded.condition_id,
        token_ids = excluded.token_ids,
        event_id = excluded.event_id,
        event_title = excluded.event_title,
        event_subtitle = excluded.event_subtitle,
        event_slug = excluded.event_slug,
        title = excluded.title,
        subtitle = excluded.subtitle,
        sport = excluded.sport,
        is_esports = excluded.is_esports,
        kind = excluded.kind,
        status = excluded.status,
        outcomes = excluded.outcomes,
        volume = excluded.volume,
        liquidity = excluded.liquidity,
        open_interest = excluded.open_interest,
        closes_at = excluded.closes_at,
        result = excluded.result,
        url = excluded.url,
        image = excluded.image,
        updated_at = excluded.updated_at
    `);
    this.db.run('BEGIN');
    try {
      for (const market of markets) {
        stmt.run([
          market.platform,
          market.id,
          market.conditionId,
          JSON.stringify(market.tokenIds),
          market.eventId,
          market.eventTitle,
          market.eventSubtitle,
          market.eventSlug,
          market.title,
          market.subtitle,
          market.sport,
          market.isEsports ? 1 : 0,
          market.kind,
          market.status,
          JSON.stringify(market.outcomes),
          market.volume,
          market.liquidity,
          market.openInterest,
          market.closesAt,
          market.result,
          market.url,
          market.image,
          market.updatedAt,
        ]);
      }
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    } finally {
      stmt.free();
    }
    this.retainMarkets(markets[0]!.platform);
    this.flush();
    return markets.length;
  }

  private retainMarkets(platform: ExternalPlatform): void {
    try {
      this.db.run(
        `DELETE FROM ext_markets WHERE platform = ? AND id NOT IN (
           SELECT id FROM ext_markets WHERE platform = ? ORDER BY updated_at DESC, id ASC LIMIT 3000
         )`,
        [platform, platform],
      );
    } catch {
      /* retenção é best-effort */
    }
  }

  /** Remove mercados que não são de esports (usado quando a opção é ativada). */
  pruneNonEsports(platform: ExternalPlatform): number {
    this.db.run('DELETE FROM ext_markets WHERE platform = ? AND is_esports = 0', [platform]);
    const changed = this.db.getRowsModified();
    if (changed > 0) this.flush();
    return changed;
  }

  /** Mercados que deixaram de aparecer na coleta e já passaram do horário de fechamento. */
  markStaleLive(platform: ExternalPlatform, collectedBefore: string): number {
    this.db.run(
      `UPDATE ext_markets
         SET status = 'pending'
       WHERE platform = ? AND status = 'live'
         AND closes_at IS NOT NULL AND closes_at < ?
         AND updated_at < ?`,
      [platform, new Date().toISOString(), collectedBefore],
    );
    const changed = this.db.getRowsModified();
    if (changed > 0) this.flush();
    return changed;
  }

  upsertPositions(positions: ExternalPosition[]): number {
    if (!positions.length) return 0;
    const stmt = this.db.prepare(`
      INSERT INTO ext_positions (
        platform, id, market_id, token_id, event_title, market_title, outcome, status,
        stake, current_value, pnl, size, avg_price, cur_price, won, opened_at, closed_at, url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(platform, id) DO UPDATE SET
        market_id = excluded.market_id,
        token_id = excluded.token_id,
        event_title = excluded.event_title,
        market_title = excluded.market_title,
        outcome = excluded.outcome,
        status = excluded.status,
        stake = excluded.stake,
        current_value = excluded.current_value,
        pnl = excluded.pnl,
        size = excluded.size,
        avg_price = excluded.avg_price,
        cur_price = excluded.cur_price,
        won = excluded.won,
        opened_at = COALESCE(ext_positions.opened_at, excluded.opened_at),
        closed_at = COALESCE(excluded.closed_at, ext_positions.closed_at),
        url = excluded.url,
        updated_at = excluded.updated_at
    `);
    this.db.run('BEGIN');
    try {
      for (const position of positions) {
        stmt.run([
          position.platform,
          position.id,
          position.marketId,
          position.tokenId,
          position.eventTitle,
          position.marketTitle,
          position.outcome,
          position.status,
          position.stake,
          position.currentValue,
          position.pnl,
          position.size,
          position.avgPrice,
          position.curPrice,
          position.won === null ? null : position.won ? 1 : 0,
          position.openedAt,
          position.closedAt,
          position.url,
          position.updatedAt,
        ]);
      }
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    } finally {
      stmt.free();
    }
    this.flush();
    return positions.length;
  }

  listMarkets(query: ExternalMarketsQuery): ExternalMarket[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.platform !== 'all') {
      where.push('platform = ?');
      params.push(query.platform);
    }
    if (query.status !== 'all') {
      where.push('status = ?');
      params.push(query.status);
    }
    if (query.sport) {
      where.push('sport = ?');
      params.push(query.sport);
    }
    if (query.esportsOnly) {
      where.push('is_esports = 1');
    }
    if (query.search.trim()) {
      where.push('(LOWER(title) LIKE ? OR LOWER(event_title) LIKE ?)');
      const term = `%${query.search.trim().toLowerCase()}%`;
      params.push(term, term);
    }
    const sql = `SELECT * FROM ext_markets ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY is_esports DESC,
        CASE status WHEN 'live' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        COALESCE(closes_at, '9999') ASC
      LIMIT ?`;
    params.push(Math.max(1, Math.min(5000, query.limit || 600)));
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: ExternalMarket[] = [];
    while (stmt.step()) rows.push(rowToMarket(stmt.getAsObject()));
    stmt.free();
    return rows;
  }

  getMarket(platform: ExternalPlatform, id: string): ExternalMarket | null {
    const stmt = this.db.prepare('SELECT * FROM ext_markets WHERE platform = ? AND id = ?');
    stmt.bind([platform, id]);
    const market = stmt.step() ? rowToMarket(stmt.getAsObject()) : null;
    stmt.free();
    return market;
  }

  listMarketsForPositions(platform: ExternalPlatform): Map<string, ExternalMarket> {
    const stmt = this.db.prepare('SELECT * FROM ext_markets WHERE platform = ?');
    stmt.bind([platform]);
    const map = new Map<string, ExternalMarket>();
    while (stmt.step()) {
      const market = rowToMarket(stmt.getAsObject());
      map.set(market.id, market);
      if (market.conditionId) map.set(market.conditionId, market);
    }
    stmt.free();
    return map;
  }

  listPositions(query: ExternalPositionsQuery): ExternalPosition[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.platform !== 'all') {
      where.push('platform = ?');
      params.push(query.platform);
    }
    if (query.status !== 'all') {
      where.push('status = ?');
      params.push(query.status);
    }
    if (query.search.trim()) {
      where.push('(LOWER(market_title) LIKE ? OR LOWER(event_title) LIKE ? OR LOWER(outcome) LIKE ?)');
      const term = `%${query.search.trim().toLowerCase()}%`;
      params.push(term, term, term);
    }
    const sql = `SELECT * FROM ext_positions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, COALESCE(closed_at, updated_at) DESC
      LIMIT ?`;
    params.push(Math.max(1, Math.min(2000, query.limit || 500)));
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: ExternalPosition[] = [];
    while (stmt.step()) rows.push(rowToPosition(stmt.getAsObject()));
    stmt.free();
    return rows;
  }

  counts(platform?: ExternalPlatform): { markets: number; positions: number } {
    const count = (table: string): number => {
      const stmt = this.db.prepare(
        `SELECT COUNT(*) AS n FROM ${table} ${platform ? 'WHERE platform = ?' : ''}`,
      );
      if (platform) stmt.bind([platform]);
      const value = stmt.step() ? Number(stmt.getAsObject().n ?? 0) : 0;
      stmt.free();
      return value;
    };
    return { markets: count('ext_markets'), positions: count('ext_positions') };
  }

  getState(platform: ExternalPlatform): ExternalStateRow {
    const stmt = this.db.prepare('SELECT * FROM ext_state WHERE platform = ?');
    stmt.bind([platform]);
    let state: ExternalStateRow = {
      platform,
      lastSyncAt: null,
      lastError: null,
      marketsCount: 0,
      positionsCount: 0,
    };
    if (stmt.step()) {
      const row = stmt.getAsObject();
      state = {
        platform,
        lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
        lastError: row.last_error ? String(row.last_error) : null,
        marketsCount: Number(row.markets_count ?? 0),
        positionsCount: Number(row.positions_count ?? 0),
      };
    }
    stmt.free();
    return state;
  }

  setState(platform: ExternalPlatform, patch: Partial<Omit<ExternalStateRow, 'platform'>>): ExternalStateRow {
    const current = this.getState(platform);
    const next: ExternalStateRow = { ...current, ...patch, platform };
    const stmt = this.db.prepare(`
      INSERT INTO ext_state (platform, last_sync_at, last_error, markets_count, positions_count)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(platform) DO UPDATE SET
        last_sync_at = excluded.last_sync_at,
        last_error = excluded.last_error,
        markets_count = excluded.markets_count,
        positions_count = excluded.positions_count
    `);
    stmt.run([platform, next.lastSyncAt, next.lastError, next.marketsCount, next.positionsCount]);
    stmt.free();
    this.flush();
    return next;
  }

  sports(): string[] {
    const stmt = this.db.prepare(
      "SELECT DISTINCT sport FROM ext_markets WHERE sport <> '' ORDER BY is_esports DESC, sport ASC",
    );
    const list: string[] = [];
    while (stmt.step()) list.push(String(stmt.getAsObject().sport));
    stmt.free();
    return list;
  }
}

export type { ExternalMarketStatus };
