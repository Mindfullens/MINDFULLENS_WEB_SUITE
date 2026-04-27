import { useFilmLabFilmViewCropDragStraightenAndPanelCluster } from './useFilmLabFilmViewCropDragStraightenAndPanelCluster.js';
import { useFilmLabWorkbenchChromeViewportAndCaptureClipboardCluster } from './useFilmLabWorkbenchChromeViewportAndCaptureClipboardCluster.js';

/**
 * Workbench + chrome/viewport + capture/clipboard, then film view + crop + straighten + panel (FilmLabPro cluster).
 */
export function useFilmLabWorkbenchChromeCaptureAndFilmCropStraightenPanelCluster({
  buildChromeCatalogViewportArgs,
  buildCaptureUploadUndoWorkbenchClipboardArgs,
  buildFilmViewCropStraightenPanelArgs,
}) {
  const core = useFilmLabWorkbenchChromeViewportAndCaptureClipboardCluster({
    buildChromeCatalogViewportArgs,
    buildCaptureUploadUndoWorkbenchClipboardArgs,
  });
  const filmCropStraightenPanel = useFilmLabFilmViewCropDragStraightenAndPanelCluster(
    buildFilmViewCropStraightenPanelArgs(core)
  );

  return {
    ...core,
    ...filmCropStraightenPanel,
  };
}
