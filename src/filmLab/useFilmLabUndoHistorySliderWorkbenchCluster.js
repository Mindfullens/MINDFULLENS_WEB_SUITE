import { useFilmLabSliderWorkbench } from './useFilmLabSliderWorkbench.js';
import { useFilmLabUndoHistoryCluster } from './useFilmLabUndoHistoryCluster.js';
import { useFilmLabWorkbenchUndoAwareActions } from './useFilmLabWorkbenchUndoAwareActions.js';

/**
 * Undo/history + slider workbench + toolbar undo-aware actions (FilmLabPro cluster).
 */
export function useFilmLabUndoHistorySliderWorkbenchCluster({
  undoHistoryClusterArgs,
  sliderWorkbenchArgs,
  workbenchUndoAwareArgs,
}) {
  const undo = useFilmLabUndoHistoryCluster(undoHistoryClusterArgs);

  const slider = useFilmLabSliderWorkbench({
    ...sliderWorkbenchArgs,
    saveUndo: undo.saveUndo,
  });

  const workbench = useFilmLabWorkbenchUndoAwareActions({
    ...workbenchUndoAwareArgs,
    saveUndo: undo.saveUndo,
    undoAction: undo.undoAction,
    redoAction: undo.redoAction,
    updateAdjustment: slider.updateAdjustment,
  });

  return { ...undo, ...slider, ...workbench };
}
