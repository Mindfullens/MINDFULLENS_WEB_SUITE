import { useEffect } from 'react';

/** Remember the most recent active panel id other than `'crop'` (for returning from crop mode). */
export function useLastNonCropPanelRef(activePanel, ref) {
  useEffect(() => {
    if (activePanel && activePanel !== 'crop') {
      ref.current = activePanel;
    }
  }, [activePanel, ref]);
}
