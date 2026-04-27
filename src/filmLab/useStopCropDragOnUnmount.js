import { useEffect } from 'react';

export function useStopCropDragOnUnmount(stopCropDrag) {
  useEffect(
    () => () => {
      stopCropDrag();
    },
    [stopCropDrag]
  );
}
