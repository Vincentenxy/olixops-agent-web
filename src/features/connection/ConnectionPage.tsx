import { Alert, Descriptions, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Panel } from '../../components/Panel';
import { IconButton } from '../../components/IconButton';
import { ApiError } from '../../lib/api/client';
import { useConnection } from './useConnection';

export default function ConnectionPage() {
  const connection = useConnection();
  const status = connection.isFetching
    ? '检查中'
    : connection.isError
      ? '连接失败'
      : connection.isSuccess
        ? '服务可达'
        : '未检查';
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>连接与配置</h1>
          <p>检查后端可用性和当前功能的接入状态。</p>
        </div>
      </div>
      <Panel
        title="后端连接"
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
        <Descriptions
          column={1}
          size="small"
          className="connection-details"
          items={[
            {
              key: 'status',
              label: '服务状态',
              children: (
                <Tag
                  color={
                    connection.isFetching
                      ? 'processing'
                      : connection.isError
                        ? 'error'
                        : connection.isSuccess
                          ? 'success'
                          : 'default'
                  }
                >
                  {status}
                </Tag>
              ),
            },
            { key: 'route', label: '连接方式', children: '通过当前站点连接后端服务' },
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
        {connection.isError && (
          <Alert
            showIcon
            type="warning"
            title="后端暂不可用"
            description={
              <div>
                <p>{connection.error.message}</p>
                <p>请确认后端已启动，并由管理员配置站点的 API 转发。</p>
                {connection.error instanceof ApiError && connection.error.requestId && (
                  <p className="break-word">请求编号：{connection.error.requestId}</p>
                )}
              </div>
            }
          />
        )}
        {connection.isSuccess && !connection.isFetching && (
          <Alert
            showIcon
            type="success"
            title="健康检查通过"
            description="后端健康接口可达。任务、认证和部署能力的接入状态请查看下方。"
          />
        )}
      </Panel>
      <Panel title="功能接入">
        <Descriptions
          column={1}
          size="small"
          items={[
            {
              key: 'auth',
              label: '用户认证',
              children: (
                <>
                  <Tag>待接入</Tag>登录和访问权限
                </>
              ),
            },
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
              label: 'Agent 与工具',
              children: (
                <>
                  <Tag>待接入</Tag>需求分析、环境查询和资源计划
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
