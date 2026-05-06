/**
 * Tier „smart”: WebP ~2560 px dłuższy bok — szkieł pod zoom/Loupe (Ethos).
 * Źródło: istniejący `standard` lub `embedded` JPEG w OPFS (bez pełnego RAW).
 */

import {
  hasDamPreview,
  readDamPreviewBlob,
  writeDamPreviewBlob,
} from '../opfs/filmLabOpfsPreviewCache.js';
import {
  createFilmLabImageBitmap,
  FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE,
} from '../filmLabImageBitmapOptions.js';
import { DAM_PREVIEW_SMART_TIER, SMART_PREVIEW_MAX_LONG_EDGE } from '../opfs/filmLabDamPreviewPaths.js';

export { DAM_PREVIEW_SMART_TIER, SMART_PREVIEW_MAX_LONG_EDGE };

const SMART_WEBP_QUALITY = 0.82;

/**
 * Skaluje najlepszy dostępny tier do WebP i zapisuje `smart`.
 *
 * @param {{ force?: boolean, onWritten?: (dims: { width: number, height: number }) => void }} [options]
 * @returns {Promise<boolean>}
 */
export async function writeSmartPreviewWebpIfPossible(sessionId, assetId, options = {}) {
  const { force = false, onWritten } = options;
  const sid = String(sessionId ?? '');
  const aid = String(assetId ?? '');
  if (!sid || !aid) {
    return false;
  }
  if (!force && (await hasDamPreview(sid, aid, DAM_PREVIEW_SMART_TIER))) {
    return true;
  }

  let blob = await readDamPreviewBlob(sid, aid, 'standard');
  if (!blob || blob.size < 1) {
    blob = await readDamPreviewBlob(sid, aid, 'embedded');
  }
  if (!blob || blob.size < 1) {
    return false;
  }

  let bmp;
  try {
    bmp = await createFilmLabImageBitmap(blob, FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE);
  } catch {
    return false;
  }

  const iw = bmp.width || 1;
  const ih = bmp.height || 1;
  const maxL = SMART_PREVIEW_MAX_LONG_EDGE;
  const sc = Math.min(1, maxL / Math.max(iw, ih));
  const tw = Math.max(1, Math.round(iw * sc));
  const th = Math.max(1, Math.round(ih * sc));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close?.();
    return false;
  }
  ctx.drawImage(bmp, 0, 0, tw, th);
  bmp.close?.();

  const webpBlob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', SMART_WEBP_QUALITY)
  );
  if (!webpBlob || webpBlob.size < 1) {
    return false;
  }

  const ok = await writeDamPreviewBlob(sid, aid, DAM_PREVIEW_SMART_TIER, webpBlob);
  if (ok && typeof onWritten === 'function') {
    onWritten({ width: tw, height: th });
  }
  return ok;
}

/**
 * Zaplanuj generację smart preview poza krytycznej ścieżki importu (idle).
 * @param {string} sessionId
 * @param {string} assetId
 * @param {{ force?: boolean, onWritten?: (dims: { width: number, height: number }) => void }} [options]
 */
export function scheduleSmartPreviewGenerationIdle(sessionId, assetId, options = {}) {
  const sid = String(sessionId ?? '');
  const aid = String(assetId ?? '');
  if (!sid || !aid) {
    return;
  }
  const run = () => {
    void writeSmartPreviewWebpIfPossible(sid, aid, options);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 0);
  }
}
