/**
 * Cliente HTTP com timeout, espaçamento entre requisições e retentativas
 * para 429/5xx (respeitando Retry-After). Usado apenas em leituras públicas
 * e endpoints autenticados das integrações.
 */

export interface JsonRequest {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpClient {
  json<T = unknown>(url: string, request?: JsonRequest): Promise<T>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function friendlyStatus(status: number, body: string): string {
  const detail = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (status === 401 || status === 403) return 'Credenciais rejeitadas pela plataforma.';
  if (status === 404) return 'Recurso não encontrado na API.';
  if (status === 409) return 'Requisição conflitante na API.';
  if (status === 429) return 'Limite de requisições da plataforma atingido.';
  if (status >= 500) return 'Serviço da plataforma indisponível no momento.';
  return detail ? `Resposta ${status}: ${detail}` : `Resposta HTTP ${status}.`;
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(15_000, seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(15_000, Math.max(0, date - Date.now()));
  return null;
}

export interface HttpClientOptions {
  minIntervalMs?: number;
  maxRetries?: number;
  userAgent?: string;
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const minIntervalMs = options.minIntervalMs ?? 180;
  const maxRetries = options.maxRetries ?? 3;
  const userAgent = options.userAgent ?? 'NappyBets/1.0 (análise; somente leitura)';
  let lastRequestAt = 0;

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function request<T>(url: string, req: JsonRequest, attempt: number): Promise<T> {
    const spacing = minIntervalMs - (Date.now() - lastRequestAt);
    if (spacing > 0) await wait(spacing);
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 20_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: req.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent,
          ...req.headers,
        },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (attempt < maxRetries) {
        await wait(900 * 2 ** attempt);
        return request<T>(url, req, attempt + 1);
      }
      throw new HttpError(
        0,
        isAbort
          ? 'Tempo esgotado ao consultar a plataforma. Verifique sua conexão.'
          : 'Não foi possível conectar à plataforma. Verifique sua conexão e tente novamente.',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxRetries) {
        const delay =
          retryAfterMs(response.headers.get('retry-after')) ?? Math.min(8000, 900 * 2 ** attempt);
        await wait(delay);
        return request<T>(url, req, attempt + 1);
      }
      throw new HttpError(response.status, friendlyStatus(response.status, body));
    }

    const text = await response.text();
    if (!text.trim()) return null as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new HttpError(response.status, 'A plataforma retornou uma resposta inválida.');
    }
  }

  return {
    json: <T,>(url: string, req: JsonRequest = {}) => request<T>(url, req, 0),
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
