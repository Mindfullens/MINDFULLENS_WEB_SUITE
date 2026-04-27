import { useCallback } from 'react';
import { useLastNonCropPanelRef } from './useLastNonCropPanel.js';

export function useFilmLabPanelNavigation({ activePanel, lastNonCropPanelRef, setActivePanel }) {
  useLastNonCropPanelRef(activePanel, lastNonCropPanelRef);

  const handlePanelTabChange = useCallback((tabId) => {
    setActivePanel(tabId);
  }, []);

  return { handlePanelTabChange };
}
