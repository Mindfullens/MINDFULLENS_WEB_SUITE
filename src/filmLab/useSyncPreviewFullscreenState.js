import { useEffect } from 'react';

/** When the shell exits browser fullscreen, clear preview full-mode state if it was tied to it. */
export function useSyncPreviewFullscreenState({ shellRef, isPreviewFullMode, setIsPreviewFullMode }) {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const syncFullscreenState = () => {
      const shellElement = shellRef.current;
      const inOwnFullscreen = Boolean(shellElement && document.fullscreenElement === shellElement);

      if (!inOwnFullscreen && isPreviewFullMode) {
        setIsPreviewFullMode(false);
      }
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, [isPreviewFullMode, setIsPreviewFullMode, shellRef]);
}
