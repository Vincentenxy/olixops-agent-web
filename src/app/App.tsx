import { lazy, Suspense } from 'react';
import { Badge, Button, Result, Spin } from 'antd';
import {
  AppstoreOutlined,
  DeploymentUnitOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Link, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router';
import AuthGate from '../features/auth/AuthGate';
import LoginPage from '../features/auth/LoginPage';
import { useAuth } from '../features/auth/context';
import { useConnection } from '../features/connection/useConnection';

const AccountPage = lazy(() => import('../features/auth/AccountPage'));
const WorkbenchPage = lazy(() => import('../features/workbench/WorkbenchPage'));
const TasksPage = lazy(() => import('../features/tasks/TasksPage'));
const ConnectionPage = lazy(() => import('../features/connection/ConnectionPage'));

function Shell() {
  const connection = useConnection();
  const auth = useAuth();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳至主要内容
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand">
          <DeploymentUnitOutlined aria-hidden="true" />
          <span>
            OlixOps<span className="brand-subtitle">AGENT CONSOLE</span>
          </span>
        </Link>
        <nav aria-label="主导航">
          <NavLink to="/" end>
            <AppstoreOutlined aria-hidden="true" />
            <span>部署工作台</span>
          </NavLink>
          <NavLink to="/tasks">
            <UnorderedListOutlined aria-hidden="true" />
            <span>部署任务</span>
          </NavLink>
          <NavLink to="/settings">
            <SettingOutlined aria-hidden="true" />
            <span>连接与配置</span>
          </NavLink>
          <NavLink to="/account">
            <UserOutlined aria-hidden="true" />
            <span>账户设置</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer">应用交付 · 基础设施管理</div>
      </aside>
      <div className="workspace">
        <header className="app-header">
          <span className="workspace-title">Agent 工作空间</span>
          <div className="header-actions">
            <Link to="/settings" className="connection-link">
              <Badge
                status={
                  connection.isFetching
                    ? 'processing'
                    : connection.isError
                      ? 'error'
                      : connection.isSuccess
                        ? 'success'
                        : 'default'
                }
                text={
                  connection.isFetching
                    ? '正在检查连接'
                    : connection.isError
                      ? '后端未连接'
                      : connection.isSuccess
                        ? '后端可达'
                        : '未检查连接'
                }
              />
            </Link>
            <Link
              className="user-link"
              to="/account"
              title={auth.user?.name || auth.user?.username}
            >
              <UserOutlined aria-hidden="true" />
              {auth.user?.name || auth.user?.username}
            </Link>
            <Button
              size="small"
              icon={<LogoutOutlined aria-hidden="true" />}
              onClick={() => {
                void auth.session.logout().catch(() => undefined);
              }}
            >
              退出
            </Button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Suspense
            fallback={
              <div className="page-loading">
                <Spin aria-label="页面加载中" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<AuthGate />}>
        <Route element={<Shell />}>
          <Route index element={<WorkbenchPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="settings" element={<ConnectionPage />} />
          <Route
            path="*"
            element={
              <Result
                status="404"
                title="页面不存在"
                subTitle="请检查地址，或返回部署工作台。"
                extra={
                  <Button
                    type="primary"
                    onClick={() => {
                      void navigate('/');
                    }}
                  >
                    返回工作台
                  </Button>
                }
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
