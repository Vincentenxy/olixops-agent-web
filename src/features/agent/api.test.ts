import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api/client';
import {
  agentErrorMessage,
  messageValidation,
  parseAgentStatus,
  parseTaskDetail,
  parseTaskList,
} from './api';

const summary = {
  task_id: 'd3a19656-e2be-4b83-b81f-06b97cabf199',
  title: 'Redis 方案',
  status: 'needs_input',
  revision: 1,
  create_at: '2026-09-10T00:00:00Z',
  update_at: '2026-09-10T00:00:00Z',
};
const spec = {
  target: 'kubernetes',
  cluster: 'test',
  namespace: 'demo',
  services: [{ kind: 'redis', name: 'cache', version: '7.4', storage_gi: 10, replicas: 1 }],
};
const detail = {
  ...summary,
  messages: [{ role: 'user', content: '部署 Redis' }],
  spec: null,
  questions: ['使用哪个集群？'],
  error: null,
};

describe('Agent response boundary', () => {
  it('parses persisted conversations and ready specifications without treating them as deployments', () => {
    expect(parseTaskDetail(detail).questions).toEqual(['使用哪个集群？']);
    expect(parseTaskDetail({ ...detail, status: 'ready', spec }).spec?.services[0]?.kind).toBe(
      'redis',
    );
    expect(parseTaskList({ items: [summary] }).items).toHaveLength(1);
    expect(parseAgentStatus({ configured: false, message: 'Not configured' }).configured).toBe(
      false,
    );
  });
  it.each([
    { status: 'succeeded' },
    { revision: 0 },
    { task_id: '../admin' },
    { update_at: 'invalid' },
    { messages: [{ role: 'system', content: 'private' }] },
    { questions: [7] },
    { status: 'ready', spec: null },
    { spec: { ...spec, services: [{ ...spec.services[0], replicas: 3 }] } },
    { spec: { ...spec, services: [{ ...spec.services[0], storage_gi: -1 }] } },
  ])('rejects incompatible task fields %j', (fields) => {
    expect(() => parseTaskDetail({ ...detail, ...fields })).toThrow();
  });
  it('validates non-empty bounded input independently of an optional repository', () => {
    expect(messageValidation('  ')).toContain('填写');
    expect(messageValidation('x'.repeat(4001))).toContain('4000');
    expect(messageValidation('部署 Redis')).toBeNull();
  });
  it('maps known failures and never displays arbitrary server exception text', () => {
    expect(agentErrorMessage(new ApiError('SECRET raw upstream error', 200, 11003))).toContain(
      '方案已更新',
    );
    expect(agentErrorMessage(new ApiError('SECRET raw upstream error', 500, 500))).not.toContain(
      'SECRET',
    );
    expect(agentErrorMessage(new Error('SECRET'))).not.toContain('SECRET');
  });
});
