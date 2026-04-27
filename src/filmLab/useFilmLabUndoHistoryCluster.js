import { useFilmLabFullHistoryTimeline } from './useFilmLabFullHistoryTimeline.js';
import { useFilmLabUndoRedo } from './useFilmLabUndoRedo.js';

/** Undo/redo stacks plus derived full-history timeline for the right panel. */
export function useFilmLabUndoHistoryCluster({ undoRedoArgs, historyTimelineArgs }) {
  const undoRedo = useFilmLabUndoRedo(undoRedoArgs);
  const fullHistoryTimeline = useFilmLabFullHistoryTimeline({
    undoStackRef: undoRedo.undoStackRef,
    ...historyTimelineArgs,
  });

  return { ...undoRedo, fullHistoryTimeline };
}
