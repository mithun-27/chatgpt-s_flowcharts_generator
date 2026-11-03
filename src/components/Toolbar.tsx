import type { RefObject } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Code2,
  Maximize2,
  Plus,
  Shapes,
  Trash2,
  Undo2,
  Redo2,
  Wand2,
} from 'lucide-react';
import type {
  FlowDiagram,
  LayoutDirection,
  NodeColor,
  NodeShape,
} from '../types/diagram';
import {
  COLOR_ORDER,
  NODE_COLORS,
  SHAPE_LABELS,
  SHAPE_ORDER,
} from '../editor/nodeTheme';
import ExportMenu from './ExportMenu';
import type { ToastKind } from './Toast';

interface ToolbarProps {
  diagram: FlowDiagram;
  containerRef: RefObject<HTMLDivElement | null>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddNode: () => void;
  onDeleteSelection: () => void;
  onApplyShape: (shape: NodeShape) => void;
  onApplyColor: (color: NodeColor) => void;
  onSetDirection: (direction: LayoutDirection) => void;
  onFitView: () => void;
  onOpenMermaid: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
}

function Divider() {
  return <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" />;
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
        active
          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
          : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
    </button>
  );
}

export default function Toolbar({
  diagram,
  containerRef,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAddNode,
  onDeleteSelection,
  onApplyShape,
  onApplyColor,
  onSetDirection,
  onFitView,
  onOpenMermaid,
  onToast,
}: ToolbarProps) {
  const selectedNodes = diagram.nodes.filter((node) => node.selected);
  const hasSelection = selectedNodes.length > 0 || diagram.edges.some((edge) => edge.selected);
  const firstSelected = selectedNodes[0];
  const shape = firstSelected?.data.shape;
  const color = firstSelected?.data.color;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={onAddNode}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 text-xs font-semibold text-white transition hover:bg-blue-700"
      >
        <Plus size={14} />
        Add step
      </button>
      <IconButton
        label="Delete selected"
        onClick={onDeleteSelection}
        disabled={!hasSelection}
      >
        <Trash2 size={15} />
      </IconButton>

      <Divider />

      <div className="flex items-center gap-1.5">
        <Shapes size={14} className="text-slate-400" />
        <select
          value={shape ?? ''}
          onChange={(event) => onApplyShape(event.target.value as NodeShape)}
          disabled={!firstSelected}
          aria-label="Change node shape"
          title="Change node shape"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          {!shape && <option value="">Shape</option>}
          {SHAPE_ORDER.map((value) => (
            <option key={value} value={value}>
              {SHAPE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1" aria-label="Node color">
        {COLOR_ORDER.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onApplyColor(value)}
            disabled={!firstSelected}
            aria-label={`Set color ${NODE_COLORS[value].label}`}
            aria-pressed={color === value}
            title={`Color: ${NODE_COLORS[value].label}`}
            className={`h-5 w-5 rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-35 ${
              color === value
                ? 'scale-110 border-slate-700 ring-2 ring-slate-300 dark:border-white dark:ring-slate-600'
                : 'border-white/80 hover:scale-110 dark:border-slate-800'
            }`}
            style={{ backgroundColor: NODE_COLORS[value].swatch }}
          />
        ))}
      </div>

      <Divider />

      <IconButton
        label="Vertical layout"
        onClick={() => onSetDirection('TB')}
        active={diagram.direction === 'TB'}
      >
        <ArrowDown size={15} />
      </IconButton>
      <IconButton
        label="Horizontal layout"
        onClick={() => onSetDirection('LR')}
        active={diagram.direction === 'LR'}
      >
        <ArrowRight size={15} />
      </IconButton>
      <button
        type="button"
        onClick={() => onSetDirection(diagram.direction)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        title="Automatically arrange all nodes"
      >
        <Wand2 size={14} />
        <span className="hidden lg:inline">Auto arrange</span>
      </button>

      <Divider />

      <IconButton label="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
        <Undo2 size={15} />
      </IconButton>
      <IconButton label="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
        <Redo2 size={15} />
      </IconButton>
      <IconButton label="Fit diagram to view" onClick={onFitView}>
        <Maximize2 size={14} />
      </IconButton>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenMermaid}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Code2 size={14} />
          <span className="hidden sm:inline">Mermaid</span>
        </button>
        <ExportMenu diagram={diagram} containerRef={containerRef} onToast={onToast} />
      </div>
    </div>
  );
}
