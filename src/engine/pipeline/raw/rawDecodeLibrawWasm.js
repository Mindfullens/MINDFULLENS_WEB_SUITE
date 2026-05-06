/**
 * Etap 2B — dekodowanie RAW w workerze przez `libraw-wasm` (LibRaw → RGB → PNG).
 * Pierwszy tor E2E: formaty obsługiwane przez LibRaw w tej kompilacji (w praktyce m.in. DNG).
 */

import LibRaw from 'libraw-wasm';
import { computeDecodeStats } from './rawDecodePreviewStats.js';

const DEFAULT_RAW_COLOR_PIPELINE = Object.freeze({
  stage: 'srgb-linear-srgb-v1',
  inputEncoding: 'display-srgb',
  workingEncoding: 'scene-linear',
  outputEncoding: 'display-srgb',
  linearStageEnabled: true,
});

/** 0..3 zgodnie z LibRaw/dcraw: 0=off, 1=if WB, 3=always (DCP/ICC macierz). */
function getLibrawUseCameraMatrixFromEnv() {
  try {
    const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
    const n = Number(env?.VITE_FILMLAB_RAW_LIBRAW_USE_CAMERA_MATRIX);
    if (Number.isFinite(n) && n >= 0 && n <= 3) {
      return Math.floor(n);
    }
  } catch {
    // ignore
  }
  return 3;
}

