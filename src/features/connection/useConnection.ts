import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/context';

export function parseHealth(data: unknown): { status: 'ok' } {
  if (typeof data !== 'object' || data === null || !('status' in data) || data.status !== 'ok')
    throw new Error('Invalid health response');
  return { status: 'ok' };
}
export interface ServiceStatus {
  status: 'ok' | 'error' | 'disabled';
  message: string;
}
export interface SystemStatus {
  database: ServiceStatus;
  redis: ServiceStatus;
  pulumi: ServiceStatus & { sdk_version: string; cli_version: string | null };
  auth: ServiceStatus;
}
function parseService(value: unknown, allowDisabled = false): ServiceStatus {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('status' in value) ||
    !(
      value.status === 'ok' ||
      value.status === 'error' ||
      (allowDisabled && value.status === 'disabled')
    ) ||
    !('message' in value) ||
    typeof value.message !== 'string'
  )
    throw new Error('Invalid service response');
  return { status: value.status, message: value.message };
}
export function parseSystemStatus(value: unknown): SystemStatus {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('database' in value) ||
    !('redis' in value) ||
    !('pulumi' in value) ||
    !('auth' in value)
  )
    throw new Error('Invalid system response');
  const pulumi = value.pulumi;
  if (
    typeof pulumi !== 'object' ||
    pulumi === null ||
    !('sdk_version' in pulumi) ||
    typeof pulumi.sdk_version !== 'string' ||
    !('cli_version' in pulumi) ||
    !(typeof pulumi.cli_version === 'string' || pulumi.cli_version === null)
  )
    throw new Error('Invalid Pulumi response');
  return {
    database: parseService(value.database),
    redis: parseService(value.redis, true),
    pulumi: {
      ...parseService(pulumi),
      sdk_version: pulumi.sdk_version,
      cli_version: pulumi.cli_version,
    },
    auth: parseService(value.auth),
  };
}
export function useConnection() {
  const auth = useAuth();
  return useQuery({
    queryKey: ['system', auth.generation, auth.user?.user_id],
    queryFn: ({ signal }) =>
      auth.session.request('/api/v1/system/status', { signal, parse: parseSystemStatus }),
    enabled: auth.status === 'authenticated',
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
