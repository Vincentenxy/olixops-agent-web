import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';

export function parseHealth(data: unknown): { status: 'ok' } {
  if (typeof data !== 'object' || data === null || !('status' in data) || data.status !== 'ok') {
    throw new Error('Invalid health response');
  }
  return { status: 'ok' };
}

export function useConnection() {
  return useQuery({
    queryKey: ['connection', 'health'],
    queryFn: ({ signal }) => api('/api/v1/pub/health', { signal, parse: parseHealth }),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
