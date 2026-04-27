import { useEffect } from 'react';

/** Legacy `raw-sprocket` frame id is no longer supported; normalize to `none`. */
export function useClearRawSprocketFrame(frame, setAdjustments) {
  useEffect(() => {
    if (frame !== 'raw-sprocket') {
      return;
    }

    setAdjustments((current) => ({
      ...current,
      frame: 'none',
    }));
  }, [frame]);
}
