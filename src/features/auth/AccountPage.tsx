import { useState } from 'react';
import { Alert, Button, Descriptions, Input, Tag } from 'antd';
import { Panel } from '../../components/Panel';
import { ApiError } from '../../lib/api/client';
import { useAuth } from './context';

export default function AccountPage() {
  const auth = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function changePassword() {
    if (busy) return;
    setError('');
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError('新密码长度需为 12 至 128 个字符');
      return;
    }
    if (newPassword === currentPassword) {
      setError('新密码不能与当前密码相同');
      return;
    }
    setBusy(true);
    try {
      await auth.session.changePassword(currentPassword, newPassword);
    } catch (failure) {
      setError(
        failure instanceof ApiError && (failure.status === 400 || failure.code === 10001)
          ? '当前密码不正确，或新密码不符合要求'
          : failure instanceof Error
            ? failure.message
            : '密码更新失败',
      );
    } finally {
      setBusy(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>账户设置</h1>
          <p>查看当前身份并管理登录密码。</p>
        </div>
      </div>
      <Panel title="账户信息">
        <Descriptions
          column={1}
          size="small"
          items={[
            { key: 'name', label: '姓名', children: auth.user?.name },
            { key: 'username', label: '用户名', children: auth.user?.username },
            {
              key: 'role',
              label: '角色',
              children: <Tag>{auth.user?.is_admin ? '管理员' : '用户'}</Tag>,
            },
          ]}
        />
      </Panel>
      <Panel title="修改密码">
        <form
          className="auth-form account-form"
          onSubmit={(event) => {
            event.preventDefault();
            void changePassword();
          }}
        >
          <p className="field-help">密码更新后将退出所有已登录会话，需要使用新密码重新登录。</p>
          <div className="field">
            <label htmlFor="current-password">当前密码</label>
            <Input.Password
              id="current-password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={currentPassword}
              disabled={busy}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-password">新密码</label>
            <Input.Password
              id="new-password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={newPassword}
              disabled={busy}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-describedby="password-hint"
            />
          </div>
          <p className="field-help" id="password-hint">
            使用 12 至 128 个字符，避免与其他服务共用密码。
          </p>
          <div className="field">
            <label htmlFor="confirm-password">确认新密码</label>
            <Input.Password
              id="confirm-password"
              autoComplete="new-password"
              required
              maxLength={128}
              value={confirm}
              disabled={busy}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          {error && <Alert type="error" showIcon title={<span role="alert">{error}</span>} />}
          <div>
            <Button
              type="primary"
              htmlType="submit"
              loading={busy}
              disabled={!currentPassword || !newPassword || !confirm}
            >
              更新密码
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
