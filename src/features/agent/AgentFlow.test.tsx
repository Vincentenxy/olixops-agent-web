import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type RequestOptions } from '../../lib/api/client';
import { AuthContext } from '../auth/context';
import { createSessionStore } from '../auth/session';
import WorkbenchPage from '../workbench/WorkbenchPage';
import TasksPage from '../tasks/TasksPage';
import TaskDetailPage from './TaskDetailPage';
import { StartAnalysis } from './StartAnalysis';
import type { TaskDetail } from './api';

const taskId = 'd3a19656-e2be-4b83-b81f-06b97cabf199';
const baseTask: TaskDetail = {
  task_id: taskId,
  title: 'Redis 测试方案',
  status: 'needs_input',
  revision: 1,
  create_at: '2026-09-10T00:00:00Z',
  update_at: '2026-09-10T00:00:00Z',
  messages: [
    { role: 'user', content: '部署 Redis' },
    { role: 'assistant', content: '请确认目标集群与配置。' },
  ],
  spec: null,
  questions: ['使用哪个集群？'],
  error: null,
};
const readyTask: TaskDetail = {
  ...baseTask,
  status: 'ready',
  questions: [],
  spec: {
    target: 'kubernetes',
    cluster: 'test',
    namespace: 'demo',
    services: [{ kind: 'redis', name: 'cache', version: '7.4', storage_gi: 10, replicas: 1 }],
  },
};
type Handler = (path: string, body: unknown) => unknown | Promise<unknown>;
function setup(handler: Handler, path = `/tasks/${taskId}`, startOnly = false) {
  const snapshot = {
    status: 'authenticated' as const,
    user: { user_id: 'user-a', username: 'alice', name: 'Alice', is_admin: false },
    generation: 1,
    error: null,
    notice: null,
  };
  const session = createSessionStore();
  vi.spyOn(session, 'getSnapshot').mockImplementation(() => snapshot);
  const calls = vi.fn(handler);
  vi.spyOn(session, 'request').mockImplementation(
    async <T,>(path: `/api/v1/${string}`, options: RequestOptions<T>): Promise<T> => {
      const value: unknown = await calls(path, options.body);
      return options.parse(value);
    },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <AuthContext value={{ ...snapshot, session }}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/"
              element={startOnly ? <StartAnalysis message="部署 Redis" /> : <WorkbenchPage />}
            />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext>
    </QueryClientProvider>,
  );
  return { ...view, calls, client, snapshot };
}
function response(path: string, task: TaskDetail = baseTask) {
  if (path === '/api/v1/agent/status') return { configured: true, message: 'Configured' };
  if (path === '/api/v1/agent/tasks') return { items: [task] };
  return task;
}
afterEach(() => {
  vi.useRealTimers();
});

