import { memo, useEffect, useMemo, useRef } from 'react';
import { drawPixelPerfectBitmapToCanvas } from './filmLabDrawThumbBitmap.js';
import { getCssTransformForExifOrientation } from './filmLabExifCssTransform.js';

/**
 * Miniaturowy podgląd: bufor canvas = pełna rozdzielczość bitmapy (brak ucinania przez skalowanie bufora).
 * Orientacja EXIF → CSS na owijce (transform), nie macierze 2D na pikselach.
 */
function FilmLabThumbCanvas({ bitmap, exifOrientation = 1, assetId, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (import.meta.env?.DEV && assetId != null && String(assetId) !== '' && bitmap) {
      console.log('[FilmLab][thumb] Drawing Thumb', {
        assetId: String(assetId),
        exifOrientation,
      });
    }
  }, [assetId, bitmap, exifOrientation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) {
      return undefined;
    }
    drawPixelPerfectBitmapToCanvas(canvas, bitmap);
    return undefined;
  }, [bitmap, exifOrientation, assetId]);

  const wrapStyle = useMemo(
    () => ({
      transform: getCssTransformForExifOrientation(exifOrientation),
      transformOrigin: 'center center',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
    }),
    [exifOrientation]
  );

  return (
    <div className={`film-lab-thumb-orient ${className}`.trim()} style={wrapStyle} aria-hidden>
      <canvas
        ref={canvasRef}
        className="film-lab-thumb-canvas-pixel"
      />
    </div>
  );
}

function thumbCanvasPropsAreEqual(prev, next) {
  return (
    prev.bitmap === next.bitmap &&
    prev.exifOrientation === next.exifOrientation &&
    prev.assetId === next.assetId &&
    prev.className === next.className
  );
}

export default memo(FilmLabThumbCanvas, thumbCanvasPropsAreEqual);
