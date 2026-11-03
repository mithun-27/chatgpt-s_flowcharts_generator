import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
} from '@xyflow/react';
import type {
  FlowDiagram,
  FlowEdge,
  FlowNode,
  LayoutDirection,
  NodeColor,
  NodeShape,
} from '../types/diagram';
import type { HfSettings } from '../types/hf';
import { layoutDiagram } from '../editor/layout';
import { createFlowEdge, createFlowNode } from '../utils/diagram';
import { getSampleDiagram } from '../utils/samples';
import { EditorActionsContext } from '../editor/EditorActionsContext';
import FlowCanvas from './FlowCanvas';
import Toolbar from './Toolbar';
import AssistantPanel from './AssistantPanel';
import type { ToastKind } from './Toast';

interface EditorShellProps {
  diagram: FlowDiagram;
  settings: HfSettings;
  canUndo: boolean;
  canRedo: boolean;
  updateDiagram: (diagram: FlowDiagram) => void;
  commitDiagram: (diagram: FlowDiagram) => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  undo: () => void;
  redo: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onOpenMermaid: (code: string) => void;
  onOpenSettings: () => void;
  fitRequest: number;
}

export default function EditorShell(props: EditorShellProps) {
  return (
    <ReactFlowProvider>
      <EditorShellInner {...props} />
    </ReactFlowProvider>
  );
}

