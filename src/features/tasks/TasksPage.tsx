import { Button, Empty } from 'antd';
import { useNavigate } from 'react-router';
import { Panel } from '../../components/Panel';

export default function TasksPage() {
  const navigate = useNavigate();
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>部署任务</h1>
          <p>查看部署记录、资源计划和执行结果。</p>
        </div>
        <Button
          onClick={() => {
            void navigate('/');
          }}
        >
          准备部署需求
        </Button>
      </div>
      <Panel title="任务列表">
        <div className="empty-region">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <>
                <strong>任务列表尚未接入</strong>
                <p>连接任务服务后，将显示实际部署记录。</p>
              </>
            }
          >
            <Button
              onClick={() => {
                void navigate('/settings');
              }}
            >
              查看连接状态
            </Button>
          </Empty>
        </div>
      </Panel>
    </div>
  );
}
