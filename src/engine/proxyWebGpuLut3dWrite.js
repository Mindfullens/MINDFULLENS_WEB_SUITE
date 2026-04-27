import { wouldProxy3dLutsExceedMaxTexEdge } from './proxyGpuLut3dLimit.js';
import { normalizeByteLutPayload } from './workers/proxyGpuRenderer.js';

export const BYTES_PER_PIXEL_RGBA16F = 8;

/**
 * Taka sama sonda co w `proxyWebGpuRenderer` — 3D `rgba16float` do LUT (wspólna z workerem / main sonda).
 * @param {GPUDevice} device
 * @returns {boolean}
 */
export function probeRgba16Float3dLutUsable(device) {
  if (typeof DataView === 'undefined' || typeof DataView.prototype.setFloat16 !== 'function') {
    return false;
  }
  try {
    const t = device.createTexture({
      label: 'proxyWebGpu:probe-3d-lut-rgba16f',
      size: { width: 2, height: 2, depthOrArrayLayers: 2 },
      dimension: '3d',
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    t.destroy();
    return true;
  } catch {
    return false;
  }
}

/**
 * Etykieta formatu 3D LUT (worker + sonda main): `rgba16float` albo `rgba8unorm`.
 * Jedno źródło z `createMainThreadProbe3dLutTextures` i `proxyWebGpuRenderer`.
 * @param {GPUDevice} device
 * @returns {'rgba16float' | 'rgba8unorm'}
 */
export function getProbeLut3dTexFormatLabel(device) {
  return probeRgba16Float3dLutUsable(device) ? 'rgba16float' : 'rgba8unorm';
}

/**
 * S³ w RGB (3 bajty / texel) → RGBA8 dla `texture_3d` w `proxyWebGpuShaders.wgsl`.
 * @param {number} size
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function buildRgbaCube(size, data) {
  const rgbaData = new Uint8Array(size * size * size * 4);
  for (let i = 0; i < size * size * size; i += 1) {
    rgbaData[i * 4] = data[i * 3];
    rgbaData[i * 4 + 1] = data[i * 3 + 1];
    rgbaData[i * 4 + 2] = data[i * 3 + 2];
    rgbaData[i * 4 + 3] = 255;
  }
  return rgbaData;
}

/**
 * S³ texeli, ciasny bufor wierszami (z, y) → `queue.writeTexture` do wolumenu 3D.
 * @param {GPUQueue} queue
 * @param {GPUTexture} texture
 * @param {number} size
 * @param {Uint8Array} tightRgba
 * @param {number} bytesPerTexel
 */
export function write3dRgbaTightToTexture(queue, texture, size, tightRgba, bytesPerTexel) {
  const rowByteWidth = size * bytesPerTexel;
  const bpr = (rowByteWidth + 255) & ~255;
  const rowsPerImage = size;
  const depth = size;
  if (bpr === rowByteWidth) {
    queue.writeTexture(
      { texture },
      tightRgba,
      { offset: 0, bytesPerRow: bpr, rowsPerImage },
      { width: size, height: size, depthOrArrayLayers: depth },
    );
    return;
  }
  const out = new Uint8Array(depth * rowsPerImage * bpr);
  for (let z = 0; z < size; z += 1) {
    for (let y = 0; y < size; y += 1) {
      const srcStart = (z * size * size + y * size) * bytesPerTexel;
      out.set(tightRgba.subarray(srcStart, srcStart + rowByteWidth), (z * rowsPerImage + y) * bpr);
    }
  }
  queue.writeTexture(
    { texture },
    out,
    { offset: 0, bytesPerRow: bpr, rowsPerImage },
    { width: size, height: size, depthOrArrayLayers: depth },
  );
}

/**
 * @param {GPUQueue} queue
 * @param {GPUTexture} texture
 * @param {number} size
 * @param {Uint8Array} rgbaData
 */
export function write3dRgbaBytes(queue, texture, size, rgbaData) {
  write3dRgbaTightToTexture(queue, texture, size, rgbaData, 4);
}

/**
 * Bufor `buildRgbaCube` (RGBA8) → ten sam porządek texeli co `write3dRgbaBytes`, kanały 0..1 w half.
 * @param {GPUQueue} queue
 * @param {GPUTexture} texture
 * @param {number} size
 * @param {Uint8Array} rgbaU8
 */
export function write3dRgba16FloatFromU8Cube(queue, texture, size, rgbaU8) {
  const n = size * size * size;
  const out = new Uint8Array(n * BYTES_PER_PIXEL_RGBA16F);
  const view = new DataView(out.buffer);
  for (let i = 0; i < n; i += 1) {
    const s = i * 4;
    const o = i * BYTES_PER_PIXEL_RGBA16F;
    view.setFloat16(o, rgbaU8[s] / 255, true);
    view.setFloat16(o + 2, rgbaU8[s + 1] / 255, true);
    view.setFloat16(o + 4, rgbaU8[s + 2] / 255, true);
    view.setFloat16(o + 6, rgbaU8[s + 3] / 255, true);
  }
  write3dRgbaTightToTexture(queue, texture, size, out, BYTES_PER_PIXEL_RGBA16F);
}

/**
 * Sonda main / worker fallback: 1×1×1 `rgba8unorm`.
 * @param {GPUDevice} device
 * @param {GPUQueue} queue
 * @param {string} label
 * @param {readonly [number,number,number,number]} rgba
 * @returns {GPUTexture}
 */
export function createEmpty3dLutRgba8Texture(device, queue, label, rgba) {
  const t = device.createTexture({
    label,
    size: { width: 1, height: 1, depthOrArrayLayers: 1 },
    dimension: '3d',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  queue.writeTexture(
    { texture: t },
    new Uint8Array(rgba),
    {},
    { width: 1, height: 1, depthOrArrayLayers: 1 },
  );
  return t;
}

/**
 * 1×1×1 pusty LUT profilu / looka — `rgba8unorm` albo `rgba16float` (jak `updateLutTexture` w workerze).
 * @param {GPUDevice} device
 * @param {GPUQueue} queue
 * @param {string} label
 * @param {'rgba8unorm' | 'rgba16float'} format
 * @param {'profile' | 'look'} kind
 * @returns {GPUTexture}
 */
function createEmpty3dLut1x1(device, queue, label, format, kind) {
  const t = device.createTexture({
    label,
    size: { width: 1, height: 1, depthOrArrayLayers: 1 },
    dimension: '3d',
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  if (format === 'rgba16float') {
    const z = new Uint8Array(8);
    const v = new DataView(z.buffer);
    v.setFloat16(0, 0, true);
    v.setFloat16(2, 0, true);
    v.setFloat16(4, 0, true);
    v.setFloat16(6, kind === 'profile' ? 1 : 0, true);
    queue.writeTexture({ texture: t }, z, {}, { width: 1, height: 1, depthOrArrayLayers: 1 });
  } else {
    queue.writeTexture(
      { texture: t },
      new Uint8Array(kind === 'profile' ? [0, 0, 0, 255] : [0, 0, 0, 0]),
      {},
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );
  }
  return t;
}

/**
 * Prawdziwe wolumeny 3D LUT dla sondy w wątku głównym (jak worker: `rgba16float` gdy
 * `probeRgba16Float3dLutUsable`, w przeciwnym razie `rgba8unorm`), gdy mieści się w `maxTextureDimension3D`.
 * Przy przekroczeniu limitu lub błędzie normalizacji: 1×1 + `useFullLutBinding: false` (silnik użyje `strip…`).
 *
 * @param {GPUDevice} device
 * @param {GPUQueue} queue
 * @param {object} p
 * @param {number} [p.profileLutSize]
 * @param {unknown} [p.profileLutData]
 * @param {unknown} [p.lookLut] — kształt jak `resolveLookLutPayload` (size, data/srgbData, key)
 * @returns {{ lut3d: GPUTexture, look3d: GPUTexture, useFullLutBinding: boolean }}
 */
export function createMainThreadProbe3dLutTextures(device, queue, p) {
  const { profileLutSize = 0, profileLutData = null, lookLut = null } = p;
  const lookSize = lookLut != null ? Number(lookLut.size) || 0 : 0;
  const lookData = lookLut?.data ?? lookLut?.srgbData ?? null;
  const lut3dFormat = getProbeLut3dTexFormatLabel(device);

  let profNorm = null;
  let lookNorm = null;
  try {
    profNorm = normalizeByteLutPayload('Profile', profileLutSize, profileLutData);
  } catch {
    profNorm = null;
  }
  try {
    lookNorm = normalizeByteLutPayload('Look', lookSize, lookData);
  } catch {
    lookNorm = null;
  }

  const pS = profNorm && profNorm.size > 1 ? profNorm.size : 0;
  const lS = lookNorm && lookNorm.size > 1 ? lookNorm.size : 0;
  const max3d = Number(device.limits?.maxTextureDimension3D) || 0;
  const canFit = !wouldProxy3dLutsExceedMaxTexEdge(pS, lS, max3d);

  if (!canFit) {
    return {
      lut3d: createEmpty3dLut1x1(
        device,
        queue,
        'film-lab-main-wgpu:proxy-lut-3d-oversize',
        lut3dFormat,
        'profile',
      ),
      look3d: createEmpty3dLut1x1(
        device,
        queue,
        'film-lab-main-wgpu:look-3d-oversize',
        lut3dFormat,
        'look',
      ),
      useFullLutBinding: false,
    };
  }

  let lut3d;
  if (profNorm) {
    const { size, data } = profNorm;
    const rgba = buildRgbaCube(size, data);
    lut3d = device.createTexture({
      label:
        lut3dFormat === 'rgba16float'
          ? 'film-lab-main-wgpu:profile-lut-3d-rgba16f'
          : 'film-lab-main-wgpu:profile-lut-3d-rgba8',
      size: { width: size, height: size, depthOrArrayLayers: size },
      dimension: '3d',
      format: lut3dFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    if (lut3dFormat === 'rgba16float') {
      write3dRgba16FloatFromU8Cube(queue, lut3d, size, rgba);
    } else {
      write3dRgbaBytes(queue, lut3d, size, rgba);
    }
  } else {
    lut3d = createEmpty3dLut1x1(
      device,
      queue,
      'film-lab-main-wgpu:proxy-lut-3d-empty',
      lut3dFormat,
      'profile',
    );
  }

  let look3d;
  if (lookNorm) {
    const { size, data } = lookNorm;
    const rgba = buildRgbaCube(size, data);
    look3d = device.createTexture({
      label:
        lut3dFormat === 'rgba16float'
          ? 'film-lab-main-wgpu:look-lut-3d-rgba16f'
          : 'film-lab-main-wgpu:look-lut-3d-rgba8',
      size: { width: size, height: size, depthOrArrayLayers: size },
      dimension: '3d',
      format: lut3dFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    if (lut3dFormat === 'rgba16float') {
      write3dRgba16FloatFromU8Cube(queue, look3d, size, rgba);
    } else {
      write3dRgbaBytes(queue, look3d, size, rgba);
    }
  } else {
    look3d = createEmpty3dLut1x1(
      device,
      queue,
      'film-lab-main-wgpu:look-3d-empty',
      lut3dFormat,
      'look',
    );
  }

  return {
    lut3d,
    look3d,
    useFullLutBinding: true,
  };
}
