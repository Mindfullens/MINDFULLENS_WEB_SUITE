/**
 * Immediate DAM standard preview from raster imports (non-RAW) so Library thumbnails work before full decode.
 */

import {
  createFilmLabImageBitmap,
  FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE,
} from '../filmLabImageBitmapOptions.js';

function isRasterFilename(name) {
  return /\.(jpe?g|png|webp|gif)$/i.test(String(name ?? ''));
}

/**
 * @param {string} sessionId
 * @param {string} assetId
 * @param {File} file
 * @returns {Promise<boolean>}
 */
export async function writeRasterImportThumbnailIfPossible(sessionId, assetId, file) {
  if (!(file instanceof File) || !isRasterFilename(file.name)) {
    return false;
  }
  const { readDamPreviewBlob, writeDamPreviewBlob } = await import('../opfs/filmLabOpfsPreviewCache.js');
  const existing = await readDamPreviewBlob(sessionId, assetId, 'standard');
  if (existing && existing.size > 0) {
    return true;
  }

  let bmp;
  try {
    bmp = await createFilmLabImageBitmap(file, FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE);
  } catch {
    return false;
  }

  const iw = bmp.width || 1;
  const ih = bmp.height || 1;
  const maxEdge = 280;
  const sc = Math.min(1, maxEdge / Math.max(iw, ih));
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

  const blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
  );
  if (!blob || blob.size < 1) {
    return false;
  }
  return writeDamPreviewBlob(sessionId, assetId, 'standard', blob);
}
