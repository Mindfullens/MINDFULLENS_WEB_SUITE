import { useFilmLabClipboardSessionCluster } from './useFilmLabClipboardSessionCluster.js';
import { useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster } from './useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster.js';

/**
 * Capture/upload + undo/slider/workbench/auto-develop + clipboard/session persistence (FilmLabPro cluster).
 */
export function useFilmLabCaptureUploadUndoWorkbenchClipboardCluster({
  captureAndUploadRestoreArgs,
  undoSliderWorkbenchAutoDevelopArgs,
  clipboardSessionClusterArgs,
}) {
  const workbenchBundle = useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster({
    captureAndUploadRestoreArgs,
    undoSliderWorkbenchAutoDevelopArgs,
  });

  const { editClipboardArgs, sessionPersistenceArgs } = clipboardSessionClusterArgs;

  const clipboardBundle = useFilmLabClipboardSessionCluster({
    editClipboardArgs: {
      ...editClipboardArgs,
      saveUndo: workbenchBundle.saveUndo,
    },
    sessionPersistenceArgs: {
      ...sessionPersistenceArgs,
      restoreSnapshot: workbenchBundle.restoreSnapshot,
      captureCurrentSnapshot: workbenchBundle.captureCurrentSnapshot,
    },
  });

  return { ...workbenchBundle, ...clipboardBundle };
}