function EditorShellInner({
  diagram,
  settings,
  canUndo,
  canRedo,
  updateDiagram,
  commitDiagram,
  beginTransaction,
  endTransaction,
  undo,
  redo,
  onToast,
  onOpenMermaid,
  onOpenSettings,
  fitRequest,
}: EditorShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView, screenToFlowPosition } = useReactFlow<FlowNode, FlowEdge>();

  // App increments fitRequest whenever a new diagram is loaded, so imports,
  // AI results and samples are always framed without re-fitting on every drag.
  useEffect(() => {
    if (fitRequest === 0) return;
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: 300 });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [fitRequest, fitView]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      updateDiagram({
        ...diagram,
        nodes: applyNodeChanges(changes, diagram.nodes),
      });
    },
    [diagram, updateDiagram],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      updateDiagram({
        ...diagram,
        edges: applyEdgeChanges(changes, diagram.edges),
      });
    },
    [diagram, updateDiagram],
  );

  const onConnect = useCallback<OnConnect>(
    (connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) {
        onToast('A node cannot connect to itself.', 'info');
        return;
      }
      commitDiagram({
        ...diagram,
        edges: [
          ...diagram.edges,
          createFlowEdge(connection.source, connection.target),
        ],
      });
    },
    [commitDiagram, diagram, onToast],
  );

  const addNode = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
    });
    const node = createFlowNode('process', center);
    commitDiagram({
      ...diagram,
      nodes: [
        ...diagram.nodes.map((existing) => ({ ...existing, selected: false })),
        { ...node, selected: true },
      ],
    });
    onToast('Added a process step. Double-click it to rename.', 'success');
  }, [commitDiagram, diagram, onToast, screenToFlowPosition]);

  const deleteSelection = useCallback(() => {
    const nodeIds = new Set(
      diagram.nodes.filter((node) => node.selected).map((node) => node.id),
    );
    const selectedEdges = diagram.edges.filter((edge) => edge.selected);
    if (nodeIds.size === 0 && selectedEdges.length === 0) return;

    const nodes = diagram.nodes.filter((node) => !nodeIds.has(node.id));
    const edges = diagram.edges.filter(
      (edge) =>
        !edge.selected &&
        !nodeIds.has(edge.source) &&
        !nodeIds.has(edge.target),
    );
    commitDiagram({ ...diagram, nodes, edges });
  }, [commitDiagram, diagram]);

  const updateNodeLabel = useCallback(
    (id: string, label: string) => {
      updateDiagram({
        ...diagram,
        nodes: diagram.nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, label } } : node,
        ),
      });
    },
    [diagram, updateDiagram],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      commitDiagram({
        ...diagram,
        edges: diagram.edges.filter((edge) => edge.id !== id),
      });
    },
    [commitDiagram, diagram],
  );

  const applyShape = useCallback(
    (shape: NodeShape) => {
      const selected = diagram.nodes.filter((node) => node.selected);
      if (selected.length === 0) return;
      commitDiagram({
        ...diagram,
        nodes: diagram.nodes.map((node) =>
          node.selected ? { ...node, data: { ...node.data, shape } } : node,
        ),
      });
    },
    [commitDiagram, diagram],
  );

  const applyColor = useCallback(
    (color: NodeColor) => {
      const selected = diagram.nodes.filter((node) => node.selected);
      if (selected.length === 0) return;
      commitDiagram({
        ...diagram,
        nodes: diagram.nodes.map((node) =>
          node.selected ? { ...node, data: { ...node.data, color } } : node,
        ),
      });
    },
    [commitDiagram, diagram],
  );

  const setDirection = useCallback(
    (direction: LayoutDirection) => {
      commitDiagram(layoutDiagram(diagram, direction));
      window.setTimeout(() => {
        void fitView({ padding: 0.22, duration: 300 });
      }, 60);
    },
    [commitDiagram, diagram, fitView],
  );

  const loadSample = useCallback(() => {
    const sample = getSampleDiagram('order', diagram.direction);
    commitDiagram(sample);
    window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: 300 });
    }, 60);
    onToast('Loaded the order processing sample.', 'success');
  }, [commitDiagram, diagram.direction, fitView, onToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.body.dataset.modalOpen === 'true') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelection, redo, undo]);

  const selectedNodeCount = diagram.nodes.filter((node) => node.selected).length;
  const selectedEdgeCount = diagram.edges.filter((edge) => edge.selected).length;
  const selectionCount = selectedNodeCount + selectedEdgeCount;

  return (
    <EditorActionsContext.Provider
      value={{
        updateNodeLabel,
        beginNodeEdit: beginTransaction,
        endNodeEdit: endTransaction,
        deleteEdge,
      }}
    >
      <section
        id="editor"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900"
      >
        <Toolbar
          diagram={diagram}
          containerRef={containerRef}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onAddNode={addNode}
          onDeleteSelection={deleteSelection}
          onApplyShape={applyShape}
          onApplyColor={applyColor}
          onSetDirection={setDirection}
          onFitView={() => {
            void fitView({ padding: 0.22, duration: 300 });
          }}
          onOpenMermaid={() => {
            onOpenMermaid('');
          }}
          onToast={onToast}
        />

        <div ref={containerRef} className="h-[500px] w-full sm:h-[560px] lg:h-[620px]">
          <FlowCanvas
            diagram={diagram}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStart={beginTransaction}
            onNodeDragStop={endTransaction}
            onAddNode={addNode}
            onLoadSample={loadSample}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
          <div className="flex items-center gap-3">
            {diagram.title && (
              <span className="max-w-[16rem] truncate font-semibold text-slate-700 dark:text-slate-200" title={diagram.title}>
                {diagram.title}
              </span>
            )}
            <span>
              <strong className="font-semibold text-slate-700 dark:text-slate-200">
                {diagram.nodes.length}
              </strong>{' '}
              nodes
            </span>
            <span>
              <strong className="font-semibold text-slate-700 dark:text-slate-200">
                {diagram.edges.length}
              </strong>{' '}
              connections
            </span>
            <span className="hidden sm:inline">
              {diagram.direction === 'LR' ? 'Horizontal' : 'Vertical'} layout
            </span>
            {selectionCount > 0 && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                {selectionCount} selected
              </span>
            )}
          </div>
          <span className="hidden md:inline">
            Drag handles to connect · Double-click a node to rename · Delete removes selection
          </span>
        </div>

        <AssistantPanel
          diagram={diagram}
          settings={settings}
          onCommitDiagram={commitDiagram}
          onToast={onToast}
          onOpenSettings={onOpenSettings}
        />
      </section>
    </EditorActionsContext.Provider>
  );
}
