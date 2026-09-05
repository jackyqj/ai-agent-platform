import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentComposeView from './AgentComposeView';
import type { Actions } from './useApp';
import type { AppState, SkillItem } from './types';

const published: SkillItem = {
  id: 'sk1',
  slug: 'leave-faq',
  title: '请假 FAQ',
  description: '请假',
  status: 'published',
  likeCount: 0,
  dislikeCount: 0,
  score: 0,
  stars: 0,
  publishedVersion: '0.2.0',
  tags: ['hr'],
  publishedVersions: ['0.2.0', '0.1.0'],
};

function composeState(skills: Array<{ skillId: string; version: string }> = []): AppState {
  return {
    skills: [published],
    compose: {
      agentId: 'assistant',
      spec: {
        id: 'assistant',
        name: '通用助手',
        description: '',
        visibility: {},
        approvalLevel: 'none',
        modelRoute: { provider: 'p', model: 'm', pinned: false },
        persona: 'hi',
        mcp: [],
        skills,
      },
      version: 1,
      dirty: false,
      catalog: { models: [{ provider: 'p', model: 'm', label: 'm' }], mcpServers: [], hostPlane: [] },
      previewYaml: '',
      issues: [],
      revisions: [],
      saving: false,
      publishing: false,
    },
  } as unknown as AppState;
}

describe('AgentComposeView SkillPicker', () => {
  it('pins the published version and can remove the binding', async () => {
    const user = userEvent.setup();
    const editComposeSpec = vi.fn();
    const act = { editComposeSpec, closeCompose: vi.fn() } as unknown as Actions;
    const { rerender } = render(<AgentComposeView state={composeState()} act={act} />);
    await user.click(screen.getByRole('button', { name: '最新（钉死）' }));
    expect(editComposeSpec).toHaveBeenCalledWith({ skills: [{ skillId: 'sk1', version: '0.2.0' }] });

    await user.selectOptions(screen.getByLabelText('版本 leave-faq'), '0.1.0');
    expect(editComposeSpec).toHaveBeenCalledWith({ skills: [{ skillId: 'sk1', version: '0.1.0' }] });

    rerender(<AgentComposeView state={composeState([{ skillId: 'sk1', version: '0.1.0' }])} act={act} />);
    expect(screen.getByText('钉死 0.1.0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '更新到 0.2.0' }));
    expect(editComposeSpec).toHaveBeenCalledWith({ skills: [{ skillId: 'sk1', version: '0.2.0' }] });
    await user.click(screen.getByRole('button', { name: '移除' }));
    expect(editComposeSpec).toHaveBeenCalledWith({ skills: [] });
  });
});