/** `embed` = w profil aparatu z pliku (DCP/ICC w kontenerze), gdy LibRaw z LCMS. */
function getLibrawCameraProfileFromEnv() {
  try {
    const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
    const v = String(env?.VITE_FILMLAB_RAW_LIBRAW_CAMERA_PROFILE ?? '')
      .trim()
      .toLowerCase();
    if (v === 'embed' || v === '1' || v === 'true' || v === 'yes') {
      return 'embed';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {Uint8Array} rgb
 * @param {number} width
 * @param {number} height
 * @returns {Promise<ArrayBuffer>}
 */
async function encodeRgb8ToPngBuffer(rgb, width, height) {
  if (
    typeof OffscreenCanvas === 'undefined' ||
    rgb.length !== width * height * 3 ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('encodeRgb8ToPngBuffer: invalid RGB buffer or dimensions');
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('encodeRgb8ToPngBuffer: no 2d context');
  }

  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    out[j] = rgb[i];
    out[j + 1] = rgb[i + 1];
    out[j + 2] = rgb[i + 2];
    out[j + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

/**
 * @param {object | null | undefined} meta
 * @param {number} rgbLength
 * @returns {{ width: number; height: number } | null}
 */
function inferOutputDimensions(meta, rgbLength) {
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const pairs = [
    [meta.width, meta.height],
    [meta.iwidth, meta.iheight],
    [meta.width, meta.iheight],
    [meta.iwidth, meta.height],
  ];
  for (const [wRaw, hRaw] of pairs) {
    const w = Number(wRaw);
    const h = Number(hRaw);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { width: Math.floor(w), height: Math.floor(h) };
    }
  }

  const pixels = Math.floor(rgbLength / 3);
  if (pixels <= 0) {
    return null;
  }
  const root = Math.round(Math.sqrt(pixels));
  if (root > 0 && root * root === pixels) {
    return { width: root, height: root };
  }
  return null;
}

function pickSensorDimensions(meta, fallbackWidth, fallbackHeight) {
  if (!meta || typeof meta !== 'object') {
    return { sourceWidth: fallbackWidth, sourceHeight: fallbackHeight };
  }
  const sw = Number(meta.full_width ?? meta.raw_width ?? meta.width ?? meta.iwidth);
  const sh = Number(meta.full_height ?? meta.raw_height ?? meta.height ?? meta.iheight);
  return {
    sourceWidth: Number.isFinite(sw) && sw > 0 ? Math.floor(sw) : fallbackWidth,
    sourceHeight: Number.isFinite(sh) && sh > 0 ? Math.floor(sh) : fallbackHeight,
  };
}

/** Tylko pola serializowalne do DIAG / UI — bez dużych buforów ani obiektów zagnieżdżonych. */
function sanitizeLibrawScalar(value) {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length ? t : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return undefined;
}

/**
 * Skrót metadanych LibRaw dla panelu i eksportu DIAG (kolejność nazw może się różnić między buildami WASM).
 */
export function pickLibrawMetadataSummary(meta) {
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const keyGroups = [
    ['make', 'model', 'software', 'desc'],
    ['iso_speed', 'iso', 'shutter', 'aperture', 'focal_len', 'focal_length', 'lens'],
    ['width', 'height', 'iwidth', 'iheight', 'full_width', 'full_height', 'raw_width', 'raw_height'],
    ['filters', 'cdesc', 'flip', 'thumb_format'],
  ];
  const out = {};
  for (const group of keyGroups) {
    for (const key of group) {
      if (!(key in meta)) {
        continue;
      }
      const v = sanitizeLibrawScalar(meta[key]);
      if (v !== undefined) {
        out[key] = v;
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {File | Blob} file
 * @param {{ renderIntent?: string; baseUrl?: string; backendPreference?: string | null }} context
 */
export async function decodeRawWithLibrawWasm(file, context = {}) {
  const renderIntent = context?.renderIntent ?? 'preview';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (!bytes.byteLength) {
      return {
        ok: false,
        error: {
          code: 'RAW_LIBRAW_EMPTY_INPUT',
          message: 'Pusty bufor pliku RAW.',
        },
        payload: {
          decoderInstalled: false,
          rawDecodeAdapter: 'libraw-wasm',
        },
      };
    }

    const raw = new LibRaw();
    const policy = String(context?.rawColorimetryPolicy ?? 'auto').trim().toLowerCase();
    let useCameraMatrix = getLibrawUseCameraMatrixFromEnv();
    let embedCameraProfile = getLibrawCameraProfileFromEnv() === 'embed';
    if (policy === 'camera_embed') {
      useCameraMatrix = 3;
      embedCameraProfile = true;
    } else if (policy === 'generic_matrix') {
      useCameraMatrix = 0;
      embedCameraProfile = false;
    }
    const openOpts = {
      outputColor: 1,
      outputBps: 8,
      halfSize: renderIntent !== 'full',
      useCameraWb: false,
      useAutoWb: false,
      useCameraMatrix,
      ...(embedCameraProfile ? { cameraProfile: 'embed' } : {}),
    };

    await raw.open(bytes, openOpts);
    let meta = await raw.metadata(false);
    const rgb = await raw.imageData();

    if (!(rgb instanceof Uint8Array) || rgb.length < 3) {
      return {
        ok: false,
        error: {
          code: 'RAW_LIBRAW_NO_IMAGE_DATA',
          message: 'LibRaw nie zwrócił danych obrazu (imageData).',
        },
        payload: {
          decoderInstalled: true,
          rawDecodeAdapter: 'libraw-wasm',
        },
      };
    }

    let dims = inferOutputDimensions(meta, rgb.length);
    if (!dims && renderIntent !== 'full') {
      meta = await raw.metadata(true);
      dims = inferOutputDimensions(meta, rgb.length);
    }

    if (!dims) {
      return {
        ok: false,
        error: {
          code: 'RAW_LIBRAW_GEOMETRY_UNKNOWN',
          message:
            'Nie udało się ustalić szerokości/wysokości wyjścia LibRaw (metadata).',
        },
        payload: {
          decoderInstalled: true,
          rawDecodeAdapter: 'libraw-wasm',
          librawMetadataSample: meta && typeof meta === 'object' ? Object.keys(meta).slice(0, 24) : [],
        },
      };
    }

    const { width, height } = dims;
    if (width * height * 3 !== rgb.length) {
      return {
        ok: false,
        error: {
          code: 'RAW_LIBRAW_RGB_SIZE_MISMATCH',
          message: `LibRaw RGB: oczekiwano ${width * height * 3} bajtów, jest ${rgb.length}.`,
        },
        payload: {
          decoderInstalled: true,
          rawDecodeAdapter: 'libraw-wasm',
        },
      };
    }

    const pngBuffer = await encodeRgb8ToPngBuffer(rgb, width, height);
    const decodeStats = await computeDecodeStats(pngBuffer, 'image/png');
    const { sourceWidth, sourceHeight } = pickSensorDimensions(meta, width, height);

    return {
      ok: true,
      payload: {
        buffer: pngBuffer,
        mimeType: 'image/png',
        backend: 'libraw-wasm',
        bridge: null,
        bridgeUrl: null,
        fileName: file?.name ?? '',
        backendPreference: String(context?.backendPreference ?? 'auto'),
        sourceWidth,
        sourceHeight,
        decodeStats,
        colorPipeline: {
          stage: DEFAULT_RAW_COLOR_PIPELINE.stage,
          inputEncoding: DEFAULT_RAW_COLOR_PIPELINE.inputEncoding,
          workingEncoding: DEFAULT_RAW_COLOR_PIPELINE.workingEncoding,
          outputEncoding: DEFAULT_RAW_COLOR_PIPELINE.outputEncoding,
          linearStageEnabled: DEFAULT_RAW_COLOR_PIPELINE.linearStageEnabled,
        },
        rawDecodeAdapter: 'libraw-wasm',
        rawDecodeAdapterPhase: 'libraw-wasm',
        librawMetadataSummary: pickLibrawMetadataSummary(meta),
        librawDevelopSettings: {
          outputColor: openOpts.outputColor,
          outputBps: openOpts.outputBps,
          halfSize: openOpts.halfSize,
          useCameraMatrix: openOpts.useCameraMatrix,
          cameraProfile: openOpts.cameraProfile ?? null,
          /** Kolorymetryka wejścia: macierz + opcjonalny profil z pliku (DCP/ICC). */
          colorimetryHint: 'srgb-output-useCameraMatrix+DCP-if-embed',
        },
        /** Pierwszy zweryfikowany tor: LibRaw (np. DNG); meta.other może zawierać tagi. */
        librawWasmNote: 'e2e-libraw-wasm-rgb8-srgb-preview',
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: {
        code: 'RAW_LIBRAW_DECODE_FAILED',
        message: message || 'Dekodowanie LibRaw WASM nie powiodło się.',
      },
      payload: {
        decoderInstalled: true,
        workerReady: true,
        backend: 'libraw-wasm',
        rawDecodeAdapter: 'libraw-wasm',
        rawDecodeAdapterPhase: 'libraw-wasm-error',
      },
    };
  }
}
