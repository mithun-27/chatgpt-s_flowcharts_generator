import { createContext, useContext } from 'react';

export interface EditorActions {
  updateNodeLabel: (id: string, label: string) => void;
  beginNodeEdit: () => void;
  endNodeEdit: () => void;
  deleteEdge: (id: string) => void;
}

export const EditorActionsContext = createContext<EditorActions | null>(null);

export function useEditorActions(): EditorActions {
  const value = useContext(EditorActionsContext);
  if (!value) {
    throw new Error('Editor actions are only available inside the editor.');
  }
  return value;
}
