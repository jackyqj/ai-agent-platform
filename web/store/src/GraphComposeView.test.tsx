import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GraphComposeView from './GraphComposeView';
import type { AppState, GraphComposeState } from './types';
import type { Actions } from './useApp';

function compose(partial: Partial<GraphComposeState> = {}): GraphComposeState {
  return {
    graphId: 'g1',
    name: '报销',
    description: '',
    visibility: {},
    spec: {
      onError: 'stop',
      nodes: [
        { id: 'step-1', kind: 'agent', agentPresetId: 'assistant', promptTemplate: '{{input.task}}' },
        { id: 'step-2', kind: 'tool', toolId: 'http.get' },
      ],
      edges: [{ from: 'step-1', to: 'step-2' }],
    },
    version: 1,
    status: 'draft',
    dirty: false,
    showAdvancedJson: false,
    editorMode: 'canvas',
    selectedNodeId: null,
    agents: [{ id: 'assistant', name: '通用助手', description: '', status: 'published' }],
    tools: [{ id: 'http.get', connectorId: 'erp', name: '查接口', status: 'published', description: '' }],
    revisions: [],
    trialTask: '',
    trialRun: null,
    trialBusy: false,
    saving: false,
    publishing: false,
    ...partial,
  };
}

function actStub(overrides: Partial<Actions> = {}): Actions {
  return new Proxy({ ...overrides }, {
    get(target, prop: string) {
      const bag = target as Record<string, unknown>;
      if (prop in bag) return bag[prop];
      return vi.fn();
    },
  }) as unknown as Actions;
}

describe('GraphComposeView canvas', () => {
  it('mounts React Flow with spec nodes and can switch to list', async () => {
    const user = userEvent.setup();
    const editGraphComposeMeta = vi.fn();
    render(
      <GraphComposeView
        state={{ graphCompose: compose() } as AppState}
        act={actStub({ editGraphComposeMeta })}
      />,
    );
    expect(document.querySelector('.react-flow')).toBeTruthy();
    expect(screen.getByText('step-1')).toBeTruthy();
    expect(screen.getByText('通用助手')).toBeTruthy();
    expect(screen.getByText('查接口')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '列表' }));
    expect(editGraphComposeMeta).toHaveBeenCalledWith({ editorMode: 'list' });
  });
});
