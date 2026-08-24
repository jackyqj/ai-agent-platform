import { describe, it, expect } from 'vitest';
import { defaultPosition, dropEdgesTouching, linearEdges, newStepId, nodeCaption, topoOk, wouldCreateCycle } from './graph-compose-utils';
import type { GraphSpec } from './types';

const diamond: GraphSpec = {
  onError: 'stop',
  nodes: [
    { id: 'a', kind: 'agent' },
    { id: 'b', kind: 'tool' },
    { id: 'c', kind: 'tool' },
    { id: 'd', kind: 'gate' },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'a', to: 'c' },
    { from: 'b', to: 'd' },
    { from: 'c', to: 'd' },
  ],
};

describe('graph-compose-utils', () => {
  it('builds linear edges from step order', () => {
    expect(linearEdges([
      { id: 'a', kind: 'tool' },
      { id: 'b', kind: 'agent' },
      { id: 'c', kind: 'gate' },
    ])).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
  });

  it('allocates unique step ids', () => {
    expect(newStepId([])).toBe('step-1');
    expect(newStepId([{ id: 'step-1', kind: 'agent' }])).toBe('step-2');
  });

  it('accepts a diamond DAG and rejects a cycle', () => {
    expect(topoOk(diamond)).toBe(true);
    expect(wouldCreateCycle(diamond, 'd', 'a')).toBe(true);
    expect(wouldCreateCycle(diamond, 'b', 'c')).toBe(false);
  });

  it('drops edges touching a removed node', () => {
    expect(dropEdgesTouching(diamond.edges, 'b')).toEqual([
      { from: 'a', to: 'c' },
      { from: 'c', to: 'd' },
    ]);
  });

  it('lays out fan-out in separate columns', () => {
    const a = defaultPosition(diamond, 'a');
    const b = defaultPosition(diamond, 'b');
    const c = defaultPosition(diamond, 'c');
    const d = defaultPosition(diamond, 'd');
    expect(b.x).toBe(c.x);
    expect(b.x).toBeGreaterThan(a.x);
    expect(d.x).toBeGreaterThan(b.x);
    expect(b.y).not.toBe(c.y);
  });

  it('shows selected agent/tool names on canvas captions', () => {
    expect(nodeCaption(
      { id: 'a', kind: 'agent', agentPresetId: 'hr' },
      [{ id: 'hr', name: '人事助手' }],
      [],
    )).toBe('人事助手');
    expect(nodeCaption(
      { id: 't', kind: 'tool', toolId: 'get-invoice' },
      [],
      [{ id: 'get-invoice', name: '查发票' }],
    )).toBe('查发票');
    expect(nodeCaption({ id: 'g', kind: 'gate' }, [], [])).toBe('未填 when');
  });
});
