import { useFilmLabAutoDevelopAndColorGradeCluster } from './useFilmLabAutoDevelopAndColorGradeCluster.js';
import { useFilmLabUndoHistorySliderWorkbenchCluster } from './useFilmLabUndoHistorySliderWorkbenchCluster.js';

/**
 * Undo/history + slider + toolbar actions + auto develop / color grade live (FilmLabPro cluster).
 */
export function useFilmLabUndoSliderWorkbenchAutoDevelopCluster({
  undoHistoryClusterArgs,
  sliderWorkbenchArgs,
  workbenchUndoAwareArgs,
  colorGradeLiveArgs,
  autoDevelopArgs,
}) {
  const undoSliderWorkbench = useFilmLabUndoHistorySliderWorkbenchCluster({
    undoHistoryClusterArgs,
    sliderWorkbenchArgs,
    workbenchUndoAwareArgs,
  });

  const autoDevelopColorGrade = useFilmLabAutoDevelopAndColorGradeCluster({
    colorGradeLiveArgs,
    autoDevelopArgs: {
      ...autoDevelopArgs,
      saveUndo: undoSliderWorkbench.saveUndo,
    },
  });

  return { ...undoSliderWorkbench, ...autoDevelopColorGrade };
}
