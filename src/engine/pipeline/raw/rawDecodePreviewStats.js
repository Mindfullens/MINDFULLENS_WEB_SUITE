/** Wspólne statystyki jakości klatki po dekodowaniu (PNG/JPEG w buforze). */

export const DECODE_STATS_MAX_EDGE = 96;

function roundStat(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * @param {ArrayBuffer} buffer
 * @param {string} [mimeType]
 * @returns {Promise<Record<string, number> | null>}
 */
export async function computeDecodeStats(buffer, mimeType = 'image/png') {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof OffscreenCanvas === 'undefined' ||
    !(buffer instanceof ArrayBuffer)
  ) {
    return null;
  }

  let bitmap = null;
  try {
    const blob = new Blob([buffer], { type: mimeType || 'image/png' });
    bitmap = await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
      premultiplyAlpha: 'none',
    });

    if (!bitmap?.width || !bitmap?.height) {
      return null;
    }

    const sampleWidth = Math.max(1, Math.min(DECODE_STATS_MAX_EDGE, bitmap.width));
    const sampleHeight = Math.max(1, Math.min(DECODE_STATS_MAX_EDGE, bitmap.height));
    const canvas = new OffscreenCanvas(sampleWidth, sampleHeight);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }

    context.clearRect(0, 0, sampleWidth, sampleHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'medium';
    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);

    const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imageData?.data;
    if (!data?.length) {
      return null;
    }

    const pixelCount = sampleWidth * sampleHeight;
    let lumaSum = 0;
    let nonBlackCount = 0;
    let opaqueCount = 0;
    let zeroAlphaCount = 0;

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] || 0;
      const green = data[index + 1] || 0;
      const blue = data[index + 2] || 0;
      const alpha = data[index + 3] || 0;
      const alphaNorm = alpha / 255;
      const luma = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * alphaNorm;
      lumaSum += luma;

      if (luma > 8) {
        nonBlackCount += 1;
      }
      if (alpha > 8) {
        opaqueCount += 1;
      }
      if (alpha <= 1) {
        zeroAlphaCount += 1;
      }
    }

    return {
      sampledWidth: sampleWidth,
      sampledHeight: sampleHeight,
      meanLuma: roundStat(lumaSum / pixelCount, 3),
      nonBlackRatio: roundStat(nonBlackCount / pixelCount, 6),
      opaqueRatio: roundStat(opaqueCount / pixelCount, 6),
      zeroAlphaRatio: roundStat(zeroAlphaCount / pixelCount, 6),
    };
  } catch (_error) {
    return null;
  } finally {
    try {
      bitmap?.close?.();
    } catch (_closeError) {
      // noop
    }
  }
}
