/**
 * Worker pool entry (module): całe I/O OPFS + dekod createImageBitmap poza głównym wątkiem.
 */

import {
  bufferStartsWithJpegSoi,
  extractLargestEmbeddedJpegBytes,
  getExifOrientation,
  getRawFileOrientation,
  listTiffIfd0TagKeys,
  bruteForceJpegSearch,
  tryExtractJpegFromTiffIfd513514,
  tryExtractFirstTiffStripRawSlice,
  tryExtractLargestTiffStripAsOpaqueBuffer,
} from './dam/filmLabEmbeddedJpegExtract.js';
import { orderTiffJpegDecodeAttempts } from './filmLabOpfsJpegAttemptOrder.js';
import {
  createFilmLabImageBitmap,
  FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE,
} from './filmLabImageBitmapOptions.js';
import {
  FILMLAB_DAM_PREVIEW_SOURCE_READ_CAP_BYTES,
  readCatalogSourceBytes,
  readDamPreviewBytes,
} from './opfs/filmLabOpfsWorkerRead.js';

const cancelled = new Set();
/** W DEV: jeden wpis na assetId — unikaj lawiny `damPreview needs proxy decode`. */
const damPreviewProxyDevWarned = new Set();

const BMP_DECODE_OPTS = FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE;
/** `createFilmLabImageBitmap` sam dokłada `imageOrientation: 'none'` w próbie 1. */
const JPEG_RESIZE_DECODE_OPTS = {
  resizeWidth: 300,
  resizeQuality: 'low',
  colorSpaceConversion: 'default',
};

function postError(id, message, extra = null) {
  const base = { type: 'error', id, message };
  if (extra && typeof extra === 'object') {
    self.postMessage({ ...base, ...extra });
  } else {
    self.postMessage(base);
  }
}

self.addEventListener('error', (ev) => {
  console.warn('[FilmLab][imageWorker] error', ev?.message ?? ev);
});
self.addEventListener('unhandledrejection', (ev) => {
  console.warn('[FilmLab][imageWorker] unhandledrejection', ev?.reason ?? ev);
});

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') {
    return;
  }

  if (msg.type === 'cancel' && typeof msg.id === 'string') {
    /**
     * `cancelled` — joby z tym samym `id` (DAM preview, `opfsCatalogSourceRead`, …).
     * Zob. `readCatalogSource` / `decodeDamPreview` — sprawdzenia po await.
     */
    const scope = msg.cancelScope;
    if (scope != null && scope !== 'damPreview') {
      return;
    }
    cancelled.add(msg.id);
    return;
  }

  if (msg.type === 'fetchBlob') {
    const { id, url, requestInit } = msg;
    if (typeof id !== 'string' || typeof url !== 'string') {
      return;
    }
    void decodeFetch(id, url, requestInit);
    return;
  }

  if (msg.type === 'opfsDamPreviewDecode') {
    const { id, sessionId, assetId, catalogAssetMeta, skipSourceBin } = msg;
    if (typeof id !== 'string' || typeof sessionId !== 'string' || typeof assetId !== 'string') {
      return;
    }
    void decodeDamPreview(id, sessionId, assetId, catalogAssetMeta, { skipSourceBin: Boolean(skipSourceBin) });
    return;
  }

  if (msg.type === 'opfsCatalogSourceRead') {
    const { id, sessionId, assetId, catalogAssetMeta } = msg;
    if (typeof id !== 'string' || typeof sessionId !== 'string' || typeof assetId !== 'string') {
      return;
    }
    void readCatalogSource(id, sessionId, assetId, catalogAssetMeta);
    return;
  }

  if (msg.type === 'fromArrayBuffer') {
    const { id, buffer, mimeType } = msg;
    if (typeof id !== 'string' || !(buffer instanceof ArrayBuffer)) {
      return;
    }
    void decodeBuffer(id, buffer, mimeType);
    return;
  }

  if (msg.type === 'fileArrayBuffer') {
    const { id, file, maxBytes } = msg;
    if (typeof id !== 'string' || !(file instanceof Blob)) {
      return;
    }
    void readFileAsArrayBuffer(id, file, Number.isFinite(Number(maxBytes)) ? Number(maxBytes) : 0);
    return;
  }
});

