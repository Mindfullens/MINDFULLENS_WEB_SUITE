import { useEffect } from 'react';

/** Clear the crop geometry fingerprint when leaving crop so aspect-fit logic can re-run on return. */
export function useClearCropGeometryKeyOutsideCrop(activePanel, geometryKeyRef) {
  useEffect(() => {
    if (activePanel !== 'crop') {
      geometryKeyRef.current = '';
    }
  }, [activePanel, geometryKeyRef]);
}
