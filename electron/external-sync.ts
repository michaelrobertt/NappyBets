import type { Store } from './store';
import { createHttpClient, errorMessage, type HttpClient } from './http';
import { fetchKalshiMarkets, fetchPolymarketMarkets } from './providers';
import type { ExternalPlatform, ExternalPlatformStatus, ExternalStatus, SyncReport } from '../src/shared/external';

const PLATFORMS: ExternalPlatform[] = ['polymarket', 'kalshi'];
const INTERVAL_MINUTES = 15;

/**
 * Sincroniza apenas mercados públicos. Não há conexão com conta, carteira ou
 * chave de API: nenhuma posição do usuário é lida e nenhuma ordem é enviada.
 */
export class ExternalSyncService {
  private readonly http: HttpClient;
  private readonly syncing = new Set<ExternalPlatform>();
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: Store,
    private readonly emit: (status: ExternalStatus) => void,
  ) {
    this.http = createHttpClient({ minIntervalMs: 220 });
  }

  status(): ExternalStatus {
    const build = (platform: ExternalPlatform): ExternalPlatformStatus => {
      const state = this.store.external.getState(platform);
      const counts = this.store.external.counts(platform);
      return {
        platform,
        configured: false,
        marketsConfigured: true,
        walletMasked: null,
        environment: 'production',
        lastSyncAt: state.lastSyncAt,
        lastError: state.lastError,
        marketCount: state.marketsCount || counts.markets,
        positionCount: 0,
      };
    };
    return {
      polymarket: build('polymarket'),
      kalshi: build('kalshi'),
      settings: { autoSync: true, intervalMinutes: INTERVAL_MINUTES, esportsOnly: false },
      syncing: [...this.syncing],
    };
  }

  private notify(): void {
    try {
      this.emit(this.status());
    } catch {
      /* renderer pode estar fechado */
    }
  }

  async sync(platform: ExternalPlatform): Promise<SyncReport> {
    const report: SyncReport = {
      platform,
      markets: 0,
      positions: 0,
      errors: [],
      finishedAt: new Date().toISOString(),
    };
    if (this.syncing.has(platform)) {
      report.errors.push('Sincronização já em andamento para esta plataforma.');
      return report;
    }
    this.syncing.add(platform);
    const collectedBefore = new Date().toISOString();
    this.notify();

    try {
      const result =
        platform === 'polymarket' ? await fetchPolymarketMarkets(this.http) : await fetchKalshiMarkets(this.http);
      report.errors.push(...result.errors);
      report.markets = this.store.external.upsertMarkets(result.items);
    } catch (error) {
      report.errors.push(errorMessage(error));
    } finally {
      this.syncing.delete(platform);
      this.store.external.markStaleLive(platform, collectedBefore);
      const counts = this.store.external.counts(platform);
      this.store.external.setState(platform, {
        lastSyncAt: new Date().toISOString(),
        lastError: report.errors.length ? report.errors.slice(0, 3).join(' • ') : null,
        marketsCount: counts.markets,
        positionsCount: 0,
      });
      this.notify();
    }

    report.finishedAt = new Date().toISOString();
    return report;
  }

  async syncAll(): Promise<SyncReport[]> {
    const reports: SyncReport[] = [];
    for (const platform of PLATFORMS) {
      reports.push(await this.sync(platform));
    }
    return reports;
  }

  restartSchedule(): void {
    this.stop();
    this.startupTimer = setTimeout(() => {
      void this.autoSync();
    }, 6000);
    this.timer = setInterval(() => {
      void this.autoSync();
    }, INTERVAL_MINUTES * 60_000);
  }

  private async autoSync(): Promise<void> {
    if (this.syncing.size > 0) return;
    const intervalMs = INTERVAL_MINUTES * 60_000;
    for (const platform of PLATFORMS) {
      const state = this.store.external.getState(platform);
      const stale = !state.lastSyncAt || Date.now() - new Date(state.lastSyncAt).getTime() >= intervalMs;
      if (!stale) continue;
      await this.sync(platform);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.timer = null;
    this.startupTimer = null;
  }
}
