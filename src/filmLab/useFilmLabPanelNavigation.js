import { useCallback } from 'react';
import { PANEL_TABS } from './panelAndGradeTabs.js';
import { useLastNonCropPanelRef } from './useLastNonCropPanel.js';

function replacePanelSearchParam(tabId) {
  if (!PANEL_TABS.some((t) => t.id === tabId)) {
    return;
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('panel', tabId);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

export function useFilmLabPanelNavigation({ activePanel, lastNonCropPanelRef, setActivePanel }) {
  useLastNonCropPanelRef(activePanel, lastNonCropPanelRef);

  const handlePanelTabChange = useCallback((tabId) => {
    setActivePanel(tabId);
    replacePanelSearchParam(tabId);
  }, [setActivePanel]);

  return { handlePanelTabChange };
}
