import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { X } from 'lucide-react';
import { useEditorActions } from '../editor/EditorActionsContext';

function FlowEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  selected,
}: EdgeProps) {
  const { deleteEdge } = useEditorActions();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const text = typeof label === 'string' ? label : label ? String(label) : '';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={selected ? { stroke: '#2563eb', strokeWidth: 2.4 } : undefined}
      />
      <EdgeLabelRenderer>
        {(text || selected) && (
          <div
            className="nodrag nopan absolute flex items-center gap-1"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            {text && (
              <span className="rounded-md border border-[var(--edge-label-border)] bg-[var(--edge-label-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm dark:text-slate-300">
                {text}
              </span>
            )}
            {selected && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteEdge(id);
                }}
                className="edge-delete flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                title="Remove connection"
                aria-label="Remove connection"
              >
                <X size={11} />
              </button>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(FlowEdgeView);
