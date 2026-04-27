import { useFilmLabCaptureAndUploadRestoreCluster } from './useFilmLabCaptureAndUploadRestoreCluster.js';
import { useFilmLabUndoSliderWorkbenchAutoDevelopCluster } from './useFilmLabUndoSliderWorkbenchAutoDevelopCluster.js';

/**
 * Session capture/upload-restore + undo/slider/workbench/auto-develop stack (FilmLabPro cluster).
 */
export function useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster({
  captureAndUploadRestoreArgs,
  undoSliderWorkbenchAutoDevelopArgs,
}) {
  const captureBundle = useFilmLabCaptureAndUploadRestoreCluster(captureAndUploadRestoreArgs);

  const { undoHistoryClusterArgs, ...restUndoSliderWorkbenchAutoDevelop } = undoSliderWorkbenchAutoDevelopArgs;

  const workbenchBundle = useFilmLabUndoSliderWorkbenchAutoDevelopCluster({
    ...restUndoSliderWorkbenchAutoDevelop,
    undoHistoryClusterArgs: {
      ...undoHistoryClusterArgs,
      undoRedoArgs: {
        ...undoHistoryClusterArgs.undoRedoArgs,
        captureCurrentSnapshot: captureBundle.captureCurrentSnapshot,
        restoreSnapshot: captureBundle.restoreSnapshot,
      },
    },
  });

  return { ...captureBundle, ...workbenchBundle };
}
