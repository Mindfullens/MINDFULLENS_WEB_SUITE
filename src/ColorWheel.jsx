import { useRef, useState, useCallback, useEffect } from 'react';

export default function ColorWheel({
  hue = 0,
  saturation = 0,
  onChange,
  onReset,
  /** Film Lab: synchronizacja z `isAdjusting` / E2E v3 / `handleSliderEnd` jak przy suwakach. */
  onAdjustSessionStart,
  onAdjustSessionEnd,
  size = 180,
  label,
}) {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateFromPointer = useCallback(
    (clientX, clientY) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const radiusMax = rect.width / 2;

      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      
      let distance = Math.hypot(deltaX, deltaY);
      if (distance > radiusMax) {
        distance = radiusMax;
      }

      const rawAngle = Math.atan2(deltaY, deltaX);
      const measuredHue = (rawAngle * (180 / Math.PI) + 360) % 360;
      const measuredSaturation = (distance / radiusMax) * 100;

      if (typeof onChange === 'function') {
        onChange({
          hue: measuredHue,
          saturation: measuredSaturation,
        });
      }
    },
    [onChange]
  );

  const handlePointerDown = (e) => {
    e.preventDefault();
    onAdjustSessionStart?.();
    setIsDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e) => {
      updateFromPointer(e.clientX, e.clientY);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      onAdjustSessionEnd?.();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, onAdjustSessionEnd, updateFromPointer]);

  // Convert current polar coordinates to cartesian for thumb placement
  const hueRad = (hue * Math.PI) / 180;
  // Use bounds so thumb stays in visually represented space
  const thumbRadius = (saturation / 100) * (size / 2);
  const thumbX = Math.cos(hueRad) * thumbRadius;
  const thumbY = Math.sin(hueRad) * thumbRadius;

  return (
    <div className="color-wheel-container" style={{ width: size }}>
      {label && (
        <div className="color-wheel-header">
          <span className="color-wheel-title">{label}</span>
          <button className="color-wheel-reset" onClick={() => onReset?.()}>
            Reset
          </button>
        </div>
      )}
      
      <div 
        className="color-wheel-surface" 
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        ref={containerRef}
      >
        {/* Background gradient structure handled largely via CSS for performance */}
        {/* Thumb indicator mapping local offset (center is 0,0 locally thanks to flex/margin) */}
        <div 
          className="color-wheel-thumb" 
          style={{
            transform: `translate(${thumbX}px, ${thumbY}px)`,
            backgroundColor: `hsl(${hue}deg 100% 50%)`
          }}
        />
      </div>
    </div>
  );
}
