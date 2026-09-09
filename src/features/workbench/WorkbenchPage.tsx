import { useState } from 'react';
import { Alert, Button, Input, Space, Tag } from 'antd';
import { ArrowRightOutlined, SaveOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { useAuth } from '../auth/context';
import { StartAnalysis } from '../agent/StartAnalysis';
import { Panel } from '../../components/Panel';
import { emptyDraft, readDraft, removeDraft, saveDraft } from './draft';
import type { DeploymentDraft, SavedDraft } from './draft';

function initialState(userId: string) {
  try {
    const saved = readDraft(userId);
    return { draft: saved?.draft ?? emptyDraft, saved, error: '' };
  } catch {
    return {
      draft: emptyDraft,
      saved: null,
      error: '无法读取本地草稿，可以继续编辑或清空草稿后重试',
    };
  }
}

export default function WorkbenchPage() {
  const { user } = useAuth();
  if (!user) throw new Error('Authenticated user required');
  const userId = user.user_id;
  const [initial] = useState(() => initialState(userId));
  const [draft, setDraft] = useState<DeploymentDraft>(initial.draft);
  const [saved, setSaved] = useState<SavedDraft | null>(initial.saved);
  const [feedback, setFeedback] = useState({ text: initial.error, error: !!initial.error });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved?.draft ?? emptyDraft);
  function update(field: keyof DeploymentDraft, value: string) {
    setDraft({ ...draft, [field]: value });
    setFeedback({ text: '', error: false });
  }
  function save() {
    try {
      setSaved(saveDraft(userId, draft));
      setFeedback({ text: '草稿已保存在当前浏览器', error: false });
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error && !(error instanceof DOMException)
            ? error.message
            : '无法保存草稿，请检查浏览器存储权限或可用空间',
        error: true,
      });
    }
  }
  function restore() {
    if (saved) {
      setDraft(saved.draft);
      setFeedback({ text: '已恢复到上次保存的内容', error: false });
    }
  }
  function clear() {
    try {
      removeDraft(userId);
      setSaved(null);
      setDraft(emptyDraft);
      setFeedback({ text: '本地草稿已清空', error: false });
    } catch {
      setFeedback({ text: '无法清空草稿，请检查浏览器存储权限', error: true });
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>部署工作台</h1>
          <p>用一句话描述 Redis 或 PostgreSQL 需求，先完善 Kubernetes 部署方案。</p>
        </div>
        <Tag>准备阶段</Tag>
      </div>
      <div className="workbench-grid">
        <Panel
          title="部署需求"
          actions={
            <span className="muted draft-indicator">
              {dirty ? '有未保存修改' : saved ? '已保存草稿' : '新草稿'}
            </span>
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
            className="draft-form"
          >
            <div className="form-row">
              <div className="field">
                <label htmlFor="repository">
                  应用仓库 <span className="muted">（可选，仅草稿）</span>
                </label>
                <Input
                  id="repository"
                  placeholder="https://git.example.com/team/app.git"
                  value={draft.repository}
                  onChange={(event) => update('repository', event.target.value)}
                  maxLength={2000}
                  autoComplete="off"
                />
              </div>
              <div className="field revision-field">
                <label htmlFor="revision">分支 / 版本</label>
                <Input
                  id="revision"
                  value={draft.revision}
                  onChange={(event) => update('revision', event.target.value)}
                  maxLength={200}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="requirement">你希望如何部署？</label>
              <Input.TextArea
                id="requirement"
                value={draft.requirement}
                onChange={(event) => update('requirement', event.target.value)}
                placeholder="例如：在测试集群的 demo 命名空间部署 Redis 7.4，名称 cache，存储 10 GiB，单副本。"
                rows={9}
                maxLength={8000}
                showCount
                aria-describedby="draft-hint"
              />
            </div>
            <p id="draft-hint" className="field-help">
              仅保存非敏感需求。请勿填写密码、访问令牌或云密钥；草稿按当前账号保存在此浏览器，退出登录时清除。
            </p>
            {feedback.text && (
              <Alert
                type={feedback.error ? 'error' : 'success'}
                showIcon
                title={<span role="status">{feedback.text}</span>}
              />
            )}
            <StartAnalysis message={draft.requirement} />
            <div className="form-actions">
              <Space wrap>
                <Button htmlType="submit" icon={<SaveOutlined aria-hidden="true" />}>
                  保存草稿
                </Button>
                <Button onClick={restore} disabled={!saved || !dirty}>
                  恢复已保存
                </Button>
                <Button onClick={clear} disabled={!saved && !dirty && !feedback.error}>
                  清空草稿
                </Button>
              </Space>
              <Button
                type="primary"
                icon={<ArrowRightOutlined aria-hidden="true" />}
                disabled
                aria-describedby="deployment-unavailable"
              >
                提交部署
              </Button>
            </div>
            <div id="deployment-unavailable" className="availability-note">
              方案分析不会执行部署；实际资源变更尚未接入。<Link to="/settings">查看连接状态</Link>
            </div>
          </form>
        </Panel>
        <Panel title="部署流程" className="workflow-panel">
          <ol className="workflow">
            <li>
              <span>1</span>
              <div>
                <strong>整理需求</strong>
                <p>确认服务版本、存储与目标环境</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>确认部署规格</strong>
                <p>补齐问题，生成结构化方案</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>资源预览与部署</strong>
                <p>待接入环境查询、审核与执行</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>验证结果</strong>
                <p>待接入部署日志、状态和访问地址</p>
              </div>
            </li>
          </ol>
          <div className="workflow-note">
            当前支持需求分析与补充，后续步骤尚未接入。<Link to="/tasks">查看分析方案 →</Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
