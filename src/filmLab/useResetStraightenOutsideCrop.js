import { useEffect } from 'react';

/**
 * When the user is not in crop mode with an image loaded, tear down straighten UI state:
 * pointer drag, armed tool, on-canvas guide, and session snapshot refs.
 */
export function useResetStraightenOutsideCrop({
  activePanel,
  hasImage,
  stopStraightenDrag,
  setIsStraightenToolArmed,
  setStraightenGuide,
  straightenSessionSnapshotRef,
  straightenHasMeaningfulChangeRef,
}) {
  useEffect(() => {
    if (activePanel === 'crop' && hasImage) {
      return;
    }
    stopStraightenDrag();
    setIsStraightenToolArmed(false);
    setStraightenGuide(null);
    straightenSessionSnapshotRef.current = null;
    straightenHasMeaningfulChangeRef.current = false;
  }, [
    activePanel,
    hasImage,
    stopStraightenDrag,
    setIsStraightenToolArmed,
    setStraightenGuide,
    straightenSessionSnapshotRef,
    straightenHasMeaningfulChangeRef,
  ]);
}
