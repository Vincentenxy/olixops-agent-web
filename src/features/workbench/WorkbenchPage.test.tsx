import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import WorkbenchPage from './WorkbenchPage';
import { draftKey } from './draft';
const DRAFT_KEY = draftKey('test-user');
vi.mock('../auth/context', () => ({ useAuth: () => ({ user: { user_id: 'test-user' } }) }));
vi.mock('../agent/StartAnalysis', () => ({ StartAnalysis: () => null }));

function renderWorkbench() {
  return render(
    <MemoryRouter>
      <WorkbenchPage />
    </MemoryRouter>,
  );
}

describe('Deployment draft workflow', () => {
  it('saves and restores across a remount, reverts edits, and removes the saved draft', async () => {
    const user = userEvent.setup();
    const first = renderWorkbench();
    await user.type(screen.getByLabelText('你希望如何部署？'), '将应用部署到测试环境');
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    expect(screen.getByRole('status')).toHaveTextContent('草稿已保存在当前浏览器');
    expect(screen.getByRole('button', { name: '提交部署' })).toBeDisabled();
    first.unmount();
    renderWorkbench();
    expect(screen.getByLabelText('你希望如何部署？')).toHaveValue('将应用部署到测试环境');
    await user.type(screen.getByLabelText('你希望如何部署？'), '，修改需求');
    await user.click(screen.getByRole('button', { name: '恢复已保存' }));
    expect(screen.getByLabelText('你希望如何部署？')).toHaveValue('将应用部署到测试环境');
    await user.click(screen.getByRole('button', { name: '清空草稿' }));
    expect(screen.getByLabelText('你希望如何部署？')).toHaveValue('');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('does not silently persist unsaved content', () => {
    const view = renderWorkbench();
    fireEvent.change(screen.getByLabelText('你希望如何部署？'), {
      target: { value: '尚未保存的需求' },
    });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    view.unmount();
    renderWorkbench();
    expect(screen.getByLabelText('你希望如何部署？')).toHaveValue('');
  });

  it('rejects repository credentials before writing a draft', async () => {
    const user = userEvent.setup();
    renderWorkbench();
    fireEvent.change(screen.getByLabelText(/应用仓库/), {
      target: { value: 'https://user:password@example.com/app.git' },
    });
    fireEvent.change(screen.getByLabelText('你希望如何部署？'), {
      target: { value: '部署测试环境' },
    });
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    expect(screen.getByRole('status')).toHaveTextContent('不能包含凭据');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('keeps edits available when browser storage is full', async () => {
    const user = userEvent.setup();
    renderWorkbench();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    fireEvent.change(screen.getByLabelText('你希望如何部署？'), {
      target: { value: '待保存的需求' },
    });
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    expect(screen.getByRole('status')).toHaveTextContent('无法保存草稿');
    expect(screen.getByLabelText('你希望如何部署？')).toHaveValue('待保存的需求');
  });

  it('shows corrupt storage and allows explicitly clearing it', async () => {
    localStorage.setItem(DRAFT_KEY, '{bad-json');
    const user = userEvent.setup();
    renderWorkbench();
    expect(screen.getByRole('status')).toHaveTextContent('无法读取本地草稿');
    await user.click(screen.getByRole('button', { name: '清空草稿' }));
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('本地草稿已清空');
  });
});
