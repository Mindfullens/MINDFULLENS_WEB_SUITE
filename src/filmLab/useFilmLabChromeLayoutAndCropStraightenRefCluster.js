import { useFilmLabChromeLayout } from './useFilmLabChromeLayout.js';
import { useFilmLabCropStraightenLiveRefs } from './useFilmLabCropStraightenLiveRefs.js';

/**
 * Chrome layout measurement + crop/straighten live ref sync (FilmLabPro cluster).
 */
export function useFilmLabChromeLayoutAndCropStraightenRefCluster({
  shellRef,
  leftSidebarRef,
  rightSidebarRef,
  toolbarRef,
  workspaceFooterRef,
  canvasAreaRef,
  canvasCenterRef,
  canvasStageRef,
  imageUrl,
  uploadedFile,
  viewMode,
  cropLiveRectRef,
  cropLiveRect,
  straightenGuideRef,
  straightenGuide,
}) {
  const chromeLayout = useFilmLabChromeLayout({
    shellRef,
    leftSidebarRef,
    rightSidebarRef,
    toolbarRef,
    workspaceFooterRef,
    canvasAreaRef,
    canvasCenterRef,
    canvasStageRef,
    imageUrl,
    uploadedFile,
    viewMode,
  });

  useFilmLabCropStraightenLiveRefs({
    cropLiveRectRef,
    cropLiveRect,
    straightenGuideRef,
    straightenGuide,
  });

  return chromeLayout;
}
