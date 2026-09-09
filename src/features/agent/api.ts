import { ApiError } from '../../lib/api/client';

export type TaskStatus = 'queued' | 'needs_input' | 'ready' | 'failed';
export interface TaskSummary {
  task_id: string;
  title: string;
  status: TaskStatus;
  revision: number;
  create_at: string;
  update_at: string;
}
export interface DeploymentSpec {
  target: 'kubernetes';
  cluster: string;
  namespace: string;
  services: {
    kind: 'redis' | 'postgresql';
    name: string;
    version: string;
    storage_gi: number;
    replicas: 1;
  }[];
}
export interface TaskDetail extends TaskSummary {
  messages: { role: 'user' | 'assistant'; content: string }[];
  spec: DeploymentSpec | null;
  questions: string[];
  error: string | null;
}
export const taskStatusLabels: Record<TaskStatus, string> = {
  queued: '正在分析',
  needs_input: '待补充需求',
  ready: '方案已就绪',
  failed: '分析失败',
};
export function isTaskId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid object');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid text');
  return value;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error('Invalid date');
  return result;
}
function parseSummary(value: unknown): TaskSummary {
  const data = object(value);
  const taskId = text(data.task_id);
  const status = data.status;
  if (
    !isTaskId(taskId) ||
    !['queued', 'needs_input', 'ready', 'failed'].some((item) => item === status) ||
    typeof data.revision !== 'number' ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 1
  )
    throw new Error('Invalid task');
  return {
    task_id: taskId,
    title: text(data.title),
    status: status as TaskStatus,
    revision: data.revision,
    create_at: date(data.create_at),
    update_at: date(data.update_at),
  };
}
function parseSpec(value: unknown): DeploymentSpec {
  const data = object(value);
  if (data.target !== 'kubernetes' || !Array.isArray(data.services) || !data.services.length)
    throw new Error('Invalid deployment specification');
  return {
    target: 'kubernetes',
    cluster: text(data.cluster),
    namespace: text(data.namespace),
    services: data.services.map((value: unknown) => {
      const service = object(value);
      if (
        (service.kind !== 'redis' && service.kind !== 'postgresql') ||
        typeof service.storage_gi !== 'number' ||
        !Number.isSafeInteger(service.storage_gi) ||
        service.storage_gi <= 0 ||
        service.replicas !== 1
      )
        throw new Error('Invalid service');
      return {
        kind: service.kind,
        name: text(service.name),
        version: text(service.version),
        storage_gi: service.storage_gi,
        replicas: 1,
      };
    }),
  };
}
export function parseTaskDetail(value: unknown): TaskDetail {
  const data = object(value);
  const summary = parseSummary(data);
  if (!Array.isArray(data.messages) || !Array.isArray(data.questions))
    throw new Error('Invalid conversation');
  const spec = data.spec === null ? null : parseSpec(data.spec);
  if (summary.status === 'ready' && spec === null) throw new Error('Missing ready specification');
  return {
    ...summary,
    messages: data.messages.map((value: unknown) => {
      const message = object(value);
      if (message.role !== 'user' && message.role !== 'assistant')
        throw new Error('Invalid message role');
      return { role: message.role, content: text(message.content) };
    }),
    spec,
    questions: data.questions.map(text),
    error: data.error === null ? null : text(data.error),
  };
}
export function parseTaskList(value: unknown): { items: TaskSummary[] } {
  const data = object(value);
  if (!Array.isArray(data.items)) throw new Error('Invalid task list');
  return { items: data.items.map(parseSummary) };
}
export function parseAgentStatus(value: unknown): { configured: boolean; message: string } {
  const data = object(value);
  if (typeof data.configured !== 'boolean') throw new Error('Invalid agent status');
  return { configured: data.configured, message: text(data.message) };
}
export function messageValidation(message: string): string | null {
  if (!message.trim()) return '请先填写要分析的需求';
  if (Array.from(message.trim()).length > 4000) return '每次分析最多提交 4000 字，请精简后重试';
  return null;
}
export function agentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 11001:
        return '分析服务尚未配置，请联系管理员后重新检查';
      case 11002:
        return '当前方案正在分析，请等待完成后再操作';
      case 11003:
        return '方案已更新，请查看最新内容后重新提交；你的输入已保留';
      case 11004:
        return '已达到当前任务或对话上限，请调整需求或稍后重试';
      case 11005:
        return '本次请求与已提交内容不一致，请刷新方案后重新提交';
      case 401:
        return '登录已失效，请重新登录';
      case 403:
        return '你没有权限访问此方案';
      case 404:
        return '方案不存在或已不可访问';
      case 422:
        return '提交内容不符合要求，请检查后重试';
    }
  }
  return '请求未完成，请检查连接后重试；已提交的分析仍可能在后台继续';
}
