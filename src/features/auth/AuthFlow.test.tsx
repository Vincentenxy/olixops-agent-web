import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import AuthGate from './AuthGate';
import LoginPage from './LoginPage';
import AccountPage from './AccountPage';
import { useAuth } from './context';
import { createSessionStore, type SessionStore } from './session';
import { draftKey, saveDraft } from '../workbench/draft';

const userData = { user_id: 'user-a', username: 'admin', name: '管理员', is_admin: true };
function result(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      code: status === 200 ? 0 : status,
      msg: status === 200 ? '' : 'Unauthorized',
      data,
    }),
    { status },
  );
}
function loggedIn() {
  return result({
    access_token: 'test-access',
    token_type: 'bearer',
    expires_in: 900,
    user: userData,
  });
}
function Home() {
  const auth = useAuth();
  return (
    <div>
      <h1>已登录工作空间</h1>
      <span>{auth.user?.username}</span>
      <button
        onClick={() => {
          void auth.session.logout();
        }}
      >
        退出登录
      </button>
    </div>
  );
}
function renderFlow(
  path = '/',
  session: SessionStore = createSessionStore(),
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const view = render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <AuthProvider session={session}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AuthGate />}>
                <Route path="/" element={<Home />} />
                <Route path="/account" element={<AccountPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
  return { ...view, session, client };
}
async function fillLogin() {
  await screen.findByRole('heading', { name: '登录工作空间' });
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'admin' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test-password' } });
}

describe('Authenticated pages', () => {
  it('guards a protected route and returns to the requested page after login', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((path: string) =>
        Promise.resolve(path.endsWith('/login') ? loggedIn() : result(null, 401)),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderFlow('/account');
    await fillLogin();
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('heading', { name: '账户设置' })).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith('/refresh'))).toHaveLength(
      1,
    );
  });
  it('shows an invalid login without exposing password or persisting a token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(result(null, 401))),
    );
    renderFlow();
    await fillLogin();
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('用户名或密码不正确')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toHaveValue('');
    expect(localStorage.length).toBe(0);
  });
  it('restores a session after a page reload from the server cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(loggedIn())),
    );
    const first = renderFlow();
    expect(await screen.findByRole('heading', { name: '已登录工作空间' })).toBeInTheDocument();
    first.unmount();
    renderFlow();
    expect(await screen.findByRole('heading', { name: '已登录工作空间' })).toBeInTheDocument();
  });
  it('clears protected query cache and user draft after logout', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((path: string) =>
          Promise.resolve(path.endsWith('/logout') ? result(null) : loggedIn()),
        ),
    );
    const { client } = renderFlow();
    await screen.findByRole('heading', { name: '已登录工作空间' });
    client.setQueryData(['private-data'], { private: true });
    saveDraft(userData.user_id, { repository: '', revision: 'main', requirement: 'private draft' });
    await userEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(await screen.findByRole('heading', { name: '登录工作空间' })).toBeInTheDocument();
    expect(client.getQueryData(['private-data'])).toBeUndefined();
    expect(localStorage.getItem(draftKey(userData.user_id))).toBeNull();
    await screen.findByText('已退出登录');
  });
  it('validates new password confirmation before submission and relogs after success', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((path: string) =>
        Promise.resolve(path.endsWith('/password') ? result(null) : loggedIn()),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderFlow('/account');
    await screen.findByRole('heading', { name: '账户设置' });
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-password-123' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), {
      target: { value: 'different-password' },
    });
    await userEvent.click(screen.getByRole('button', { name: '更新密码' }));
    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([path]) => String(path).endsWith('/password'))).toBe(false);
    fireEvent.change(screen.getByLabelText('确认新密码'), {
      target: { value: 'new-password-123' },
    });
    await userEvent.click(screen.getByRole('button', { name: '更新密码' }));
    expect(await screen.findByRole('heading', { name: '登录工作空间' })).toBeInTheDocument();
    expect(screen.getByText('密码已更新，请使用新密码登录')).toBeInTheDocument();
  });
  it('keeps the account open if the current password is incorrect', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((path: string) =>
          Promise.resolve(path.endsWith('/password') ? result(null, 400) : loggedIn()),
        ),
    );
    renderFlow('/account');
    await screen.findByRole('heading', { name: '账户设置' });
    for (const [label, value] of [
      ['当前密码', 'wrong-password'],
      ['新密码', 'new-password-123'],
      ['确认新密码', 'new-password-123'],
    ])
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    await userEvent.click(screen.getByRole('button', { name: '更新密码' }));
    expect(await screen.findByText('当前密码不正确，或新密码不符合要求')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '账户设置' })).toBeInTheDocument();
  });
  it('lets a disconnected session retry without displaying protected pages', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockImplementation(() => Promise.resolve(loggedIn()));
    vi.stubGlobal('fetch', fetchMock);
    renderFlow();
    await screen.findByRole('heading', { name: '暂时无法连接服务' });
    expect(screen.queryByRole('heading', { name: '已登录工作空间' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新连接' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '已登录工作空间' })).toBeInTheDocument(),
    );
  });
});
