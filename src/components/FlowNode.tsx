import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNode } from '../types/diagram';
import { NODE_COLORS, NODE_SIZES } from '../editor/nodeTheme';
import { useEditorActions } from '../editor/EditorActionsContext';

const DECISION_CLIP = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
const IO_CLIP = 'polygon(12% 0%, 100% 0%, 88% 100%, 0% 100%)';

function FlowNodeView({ id, data, selected, isConnectable }: NodeProps<FlowNode>) {
  const { updateNodeLabel, beginNodeEdit, endNodeEdit } = useEditorActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelledRef = useRef(false);

  const size = NODE_SIZES[data.shape] ?? NODE_SIZES.process;
  const palette = NODE_COLORS[data.color] ?? NODE_COLORS.slate;
  const filter = `drop-shadow(0 3px 4px rgba(15, 23, 42, 0.16))${
    selected ? ' drop-shadow(0 0 3px rgba(37, 99, 235, 0.9))' : ''
  }`;

  useEffect(() => {
    if (!editing) setDraft(data.label);
  }, [data.label, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  const startEditing = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (editing) return;
    cancelledRef.current = false;
    setDraft(data.label);
    setEditing(true);
    beginNodeEdit();
  };

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setEditing(false);
      setDraft(data.label);
      endNodeEdit();
      return;
    }
    const next =
      draft
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 3)
        .join('\n') || data.label;
    setDraft(next);
    setEditing(false);
    updateNodeLabel(id, next);
    endNodeEdit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelledRef.current = true;
      event.currentTarget.blur();
    }
    event.stopPropagation();
  };

  const label = editing ? (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className="nodrag nowheel h-full w-full resize-none overflow-hidden rounded-md border border-blue-400 bg-white/95 p-1 text-center text-[12px] font-medium leading-snug text-slate-900 shadow-sm focus:outline-none"
      aria-label="Edit node label"
    />
  ) : (
    <span className="line-clamp-5 max-w-full whitespace-pre-line break-words text-center text-[13px] font-semibold leading-snug">
      {data.label}
    </span>
  );

  const content = (
    <div
      className="relative flex h-full w-full items-center justify-center"
      style={{ color: palette.text, filter }}
      onDoubleClick={startEditing}
      title={editing ? undefined : `${data.label} — double-click to edit`}
    >
      <Handles isConnectable={isConnectable} />
      {data.shape === 'decision' ? (
        <>
          <div
            className="absolute inset-0"
            style={{ backgroundColor: palette.border, clipPath: DECISION_CLIP }}
          />
          <div
            className="absolute inset-[2px]"
            style={{ backgroundColor: palette.fill, clipPath: DECISION_CLIP }}
          />
          <div className="relative z-10 w-full px-7 text-center">{label}</div>
        </>
      ) : data.shape === 'inputOutput' ? (
        <>
          <div
            className="absolute inset-0"
            style={{ backgroundColor: palette.border, clipPath: IO_CLIP }}
          />
          <div
            className="absolute inset-[2px]"
            style={{ backgroundColor: palette.fill, clipPath: IO_CLIP }}
          />
          <div className="relative z-10 w-full px-9 text-center">{label}</div>
        </>
      ) : data.shape === 'document' ? (
        <>
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 200 92"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M2 2 H198 V78 C160 99 40 59 2 78 Z"
              fill={palette.fill}
              stroke={palette.border}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </svg>
          <div className="relative z-10 w-full px-7 pb-3 text-center">{label}</div>
        </>
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center border-2 px-6 ${
            data.shape === 'connector'
              ? 'rounded-full'
              : data.shape === 'startEnd'
                ? 'rounded-full'
                : 'rounded-xl'
          }`}
          style={{
            backgroundColor: palette.fill,
            borderColor: palette.border,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ width: size.width, height: size.height }} className="flow-node">
      {content}
    </div>
  );
}

function Handles({ isConnectable }: { isConnectable?: boolean }) {
  const sides: Array<{ id: string; position: Position }> = [
    { id: 'top', position: Position.Top },
    { id: 'right', position: Position.Right },
    { id: 'bottom', position: Position.Bottom },
    { id: 'left', position: Position.Left },
  ];

  return (
    <>
      {sides.map((side) => (
        <Handle
          key={side.id}
          id={side.id}
          type="source"
          position={side.position}
          isConnectable={isConnectable}
          className="flow-handle"
        />
      ))}
    </>
  );
}

export default memo(FlowNodeView);
