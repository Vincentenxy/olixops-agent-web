import { Alert, Button, Spin } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './context';

export default function AuthGate() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading')
    return (
      <div className="session-loading" role="status">
        <Spin />
        正在恢复登录状态
      </div>
    );
  if (auth.status === 'error')
    return (
      <div className="auth-screen">
        <section className="auth-panel">
          <h1>暂时无法连接服务</h1>
          <Alert type="error" showIcon title={auth.error} />
          <Button
            onClick={() => {
              void auth.session.retryRestore();
            }}
          >
            重新连接
          </Button>
        </section>
      </div>
    );
  if (auth.status !== 'authenticated')
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet key={`${auth.generation}:${auth.user?.user_id}`} />;
}
