import {
  collectBrute512kFfd8ffJpegSlices,
  extractLargestEmbeddedJpegBytes,
  getRawFileOrientation,
  isLikelyCameraRawFilename,
  tryExtractJpegFromTiffIfd513514,
} from './filmLabEmbeddedJpegExtract.js';
import { nextImageWorkerRequestId, scheduleFileArrayBufferRead } from '../filmLabImageWorkerBridge.js';
import {
  createFilmLabImageBitmap,
  FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE,
} from '../filmLabImageBitmapOptions.js';
import { orderTiffJpegDecodeAttempts } from '../filmLabOpfsJpegAttemptOrder.js';

/** Maksymalna liczba kandydatów JPEG do testowania per plik — chroni przed eksplozją prób na zaszyfikowanych RAW. */
const MAX_JPEG_CANDIDATES_PER_FILE = 5;
/** Krótszy timeout per próba — `createFilmLabImageBitmap` zachowuje 5s, ale tu chcemy szybko przejść do następnego. */
const PICK_DECODE_PER_ATTEMPT_TIMEOUT_MS = 800;
/** Całkowity budżet czasu na ekstrakcję per plik — chroni główny wątek przed wielosekundowymi blokadami. */
const PICK_DECODE_TOTAL_BUDGET_MS = 4000;

function decodeWithRaceTimeout(blob, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('decode-attempt-timeout')), ms);
    createFilmLabImageBitmap(blob, FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE)
      .then((bmp) => {
        clearTimeout(t);
        resolve(bmp);
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

/**
 * @param {ArrayBuffer[]} buffers
 * @param {number} startedAtMs — `performance.now()` z chwili rozpoczęcia ekstrakcji (do budżetu)
 * @returns {Promise<ArrayBuffer | null>}
 */
async function pickFirstDecodableJpegBuffer(buffers, startedAtMs) {
  let tried = 0;
  for (const ab of buffers) {
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < 256) {
      continue;
    }
    if (tried >= MAX_JPEG_CANDIDATES_PER_FILE) {
      break;
    }
    if (performance.now() - startedAtMs > PICK_DECODE_TOTAL_BUDGET_MS) {
      break;
    }
    tried += 1;
    try {
      const bmp = await decodeWithRaceTimeout(
        new Blob([ab], { type: 'image/jpeg' }),
        PICK_DECODE_PER_ATTEMPT_TIMEOUT_MS
      );
      bmp.close?.();
      return ab;
    } catch {
      // następny kandydat
    }
  }
  return null;
}

/**
 * @param {ArrayBuffer[]} slices
 * @returns {ArrayBuffer[]}
 */
function dedupeSliceBuffers(slices) {
  const keys = new Set();
  /** @type {ArrayBuffer[]} */
  const out = [];
  for (const ab of slices) {
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < 256) {
      continue;
    }
    const z = new Uint8Array(ab);
    const key = `${ab.byteLength}:${Array.from(z.slice(0, 48)).join(',')}`;
    if (keys.has(key)) {
      continue;
    }
    keys.add(key);
    out.push(ab);
  }
  return out;
}

/**
 * Wyciąga wbudowany JPEG z pliku RAW (miniatury do OPFS `embedded` zanim zadziała pełny pipeline).
 * Używa parsera TIFF/DNG + brutalnego skanu FF D8 FF, nie tylko SOI…EOI w pierwszych 40 MB.
 * Zwraca {blob, orientationTag} — orientationTag pochodzi z głównego TIFF IFD pliku RAW
 * (bo embedded JPEG zwykle nie ma własnego EXIF orientation, np. Canon CR2).
 * @param {File} file
 * @returns {Promise<{ blob: Blob, orientationTag: number | null } | null>}
 */
export async function tryExtractEmbeddedJpegFromRawFile(file) {
  if (!(file instanceof File)) {
    return null;
  }
  if (!isLikelyCameraRawFilename(file.name)) {
    return null;
  }
  try {
    const startedAtMs = performance.now();
    const reqId = nextImageWorkerRequestId();
    /**
     * Czytaj tylko pierwsze 16 MB pliku — embedded JPEG (preview / thumbnail) jest praktycznie zawsze
     * w pierwszych megabajtach pliku RAW. Pełen 80 MB Panasonic RW2 czytany w workerze blokuje slot na 8+s.
     * Jeśli embedded JPEG jest dalej, fallback `webgpu-required` placeholder + Develop wygeneruje proxy.
     */
    let ab = await scheduleFileArrayBufferRead(file, reqId, undefined, { maxBytes: 16 * 1024 * 1024 });
    if (!ab || ab.byteLength < 2048) {
      return null;
    }
    /** Czytaj orientację z głównego TIFF IFD ZANIM rozpoczniemy decode — nie ma jej w embedded JPEG. */
    const orientationTag = getRawFileOrientation(ab, file.name);
    const pack = tryExtractJpegFromTiffIfd513514(ab, { assetId: file.name });
    const fromIfd = orderTiffJpegDecodeAttempts(pack.buffer, pack.fallbackSlices);
    /** Brute scan jest CPU-intensive (skanuje cały bufor) — pomijamy gdy IFD już znalazł kandydatów. */
    const brutal = fromIfd.length === 0 ? collectBrute512kFfd8ffJpegSlices(ab) : [];
    const merged = dedupeSliceBuffers([...fromIfd, ...brutal]);
    const picked = await pickFirstDecodableJpegBuffer(merged, startedAtMs);
    if (picked) {
      return { blob: new Blob([picked], { type: 'image/jpeg' }), orientationTag };
    }
    if (performance.now() - startedAtMs > PICK_DECODE_TOTAL_BUDGET_MS) {
      return null;
    }
    const jpeg = extractLargestEmbeddedJpegBytes(ab);
    if (!jpeg || jpeg.byteLength < 256) {
      return null;
    }
    return { blob: new Blob([jpeg], { type: 'image/jpeg' }), orientationTag };
  } catch {
    return null;
  }
}

/**
 * Zapisuje tier `embedded` w OPFS zaraz po imporcie RAW (parallel do writeRasterImportThumbnailIfPossible).
 * Zwraca `{ ok, orientationTag }` — orientationTag z TIFF IFD przeznaczony do zapisu w katalogu (exif snapshot).
 * @param {string} sessionId
 * @param {string} assetId
 * @param {File} file
 * @returns {Promise<{ ok: boolean, orientationTag: number | null }>}
 */
export async function writeRawEmbeddedThumbnailIfPossible(sessionId, assetId, file) {
  if (!(file instanceof File) || !isLikelyCameraRawFilename(file.name)) {
    return { ok: false, orientationTag: null };
  }
  const result = await tryExtractEmbeddedJpegFromRawFile(file);
  if (!result || !result.blob || result.blob.size < 1) {
    return { ok: false, orientationTag: null };
  }
  const { writeDamPreviewBlob } = await import('../opfs/filmLabOpfsPreviewCache.js');
  const ok = await writeDamPreviewBlob(sessionId, assetId, 'embedded', result.blob);
  return { ok: Boolean(ok), orientationTag: result.orientationTag };
}
