/**
 * OPFS cache dla drugiej płytki double exposure (Film Lab Develop).
 * Klucz = stabilny identyfikator źródła głównego (jak `uploadSourceKey` w silniku).
 */

import { safeSegment } from './filmLabDamPreviewPaths.js';

const ROOT = 'film-lab-develop';
const VERSION = 'v1';
const SUB = 'double-exposure';
const PLATE_WEBP = 'plate.webp';
const PLATE_PNG = 'plate.png';

/** Ograniczenie rozmiaru zapisu — duże bitmapy skalujemy przed WebP (quota OPFS / RAM). */
const MAX_PLATE_LONG_EDGE_PX = 4096;
const MAX_PLATE_PIXELS = 24 * 1024 * 1024;

/**
 * @param {number} w
 * @param {number} h
 * @returns {{ tw: number; th: number }}
 */
function computePlateEncodeDimensions(w, h) {
  const iw = Math.max(1, Math.floor(Number(w)));
  const ih = Math.max(1, Math.floor(Number(h)));
  let tw = iw;
  let th = ih;
  const longEdge = Math.max(iw, ih);
  if (longEdge > MAX_PLATE_LONG_EDGE_PX) {
    const s = MAX_PLATE_LONG_EDGE_PX / longEdge;
    tw = Math.max(1, Math.round(iw * s));
    th = Math.max(1, Math.round(ih * s));
  }
  while (tw * th > MAX_PLATE_PIXELS && tw > 2 && th > 2) {
    tw = Math.max(1, Math.floor(tw * 0.92));
    th = Math.max(1, Math.floor(th * 0.92));
  }
  return { tw, th };
}

function canUseOpfs() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
  );
}

async function getOpfsRoot() {
  return navigator.storage.getDirectory();
}

async function ensurePath(root, segments) {
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  return dir;
}

/** @param {string} str */
function djb2Hex(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Zgodnie z logiką ingestu w `useFilmLabEngine`: plik z dysku lub hash źródła URL.
 * @param {File | null | undefined} uploadedFile
 * @param {unknown} uploadedImage — pierwszy argument hooka (URL / blob ref)
 */
export function getDevelopUploadSourceKey(uploadedFile, uploadedImage) {
  if (uploadedFile instanceof File) {
    return `file:${uploadedFile.name}:${uploadedFile.size}:${uploadedFile.lastModified}`;
  }
  const src =
    typeof uploadedImage === 'string' && uploadedImage.length > 0 ? uploadedImage : '';
  if (src) {
    return `src:${djb2Hex(src)}`;
  }
  return '';
}

function plateSegments(uploadSourceKey) {
  return [ROOT, VERSION, SUB, safeSegment(uploadSourceKey)];
}

/**
 * @param {ImageBitmap} bitmap
 * @returns {Promise<Blob | null>}
 */
async function imageBitmapToPersistedBlob(bitmap) {
  const w = bitmap.width;
  const h = bitmap.height;
  if (!w || !h) {
    return null;
  }

  const { tw, th } = computePlateEncodeDimensions(w, h);

  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(tw, th);
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
  } else {
    return null;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, tw, th);

  if (typeof canvas.convertToBlob === 'function') {
    try {
      const webp = await canvas.convertToBlob({ type: 'image/webp', quality: 0.88 });
      if (webp && webp.size > 0) {
        return webp;
      }
    } catch {
      /* fallback png */
    }
  }

  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b || null), 'image/png');
    } else {
      resolve(null);
    }
  });
}

/**
 * @param {string} uploadSourceKey
 * @param {ImageBitmap} bitmap
 * @returns {Promise<boolean>}
 */
export async function writeDoubleExposurePlateToOpfs(uploadSourceKey, bitmap) {
  if (!canUseOpfs() || !uploadSourceKey || !bitmap?.width) {
    return false;
  }
  try {
    const blob = await imageBitmapToPersistedBlob(bitmap);
    if (!blob || blob.size < 32) {
      return false;
    }
    const ext = blob.type === 'image/webp' ? PLATE_WEBP : PLATE_PNG;
    const root = await getOpfsRoot();
    const dir = await ensurePath(root, plateSegments(uploadSourceKey));
    const fh = await dir.getFileHandle(ext, { create: true });
    const writable = await fh.createWritable();
    const buf = await blob.arrayBuffer();
    await writable.write(buf);
    await writable.close();

    const other = ext === PLATE_WEBP ? PLATE_PNG : PLATE_WEBP;
    try {
      await dir.removeEntry(other);
    } catch {
      /* ignore */
    }
    return true;
  } catch (e) {
    if (import.meta?.env?.DEV) {
      console.warn('[FilmLab] double exposure OPFS write failed', e);
    }
    return false;
  }
}

/**
 * @param {string} uploadSourceKey
 * @returns {Promise<Blob | null>}
 */
export async function readDoubleExposurePlateBlobFromOpfs(uploadSourceKey) {
  if (!canUseOpfs() || !uploadSourceKey) {
    return null;
  }
  try {
    const root = await getOpfsRoot();
    const segments = plateSegments(uploadSourceKey);
    let dir = root;
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg);
    }
    for (const name of [PLATE_WEBP, PLATE_PNG]) {
      try {
        const fh = await dir.getFileHandle(name);
        const file = await fh.getFile();
        if (file && file.size > 32) {
          return file;
        }
      } catch {
        /* try next */
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string} uploadSourceKey
 * @returns {Promise<boolean>}
 */
export async function removeDoubleExposurePlateFromOpfs(uploadSourceKey) {
  if (!canUseOpfs() || !uploadSourceKey) {
    return false;
  }
  try {
    const root = await getOpfsRoot();
    const segments = plateSegments(uploadSourceKey);
    let dir = root;
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg);
    }
    let removed = false;
    for (const name of [PLATE_WEBP, PLATE_PNG]) {
      try {
        await dir.removeEntry(name);
        removed = true;
      } catch {
        /* ignore */
      }
    }
    return removed;
  } catch {
    return false;
  }
}
