import { useCallback, useEffect } from 'react';
import {
  clampStudioWorkspaceTabForUiMode,
  normalizeUiMode,
  resolveStudioWorkspaceForUiMode,
} from './useFilmLabUiMode.js';

/**
 * Primary navigation between library / develop / masks / …
 * Syncs `?workspace=` and nudges related UI (e.g. masks → Detal panel, export → save modal).
 */
export function useFilmLabStudioWorkspace({
  setStudioWorkspace,
  setActivePanel,
  setIsExportModalOpen,
  studioWorkspace,
  uiMode,
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

      if (resolved === 'masks') {
        setActivePanel('detail');
      }
      if (resolved === 'export') {
        setIsExportModalOpen(true);
      }
    },
    [setStudioWorkspace, setActivePanel, setIsExportModalOpen, uiMode]
  );

  return { handleStudioWorkspaceChange };
}
