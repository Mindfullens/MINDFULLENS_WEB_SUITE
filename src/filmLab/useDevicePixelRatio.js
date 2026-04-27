import { useEffect, useState } from 'react';

function readWindowDpr() {
  if (typeof window === 'undefined') {
    return 1;
  }
  return Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
}

export function useDevicePixelRatio() {
  const [devicePixelRatio, setDevicePixelRatio] = useState(readWindowDpr);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      const nextDpr = readWindowDpr();
      setDevicePixelRatio((current) => (Math.abs(current - nextDpr) < 0.001 ? current : nextDpr));
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return devicePixelRatio;
}
