const LEGACY_DRAFT_KEY = 'olixops:deployment-draft:v1';
export function draftKey(userId: string) {
  return `olixops:deployment-draft:v2:${encodeURIComponent(userId)}`;
}
export interface DeploymentDraft {
  repository: string;
  revision: string;
  requirement: string;
}
export const emptyDraft: DeploymentDraft = { repository: '', revision: 'main', requirement: '' };
export interface SavedDraft {
  version: 1;
  savedAt: string;
  draft: DeploymentDraft;
}

function isDraft(value: unknown): value is DeploymentDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    'repository' in value &&
    typeof value.repository === 'string' &&
    value.repository.length <= 2000 &&
    'revision' in value &&
    typeof value.revision === 'string' &&
    value.revision.length <= 200 &&
    'requirement' in value &&
    typeof value.requirement === 'string' &&
    value.requirement.length <= 8000
  );
}

export function readDraft(userId: string): SavedDraft | null {
  const raw = localStorage.getItem(draftKey(userId));
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('savedAt' in value) ||
    typeof value.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.savedAt)) ||
    !('draft' in value) ||
    !isDraft(value.draft)
  )
    throw new Error('保存的草稿格式无法识别，请清空后重新保存');
  return { version: 1, savedAt: value.savedAt, draft: value.draft };
}

export function validateDraft(draft: DeploymentDraft): string | null {
  if (!draft.requirement.trim()) return '请先填写部署需求';
  if (draft.repository.trim()) {
    try {
      const url = new URL(draft.repository);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        return '仓库地址需使用 HTTPS，且不能包含凭据、查询参数或片段';
      }
    } catch {
      return '请填写有效的 HTTPS 仓库地址';
    }
  }
  return null;
}

export function saveDraft(userId: string, draft: DeploymentDraft): SavedDraft {
  if (!isDraft(draft)) throw new Error('草稿内容超出长度限制');
  const error = validateDraft(draft);
  if (error) throw new Error(error);
  const saved: SavedDraft = { version: 1, savedAt: new Date().toISOString(), draft };
  localStorage.setItem(draftKey(userId), JSON.stringify(saved));
  return saved;
}

export function removeDraft(userId: string) {
  localStorage.removeItem(draftKey(userId));
  localStorage.removeItem(LEGACY_DRAFT_KEY);
}
