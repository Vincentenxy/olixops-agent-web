import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/context';
import { isTaskId, parseAgentStatus, parseTaskDetail, parseTaskList } from './api';

export function useAgentStatus() {
  const auth = useAuth();
  return useQuery({
    queryKey: ['agent-status', auth.generation, auth.user?.user_id],
    queryFn: ({ signal }) =>
      auth.session.request('/api/v1/agent/status', { signal, parse: parseAgentStatus }),
    enabled: auth.status === 'authenticated',
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
export function useAgentTasks() {
  const auth = useAuth();
  return useQuery({
    queryKey: ['agent-tasks', auth.generation, auth.user?.user_id],
    queryFn: ({ signal }) =>
      auth.session.request('/api/v1/agent/tasks', { signal, parse: parseTaskList }),
    enabled: auth.status === 'authenticated',
    retry: false,
    refetchInterval: (query) =>
      query.state.status !== 'error' &&
      query.state.data?.items.some((task) => task.status === 'queued')
        ? 2000
        : false,
  });
}
export function useAgentTask(taskId: string) {
  const auth = useAuth();
  return useQuery({
    queryKey: ['agent-task', auth.generation, auth.user?.user_id, taskId],
    queryFn: ({ signal }) =>
      auth.session.request('/api/v1/agent/tasks/detail', {
        method: 'POST',
        body: { task_id: taskId },
        signal,
        parse: parseTaskDetail,
      }),
    enabled: auth.status === 'authenticated' && isTaskId(taskId),
    retry: false,
    refetchInterval: (query) =>
      query.state.status !== 'error' && query.state.data?.status === 'queued' ? 2000 : false,
  });
}
