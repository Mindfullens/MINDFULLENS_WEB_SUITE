import { useCanvasStageSize } from './useCanvasStageSize.js';
import { useChromeBoxInsets } from './useChromeBoxInsets.js';
import { useFilmLabPreviewFullscreen } from './useFilmLabPreviewFullscreen.js';

export function useFilmLabChromeLayout({
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
}) {
  const { isPreviewFullMode, setIsPreviewFullMode, togglePreviewFullMode } =
    useFilmLabPreviewFullscreen(shellRef);

  const chromeBox = useChromeBoxInsets({
    leftSidebarRef,
    rightSidebarRef,
    toolbarRef,
    workspaceFooterRef,
  });

  const canvasStageSize = useCanvasStageSize({
    canvasAreaRef,
    canvasCenterRef,
    canvasStageRef,
    imageUrl,
    isPreviewFullMode,
    uploadedFile,
    viewMode,
  });

  return {
    isPreviewFullMode,
    setIsPreviewFullMode,
    togglePreviewFullMode,
    chromeBox,
    canvasStageSize,
  };
}
