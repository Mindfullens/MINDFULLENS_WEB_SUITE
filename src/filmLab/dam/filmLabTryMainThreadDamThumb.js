/**
 * Szybka ścieżka miniaturek siatki: dekoduj JPEG z tierów OPFS (`standard` / `embedded`)
 * na wątku głównym — bez kolejki imageWorker (unik WASM / natywnego RAW w workerze).
 * Gdy `createImageBitmap` nie udźwignie blobu, zwraca `null` → fallback do worker bridge.
 */

import { readDamPreviewBlob } from '../opfs/filmLabOpfsPreviewCache.js';
import { createFilmLabImageBitmap } from '../filmLabImageBitmapOptions.js';
import { getExifOrientation } from './filmLabEmbeddedJpegExtract.js';

const RESIZE_W = 360;

/**
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {string} opts.assetId
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ bitmap: ImageBitmap, exifOrientation: number } | null>}
 */
export async function tryMainThreadDamPreviewThumbBitmap({ sessionId, assetId, signal }) {
  const sid = String(sessionId ?? '');
  const aid = String(assetId ?? '');
  if (!sid || !aid) {
    return null;
  }

  for (const tier of ['standard', 'embedded']) {
    if (signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    const blob = await readDamPreviewBlob(sid, aid, tier);
    if (!blob || blob.size < 32) {
      continue;
    }
    try {
      const bmp = await createFilmLabImageBitmap(blob, {
        resizeWidth: RESIZE_W,
        resizeQuality: 'low',
        colorSpaceConversion: 'default',
      });
      let exifOrientation = 1;
      try {
        const head = await blob.slice(0, Math.min(blob.size, 4 * 1024 * 1024)).arrayBuffer();
        const jo = getExifOrientation(head, aid);
        if (Number.isFinite(jo) && jo >= 1 && jo <= 8) {
          exifOrientation = Math.floor(jo);
        }
      } catch {
        // orientacja z JPEG opcjonalna — FilmLabThumbCanvas i tak scala z katalogiem
      }
      if (signal?.aborted) {
        bmp.close?.();
        throw new DOMException('aborted', 'AbortError');
      }
      return { bitmap: bmp, exifOrientation };
    } catch (e) {
      if (e?.name === 'AbortError') {
        throw e;
      }
      /* tier nie jest czystym dekodowalnym JPEG / WebP — worker spróbuje TIFF/RAW ścieżki */
    }
  }
  return null;
}
