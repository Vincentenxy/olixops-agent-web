import { describe, expect, it, vi } from 'vitest';
import { createSessionStore } from './session';
import { draftKey, saveDraft, readDraft } from '../workbench/draft';
import { safeReturnPath } from './navigation';

export const testUser = { user_id: 'user-a', username: 'admin', name: '管理员', is_admin: true };
function envelope(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      code: status === 200 ? 0 : status,
      msg: status === 200 ? '' : 'Unauthorized',
      data,
    }),
    { status },
  );
}
function loginResult(token = 'first') {
  return { access_token: token, token_type: 'bearer', expires_in: 900, user: testUser };
}
const parse = (data: unknown) => data;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Session lifecycle and concurrency', () => {
  it('shares initial restoration and stores no token in browser storage', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(envelope(loginResult())));
    vi.stubGlobal('fetch', fetchMock);
    const session = createSessionStore();
    await Promise.all([session.restore(), session.restore()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().user).toEqual(testUser);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it('treats missing refresh cookie as logged out but surfaces connectivity errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(null, 401)));
    const session = createSessionStore();
    await session.restore();
    expect(session.getSnapshot().status).toBe('anonymous');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed')));
    const disconnected = createSessionStore();
    await disconnected.restore();
    expect(disconnected.getSnapshot().status).toBe('error');
  });
  it('refreshes concurrent unauthorized requests once and retries using the new token', async () => {
    const refresh = deferred<Response>();
    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((path: string, init: RequestInit) => {
      if (path.endsWith('/login')) return Promise.resolve(envelope(loginResult()));
      if (path.endsWith('/refresh')) {
        refreshCalls += 1;
        return refresh.promise;
      }
      return Promise.resolve(
        new Headers(init.headers).get('Authorization') === 'Bearer second'
          ? envelope({ value: 'protected' })
          : envelope(null, 401),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const session = createSessionStore();
    await session.login('admin', 'test-password');
    const pending = Promise.all([
      session.request('/api/v1/example', { parse }),
      session.request('/api/v1/example', { parse }),
    ]);
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    refresh.resolve(envelope(loginResult('second')));
    await expect(pending).resolves.toEqual([{ value: 'protected' }, { value: 'protected' }]);
    expect(refreshCalls).toBe(1);
  });
  it('rejects account switches during refresh without replaying an old user request or returning stale data', async () => {
    const staleData = deferred<Response>();
    const otherUser = { user_id: 'user-b', username: 'other', name: '其他用户', is_admin: false };
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('/login')) return Promise.resolve(envelope(loginResult()));
      if (path.endsWith('/refresh'))
        return Promise.resolve(envelope({ ...loginResult('user-b-token'), user: otherUser }));
      if (path.endsWith('/stale')) return staleData.promise;
      return Promise.resolve(envelope(null, 401));
    });
    vi.stubGlobal('fetch', fetchMock);
    const session = createSessionStore();
    await session.login('admin', 'test-password');
    saveDraft(testUser.user_id, { repository: '', revision: 'main', requirement: 'User A draft' });
    const originalGeneration = session.getSnapshot().generation;
    const notifications: number[] = [];
    const unsubscribe = session.subscribe(() =>
      notifications.push(session.getSnapshot().generation),
    );
    const stale = session.request('/api/v1/stale', { parse }).catch((error: unknown) => error);
    await expect(
      session.request('/api/v1/example', {
        method: 'POST',
        body: { action: 'user-a-action' },
        parse,
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/example')).toHaveLength(1);
    expect(session.getSnapshot()).toMatchObject({
      status: 'anonymous',
      user: null,
      generation: originalGeneration + 1,
    });
    expect(notifications).toContain(originalGeneration + 1);
    expect(readDraft(testUser.user_id)).toBeNull();
    staleData.resolve(envelope({ private: 'User A data' }));
    expect(await stale).toMatchObject({ status: 401 });
    await expect(session.request('/api/v1/example', { parse })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    unsubscribe();
  });
  it('rejects a second 401 without looping and clears the expired session', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((path: string) =>
        Promise.resolve(
          path.endsWith('/login') || path.endsWith('/refresh')
            ? envelope(loginResult())
            : envelope(null, 401),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const session = createSessionStore();
    await session.login('admin', 'test-password');
    await expect(session.request('/api/v1/example', { parse })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(session.getSnapshot().status).toBe('anonymous');
  });
  it('waits for in-flight refresh before revoking cookie and cannot revive a logged out session', async () => {
    const refresh = deferred<Response>();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((path: string) => {
        calls.push(path);
        if (path.endsWith('/login')) return Promise.resolve(envelope(loginResult()));
        if (path.endsWith('/refresh')) return refresh.promise;
        if (path.endsWith('/logout')) return Promise.resolve(envelope(null));
        return Promise.resolve(envelope(null, 401));
      }),
    );
    const session = createSessionStore();
    await session.login('admin', 'test-password');
    saveDraft(testUser.user_id, { repository: '', revision: 'main', requirement: '私有草稿' });
    const pending = session.request('/api/v1/example', { parse }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(calls).toContain('/api/v1/pub/auth/refresh'));
    const logout = session.logout();
    expect(session.getSnapshot().status).toBe('anonymous');
    expect(localStorage.getItem(draftKey(testUser.user_id))).toBeNull();
    expect(calls).not.toContain('/api/v1/pub/auth/logout');
    refresh.resolve(envelope(loginResult('late')));
    await logout;
    await pending;
    expect(calls.at(-1)).toBe('/api/v1/pub/auth/logout');
    expect(session.getSnapshot().user).toBeNull();
  });
  it('waits for a pending login before logout and discards late identity', async () => {
    const login = deferred<Response>();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((path: string) => {
        calls.push(path);
        return path.endsWith('/login') ? login.promise : Promise.resolve(envelope(null));
      }),
    );
    const session = createSessionStore();
    const pending = session.login('admin', 'test-password').catch((error: unknown) => error);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const logout = session.logout();
    login.resolve(envelope(loginResult()));
    await pending;
    await logout;
    expect(session.getSnapshot().user).toBeNull();
    expect(calls.at(-1)).toBe('/api/v1/pub/auth/logout');
  });
  it('never returns protected data that finishes after logout', async () => {
    const data = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((path: string) =>
          path.endsWith('/login')
            ? Promise.resolve(envelope(loginResult()))
            : path.endsWith('/logout')
              ? Promise.resolve(envelope(null))
              : data.promise,
        ),
    );
    const session = createSessionStore();
    await session.login('admin', 'test-password');
    const pending = session.request('/api/v1/example', { parse });
    await session.logout();
    data.resolve(envelope({ private: true }));
    await expect(pending).rejects.toMatchObject({ status: 401 });
  });
  it('clears sessions and user drafts on a successful password change', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((path: string) =>
          Promise.resolve(path.endsWith('/login') ? envelope(loginResult()) : envelope(null)),
        ),
    );
    const session = createSessionStore();
    await session.login('admin', 'test-password');
    saveDraft(testUser.user_id, { repository: '', revision: 'main', requirement: 'draft' });
    await session.changePassword('old-password', 'new-test-password');
    expect(session.getSnapshot().notice).toBe('密码已更新，请使用新密码登录');
    expect(session.getSnapshot().status).toBe('anonymous');
    expect(readDraft(testUser.user_id)).toBeNull();
  });
  it('does not restore from a remaining cookie after logout fails, and sends the captured bearer to revoke', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((path: string) =>
        path.endsWith('/login')
          ? Promise.resolve(envelope(loginResult()))
          : Promise.reject(new TypeError('offline')),
      );
    vi.stubGlobal('fetch', fetchMock);
    const session = createSessionStore();
    await session.login('admin', 'test-password');
    await expect(session.logout()).rejects.toThrow('无法连接后端服务');
    const logoutOptions: RequestInit = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(logoutOptions.headers).get('Authorization')).toBe('Bearer first');
    await expect(session.request('/api/v1/example', { parse })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().error).toContain('重试退出');
    expect(session.getSnapshot().status).toBe('anonymous');
  });
  it('keeps drafts isolated by user and does not migrate an unowned legacy draft', () => {
    localStorage.setItem('olixops:deployment-draft:v1', JSON.stringify({ private: true }));
    saveDraft('user-a', { repository: '', revision: 'main', requirement: 'A only' });
    expect(readDraft('user-b')).toBeNull();
    expect(readDraft('user-a')?.draft.requirement).toBe('A only');
  });
  it.each(['//evil.example', '/\\evil.example', '/%2fevil', '/login', 'https://evil.example'])(
    'rejects unsafe post-login destinations: %s',
    (from) => {
      expect(safeReturnPath({ from })).toBe('/');
    },
  );
  it('preserves an internal protected destination', () => {
    expect(safeReturnPath({ from: '/account' })).toBe('/account');
  });
});
