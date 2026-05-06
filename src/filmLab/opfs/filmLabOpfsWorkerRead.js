/**
 * Odczyt OPFS (+ fallback IDB jak w filmLabOpfsPreviewCache) — wyłącznie z poziomu Web Workera.
 * Współdzielone segmenty ścieżek z produkcyjnym kodem DAM (muszą pozostać zgodne).
 */

import { get } from 'idb-keyval';
import { buildDamPreviewVirtualPath, safeSegment } from './filmLabDamPreviewPaths.js';

const FALLBACK_KEY_PREFIX = 'mindfullens-dam-thumb-fallback:';

export { buildDamPreviewVirtualPath, safeSegment };

export function fallbackStorageKey(sessionId, assetId, tier) {
  return `${FALLBACK_KEY_PREFIX}${safeSegment(sessionId)}:${safeSegment(assetId)}:${tier}`;
}

export function sourceVirtualSegments(sessionId, assetId) {
  return ['dam-sources', 'v1', safeSegment(sessionId), safeSegment(assetId)];
}

async function getOpfsRoot() {
  return navigator.storage.getDirectory();
}

/**
 * Synchroniczny odczyt przez `FileSystemSyncAccessHandle` (dostępne w dedykowanym Workerze).
 * Gdy `maxBytes` > 0, czyta tylko prefiks (np. kafel miniatury) — bez materializacji `Blob` w całości.
 *
 * @param {FileSystemFileHandle} fileHandle
 * @param {number} [maxBytes=0] — 0 = cały plik
 * @returns {Promise<ArrayBuffer|null>}
 */
async function tryReadFileBufferViaSyncAccessHandle(fileHandle, maxBytes = 0) {
  if (!fileHandle || typeof fileHandle.createSyncAccessHandle !== 'function') {
    return null;
  }
  let access;
  try {
    access = await fileHandle.createSyncAccessHandle();
  } catch {
    return null;
  }
  try {
    const total = access.getSize();
    if (total <= 0) {
      return new ArrayBuffer(0);
    }
    const cap = Number(maxBytes);
    const len = Number.isFinite(cap) && cap > 0 ? Math.min(total, cap) : total;
    const buf = new ArrayBuffer(len);
    const u8 = new Uint8Array(buf);
    let off = 0;
    while (off < len) {
      const n = access.read(u8.subarray(off, len), { at: off });
      if (n === 0) {
        break;
      }
      off += n;
    }
    return buf;
  } finally {
    try {
      access.close();
    } catch {
      // noop
    }
  }
}

/**
 * Buduje `ArrayBuffer` z widoku IDB bez zbędnej kopii, gdy `Uint8Array` obejmuje cały podspódni bufor.
 * W przeciwnym razie `ArrayBuffer.prototype.slice` kopiuje tylko logiczny zakres (unikamy podwójnej kopii z `concat`).
 *
 * @param {Uint8Array} u8
 * @returns {ArrayBuffer|null}
 */
function arrayBufferFromUint8ArrayView(u8) {
  if (!(u8 instanceof Uint8Array) || u8.byteLength === 0) {
    return null;
  }
  if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
    return u8.buffer;
  }
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

/**
 * @param {'embedded' | 'standard' | 'smart'} tier
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function readDamPreviewBytes(sessionId, assetId, tier) {
  const virtualPath = buildDamPreviewVirtualPath(sessionId, assetId, tier);
  const fbKey = fallbackStorageKey(sessionId, assetId, tier);

  try {
    const root = await getOpfsRoot();
    const segments = virtualPath.split('/').filter(Boolean);
    const fileName = segments.pop();
    let dir = root;
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg);
    }
    const fh = await dir.getFileHandle(fileName);
    const syncBuf = await tryReadFileBufferViaSyncAccessHandle(fh, 0);
    if (syncBuf) {
      return syncBuf;
    }
    const file = await fh.getFile();
    return file.arrayBuffer();
  } catch {
    // OPFS miss → IDB fallback
  }

  try {
    const u8 = await get(fbKey);
    if (u8 instanceof Uint8Array && u8.byteLength > 0) {
      return arrayBufferFromUint8ArrayView(u8);
    }
  } catch {
    // noop
  }
  return null;
}

/** Górny limit odczytu `source.bin` przy ścieżce miniatury DAM (unik zawieszenia `createImageBitmap` na całym RAW). */
export const FILMLAB_DAM_PREVIEW_SOURCE_READ_CAP_BYTES = 32 * 1024 * 1024;

/**
 * Asynchroniczny odczyt `source.bin` z OPFS — łańcuch `getDirectoryHandle` + `File.arrayBuffer()`.
 * Wyłącznie z Web Workera (`imageWorker`): duży `arrayBuffer()` nie blokuje głównego wątku React.
 * Jedna alokacja bufora na pełny plik (materializacja w JS); brak `slice`/`concat` na dużych danych w tej funkcji.
 *
 * @param {{ maxBytes?: number }} [options] — `maxBytes`: tylko początek pliku (`File.slice`), np. dla miniatury z OPFS.
 * @returns {Promise<{ buffer: ArrayBuffer, sourceName: string, sourceLastModified: number }|null>}
 */
export async function readCatalogSourceBytes(sessionId, assetId, catalogAsset, options = {}) {
  try {
    const root = await getOpfsRoot();
    const segments = sourceVirtualSegments(sessionId, assetId);
    segments.push('source.bin');
    const fileName = segments.pop();
    let dir = root;
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg);
    }
    const fh = await dir.getFileHandle(fileName);
    const cap = Number(options.maxBytes);
    const maxSlice =
      Number.isFinite(cap) && cap > 0 ? cap : 0;
    const syncBuf = await tryReadFileBufferViaSyncAccessHandle(fh, maxSlice);
    if (syncBuf) {
      const sourceName =
        typeof catalogAsset?.sourceName === 'string' && catalogAsset.sourceName.trim() !== ''
          ? catalogAsset.sourceName.trim()
          : 'source.bin';
      const sourceLastModified =
        catalogAsset != null && Number.isFinite(Number(catalogAsset.sourceLastModified))
          ? Number(catalogAsset.sourceLastModified)
          : 0;
      return { buffer: syncBuf, sourceName, sourceLastModified };
    }
    const file = await fh.getFile();
    const blobForRead =
      maxSlice > 0 && file.size > maxSlice ? file.slice(0, maxSlice) : file;
    const buffer = await blobForRead.arrayBuffer();
    const sourceName =
      typeof catalogAsset?.sourceName === 'string' && catalogAsset.sourceName.trim() !== ''
        ? catalogAsset.sourceName.trim()
        : 'source.bin';
    const sourceLastModified =
      catalogAsset != null && Number.isFinite(Number(catalogAsset.sourceLastModified))
        ? Number(catalogAsset.sourceLastModified)
        : file.lastModified;
    return { buffer, sourceName, sourceLastModified };
  } catch {
    return null;
  }
}
