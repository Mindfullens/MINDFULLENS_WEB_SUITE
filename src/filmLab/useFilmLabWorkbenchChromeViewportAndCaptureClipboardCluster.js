import { useFilmLabCaptureUploadUndoWorkbenchClipboardCluster } from './useFilmLabCaptureUploadUndoWorkbenchClipboardCluster.js';
import { useFilmLabWorkbenchStateRefsAndChromeCatalogViewportPreviewSprocketCluster } from './useFilmLabWorkbenchStateRefsAndChromeCatalogViewportPreviewSprocketCluster.js';

/**
 * Workbench + chrome/catalog/viewport preview, then capture/upload/undo/workbench + clipboard (FilmLabPro cluster).
 */
export function useFilmLabWorkbenchChromeViewportAndCaptureClipboardCluster({
  buildChromeCatalogViewportArgs,
  buildCaptureUploadUndoWorkbenchClipboardArgs,
}) {
  const bootstrap = useFilmLabWorkbenchStateRefsAndChromeCatalogViewportPreviewSprocketCluster(
    buildChromeCatalogViewportArgs
  );
  const captureClipboard = useFilmLabCaptureUploadUndoWorkbenchClipboardCluster(
    buildCaptureUploadUndoWorkbenchClipboardArgs(bootstrap)
  );

  return {
    ...bootstrap,
    ...captureClipboard,
  };
}