async function readFileAsArrayBuffer(id, file, maxBytes) {
  try {
    if (cancelled.has(id)) {
      return;
    }
    /** Slice: dla dużych RAW (np. 80 MB Panasonic RW2) czytamy tylko pierwsze N MB — embedded JPEG zawsze tam jest. */
    const blobForRead = maxBytes > 0 && file.size > maxBytes ? file.slice(0, maxBytes) : file;
    const buffer = await blobForRead.arrayBuffer();
    if (cancelled.has(id)) {
      return;
    }
    /** Transfer list: jedna kopia bufora — ownership przekazany do main bez dodatkowego klonowania. */
    self.postMessage({ type: 'arrayBufferReady', id, buffer }, [buffer]);
  } catch (e) {
    if (!cancelled.has(id)) {
      postError(id, e instanceof Error ? e.message : String(e));
    }
  }
}

async function decodeFetch(id, url, requestInit) {
  try {
    if (cancelled.has(id)) {
      return;
    }
    const res = await fetch(url, requestInit ?? undefined);
    if (!res.ok) {
      postError(id, `HTTP ${res.status}`);
      return;
    }
    const blob = await res.blob();
    if (cancelled.has(id)) {
      return;
    }
    const bitmap = await createFilmLabImageBitmap(blob, BMP_DECODE_OPTS);
    if (cancelled.has(id)) {
      bitmap.close();
      cancelled.delete(id);
      return;
    }
    self.postMessage({ type: 'ready', id, bitmap }, [bitmap]);
  } catch (e) {
    if (!cancelled.has(id)) {
      postError(id, e instanceof Error ? e.message : String(e));
    }
  }
}

async function decodeBuffer(id, buffer, mimeType) {
  try {
    if (cancelled.has(id)) {
      return;
    }
    const blob = new Blob([buffer], {
      type: typeof mimeType === 'string' && mimeType ? mimeType : 'application/octet-stream',
    });
    const bitmap = await createFilmLabImageBitmap(blob, BMP_DECODE_OPTS);
    if (cancelled.has(id)) {
      bitmap.close();
      cancelled.delete(id);
      return;
    }
    self.postMessage({ type: 'ready', id, bitmap }, [bitmap]);
  } catch (e) {
    if (!cancelled.has(id)) {
      postError(id, e instanceof Error ? e.message : String(e));
    }
  }
}

/**
 * @param {ArrayBuffer} buf
 * @param {string} [assetId]
 * @param {string} [label]
 */
