import { useCallback, useEffect } from 'react';
import {
  clampStudioWorkspaceTabForUiMode,
  normalizeUiMode,
  resolveStudioWorkspaceForUiMode,
} from './useFilmLabUiMode.js';

/**
 * Primary navigation between library / develop / export.
 * Syncs `?workspace=` and nudges related UI (export → save modal when a source is loaded).
 */
export function useFilmLabStudioWorkspace({
  setStudioWorkspace,
  setActivePanel,
  setIsExportModalOpen,
  studioWorkspace,
  uiMode,
  hasActiveSource,
}) {
  useEffect(() => {
    if (normalizeUiMode(uiMode) !== 'simple') {
      return;
    }
    const next = resolveStudioWorkspaceForUiMode(studioWorkspace, uiMode);
    if (next === studioWorkspace) {
      return;
    }
    setStudioWorkspace(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('workspace', next);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
  }, [uiMode, studioWorkspace, setStudioWorkspace]);

  const handleStudioWorkspaceChange = useCallback(
    (nextId) => {
      const resolved = clampStudioWorkspaceTabForUiMode(nextId, uiMode);
      setStudioWorkspace(resolved);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('workspace', resolved);
        const path = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState(null, '', path);
      } catch {
        /* ignore */
      }

      if (resolved === 'export' && hasActiveSource) {
        setIsExportModalOpen(true);
      }
    },
    [setStudioWorkspace, setActivePanel, setIsExportModalOpen, uiMode, hasActiveSource]
  );

  return { handleStudioWorkspaceChange };
}
