import { useEffect } from 'react';
import { VIEWPORT_BUILD_MARKER } from './buildInfo.js';
import { ZOOM_MODE_STORAGE_KEY } from './viewportZoom.js';

/** Mirror a few Film Lab settings to localStorage and expose the viewport build id on window (for QA / diagnostics). */
export function useFilmLabPersistenceEcho({ rawBackendMode, rawLinearStageMode, zoomMode }) {
  useEffect(() => {
    try {
      localStorage.setItem('mindfullens_raw_backend_override', rawBackendMode);
    } catch {
      // noop
    }
  }, [rawBackendMode]);

  useEffect(() => {
    try {
      localStorage.setItem('mindfullens_raw_linear_stage_override', rawLinearStageMode);
    } catch {
      // noop
    }
  }, [rawLinearStageMode]);

  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_MODE_STORAGE_KEY, zoomMode);
    } catch {
      // noop
    }
  }, [zoomMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.__mindfullensViewportBuild = VIEWPORT_BUILD_MARKER;
  }, []);
}
