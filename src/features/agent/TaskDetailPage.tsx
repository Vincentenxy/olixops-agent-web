import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Input, Result, Spin, Tag } from 'antd';
import { ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router';
import { Panel } from '../../components/Panel';
import { IconButton } from '../../components/IconButton';
import { useAuth } from '../auth/context';
import { ApiError } from '../../lib/api/client';
import { AgentFeedback } from './AgentFeedback';
import {
  isTaskId,
  messageValidation,
  parseTaskDetail,
  taskStatusLabels,
  type TaskDetail,
} from './api';
import { useAgentStatus, useAgentTask } from './queries';

export default function TaskDetailPage() {
  const { taskId = '' } = useParams();
  if (!isTaskId(taskId))
    return (
      <Result status="404" title="方案地址无效" extra={<Link to="/tasks">返回方案列表</Link>} />
    );
  return <TaskConversation key={taskId} taskId={taskId} />;
}
function TaskConversation({ taskId }: { taskId: string }) {
  const auth = useAuth();
  const client = useQueryClient();
  const task = useAgentTask(taskId);
  const agent = useAgentStatus();
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const editingRevision = useRef<number | null>(null);
  const attempt = useRef<{
    task_id: string;
    request_id: string;
    expected_revision: number;
    message: string;
  } | null>(null);
  const data = task.data;
  async function accept(result: TaskDetail) {
    await client.cancelQueries({
      queryKey: ['agent-task', auth.generation, auth.user?.user_id, taskId],
    });
    if (auth.session.getSnapshot().generation !== auth.generation) return;
    client.setQueryData(['agent-task', auth.generation, auth.user?.user_id, taskId], result);
    void client.invalidateQueries({
      queryKey: ['agent-tasks', auth.generation, auth.user?.user_id],
    });
  }
  const mutation = useMutation({
    mutationFn: (body: NonNullable<typeof attempt.current>) =>
      auth.session.request('/api/v1/agent/tasks/message', {
        method: 'POST',
        body,
        parse: parseTaskDetail,
      }),
    retry: false,
    onSuccess: async (result) => {
      attempt.current = null;
      editingRevision.current = null;
      setMessage('');
      setNotice('补充需求已提交');
      await accept(result);
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        (error.code === 11002 || error.code === 11003 || error.code === 11005)
      ) {
        attempt.current = null;
        if (error.code === 11003) editingRevision.current = null;
        void task.refetch();
      }
    },
  });
  const retry = useMutation({
    mutationFn: (revision: number) =>
      auth.session.request('/api/v1/agent/tasks/retry', {
        method: 'POST',
        body: { task_id: taskId, expected_revision: revision },
        parse: parseTaskDetail,
      }),
    retry: false,
    onSuccess: async (result) => {
      setNotice('已重新提交分析');
      await accept(result);
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.code === 11002 || error.code === 11003))
        void task.refetch();
    },
  });
  const busy = mutation.isPending || retry.isPending;
  const canSend =
    !!data &&
    (data.status === 'needs_input' || data.status === 'ready') &&
    !task.isError &&
    !task.isFetching &&
    agent.data?.configured === true &&
    !agent.isError &&
    !agent.isFetching;
  async function send() {
    if (!data || !canSend || pending.current) return;
    const error = messageValidation(message);
    setValidation(error ?? '');
    setNotice('');
    if (error) return;
    const content = message.trim();
    if (attempt.current?.message !== content)
      attempt.current = {
        task_id: taskId,
        request_id: crypto.randomUUID(),
        expected_revision: editingRevision.current ?? data.revision,
        message: content,
      };
    pending.current = true;
    try {
      await mutation.mutateAsync(attempt.current);
    } catch {
      /* Keep input and idempotency key until the user can retry. */
    } finally {
      pending.current = false;
    }
  }
  async function retryAnalysis() {
    if (!data || data.status !== 'failed' || pending.current) return;
    pending.current = true;
    setNotice('');
    try {
      await retry.mutateAsync(data.revision);
    } catch {
      /* Safe error appears next to retry. */
    } finally {
      pending.current = false;
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>方案详情</h1>
          <p className="break-word">{data?.title ?? '正在读取分析会话'}</p>
        </div>
        <Link to="/tasks">返回列表</Link>
      </div>
      {task.isPending && (
        <div className="page-loading" role="status">
          <Spin />
          正在加载方案…
        </div>
      )}
      {task.isError && <AgentFeedback error={task.error} />}
      <div className="task-detail-grid">
        <Panel
          title="需求对话"
          actions={
            <IconButton
              label="刷新方案"
              icon={<ReloadOutlined />}
              loading={task.isFetching || agent.isFetching}
              onClick={() => {
                void task.refetch();
                void agent.refetch();
              }}
            />
          }
        >
          {data && (
            <>
              <div className="task-context">
                <Tag
                  color={
                    data.status === 'queued'
                      ? 'processing'
                      : data.status === 'failed'
                        ? 'error'
                        : data.status === 'ready'
                          ? 'blue'
                          : 'warning'
                  }
                >
                  {taskStatusLabels[data.status]}
                </Tag>
                <span className="muted">
                  第 {data.revision} 轮 · {new Date(data.update_at).toLocaleString('zh-CN')}
                </span>
              </div>
              <ol className="conversation" aria-label="需求对话记录" tabIndex={0}>
                {data.messages.map((item, index) => (
                  <li key={index} className={`conversation-message message-${item.role}`}>
                    <strong>{item.role === 'user' ? '你' : 'Agent'}</strong>
                    <p>{item.content}</p>
                  </li>
                ))}
              </ol>
              {data.status === 'queued' && (
                <Alert
                  type="info"
                  showIcon
                  title="正在分析需求"
                  description="可以离开页面，稍后从方案列表继续查看。"
                />
              )}
              {data.status === 'needs_input' && (
                <Alert
                  type="info"
                  showIcon
                  title="请补充以下信息"
                  description={
                    <ul className="question-list" tabIndex={0} aria-label="待补充问题">
                      {data.questions.map((question, index) => (
                        <li key={index}>{question}</li>
                      ))}
                    </ul>
                  }
                />
              )}
              {data.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  title="本次分析未完成"
                  description="服务暂时无法完成分析。请稍后重试，或联系管理员查看运行记录。"
                  action={
                    <Button
                      loading={retry.isPending}
                      disabled={
                        busy ||
                        task.isFetching ||
                        task.isError ||
                        !agent.data?.configured ||
                        agent.isError
                      }
                      onClick={() => {
                        void retryAnalysis();
                      }}
                    >
                      重试分析
                    </Button>
                  }
                />
              )}
              {retry.isError && <AgentFeedback error={retry.error} />}
              <form
                className="conversation-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <div className="field">
                  <label htmlFor="agent-message">补充或修改需求</label>
                  <Input.TextArea
                    id="agent-message"
                    value={message}
                    onChange={(event) => {
                      editingRevision.current ??= data.revision;
                      setMessage(event.target.value);
                      setValidation('');
                    }}
                    rows={4}
                    maxLength={4000}
                    showCount
                    disabled={busy || data.status === 'queued'}
                    placeholder="例如：使用测试集群，命名空间 demo，Redis 7.4，存储 10 GiB。"
                  />
                </div>
                {validation && (
                  <Alert type="warning" title={<span role="alert">{validation}</span>} />
                )}
                {mutation.isError && <AgentFeedback error={mutation.error} />}
                {notice && (
                  <p role="status" className="field-help">
                    {notice}
                  </p>
                )}
                <div className="conversation-actions">
                  <p className="field-help">请勿填写密码、访问令牌或云密钥。</p>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SendOutlined aria-hidden="true" />}
                    loading={mutation.isPending}
                    disabled={!canSend || busy}
                  >
                    发送补充
                  </Button>
                </div>
                {agent.isSuccess && !agent.data.configured && (
                  <p className="field-help">分析服务尚未配置，请联系管理员后重新检查。</p>
                )}
                {agent.isError && <AgentFeedback error={agent.error} />}
              </form>
            </>
          )}
        </Panel>
        <Panel
          title="部署规格"
          actions={
            <Button disabled size="small">
              提交部署
            </Button>
          }
        >
          {data?.status === 'ready' ? (
            <Alert
              type="info"
              showIcon
              title="方案已就绪，尚未部署"
              description="规格仅用于方案确认；环境查询、Pulumi 预览与实际部署尚未接入。"
            />
          ) : (
            <p className="field-help">
              分析完成后展示 Kubernetes、Redis / PostgreSQL 的结构化规格。
            </p>
          )}
          {data?.spec && (
            <div className="deployment-spec">
              {data.status !== 'ready' && <Tag>上次分析规格，等待本轮确认</Tag>}
              <Descriptions
                size="small"
                column={1}
                items={[
                  { key: 'target', label: '目标', children: 'Kubernetes' },
                  { key: 'cluster', label: '集群', children: data.spec.cluster },
                  { key: 'namespace', label: '命名空间', children: data.spec.namespace },
                ]}
              />
              <ul className="spec-services" aria-label="服务规格">
                {data.spec.services.map((service, index) => (
                  <li key={index}>
                    <strong>{service.name}</strong>
                    <span>
                      {service.kind === 'redis' ? 'Redis' : 'PostgreSQL'} {service.version}
                    </span>
                    <span>
                      {service.storage_gi} GiB 存储 · {service.replicas} 个副本
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
