import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import { CommentOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/context';
import { IconButton } from '../../components/IconButton';
import { messageValidation, parseTaskDetail } from './api';
import { AgentFeedback } from './AgentFeedback';
import { useAgentStatus } from './queries';

export function StartAnalysis({ message }: { message: string }) {
  const auth = useAuth();
  const status = useAgentStatus();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [validation, setValidation] = useState('');
  const pending = useRef(false);
  const attempt = useRef<{ message: string; request_id: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (body: { message: string; request_id: string }) =>
      auth.session.request('/api/v1/agent/tasks/create', {
        method: 'POST',
        body,
        parse: parseTaskDetail,
      }),
    retry: false,
    onSuccess: (task) => {
      if (auth.session.getSnapshot().generation !== auth.generation) return;
      attempt.current = null;
      client.setQueryData(['agent-task', auth.generation, auth.user?.user_id, task.task_id], task);
      void client.invalidateQueries({
        queryKey: ['agent-tasks', auth.generation, auth.user?.user_id],
      });
      void navigate(`/tasks/${task.task_id}`);
    },
  });
  async function analyze() {
    if (pending.current) return;
    const error = messageValidation(message);
    setValidation(error ?? '');
    if (error) return;
    const content = message.trim();
    if (attempt.current?.message !== content)
      attempt.current = { message: content, request_id: crypto.randomUUID() };
    pending.current = true;
    try {
      await mutation.mutateAsync(attempt.current);
    } catch {
      /* The mutation renders a safe error and keeps the request ID for retry. */
    } finally {
      pending.current = false;
    }
  }
  return (
    <div className="analysis-entry">
      <div className="analysis-actions">
        <Button
          type="primary"
          htmlType="button"
          icon={<CommentOutlined aria-hidden="true" />}
          loading={mutation.isPending}
          disabled={!status.data?.configured || status.isError || status.isFetching}
          onClick={() => {
            void analyze();
          }}
        >
          分析需求
        </Button>
        <span className="field-help">
          {status.isFetching
            ? '正在检查分析服务…'
            : status.isError
              ? '分析服务状态检查失败'
              : status.data?.configured
                ? '支持 Redis / PostgreSQL，先生成 Kubernetes 方案'
                : '分析服务尚未配置，请联系管理员'}
        </span>
        <IconButton
          label="重新检查分析服务"
          icon={<ReloadOutlined />}
          loading={status.isFetching}
          onClick={() => {
            void status.refetch();
          }}
        />
      </div>
      <p className="field-help">仅发送需求正文，每次最多 4000 字；方案分析不会创建资源。</p>
      {validation && (
        <Alert type="warning" showIcon title={<span role="alert">{validation}</span>} />
      )}
      {mutation.isError && <AgentFeedback error={mutation.error} />}
      {status.isError && <AgentFeedback error={status.error} />}
    </div>
  );
}
