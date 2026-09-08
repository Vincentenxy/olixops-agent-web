import { useState } from 'react';
import { Alert, Button, Input, Space, Tag } from 'antd';
import { ArrowRightOutlined, SaveOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { Panel } from '../../components/Panel';
import { emptyDraft, readDraft, removeDraft, saveDraft } from './draft';
import type { DeploymentDraft, SavedDraft } from './draft';

function initialState() {
  try {
    const saved = readDraft();
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
  const [initial] = useState(initialState);
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
      setSaved(saveDraft(draft));
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
      removeDraft();
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
          <p>描述应用和目标环境，准备一次新的部署。</p>
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
                  应用仓库 <span className="muted">（可选）</span>
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
                placeholder="例如：将这个应用部署到测试环境，使用现有 PostgreSQL，先展示资源变更计划。"
                rows={9}
                maxLength={8000}
                showCount
                aria-describedby="draft-hint"
              />
            </div>
            <p id="draft-hint" className="field-help">
              仅保存非敏感需求。请勿填写密码、访问令牌或云密钥；草稿只保存在当前浏览器。
            </p>
            {feedback.text && (
              <Alert
                type={feedback.error ? 'error' : 'success'}
                showIcon
                title={<span role="status">{feedback.text}</span>}
              />
            )}
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
              部署服务尚未接入，当前可以编辑和保存需求。<Link to="/settings">查看连接状态</Link>
            </div>
          </form>
        </Panel>
        <Panel title="部署流程" className="workflow-panel">
          <ol className="workflow">
            <li>
              <span>1</span>
              <div>
                <strong>分析应用</strong>
                <p>识别运行方式、依赖和部署需求</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>生成资源计划</strong>
                <p>查询环境信息，准备基础设施变更</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>审阅与执行</strong>
                <p>根据环境策略确认计划并部署</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>验证结果</strong>
                <p>检查应用状态，查看日志和访问地址</p>
              </div>
            </li>
          </ol>
          <div className="workflow-note">
            后续任务会在这里展示实际进度。<Link to="/tasks">进入任务列表 →</Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
