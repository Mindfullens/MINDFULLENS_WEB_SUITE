import {
  createIdlePipelineInfo,
  detectSourceKind,
  PIPELINE_KIND,
  PIPELINE_STATUS,
  SOURCE_KIND,
} from './constants.js';
import {
  loadBitmapRenderableBlob,
  loadBitmapRenderableSource,
} from './bitmap/loadBitmapRenderableSource.js';
import { decodeRawSource, probeRawPipeline } from './raw/rawPipelineController.js';

/**
 * Czytelny komunikat dla typowych błędów LibRaw WASM (Etap 2); zachowuje oryginał w nawiasie.
 * @param {string | undefined} code
 * @param {string | undefined} serverMessage
 */
function formatRawLibrawErrorForUser(code, serverMessage) {
  const base = {
    RAW_LIBRAW_EMPTY_INPUT: 'Brak danych pliku RAW (pusty bufor).',
    RAW_LIBRAW_NO_IMAGE_DATA: 'LibRaw zakończył pracę, ale nie zwrócił danych obrazu.',
    RAW_LIBRAW_GEOMETRY_UNKNOWN: 'LibRaw nie ustalił wymiarów obrazu (metadane).',
    RAW_LIBRAW_RGB_SIZE_MISMATCH: 'Niespójny rozmiar bufora RGB z LibRaw.',
    RAW_LIBRAW_DECODE_FAILED: 'Dekodowanie LibRaw (WASM) nie powiodło się.',
  };
  const head = code && base[code] ? base[code] : null;
  if (head) {
    return serverMessage ? `${head} (${serverMessage})` : head;
  }
  return serverMessage ?? '';
}

function formatRawDecodeMessage(payload) {
  const backendRaw = payload?.backend ?? '';
  const backendLower = String(backendRaw).toLowerCase();
  const backend =
    backendLower === 'libraw-wasm' || payload?.rawDecodeAdapter === 'libraw-wasm'
      ? 'LibRaw (WASM)'
      : backendRaw || 'lokalny dekoder';
  const stats = payload?.decodeStats ?? null;
  const colorPipeline = payload?.colorPipeline ?? null;
  const parts = [`RAW zdekodowany lokalnie przez ${backend}.`];

  const meanLuma = Number(stats?.meanLuma);
  const nonBlackRatio = Number(stats?.nonBlackRatio);
  if (Number.isFinite(meanLuma) || Number.isFinite(nonBlackRatio)) {
    const statsParts = [];
    if (Number.isFinite(meanLuma)) {
      statsParts.push(`L=${meanLuma.toFixed(2)}`);
    }
    if (Number.isFinite(nonBlackRatio)) {
      statsParts.push(`NB=${(nonBlackRatio * 100).toFixed(2)}%`);
    }
    if (statsParts.length) {
      parts.push(`Statystyki dekodu: ${statsParts.join(', ')}.`);
    }
  }

  if (payload?.fallbackReason) {
    parts.push(`Aktywny fallback: ${String(payload.fallbackReason)}.`);
  }
  if (payload?.suspectedBlackFrame) {
    parts.push('Uwaga: dekod wygląda na podejrzanie ciemny.');
  }
  if (colorPipeline?.stage) {
    parts.push(
      `Color pipeline: ${colorPipeline.stage} (${colorPipeline.inputEncoding ?? 'input'} -> ${
        colorPipeline.workingEncoding ?? 'working'
      } -> ${colorPipeline.outputEncoding ?? 'output'}).`
    );
  }

  return parts.join(' ');
}

