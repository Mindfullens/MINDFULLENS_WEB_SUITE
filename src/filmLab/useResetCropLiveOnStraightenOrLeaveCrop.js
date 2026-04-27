import { useEffect } from 'react';

/**
 * When there is no image, the user left the crop panel, or the straighten tool is armed,
 * tear down in-progress crop pointer drag and clear the live crop rect (mutually exclusive flows).
 */
export function useResetCropLiveOnStraightenOrLeaveCrop({
  hasImage,
  activePanel,
  isStraightenToolArmed,
  stopCropDrag,
  cropLiveRectRef,
  setCropLiveRect,
}) {
  useEffect(() => {
    if (!hasImage || activePanel !== 'crop' || isStraightenToolArmed) {
      stopCropDrag();
      cropLiveRectRef.current = null;
      setCropLiveRect(null);
    }
  }, [
    activePanel,
    hasImage,
    isStraightenToolArmed,
    stopCropDrag,
    cropLiveRectRef,
    setCropLiveRect,
  ]);
}
