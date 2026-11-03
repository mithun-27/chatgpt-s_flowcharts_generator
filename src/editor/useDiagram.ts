import { useCallback, useReducer, useRef } from 'react';
import type { FlowDiagram } from '../types/diagram';

interface HistoryState {
  past: FlowDiagram[];
  present: FlowDiagram;
  future: FlowDiagram[];
}

type HistoryAction =
  | { type: 'update'; diagram: FlowDiagram }
  | { type: 'replace'; diagram: FlowDiagram }
  | { type: 'record'; previous: FlowDiagram }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 50;

function sameDiagram(a: FlowDiagram, b: FlowDiagram): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function reducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'update':
      return { ...state, present: action.diagram };
    case 'replace': {
      if (sameDiagram(state.present, action.diagram)) return state;
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: action.diagram,
        future: [],
      };
    }
    case 'record': {
      if (sameDiagram(action.previous, state.present)) return state;
      return {
        past: [...state.past, action.previous].slice(-HISTORY_LIMIT),
        present: state.present,
        future: [],
      };
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}

export function useDiagram(initial: FlowDiagram) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initial,
    future: [],
  });

  const presentRef = useRef(state.present);
  presentRef.current = state.present;
  const transactionRef = useRef<FlowDiagram | null>(null);

  const updateDiagram = useCallback((diagram: FlowDiagram) => {
    dispatch({ type: 'update', diagram });
  }, []);

  const commitDiagram = useCallback((diagram: FlowDiagram) => {
    dispatch({ type: 'replace', diagram });
  }, []);

  const beginTransaction = useCallback(() => {
    transactionRef.current = presentRef.current;
  }, []);

  const endTransaction = useCallback(() => {
    const previous = transactionRef.current;
    transactionRef.current = null;
    if (!previous) return;
    dispatch({ type: 'record', previous });
  }, []);

  const cancelTransaction = useCallback(() => {
    const previous = transactionRef.current;
    transactionRef.current = null;
    if (previous) dispatch({ type: 'update', diagram: previous });
  }, []);

  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  return {
    diagram: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    updateDiagram,
    commitDiagram,
    beginTransaction,
    endTransaction,
    cancelTransaction,
    undo,
    redo,
  };
}
