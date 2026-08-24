import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphComposeState } from './types';
import { nodeCaption, nodePosition } from './graph-compose-utils';
import { type Actions } from './useApp';

type FlowData = { kind: string; label: string; caption: string };

function KindNode({ data }: NodeProps<Node<FlowData>>) {
  return (
    <div className={'graph-rf-node kind-' + data.kind}>
      <Handle type="target" position={Position.Left} />
      <div className="graph-rf-id">{data.label}</div>
      <div className="graph-rf-kind">{data.kind}</div>
      <div className="graph-rf-caption">{data.caption}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agent: KindNode,
  tool: KindNode,
  gate: KindNode,
};

function GraphCanvasInner({ c, act }: { c: GraphComposeState; act: Actions }) {
  const built: Node<FlowData>[] = useMemo(
    () =>
      c.spec.nodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: nodePosition(c.spec, n),
        data: {
          kind: n.kind,
          label: n.id,
          caption: nodeCaption(n, c.agents, c.tools),
        },
        selected: c.selectedNodeId === n.id,
      })),
    [c.spec, c.selectedNodeId, c.agents, c.tools],
  );

  const [nodes, setNodes] = useState(built);
  const dragging = useRef(false);

  useEffect(() => {
    if (dragging.current) return;
    setNodes((prev) => {
      const pos = new Map(prev.map((n) => [n.id, n.position]));
      return built.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
    });
  }, [built]);

  const edges: Edge[] = useMemo(
    () =>
      c.spec.edges.map((e) => ({
        id: e.from + '->' + e.to,
        source: e.from,
        target: e.to,
      })),
    [c.spec.edges],
  );

  const onNodesChange = useCallback((changes: NodeChange<Node<FlowData>>[]) => {
    if (changes.some((ch) => ch.type === 'position' && ch.dragging)) dragging.current = true;
    if (changes.some((ch) => ch.type === 'position' && ch.dragging === false)) dragging.current = false;
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      act.connectGraphEdge(conn.source, conn.target);
    },
    [act],
  );

  return (
    <div className="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => act.editGraphComposeMeta({ selectedNodeId: node.id })}
        onPaneClick={() => act.editGraphComposeMeta({ selectedNodeId: null })}
        onNodeDragStop={(_, node) => act.setGraphNodePosition(node.id, node.position.x, node.position.y)}
        onNodesDelete={(deleted) => {
          for (const n of deleted) act.removeGraphStep(n.id);
        }}
        onEdgesDelete={(deleted) => {
          for (const e of deleted) act.disconnectGraphEdge(e.source, e.target);
        }}
        fitView
        minZoom={0.15}
        maxZoom={1.6}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

export default function GraphCanvas({ c, act }: { c: GraphComposeState; act: Actions }) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner c={c} act={act} />
    </ReactFlowProvider>
  );
}
