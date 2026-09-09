import { Button, Empty, Spin, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router';
import { Panel } from '../../components/Panel';
import { IconButton } from '../../components/IconButton';
import { AgentFeedback } from '../agent/AgentFeedback';
import { taskStatusLabels } from '../agent/api';
import { useAgentTasks } from '../agent/queries';

export default function TasksPage() {
  const tasks = useAgentTasks();
  const navigate = useNavigate();
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>方案分析</h1>
          <p>查看最近 50 个分析会话，继续完善部署需求。</p>
        </div>
        <Button
          icon={<PlusOutlined aria-hidden="true" />}
          onClick={() => {
            void navigate('/');
          }}
        >
          新建方案
        </Button>
      </div>
      <Panel
        title="分析任务"
        actions={
          <IconButton
            label="刷新分析任务"
            icon={<ReloadOutlined />}
            loading={tasks.isFetching}
            onClick={() => {
              void tasks.refetch();
            }}
          />
        }
      >
        {tasks.isPending && (
          <div className="page-loading" role="status">
            <Spin />
            正在加载方案…
          </div>
        )}
        {tasks.isError && <AgentFeedback error={tasks.error} />}
        {tasks.isSuccess && tasks.data.items.length === 0 && (
          <div className="empty-region">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有分析方案">
              <Link to="/">用一句话开始分析 →</Link>
            </Empty>
          </div>
        )}
        {tasks.data && tasks.data.items.length > 0 && (
          <ul className="task-list" aria-label="分析任务列表">
            {tasks.data.items.map((task) => (
              <li key={task.task_id}>
                <div className="task-list-main">
                  <Link to={`/tasks/${task.task_id}`}>{task.title}</Link>
                  <span className="muted">
                    最近更新 {new Date(task.update_at).toLocaleString('zh-CN')}
                  </span>
                </div>
                <Tag
                  color={
                    task.status === 'queued'
                      ? 'processing'
                      : task.status === 'failed'
                        ? 'error'
                        : task.status === 'ready'
                          ? 'blue'
                          : 'warning'
                  }
                >
                  {taskStatusLabels[task.status]}
                </Tag>
              </li>
            ))}
          </ul>
        )}
        <p className="field-help">方案就绪表示需求已整理完成，尚未执行资源预览或部署。</p>
      </Panel>
    </div>
  );
}
