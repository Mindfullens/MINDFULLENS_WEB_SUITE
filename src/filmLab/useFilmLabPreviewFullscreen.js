import { useCallback, useState } from 'react';
import { useSyncPreviewFullscreenState } from './useSyncPreviewFullscreenState.js';

export function useFilmLabPreviewFullscreen(shellRef) {
  const [isPreviewFullMode, setIsPreviewFullMode] = useState(false);

  const togglePreviewFullMode = useCallback(() => {
    const nextMode = !isPreviewFullMode;
    const shellElement = shellRef.current;

    if (typeof document !== 'undefined') {
      if (nextMode) {
        if (
          shellElement &&
          document.fullscreenElement !== shellElement &&
          typeof shellElement.requestFullscreen === 'function'
        ) {
          shellElement.requestFullscreen().catch(() => {});
        }
      } else if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        document.exitFullscreen().catch(() => {});
      }
    }

    setIsPreviewFullMode(nextMode);
  }, [isPreviewFullMode]);

  useSyncPreviewFullscreenState({ shellRef, isPreviewFullMode, setIsPreviewFullMode });

  return { isPreviewFullMode, setIsPreviewFullMode, togglePreviewFullMode };
}
