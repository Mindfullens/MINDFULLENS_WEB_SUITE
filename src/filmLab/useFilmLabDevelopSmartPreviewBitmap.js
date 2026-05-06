import { useEffect } from 'react';
import { DAM_PREVIEW_SMART_TIER } from './opfs/filmLabDamPreviewPaths.js';

/**
 * Przy mocnym zoomie (pixel peep) ładuje `smart.webp` z OPFS do `ImageBitmap` — referencja do detalu / późniejszy Loupe.
 * Czyści bitmapę przy edycji (isAdjusting), by uniknąć mylącego podglądu względem żywego pipeline.
 */
export function useFilmLabDevelopSmartPreviewBitmap({
  studioWorkspace,
  hasImage,
  sessionId,
  assetId,
  previewEpoch,
  isPixelPeepZoom,
  isAdjusting,
  setDevelopSmartPreviewBitmap,
}) {
  useEffect(() => {
    let cancelled = false;

    const clear = () => {
      setDevelopSmartPreviewBitmap((prev) => {
        if (prev && typeof prev.close === 'function') {
          prev.close();
        }
        return null;
      });
    };

    if (studioWorkspace !== 'develop' || !hasImage || !sessionId || !assetId) {
      clear();
      return undefined;
    }

    if (!isPixelPeepZoom || isAdjusting) {
      clear();
      return undefined;
    }

    void (async () => {
      const { readDamPreviewBlob } = await import('./opfs/filmLabOpfsPreviewCache.js');
      const {
        createFilmLabImageBitmap,
        FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE,
      } = await import('./filmLabImageBitmapOptions.js');

      const blob = await readDamPreviewBlob(String(sessionId), String(assetId), DAM_PREVIEW_SMART_TIER);
      if (cancelled) {
        return;
      }
      if (!blob || blob.size < 1) {
        clear();
        return;
      }

      let bmp;
      try {
        bmp = await createFilmLabImageBitmap(blob, FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE);
      } catch {
        if (!cancelled) {
          clear();
        }
        return;
      }

      if (cancelled) {
        bmp?.close?.();
        return;
      }

      setDevelopSmartPreviewBitmap((prev) => {
        if (prev && typeof prev.close === 'function') {
          prev.close();
        }
        return bmp;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    studioWorkspace,
    hasImage,
    sessionId,
    assetId,
    previewEpoch,
    isPixelPeepZoom,
    isAdjusting,
    setDevelopSmartPreviewBitmap,
  ]);
}