export async function ingestUploadSource({
  uploadedFile,
  uploadedImage,
  renderIntent = 'preview',
  rawBackendPreference = null,
}) {
  if (!uploadedFile && !uploadedImage) {
    return {
      pipelineInfo: createIdlePipelineInfo(),
      asset: null,
    };
  }

  const sourceKind = detectSourceKind(uploadedFile);

  if (sourceKind === SOURCE_KIND.RAW) {
    console.info('[FilmLab] Detected RAW source', {
      fileName: uploadedFile?.name,
      fileType: uploadedFile?.type,
      fileSize: uploadedFile?.size,
      extension: uploadedFile?.name?.split('.').pop()?.toLowerCase(),
    });
    const probe = await probeRawPipeline();
    // Keep preview framing identical to export/full path:
    // request full decode for RAW, then scale down client-side for UI preview.
    const rawDecodeIntent = renderIntent === 'preview' ? 'full' : renderIntent;
    const decode = await decodeRawSource(uploadedFile, rawDecodeIntent, rawBackendPreference);

    if (decode.ok && decode.payload?.buffer) {
      const { buffer: _decodedBuffer, ...decodeCapabilities } = decode.payload ?? {};
      const detectedMime = decode.payload.mimeType || 'image/png';
      const previewBlob = new Blob([decode.payload.buffer], {
        type: detectedMime,
      });

      const firstBytes = new Uint8Array(decode.payload.buffer, 0, Math.min(32, decode.payload.buffer.byteLength));
      const hexPreview = Array.from(firstBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');
      const asciiPreview = Array.from(firstBytes)
        .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
        .join('');

      console.info('[FilmLab] RAW bridge returned blob', {
        backend: decode.payload.backend,
        bridge: decode.payload.bridge,
        bridgeUrl: decode.payload.bridgeUrl,
        mimeType: detectedMime,
        size: previewBlob.size,
        sourceWidth: decode.payload.sourceWidth,
        sourceHeight: decode.payload.sourceHeight,
        firstBytesHex: hexPreview,
        firstBytesAscii: asciiPreview,
      });

      const asset = await loadBitmapRenderableBlob(previewBlob, {
        // createImageBitmap can return black frames for some RAW-decoder PNGs
        // on specific browser/GPU combinations; HTMLImageElement decode is slower
        // but more reliable for this path (with createImageBitmap as fallback).
        preferHtmlImage: true,
      });

      return {
        pipelineInfo: {
          sourceKind,
          pipelineKind: PIPELINE_KIND.RAW,
          status: PIPELINE_STATUS.READY,
          message: formatRawDecodeMessage(decode.payload),
          capabilities: {
            ...(decodeCapabilities ?? {}),
            rawProbeSnapshot: probe.payload ?? null,
          },
          fileName: uploadedFile?.name ?? '',
        },
        asset,
      };
    }

    console.warn('[FilmLab] RAW decode FAILED', {
      errorCode: decode.error?.code,
      errorMessage: decode.error?.message,
      bridge: decode.payload?.bridge,
      bridgeUrl: decode.payload?.bridgeUrl,
      decodeOk: decode.ok,
      hasBuffer: Boolean(decode.payload?.buffer),
      fileName: uploadedFile?.name,
    });

    const errCode = decode.error?.code;
    const errDetail = decode.error?.message;
    const librawMsg = String(errCode ?? '').startsWith('RAW_LIBRAW_')
      ? formatRawLibrawErrorForUser(errCode, errDetail)
      : '';

    return {
      pipelineInfo: {
        sourceKind,
        pipelineKind: PIPELINE_KIND.RAW,
        status:
          decode.error?.code === 'RAW_DECODER_MISSING'
            ? PIPELINE_STATUS.DECODER_MISSING
            : PIPELINE_STATUS.ERROR,
        message:
          librawMsg ||
          errDetail ||
          'RAW/DNG pipeline jest gotowy architektonicznie, ale dekoder nie jest jeszcze aktywny.',
        capabilities:
          decode.payload || probe.payload
            ? {
                ...(typeof decode.payload === 'object' && decode.payload ? decode.payload : {}),
                rawProbeSnapshot: probe.payload ?? null,
              }
            : null,
        fileName: uploadedFile?.name ?? '',
      },
      asset: null,
    };
  }

  if (sourceKind === SOURCE_KIND.UNKNOWN) {
    return {
      pipelineInfo: {
        sourceKind,
        pipelineKind: PIPELINE_KIND.BITMAP,
        status: PIPELINE_STATUS.ERROR,
        message: 'Ten format pliku nie jest jeszcze obsługiwany przez Film Lab.',
        capabilities: null,
        fileName: uploadedFile?.name ?? '',
      },
      asset: null,
    };
  }

  const asset = await loadBitmapRenderableSource(uploadedFile, uploadedImage, {
    renderIntent,
  });

  return {
    pipelineInfo: {
      sourceKind: SOURCE_KIND.BITMAP,
      pipelineKind: PIPELINE_KIND.BITMAP,
      status: PIPELINE_STATUS.READY,
      message: '',
      capabilities: null,
      fileName: uploadedFile?.name ?? '',
    },
    asset,
  };
}