describe('Agent analysis workflow', () => {
  it('creates a persistent analysis using only the requirement and opens its conversation', async () => {
    const { calls } = setup((path) => response(path), '/');
    await waitFor(() => expect(screen.getByRole('button', { name: '分析需求' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('你希望如何部署？'), {
      target: { value: '部署 Redis' },
    });
    await userEvent.click(screen.getByRole('button', { name: '分析需求' }));
    expect(await screen.findByText('使用哪个集群？')).toBeInTheDocument();
    const call = calls.mock.calls.find(([path]) => path.endsWith('/create'));
    expect(call?.[1]).toEqual({
      request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: '部署 Redis',
    });
    expect(screen.getByRole('button', { name: '提交部署' })).toBeDisabled();
  });
  it('blocks model-unconfigured submissions and offers a status refresh', async () => {
    const { calls } = setup(() => ({ configured: false, message: 'Not configured' }), '/', true);
    await screen.findByText('分析服务尚未配置，请联系管理员');
    expect(screen.getByRole('button', { name: '分析需求' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '重新检查分析服务' }));
    expect(calls.mock.calls.every(([path]) => path.endsWith('/status'))).toBe(true);
  });
  it('reuses an idempotency key after an uncertain create failure without automatic resubmission', async () => {
    let attempts = 0;
    const { calls } = setup(
      (path) => {
        if (path.endsWith('/create') && ++attempts === 1) throw new ApiError('raw private error');
        return response(path);
      },
      '/',
      true,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '分析需求' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: '分析需求' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请求未完成');
    expect(attempts).toBe(1);
    expect(screen.queryByText('raw private error')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '分析需求' }));
    await screen.findByText('使用哪个集群？');
    const creates = calls.mock.calls.filter(([path]) => path.endsWith('/create'));
    expect(creates[0]?.[1]).toEqual(creates[1]?.[1]);
  });
  it('keeps input on a revision conflict, reloads the task, and resubmits against the current revision', async () => {
    let current = baseTask;
    let sends = 0;
    const { calls } = setup((path) => {
      if (path.endsWith('/message')) {
        sends += 1;
        if (sends === 1) {
          current = { ...baseTask, revision: 2 };
          throw new ApiError('private', 200, 11003);
        }
        return { ...current, status: 'queued', revision: 3 };
      }
      return response(path, current);
    });
    await screen.findByText('使用哪个集群？');
    fireEvent.change(screen.getByLabelText('补充或修改需求'), {
      target: { value: '使用测试集群' },
    });
    await userEvent.click(screen.getByRole('button', { name: '发送补充' }));
    expect(
      await screen.findByText('方案已更新，请查看最新内容后重新提交；你的输入已保留'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('补充或修改需求')).toHaveValue('使用测试集群');
    await waitFor(() => expect(screen.getByText(/第 2 轮/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '发送补充' }));
    await screen.findByText('正在分析需求');
    const messages = calls.mock.calls.filter(([path]) => path.endsWith('/message'));
    expect(messages[0]?.[1]).toMatchObject({ expected_revision: 1, message: '使用测试集群' });
    expect(messages[1]?.[1]).toMatchObject({ expected_revision: 2, message: '使用测试集群' });
    expect(screen.getByLabelText('补充或修改需求')).toHaveValue('');
    expect(screen.getByRole('button', { name: '发送补充' })).toBeDisabled();
  });
  it('polls queued work until ready, shows the saved specification, and keeps deployment disabled', async () => {
    vi.useFakeTimers();
    let current: TaskDetail = { ...baseTask, status: 'queued' };
    const { calls } = setup((path) => response(path, current));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText('正在分析需求')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送补充' })).toBeDisabled();
    current = readyTask;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText('方案已就绪，尚未部署')).toBeInTheDocument();
    expect(screen.getByText('Redis 7.4')).toBeInTheDocument();
    const count = calls.mock.calls.filter(([path]) => path.endsWith('/detail')).length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(calls.mock.calls.filter(([path]) => path.endsWith('/detail'))).toHaveLength(count);
    expect(screen.getByRole('button', { name: '提交部署' })).toBeDisabled();
  });
  it('keeps an edit bound to the viewed revision when another page changes the task', async () => {
    let current = baseTask;
    const { calls } = setup((path) => {
      if (path.endsWith('/message')) throw new ApiError('private', 200, 11003);
      return response(path, current);
    });
    await screen.findByText('使用哪个集群？');
    fireEvent.change(screen.getByLabelText('补充或修改需求'), {
      target: { value: '使用测试集群' },
    });
    current = { ...baseTask, revision: 2 };
    await userEvent.click(screen.getByRole('button', { name: '刷新方案' }));
    await waitFor(() => expect(screen.getByText(/第 2 轮/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '发送补充' }));
    expect(
      await screen.findByText('方案已更新，请查看最新内容后重新提交；你的输入已保留'),
    ).toBeInTheDocument();
    expect(calls.mock.calls.find(([path]) => path.endsWith('/message'))?.[1]).toMatchObject({
      expected_revision: 1,
    });
    expect(screen.getByLabelText('补充或修改需求')).toHaveValue('使用测试集群');
  });
  it('retries a failed analysis without leaking a raw server failure', async () => {
    const failed: TaskDetail = {
      ...baseTask,
      status: 'failed',
      error: 'SECRET provider exception',
    };
    const { calls } = setup((path) =>
      response(
        path,
        path.endsWith('/retry') ? { ...failed, status: 'queued', error: null } : failed,
      ),
    );
    await screen.findByText('本次分析未完成');
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试分析' }));
    await screen.findByText('正在分析需求');
    expect(calls.mock.calls.find(([path]) => path.endsWith('/retry'))?.[1]).toEqual({
      task_id: taskId,
      expected_revision: 1,
    });
  });
  it('loads an existing conversation after remount and renders real task links', async () => {
    const first = setup((path) => response(path, readyTask));
    await screen.findByText('方案已就绪，尚未部署');
    first.unmount();
    setup((path) => response(path, readyTask), '/tasks');
    await userEvent.click(await screen.findByRole('link', { name: 'Redis 测试方案' }));
    expect(await screen.findByText('方案已就绪，尚未部署')).toBeInTheDocument();
    expect(screen.getByText('部署 Redis')).toBeInTheDocument();
  });
  it('shows a task query failure without presenting it as an empty list', async () => {
    setup(() => {
      throw new ApiError('private');
    }, '/tasks');
    expect(await screen.findByRole('alert')).toHaveTextContent('请求未完成');
    expect(screen.queryByText('还没有分析方案')).not.toBeInTheDocument();
  });
  it('does not navigate or repopulate cache when identity changes during creation', async () => {
    let resolveCreate: ((value: TaskDetail) => void) | undefined;
    const { snapshot, client } = setup(
      (path) =>
        path.endsWith('/create')
          ? new Promise<TaskDetail>((resolve) => {
              resolveCreate = resolve;
            })
          : response(path),
      '/',
      true,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '分析需求' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: '分析需求' }));
    snapshot.generation = 2;
    await act(async () => {
      resolveCreate?.(baseTask);
    });
    expect(screen.queryByRole('heading', { name: '方案详情' })).not.toBeInTheDocument();
    expect(client.getQueryData(['agent-task', 1, 'user-a', taskId])).toBeUndefined();
  });
});