async function createJpegImageBitmapWithFallback(buf, assetId = '', label = '') {
  const u8 = new Uint8Array(buf);
  const head4 = Array.from(u8.slice(0, Math.min(4, u8.length)))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
  if (import.meta.env?.DEV) {
    console.debug(`[FilmLab][imageWorker] ${label} [${assetId || '-'}]`, {
      byteLength: buf.byteLength,
      head4,
      head10: Array.from(u8.slice(0, Math.min(10, u8.length)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' '),
    });
  }
  const blob = new Blob([buf], { type: 'image/jpeg' });
  try {
    return await createFilmLabImageBitmap(blob, JPEG_RESIZE_DECODE_OPTS);
  } catch (e1) {
    try {
      return await createFilmLabImageBitmap(blob, BMP_DECODE_OPTS);
    } catch (e2) {
      const err = e2 instanceof Error ? e2 : e1;
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

/**
 * Wyższy priorytet: dowolna wartość > 1 wygrywa z domyślną „1” (koniec wyścigu worker vs szybki EXIF).
 * @param {number | null | undefined} jpegOrientation
 * @param {number | null | undefined} rawOrientation
 */
function pickDecodedPreviewOrientation(jpegOrientation, rawOrientation) {
  const ro =
    rawOrientation != null && rawOrientation >= 1 && rawOrientation <= 8
      ? Math.floor(Number(rawOrientation))
      : null;
  const jo =
    jpegOrientation != null && jpegOrientation >= 1 && jpegOrientation <= 8
      ? Math.floor(Number(jpegOrientation))
      : null;
  const r = ro ?? 1;
  const j = jo ?? 1;
  return r > 1 ? r : j > 1 ? j : 1;
}

/** Bufor OPFS może zawierać cały RAW zamiast JPEG — tnij SOI…EOI zanim createImageBitmap. */
async function decodeDamPreviewFromBytes(ab, assetId, catalogAssetMetaHint = null) {
  /** Pełny bufor dla IFD/SubIFD; „brutalne” skany bajt-po-bajcie są ograniczone w parserze (~1 MB). */
  const u8Probe = new Uint8Array(ab);
  const hexHeader = Array.from(u8Probe.slice(0, Math.min(4, u8Probe.length)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
  if (import.meta.env?.DEV) {
    console.log('[DNG Entry] Parsing asset:', assetId || '(unknown)', 'First 4 bytes:', hexHeader);
  }
  const rawHeaderOrientation = getRawFileOrientation(ab, assetId);
  /**
   * Fallback orientacji z metadanych katalogu — gdy `ab` jest już czystym JPEG
   * (tier standard/embedded z OPFS), `getRawFileOrientation` zwraca null bo JPEG.
   * Wiele aparatów (Canon CR2, DNG) nie umieszcza tagu orientacji w osadzonym JPEG,
   * lecz w nagłówku TIFF pliku RAW. `catalogAssetMetaHint.orientationTag` pochodzi
   * z exif snapshotem zapisanego przy otwarciu pliku w Develop — jest niezawodnym fallbackiem.
   */
  const effectiveRawOrientation =
    rawHeaderOrientation != null
      ? rawHeaderOrientation
      : Number.isFinite(Number(catalogAssetMetaHint?.orientationTag)) &&
          Number(catalogAssetMetaHint.orientationTag) >= 2
        ? Math.round(Number(catalogAssetMetaHint.orientationTag))
        : null;
  if (import.meta.env?.DEV) {
    console.log('[RAW Header] Detected orientation:', rawHeaderOrientation ?? '(none)',
      '| effectiveOrientation:', effectiveRawOrientation ?? '(none)', 'for', assetId || '(unknown)');
  }

  const decodeBuf = async (buf, sourceTag) => {
    const jpegOrientation = getExifOrientation(buf, assetId);
    const orientation = pickDecodedPreviewOrientation(jpegOrientation, effectiveRawOrientation);
    const bitmap = await createJpegImageBitmapWithFallback(buf, assetId, sourceTag);
    return { bitmap, orientation };
  };

  /** Osadzony JPEG lub surowy strip (DNG) — `createImageBitmap` czasem przyjmie bufor bez image/jpeg. */
  const decodeOpaqueOrJpegStrip = async (buf, sourceTag) => {
    const jpegOrientation = getExifOrientation(buf, assetId);
    const orientation = pickDecodedPreviewOrientation(jpegOrientation, effectiveRawOrientation);
    const tryMime = async (mime) => {
      const blob = new Blob([buf], { type: mime });
      try {
        return await createFilmLabImageBitmap(blob, JPEG_RESIZE_DECODE_OPTS);
      } catch {
        return await createFilmLabImageBitmap(blob, BMP_DECODE_OPTS);
      }
    };
    let bitmap;
    try {
      bitmap = await tryMime('image/jpeg');
    } catch {
      bitmap = await tryMime('application/octet-stream');
    }
    if (import.meta.env?.DEV) {
      const uz = new Uint8Array(buf);
      const head4 = Array.from(uz.slice(0, Math.min(4, uz.length)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      console.debug(`[FilmLab][imageWorker] ${sourceTag} [${assetId || '-'}]`, {
        byteLength: buf.byteLength,
        head4,
      });
    }
    return { bitmap, orientation };
  };

  if (bufferStartsWithJpegSoi(u8Probe)) {
    if (import.meta.env?.DEV) {
      const ifd0Tags = Object.fromEntries(listTiffIfd0TagKeys(ab).map((t) => [t, true]));
      console.log('[DNG Probe]', assetId || '(unknown)', {
        hasSubIFDs: false,
        firstMarker: hexHeader,
        byteLength: ab.byteLength,
        previewBytesOk: ab.byteLength > 0,
        tiffJpegFallbackCount: 0,
        hasTiffFallbacks: false,
        foundTags: Object.keys(ifd0Tags),
      });
    }
    try {
      return await decodeBuf(ab, 'jpeg-soi');
    } catch {
      /* możliwy „pseudo-JPEG” z początku pliku — wytnij ramkę SOI…EOI */
    }
  } else {
    const tiffPack = tryExtractJpegFromTiffIfd513514(ab, { assetId });
    if (import.meta.env?.DEV) {
      const fb = Array.isArray(tiffPack.fallbackSlices) ? tiffPack.fallbackSlices.length : 0;
      const ifd0Tags = Object.fromEntries(listTiffIfd0TagKeys(ab).map((t) => [t, true]));
      console.log('[DNG Probe]', assetId || '(unknown)', {
        hasSubIFDs: tiffPack.subIfdQueued > 0,
        firstMarker: hexHeader,
        byteLength: ab.byteLength,
        previewBytesOk: ab.byteLength > 0,
        tiffJpegFallbackCount: fb,
        hasTiffFallbacks: fb > 0,
        foundTags: Object.keys(ifd0Tags),
      });
    }
    const attempts = orderTiffJpegDecodeAttempts(tiffPack.buffer, tiffPack.fallbackSlices);
    for (let ai = 0; ai < attempts.length; ai += 1) {
      const buf = attempts[ai];
      try {
        return await decodeBuf(buf, ai === 0 ? 'tiff-ifd-jpeg' : 'tiff-ifd-jpeg-fallback');
      } catch {
        /* kolejny kandydat albo strip / skan SOI…EOI */
      }
    }
    const opaqueStrip = tryExtractLargestTiffStripAsOpaqueBuffer(ab, { assetId });
    if (opaqueStrip && opaqueStrip.byteLength >= 64) {
      try {
        return await decodeOpaqueOrJpegStrip(opaqueStrip, 'tiff-strip-opaque');
      } catch {
        /* duży surowy strip nie zdekodował się — próba wycinków z bruteForceJpegSearch */
      }
    }
    const brutePack = bruteForceJpegSearch(ab);
    for (let bi = 0; bi < brutePack.slices.length; bi += 1) {
      try {
        return await decodeBuf(brutePack.slices[bi], 'brute-force-jpeg');
      } catch {
        /* kolejny offset SOI */
      }
    }
  }
  const extracted = extractLargestEmbeddedJpegBytes(ab);
  if (!extracted || extracted.byteLength < 256) {
    const rawStripBuf = tryExtractFirstTiffStripRawSlice(ab);
    if (rawStripBuf && rawStripBuf.byteLength >= 64) {
      try {
        const jpegOrientation = getExifOrientation(rawStripBuf, assetId);
        const orientation = pickDecodedPreviewOrientation(jpegOrientation, effectiveRawOrientation);
        const blob = new Blob([rawStripBuf], { type: 'image/jpeg' });
        let bitmap;
        try {
          bitmap = await createFilmLabImageBitmap(blob, JPEG_RESIZE_DECODE_OPTS);
        } catch {
          bitmap = await createFilmLabImageBitmap(blob, BMP_DECODE_OPTS);
        }
        return { bitmap, orientation };
      } catch {
        /* dalej — finalny błąd */
      }
    }
    const u8Tail = new Uint8Array(ab);
    const tiffMagic =
      (u8Tail[0] === 0x49 && u8Tail[1] === 0x49 && u8Tail[2] === 0x2a && u8Tail[3] === 0x00) ||
      (u8Tail[0] === 0x4d && u8Tail[1] === 0x4d && u8Tail[2] === 0x00 && u8Tail[3] === 0x2a);
    /**
     * Jedyna ścieżka `NEEDS_WEBGPU_DECODE`: TIFF/DNG (magic II* / MM*), a `bruteForceJpegSearch`
     * nie znalazł żadnego SOI — brak osadzonego JPEG do zdekodowania w workerze (proxy WebGPU po stronie hosta).
     */
    const bruteFull = bruteForceJpegSearch(ab, 2000000, { silent: true });
    if (tiffMagic && bruteFull.offsets.length === 0) {
      const err = new Error('needs-webgpu-decode');
      err.code = 'NEEDS_WEBGPU_DECODE';
      err.damPreviewNeedsProxyDecode = true;
      throw err;
    }
    throw new Error('no embedded JPEG in preview bytes');
  }
  return decodeBuf(extracted, 'embedded-extract');
}

function previewFirstMarkerHex(ab) {
  if (!ab || !(ab instanceof ArrayBuffer) || ab.byteLength < 1) {
    return '';
  }
  const u8 = new Uint8Array(ab);
  return Array.from(u8.slice(0, Math.min(4, u8.length)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

/**
 * Naprawia niespójność między tagiem EXIF Orientation a faktycznym ułożeniem pikseli w JPEG.
 * Niektóre aparaty (Nikon NEF, Canon CR2) zapisują podgląd JPEG już obrócony do naturalnej
 * orientacji, lecz nadal ustawiają tag Orientation = 6 lub 8 (błąd firmware).
 * `createImageBitmap(blob, { imageOrientation: 'none' })` ignoruje EXIF → bitmap ma „właściwy"
 * stosunek boków. Jeśli tag mówi „obróć 90°/270°" (orientation 5–8), ale bitmap jest PIONOWY
 * (height > width), to obrót zmieniłby obraz w poziomy — co jest błędem. W takim wypadku
 * zwracamy 1 (brak rotacji).
 * @param {ImageBitmap} bitmap
 * @param {number} orientation  — wartość z getExifOrientation / getRawFileOrientation
 * @returns {number}
 */
function reconcileOrientationWithBitmap(bitmap, orientation) {
  const o = Number(orientation) || 1;
  if (o < 5 || o > 8) {
    return o; // orientacje 1–4 nie zamieniają szerokości z wysokością — brak problemu
  }
  // Orientacje 5–8 zakładają swap osi. Jeśli bitmap JUŻ jest pionowy (bh > bw),
  // rotacja zmieniłaby go w poziomy → błąd. Ignoruj tag, traktuj jako prawidłowo obrócony.
  if (bitmap.height > bitmap.width) {
    return 1;
  }
  return o;
}

async function decodeDamPreview(id, sessionId, assetId, catalogAssetMeta, opts = {}) {
  const { skipSourceBin = false } = opts;
  /** @type {ArrayBuffer | null} */
  let ab = null;
  try {
    if (cancelled.has(id)) {
      return;
    }
    let tier = 'standard';
    ab = await readDamPreviewBytes(sessionId, assetId, 'standard');
    if (!ab || ab.byteLength < 1) {
      tier = 'embedded';
      ab = await readDamPreviewBytes(sessionId, assetId, 'embedded');
    }
    if ((!ab || ab.byteLength < 1) && skipSourceBin) {
      /**
       * Brak tierów OPFS przy `skipSourceBin` — race / embedded jeszcze nie zapisany.
       * NIE `NEEDS_WEBGPU_DECODE` (to nie jest „brak JPEG w TIFF/DNG po brute scan”).
       */
      const err = new Error('no dam preview bytes in OPFS (skipSourceBin)');
      err.code = 'NO_OPFS_DAM_PREVIEW';
      throw err;
    }
    /**
     * Camera-RAW (CR2/CR3/NEF/ARW/RAF/ORF/RW2/X3F/3FR): NIE czytaj source.bin w workerze thumb path.
     * Te formaty NIE zwracają decodowalnego JPEG przez `createImageBitmap` na surowym buforze, a 30+ MB
     * read blokuje workera na sekundy. Zamiast tego: szybkie wyjście webgpu-required → main thread
     * uruchamia `tryExtractEmbeddedJpegFromRawFile` (sequencyjnie, z budżetem 4 s) → zapisuje embedded.jpg
     * → bumpPreviewEpoch → kolejny load przez tier `embedded` (szybki).
     * DNG zostawiamy w starej ścieżce — często ma pełen embedded JPEG decodowalny natywnie.
     */
    if (!ab || ab.byteLength < 1) {
      const sourceName =
        typeof catalogAssetMeta?.sourceName === 'string' ? catalogAssetMeta.sourceName : '';
      const isLikelyBareRaw = /\.(cr2|cr3|nef|arw|raf|orf|rw2|x3f|3fr)$/i.test(sourceName);
      if (isLikelyBareRaw) {
        const err = new Error('raw file pending embedded preview tier');
        err.code = 'RAW_AWAITING_EMBEDDED_TIER';
        throw err;
      }
    }
    if (!ab || ab.byteLength < 1) {
      const row =
        catalogAssetMeta && typeof catalogAssetMeta === 'object'
          ? catalogAssetMeta
          : null;
      const src = await readCatalogSourceBytes(sessionId, assetId, row, {
        maxBytes: FILMLAB_DAM_PREVIEW_SOURCE_READ_CAP_BYTES,
      });
      if (src?.buffer?.byteLength > 0) {
        ab = src.buffer;
        tier = 'source-bin';
        if (import.meta.env?.DEV) {
          console.debug('[FilmLab][imageWorker] damPreview fallback → source.bin', {
            assetId,
            byteLength: ab.byteLength,
          });
        }
      }
    }
    if (!ab || ab.byteLength < 1) {
      postError(id, 'no preview in OPFS');
      return;
    }
    if (cancelled.has(id)) {
      return;
    }
    if (import.meta.env?.DEV) {
      console.debug('[FilmLab][imageWorker] damPreview bytes', {
        assetId,
        tier,
        byteLength: ab.byteLength,
        startsJpeg: bufferStartsWithJpegSoi(new Uint8Array(ab)),
      });
    }
    self.postMessage({
      type: 'lruPing',
      sessionId: String(sessionId),
      assetId: String(assetId),
      tier,
      bytes: ab.byteLength,
    });
    const { bitmap, orientation } = await decodeDamPreviewFromBytes(ab, assetId, catalogAssetMeta);
    if (cancelled.has(id)) {
      bitmap.close();
      cancelled.delete(id);
      return;
    }
    /**
     * Część aparatów (Canon, Nikon) wbudowuje w plik RAW podgląd JPEG już obrócony do naturalnej
     * orientacji, ale jednocześnie ustawia tag EXIF Orientation != 1 (błąd firmware).
     * Jeśli po wykryciu orientacji obrót 90°/270° zmieniłby pionowy obraz (bh > bw) w poziomy,
     * ignorujemy tag i traktujemy obraz jako poprawnie obrócony (orientation = 1).
     */
    const finalOrientation = reconcileOrientationWithBitmap(bitmap, orientation);
    /** Transfer — ImageBitmap nie jest kopiowany do głównego wątku. */
    self.postMessage(
      {
        type: 'ready',
        id,
        bitmap,
        orientation: Number.isFinite(finalOrientation) ? finalOrientation : 1,
      },
      [bitmap]
    );
  } catch (e) {
    if (!cancelled.has(id)) {
      const msg = e instanceof Error ? e.message : String(e);
      const needsWebgpuDecode = e && typeof e === 'object' && e.code === 'NEEDS_WEBGPU_DECODE';
      const needsProxyDecode = Boolean(needsWebgpuDecode);
      if (import.meta.env?.DEV && needsProxyDecode) {
        const k = String(assetId ?? '');
        if (!damPreviewProxyDevWarned.has(k)) {
          damPreviewProxyDevWarned.add(k);
          console.warn('[FilmLab][imageWorker] damPreview needs proxy decode', assetId, {
            firstMarker: previewFirstMarkerHex(ab),
            needsWebgpuDecode,
          });
        }
      }
      postError(id, msg, {
        damPreviewNeedsProxyDecode: needsProxyDecode,
        needsWebgpuDecode,
        firstMarker: previewFirstMarkerHex(ab),
        bufferHead10:
          ab && ab.byteLength > 0
            ? Array.from(new Uint8Array(ab.slice(0, Math.min(10, ab.byteLength))))
            : null,
      });
    }
  }
}

async function readCatalogSource(id, sessionId, assetId, catalogAssetMeta) {
  try {
    if (cancelled.has(id)) {
      cancelled.delete(id);
      return;
    }
    const row =
      catalogAssetMeta && typeof catalogAssetMeta === 'object'
        ? catalogAssetMeta
        : null;
    const result = await readCatalogSourceBytes(sessionId, assetId, row);
    if (cancelled.has(id)) {
      cancelled.delete(id);
      return;
    }
    if (import.meta.env?.DEV) {
      const bl = result?.buffer?.byteLength ?? 0;
      const head = result?.buffer instanceof ArrayBuffer ? new Uint8Array(result.buffer).slice(0, 4) : null;
      const firstMarker = head && head.length
        ? Array.from(head)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' ')
        : '';
      console.log('[DNG Probe]', assetId, { hasSubIFDs: false, firstMarker, byteLength: bl });
    }
    if (!result || !result.buffer || result.buffer.byteLength < 1) {
      postError(id, 'no source in OPFS');
      return;
    }
    const { buffer, sourceName, sourceLastModified } = result;
    self.postMessage(
      {
        type: 'sourceReady',
        id,
        sourceName,
        sourceLastModified,
        buffer,
      },
      [buffer]
    );
  } catch (e) {
    if (!cancelled.has(id)) {
      postError(id, e instanceof Error ? e.message : String(e));
    }
  }
}
