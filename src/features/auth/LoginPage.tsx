import { useState } from 'react';
import { Alert, Button, Input, Spin } from 'antd';
import { DeploymentUnitOutlined } from '@ant-design/icons';
import { Navigate, useLocation } from 'react-router';
import { ApiError } from '../../lib/api/client';
import { useAuth } from './context';
import { safeReturnPath } from './navigation';

export default function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (auth.status === 'authenticated')
    return <Navigate to={safeReturnPath(location.state)} replace />;
  if (auth.status === 'loading')
    return (
      <div className="session-loading" role="status">
        <Spin />
        正在恢复登录状态
      </div>
    );
  async function login() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await auth.session.login(username.trim(), password);
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 401
          ? '用户名或密码不正确'
          : failure instanceof Error
            ? failure.message
            : '登录失败，请重试',
      );
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="login-heading">
        <div className="auth-brand">
          <DeploymentUnitOutlined aria-hidden="true" />
          <span>OlixOps</span>
        </div>
        <h1 id="login-heading">登录工作空间</h1>
        <p className="field-help">使用本地账号访问应用交付控制台。</p>
        {auth.notice && (
          <Alert type="info" showIcon title={<span role="status">{auth.notice}</span>} />
        )}
        {auth.error && (
          <Alert
            type="warning"
            showIcon
            title={auth.error}
            action={
              <Button
                size="small"
                onClick={() => {
                  if (auth.status === 'error') void auth.session.retryRestore();
                  else void auth.session.logout().catch(() => undefined);
                }}
              >
                {auth.status === 'error' ? '重新连接' : '重试退出'}
              </Button>
            }
          />
        )}
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
        >
          <div className="field">
            <label htmlFor="username">用户名</label>
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              maxLength={64}
              required
              value={username}
              disabled={busy}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">密码</label>
            <Input.Password
              id="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && <Alert type="error" showIcon title={<span role="alert">{error}</span>} />}
          <Button
            type="primary"
            htmlType="submit"
            aria-label="登录"
            block
            loading={busy}
            disabled={!username.trim() || !password || auth.notice === '正在退出登录…'}
          >
            登录
          </Button>
        </form>
        <p className="field-help">账号由管理员创建；忘记密码请联系管理员。</p>
      </section>
    </main>
  );
}
