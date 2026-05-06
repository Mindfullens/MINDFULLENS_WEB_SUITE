/**
 * Compound masking — each layer has an independent float alpha buffer; this module merges them
 * using the same blend semantics as the preview (`compoundLayerIntoMaster` in maskMasterAlphaPreview).
 * Optional OffscreenCanvas path composites layers for visualization without touching engine Float32 math.
 */

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {Float32Array} master
 * @param {Float32Array} buffer
 * @param {number} opacity01
 * @param {string} blend
 */
export function compoundFloatLayerIntoMaster(master, buffer, opacity01, blend) {
  if (!(buffer instanceof Float32Array) || !(master instanceof Float32Array) || buffer.length !== master.length) {
    return;
  }
  const op = clamp01(opacity01);
  const b = String(blend ?? 'normal');
  const len = master.length;
  for (let p = 0; p < len; p += 1) {
    const g = clamp01(buffer[p] * op);
    if (g <= 0.00001) {
      continue;
    }
    if (b === 'subtract') {
      master[p] = clamp01(master[p] - g);
    } else if (b === 'add') {
      master[p] = clamp01(master[p] + g * (1 - master[p]));
    } else {
      master[p] = Math.max(master[p], g);
    }
  }
}

/**
 * Stack multiple precomputed mask buffers (one per layer) into a single master alpha grid.
 *
 * @param {Array<{ buffer: Float32Array, opacity01: number, blend: string }>} layers
 * @param {number} pixelCount width * height
 * @returns {Float32Array}
 */
export function compoundMaskFloatLayers(layers, pixelCount) {
  const master = new Float32Array(pixelCount).fill(0);
  for (const layer of layers) {
    if (layer?.buffer instanceof Float32Array && layer.buffer.length === pixelCount) {
      compoundFloatLayerIntoMaster(master, layer.buffer, layer.opacity01 ?? 1, layer.blend ?? 'normal');
    }
  }
  return master;
}

/**
 * Draw stacked mask buffers to an OffscreenCanvas (non-destructive merge preview).
 *
 * @param {Array<{ buffer: Float32Array, opacity01: number, blend: string }>} layers
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement | OffscreenCanvas | null}
 */
function createBitmapCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  return null;
}

export function compositeMaskLayersToOffscreenCanvas(layers, width, height) {
  if (width < 2 || height < 2 || !Array.isArray(layers) || layers.length === 0) {
    return null;
  }
  const pixelCount = width * height;
  const master = createBitmapCanvas(width, height);
  if (!master) {
    return null;
  }
  const ctx = master.getContext('2d', { alpha: true });
  if (!ctx) {
    return null;
  }
  ctx.clearRect(0, 0, width, height);
  for (let li = 0; li < layers.length; li += 1) {
    const layer = layers[li];
    const buf = layer?.buffer;
    if (!(buf instanceof Float32Array) || buf.length !== pixelCount) {
      continue;
    }
    const layerCanvas = createBitmapCanvas(width, height);
    if (!layerCanvas) {
      continue;
    }
    const lctx = layerCanvas.getContext('2d', { alpha: true });
    if (!lctx) {
      continue;
    }
    const img = lctx.createImageData(width, height);
    const d = img.data;
    const op = clamp01(layer.opacity01 ?? 1);
    for (let i = 0; i < pixelCount; i += 1) {
      const a = Math.round(clamp01(buf[i]) * op * 255);
      const j = i * 4;
      d[j] = 255;
      d[j + 1] = 255;
      d[j + 2] = 255;
      d[j + 3] = a;
    }
    lctx.putImageData(img, 0, 0);
    const blend = String(layer.blend ?? 'normal');
    if (blend === 'subtract') {
      ctx.globalCompositeOperation = 'destination-out';
    } else if (blend === 'add') {
      ctx.globalCompositeOperation = 'lighter';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(layerCanvas, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
  return master;
}
