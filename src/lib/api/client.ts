export interface ApiEnvelope {
  code: number;
  msg: string;
  data: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  parse: (data: unknown) => T;
}

function isEnvelope(value: unknown): value is ApiEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'number' &&
    'msg' in value &&
    typeof value.msg === 'string' &&
    'data' in value
  );
}

// Authentication adapters supply a short-lived token in memory; public calls never receive it.
export function createApiClient(getToken: () => string | undefined = () => undefined) {
  return async function request<T>(
    path: `/api/v1/${string}`,
    options: RequestOptions<T>,
  ): Promise<T> {
    if (path.includes('..') || path.includes('\\') || path.includes('?') || path.includes('#')) {
      throw new ApiError('接口路径无效');
    }
    const headers = new Headers({
      Accept: 'application/json',
      'X-Request-Id': Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    });
    if (!path.startsWith('/api/v1/pub/')) {
      const token = getToken();
      if (!token) throw new ApiError('请先完成登录认证', 401, 401);
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (options.body !== undefined) {
      if (options.method !== 'POST') throw new ApiError('带参数的请求必须使用 POST');
      headers.set('Content-Type', 'application/json');
    }
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(path, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
      });
      const requestId = response.headers.get('X-Request-Id') ?? undefined;
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ApiError(
          response.ok ? '接口未返回有效的 JSON 响应' : `请求失败（HTTP ${response.status}）`,
          response.status,
          undefined,
          requestId,
        );
      }
      if (!response.ok) {
        throw new ApiError(
          isEnvelope(payload) ? payload.msg : `请求失败（HTTP ${response.status}）`,
          response.status,
          response.status,
          requestId,
        );
      }
      if (!isEnvelope(payload))
        throw new ApiError('接口响应不符合约定格式', response.status, undefined, requestId);
      if (payload.code !== 0)
        throw new ApiError(payload.msg || '请求未完成', response.status, payload.code, requestId);
      try {
        return options.parse(payload.data);
      } catch {
        throw new ApiError('接口数据不符合约定格式', response.status, undefined, requestId);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted)
        throw new ApiError(options.signal?.aborted ? '请求已取消' : '连接超时，请稍后重试');
      throw new ApiError('无法连接后端服务，请检查服务和网络');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  };
}

export const api = createApiClient();
