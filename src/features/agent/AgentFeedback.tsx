import { Alert } from 'antd';
import { ApiError } from '../../lib/api/client';
import { agentErrorMessage } from './api';

export function AgentFeedback({ error }: { error: unknown }) {
  return (
    <Alert
      type="error"
      showIcon
      title={agentErrorMessage(error)}
      description={
        error instanceof ApiError && error.requestId ? (
          <span className="break-word">请求编号：{error.requestId}</span>
        ) : undefined
      }
    />
  );
}
