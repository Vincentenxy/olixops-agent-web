import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';
import { parseHealth } from '../../features/connection/useConnection';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'test-request' },
  });
}

function mockFetch(result: Response) {
  const fetchMock = vi.fn().mockResolvedValue(result);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const publicPath = '/api/v1/pub/health';
const parse = (value: unknown) => value;

describe('API client contract', () => {
  it('unwraps validated data and keeps authentication off public requests', async () => {
    const fetchMock = mockFetch(response({ code: 0, msg: '', data: { status: 'ok' } }));
    const client = createApiClient(() => 'memory-token');
    await expect(client(publicPath, { parse: parseHealth })).resolves.toEqual({ status: 'ok' });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).has('Authorization')).toBe(false);
    expect(options.credentials).toBe('same-origin');
    expect(new Headers(options.headers).get('X-Olixops-Client')).toBe('web');
  });

  it('stops protected requests before network access when unauthenticated', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createApiClient()('/api/v1/tasks', { parse })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('injects the latest token only when a protected request is made', async () => {
    const fetchMock = mockFetch(response({ code: 0, msg: '', data: null }));
    await createApiClient(() => 'session-token')('/api/v1/tasks', {
      method: 'POST',
      body: { cursor: 'next' },
      parse,
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer session-token');
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({ cursor: 'next' });
  });

  it('rejects business failures even when HTTP status is 200', async () => {
    mockFetch(response({ code: 10001, msg: '目标环境不可用', data: null }));
    await expect(createApiClient()(publicPath, { parse })).rejects.toMatchObject({
      code: 10001,
      status: 200,
      message: '目标环境不可用',
      requestId: 'test-request',
    });
  });

  it('rejects HTTP failures even when a payload claims success', async () => {
    mockFetch(response({ code: 0, msg: 'Service Unavailable', data: null }, 503));
    await expect(createApiClient()(publicPath, { parse })).rejects.toMatchObject({
      code: 503,
      status: 503,
    });
  });

  it('handles non-JSON proxy failures', async () => {
    mockFetch(new Response('<html>Bad Gateway</html>', { status: 502 }));
    await expect(createApiClient()(publicPath, { parse })).rejects.toMatchObject({
      status: 502,
      message: '请求失败（HTTP 502）',
    });
  });

  it('does not treat an unrelated JSON or an invalid health body as healthy', async () => {
    mockFetch(response({ status: 'ok' }));
    await expect(createApiClient()(publicPath, { parse: parseHealth })).rejects.toThrow(
      '接口响应不符合约定格式',
    );
    mockFetch(response({ code: 0, msg: '', data: { status: 'failed' } }));
    await expect(createApiClient()(publicPath, { parse: parseHealth })).rejects.toThrow(
      '接口数据不符合约定格式',
    );
  });

  it('normalizes network errors without leaking transport internals', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(createApiClient()(publicPath, { parse })).rejects.toThrow('无法连接后端服务');
  });

  it('cancels fetch when its caller aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_path: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const controller = new AbortController();
    const pending = createApiClient()(publicPath, { signal: controller.signal, parse });
    controller.abort();
    await expect(pending).rejects.toEqual(new ApiError('请求已取消'));
  });
});
