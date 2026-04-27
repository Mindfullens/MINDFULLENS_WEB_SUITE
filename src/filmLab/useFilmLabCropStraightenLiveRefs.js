import { useClearRefWhenNullish, useSyncStateToRef } from './useSyncStateToRef.js';

export function useFilmLabCropStraightenLiveRefs({
  cropLiveRectRef,
  cropLiveRect,
  straightenGuideRef,
  straightenGuide,
}) {
  useClearRefWhenNullish(cropLiveRectRef, cropLiveRect);
  useSyncStateToRef(straightenGuideRef, straightenGuide);
}
