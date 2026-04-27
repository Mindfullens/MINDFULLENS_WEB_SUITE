import { useLayoutEffect, useState } from 'react';

/**
 * Tracks the visible canvas stage dimensions (intersection with viewport + fallback to client size).
 */
export function useCanvasStageSize({
  canvasAreaRef,
  canvasStageRef,
  canvasCenterRef,
  imageUrl,
  isPreviewFullMode,
  uploadedFile,
  viewMode,
}) {
  const [canvasStageSize, setCanvasStageSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const stageElement = canvasAreaRef.current ?? canvasStageRef.current ?? canvasCenterRef.current;

    if (!stageElement) {
      return undefined;
    }

    const updateStageSize = () => {
      const rect = stageElement.getBoundingClientRect?.() ?? null;
      const docElement = typeof document !== 'undefined' ? document.documentElement : null;
      const viewportWidth =
        Number(docElement?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 0)) || 0;
      const viewportHeight =
        Number(docElement?.clientHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 0)) || 0;

      const visibleRectWidth = rect
        ? Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0))
        : 0;
      const visibleRectHeight = rect
        ? Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0))
        : 0;

      const width = visibleRectWidth > 0 ? visibleRectWidth : Number(stageElement.clientWidth) || 0;
      const height = visibleRectHeight > 0 ? visibleRectHeight : Number(stageElement.clientHeight) || 0;
      setCanvasStageSize((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
    };

    updateStageSize();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            updateStageSize();
          })
        : null;
    resizeObserver?.observe(stageElement);
    window.addEventListener('resize', updateStageSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateStageSize);
    };
  }, [
    canvasAreaRef,
    canvasCenterRef,
    canvasStageRef,
    imageUrl,
    isPreviewFullMode,
    uploadedFile,
    viewMode,
  ]);

  return canvasStageSize;
}
