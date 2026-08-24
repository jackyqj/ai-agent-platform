import type { GraphEdge, GraphNode, GraphSpec } from './types';

export function linearEdges(nodes: GraphNode[]): GraphSpec['edges'] {
  const edges: GraphSpec['edges'] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  }
  return edges;
}

export function newStepId(nodes: GraphNode[]): string {
  let n = nodes.length + 1;
  let id = `step-${n}`;
  const used = new Set(nodes.map((x) => x.id));
  while (used.has(id)) {
    n += 1;
    id = `step-${n}`;
  }
  return id;
}

export function dropEdgesTouching(edges: GraphEdge[], nodeId: string): GraphEdge[] {
  return edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
}

export function topoOk(spec: Pick<GraphSpec, 'nodes' | 'edges'>): boolean {
  const ids = new Set(spec.nodes.map((n) => n.id));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) {
    indeg.set(id, 0);
    adj.set(id, []);
  }
  for (const e of spec.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) return false;
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const q = [...ids].filter((id) => indeg.get(id) === 0);
  let seen = 0;
  while (q.length) {
    const id = q.shift()!;
    seen += 1;
    for (const nxt of adj.get(id) ?? []) {
      const n = (indeg.get(nxt) ?? 0) - 1;
      indeg.set(nxt, n);
      if (n === 0) q.push(nxt);
    }
  }
  return seen === ids.size;
}

export function wouldCreateCycle(spec: GraphSpec, from: string, to: string): boolean {
  if (from === to) return true;
  if (spec.edges.some((e) => e.from === from && e.to === to)) return false;
  return !topoOk({ nodes: spec.nodes, edges: [...spec.edges, { from, to }] });
}

const COL_W = 220;
const ROW_H = 96;

export function defaultPosition(spec: GraphSpec, nodeId: string): { x: number; y: number } {
  const ranks = new Map<string, number>();
  const ids = spec.nodes.map((n) => n.id);
  for (const id of ids) ranks.set(id, 0);
  for (let i = 0; i < ids.length; i++) {
    for (const e of spec.edges) {
      ranks.set(e.to, Math.max(ranks.get(e.to) ?? 0, (ranks.get(e.from) ?? 0) + 1));
    }
  }
  const buckets = new Map<number, string[]>();
  for (const n of spec.nodes) {
    const r = ranks.get(n.id) ?? 0;
    buckets.set(r, [...(buckets.get(r) ?? []), n.id]);
  }
  const rank = ranks.get(nodeId) ?? 0;
  const row = (buckets.get(rank) ?? []).indexOf(nodeId);
  return { x: 24 + rank * COL_W, y: 24 + Math.max(0, row) * ROW_H };
}

export function nodePosition(spec: GraphSpec, node: GraphNode): { x: number; y: number } {
  if (typeof node.x === 'number' && typeof node.y === 'number') return { x: node.x, y: node.y };
  return defaultPosition(spec, node.id);
}

export function nodeCaption(
  node: GraphNode,
  agents: Array<{ id: string; name: string }>,
  tools: Array<{ id: string; name?: string }>,
): string {
  switch (node.kind) {
    case 'agent': {
      const a = agents.find((x) => x.id === node.agentPresetId)
      return a?.name || node.agentPresetId || '未选择 Agent'
    }
    case 'tool': {
      const t = tools.find((x) => x.id === node.toolId)
      return t?.name || node.toolId || '未选择工具'
    }
    case 'gate':
      return node.when?.trim() || '未填 when'
    default: {
      const _never: never = node.kind
      return _never
    }
  }
}
