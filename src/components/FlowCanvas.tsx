import { useCallback } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
} from '@xyflow/react';
import { Plus, Sparkles } from 'lucide-react';
import type { FlowDiagram, FlowEdge, FlowNode } from '../types/diagram';
import FlowNodeView from './FlowNode';
import FlowEdgeView from './FlowEdge';

interface FlowCanvasProps {
  diagram: FlowDiagram;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: OnConnect;
  onNodeDragStart: () => void;
  onNodeDragStop: () => void;
  onAddNode: () => void;
  onLoadSample: () => void;
}

const nodeTypes = { flow: FlowNodeView };
const edgeTypes = { flow: FlowEdgeView };

const defaultEdgeOptions = {
  type: 'flow',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: '#64748b',
  },
};

export default function FlowCanvas({
  diagram,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDragStart,
  onNodeDragStop,
  onAddNode,
  onLoadSample,
}: FlowCanvasProps) {
  const handleConnect = useCallback<OnConnect>(
    (connection: Connection) => {
      onConnect(connection);
    },
    [onConnect],
  );

  return (
    <div className="flow-canvas relative h-full w-full">
      <ReactFlow
        nodes={diagram.nodes}
        edges={diagram.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: '#2563eb', strokeWidth: 2 }}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1.15 }}
        className="bg-[var(--canvas-bg)]"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="var(--canvas-dots)"
        />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      {diagram.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
              <Sparkles size={20} />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Your canvas is empty
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Add a step or load a sample, then drag from any node handle to
              connect it.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={onAddNode}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                <Plus size={13} />
                Add step
              </button>
              <button
                type="button"
                onClick={onLoadSample}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Load sample
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
