import { ApiError, createApiClient, type RequestOptions } from '../../lib/api/client';
import { removeDraft } from '../workbench/draft';

export interface User {
  user_id: string;
  username: string;
  name: string;
  is_admin: boolean;
}
interface LoginResult {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: User;
}
export interface SessionSnapshot {
  status: 'loading' | 'anonymous' | 'authenticated' | 'error';
  user: User | null;
  generation: number;
  error: string | null;
  notice: string | null;
}
export function parseUser(value: unknown): User {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('user_id' in value) ||
    typeof value.user_id !== 'string' ||
    !value.user_id ||
    !('username' in value) ||
    typeof value.username !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('is_admin' in value) ||
    typeof value.is_admin !== 'boolean'
  ) {
    throw new Error('Invalid user response');
  }
  return {
    user_id: value.user_id,
    username: value.username,
    name: value.name,
    is_admin: value.is_admin,
  };
}
function parseLogin(value: unknown): LoginResult {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('access_token' in value) ||
    typeof value.access_token !== 'string' ||
    !value.access_token ||
    !('token_type' in value) ||
    value.token_type !== 'bearer' ||
    !('expires_in' in value) ||
    typeof value.expires_in !== 'number' ||
    value.expires_in <= 0 ||
    !('user' in value)
  )
    throw new Error('Invalid login response');
  return {
    access_token: value.access_token,
    token_type: value.token_type,
    expires_in: value.expires_in,
    user: parseUser(value.user),
  };
}
export function parseNull(value: unknown): null {
  if (value !== null) throw new Error('Invalid empty response');
  return null;
}
const changed = () => new ApiError('会话已变更，请重新登录', 401, 401);

// One store per browser application: StrictMode remounts share restore and refresh flights.
export function createSessionStore() {
  let state: SessionSnapshot = {
    status: 'loading',
    user: null,
    generation: 0,
    error: null,
    notice: null,
  };
  let token: string | undefined;
  let epoch = 0;
  let restored = false;
  let refreshFlight: Promise<void> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const raw = createApiClient(() => token);
  function publish(next: Partial<SessionSnapshot>) {
    state = { ...state, ...next, generation: epoch };
    listeners.forEach((listener) => listener());
  }
  function clear(notice: string | null = null) {
    const previous = state.user;
    epoch += 1;
    token = undefined;
    if (previous) {
      try {
        removeDraft(previous.user_id);
      } catch {
        /* Storage denial cannot preserve a session. */
      }
    }
    publish({ status: 'anonymous', user: null, error: null, notice });
  }
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }
  function apply(result: LoginResult, generation: number) {
    if (generation !== epoch) throw changed();
    token = result.access_token;
    publish({ status: 'authenticated', user: result.user, error: null, notice: null });
  }
  function refresh(): Promise<void> {
    if (refreshFlight) return refreshFlight;
    const generation = epoch;
    const initiatingUserId = state.user?.user_id;
    const flight = serial(async () => {
      const result = await raw('/api/v1/pub/auth/refresh', {
        method: 'POST',
        body: {},
        parse: parseLogin,
      });
      if (generation !== epoch) throw changed();
      if (initiatingUserId && result.user.user_id !== initiatingUserId) {
        clear('浏览器中的登录账号已变更，请重新登录');
        throw changed();
      }
      apply(result, generation);
    }).catch((error: unknown) => {
      if (generation === epoch && error instanceof ApiError && error.status === 401)
        clear(state.user ? '登录已过期，请重新登录' : null);
      throw error;
    });
    refreshFlight = flight;
    void flight
      .finally(() => {
        if (refreshFlight === flight) refreshFlight = undefined;
      })
      .catch(() => undefined);
    return flight;
  }
  async function restore() {
    if (restored) return refreshFlight?.catch(() => undefined);
    restored = true;
    const generation = epoch;
    try {
      await refresh();
    } catch (error) {
      if (generation !== epoch) return;
      publish({
        status: 'error',
        error: error instanceof Error ? error.message : '无法恢复登录状态',
      });
    }
  }
  async function request<T>(path: `/api/v1/${string}`, options: RequestOptions<T>): Promise<T> {
    if (!path.startsWith('/api/v1/pub/') && (!token || state.status !== 'authenticated'))
      throw changed();
    const generation = epoch;
    const originalToken = token;
    try {
      const result = await raw(path, options);
      if (generation !== epoch) throw changed();
      return result;
    } catch (error) {
      if (generation !== epoch || options.signal?.aborted) throw error;
      if (!(error instanceof ApiError) || error.status !== 401 || path.startsWith('/api/v1/pub/'))
        throw error;
      if (originalToken === token) await refresh();
      if (generation !== epoch || !token) throw changed();
      try {
        const result = await raw(path, options);
        if (generation !== epoch) throw changed();
        return result;
      } catch (retryError) {
        if (generation === epoch && retryError instanceof ApiError && retryError.status === 401)
          clear('登录已过期，请重新登录');
        throw retryError;
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    restore,
    async retryRestore() {
      restored = false;
      publish({ status: 'loading', error: null });
      await restore();
    },
    request,
    async login(username: string, password: string) {
      clear();
      restored = true;
      const generation = epoch;
      const result = await serial(() =>
        raw('/api/v1/pub/auth/login', {
          method: 'POST',
          body: { username, password },
          parse: parseLogin,
        }),
      );
      apply(result, generation);
    },
    async logout() {
      const logoutToken = token;
      const logoutRequest = createApiClient(() => logoutToken);
      clear('正在退出登录…');
      const generation = epoch;
      try {
        await serial(() =>
          logoutRequest('/api/v1/pub/auth/logout', {
            method: 'POST',
            auth: 'optional',
            body: {},
            parse: parseNull,
          }),
        );
        if (generation === epoch) publish({ notice: '已退出登录', error: null });
      } catch (error) {
        if (generation === epoch)
          publish({ notice: null, error: '退出请求未完成，请重试退出以撤销浏览器会话' });
        throw error;
      }
    },
    async changePassword(currentPassword: string, newPassword: string) {
      await request('/api/v1/auth/password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
        parse: parseNull,
      });
      clear('密码已更新，请使用新密码登录');
    },
  };
}
export type SessionStore = ReturnType<typeof createSessionStore>;
export const session = createSessionStore();
