import { useFilmLabClipboardSessionCluster } from './useFilmLabClipboardSessionCluster.js';
import { useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster } from './useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster.js';
import { useFilmLabRecipeDocumentApply } from './useFilmLabRecipeDocumentApply.js';
import { useFilmLabRecipePasteKeyboardShortcut } from './useFilmLabRecipePasteKeyboardShortcut.js';

/**
 * Capture/upload + undo/slider/workbench/auto-develop + clipboard/session persistence (FilmLabPro cluster).
 */
export function useFilmLabCaptureUploadUndoWorkbenchClipboardCluster({
  captureAndUploadRestoreArgs,
  undoSliderWorkbenchAutoDevelopArgs,
  clipboardSessionClusterArgs,
  recipeDebugKeyboardArgs,
}) {
  const workbenchBundle = useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster({
    captureAndUploadRestoreArgs,
    undoSliderWorkbenchAutoDevelopArgs,
  });

  const { editClipboardArgs, sessionPersistenceArgs } = clipboardSessionClusterArgs;

  const applyRecipeDocument = useFilmLabRecipeDocumentApply({
    restoreSnapshot: workbenchBundle.restoreSnapshot,
    uploadedFile: sessionPersistenceArgs?.uploadedFile,
  });

  useFilmLabRecipePasteKeyboardShortcut({
    applyRecipeDocument,
    enabled: Boolean(recipeDebugKeyboardArgs?.showRenderDebugPanel),
  });

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

  return { ...workbenchBundle, ...clipboardBundle, applyRecipeDocument };
}
