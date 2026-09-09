import { Alert, Descriptions, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Panel } from '../../components/Panel';
import { IconButton } from '../../components/IconButton';
import { ApiError } from '../../lib/api/client';
import { useConnection, type ServiceStatus } from './useConnection';
import { useAgentStatus } from '../agent/queries';
import { AgentFeedback } from '../agent/AgentFeedback';

function Service({ value }: { value: ServiceStatus | undefined }) {
  if (!value) return <span className="muted">尚未取得状态</span>;
  return (
    <span className="service-status">
      <Tag
        color={value.status === 'ok' ? 'success' : value.status === 'error' ? 'error' : 'default'}
      >
        {value.status === 'ok' ? '正常' : value.status === 'error' ? '异常' : '未启用'}
      </Tag>
      <span className="break-word">{value.message}</span>
    </span>
  );
}
export default function ConnectionPage() {
  const connection = useConnection();
  const agent = useAgentStatus();
  const data = connection.isError ? undefined : connection.data;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>连接与配置</h1>
          <p>查看当前环境的基础服务状态。</p>
        </div>
      </div>
      <Panel
        title="基础服务"
        actions={
          <IconButton
            label="重新检查连接"
            icon={<ReloadOutlined />}
            loading={connection.isFetching}
            onClick={() => {
              void connection.refetch();
            }}
          />
        }
      >
        {connection.isFetching && (
          <p className="field-help" role="status">
            正在检查基础服务…
          </p>
        )}
        {connection.isError && (
          <Alert
            showIcon
            type="error"
            title="状态检查失败"
            description={
              <div>
                <p>{connection.error.message}</p>
                {connection.error instanceof ApiError && connection.error.requestId && (
                  <p className="break-word">请求编号：{connection.error.requestId}</p>
                )}
              </div>
            }
          />
        )}
        <Descriptions
          className="connection-details"
          column={1}
          size="small"
          items={[
            { key: 'database', label: '数据库', children: <Service value={data?.database} /> },
            { key: 'redis', label: 'Redis', children: <Service value={data?.redis} /> },
            { key: 'auth', label: '用户认证', children: <Service value={data?.auth} /> },
            { key: 'pulumi', label: 'Pulumi', children: <Service value={data?.pulumi} /> },
            {
              key: 'versions',
              label: 'Pulumi 版本',
              children: data
                ? `SDK ${data.pulumi.sdk_version} / CLI ${data.pulumi.cli_version ?? '不可用'}`
                : '尚未取得状态',
            },
            {
              key: 'time',
              label: '最近检查',
              children:
                connection.dataUpdatedAt || connection.errorUpdatedAt
                  ? new Date(
                      Math.max(connection.dataUpdatedAt, connection.errorUpdatedAt),
                    ).toLocaleString('zh-CN')
                  : '尚未完成',
            },
          ]}
        />
        <p className="field-help">基础服务可用性用于检查环境；实际资源变更需由部署任务执行。</p>
      </Panel>
      <Panel
        title="方案分析服务"
        actions={
          <IconButton
            label="重新检查分析服务"
            icon={<ReloadOutlined />}
            loading={agent.isFetching}
            onClick={() => {
              void agent.refetch();
            }}
          />
        }
      >
        {agent.isFetching && (
          <p role="status" className="field-help">
            正在检查分析服务…
          </p>
        )}
        {agent.isError && <AgentFeedback error={agent.error} />}
        {agent.isSuccess && (
          <>
            <Tag color={agent.data.configured ? 'blue' : 'default'}>
              {agent.data.configured ? '已配置' : '未配置'}
            </Tag>
            <span>
              {agent.data.configured
                ? '可提交 Redis / PostgreSQL 需求，由 Agent 整理部署规格。'
                : '请联系管理员配置分析模型后重试。'}
            </span>
          </>
        )}
        <p className="availability-note">模型配置就绪不代表环境已验证；分析方案不执行资源部署。</p>
      </Panel>
      <Panel title="待接入功能">
        <Descriptions
          column={1}
          size="small"
          items={[
            {
              key: 'tasks',
              label: '部署任务',
              children: (
                <>
                  <Tag>待接入</Tag>任务提交、列表和取消
                </>
              ),
            },
            {
              key: 'agent',
              label: 'MCP 环境查询',
              children: (
                <>
                  <Tag>待接入</Tag>真实集群、环境和资源查询
                </>
              ),
            },
            {
              key: 'iac',
              label: '资源变更',
              children: (
                <>
                  <Tag>待接入</Tag>Pulumi 计划审阅与任务执行
                </>
              ),
            },
            {
              key: 'events',
              label: '执行进度',
              children: (
                <>
                  <Tag>待接入</Tag>实时日志和结果更新
                </>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
