import proxyWgsl from './proxyWebGpuShaders.wgsl?raw';
import { buildProxyWebGpuUBlockFloat32 } from '../proxyWebGpuUniformBlock.js';
import { wouldProxy3dLutsExceedMaxTexEdge } from '../proxyGpuLut3dLimit.js';
import { doesRectExceedMaxTexture2dEdge } from '../proxyGpu2dRectLimit.js';
import {
  buildDataSignature,
  normalizeByteLutPayload,
  normalizeSourcePixelView,
  resolveLookLutPayload,
} from './proxyGpuRenderer.js';
import { tightRgba8FromPaddedReadback } from '../proxyOutputTileComposite.js';
import {
  buildRgbaCube,
  BYTES_PER_PIXEL_RGBA16F,
  getProbeLut3dTexFormatLabel,
  write3dRgba16FloatFromU8Cube,
  write3dRgbaBytes,
} from '../proxyWebGpuLut3dWrite.js';

function readWebGpuPre() {
  return globalThis.__mlWgpu ?? null;
}

/**
 * Suma 2D `writeTexture` w WebGPU: przy height > 1, `bytesPerRow` musi być 256B‑aligned.
 */
function write2dRgba8Unorm(queue, texture, w, h, sourceBytes) {
  const bpp = 4;
  const unalignedBpr = w * bpp;
  if (h <= 1) {
    queue.writeTexture(
      { texture },
      sourceBytes,
      { offset: 0, bytesPerRow: unalignedBpr, rowsPerImage: 1 },
      { width: w, height: 1, depthOrArrayLayers: 1 },
    );
    return;
  }
  const bpr = (unalignedBpr + 255) & ~255;
  if (bpr === unalignedBpr) {
    queue.writeTexture(
      { texture },
      sourceBytes,
      { offset: 0, bytesPerRow: bpr, rowsPerImage: h },
      { width: w, height: h, depthOrArrayLayers: 1 },
    );
    return;
  }
  const padded = new Uint8Array(bpr * h);
  for (let y = 0; y < h; y += 1) {
    padded.set(sourceBytes.subarray(y * unalignedBpr, (y + 1) * unalignedBpr), y * bpr);
  }
  queue.writeTexture(
    { texture },
    padded,
    { offset: 0, bytesPerRow: bpr, rowsPerImage: h },
    { width: w, height: h, depthOrArrayLayers: 1 },
  );
}

/**
 * Ubyte RGBA (jak z `getImageData`) → kanały 0..1 w `rgba16float` (half), z paddingiem
 * 256B co wiersz przy h > 1.
 */
function write2dRgba16Float(queue, texture, w, h, u8) {
  const unalignedBpr = w * BYTES_PER_PIXEL_RGBA16F;
  if (h <= 1) {
    const data = new Uint8Array(w * BYTES_PER_PIXEL_RGBA16F);
    const view = new DataView(data.buffer);
    for (let x = 0; x < w; x += 1) {
      const s = x * 4;
      const o = x * BYTES_PER_PIXEL_RGBA16F;
      view.setFloat16(o, u8[s] / 255, true);
      view.setFloat16(o + 2, u8[s + 1] / 255, true);
      view.setFloat16(o + 4, u8[s + 2] / 255, true);
      view.setFloat16(o + 6, u8[s + 3] / 255, true);
    }
    queue.writeTexture(
      { texture },
      data,
      { offset: 0, bytesPerRow: unalignedBpr, rowsPerImage: 1 },
      { width: w, height: 1, depthOrArrayLayers: 1 },
    );
    return;
  }
  const bpr = (unalignedBpr + 255) & ~255;
  if (bpr === unalignedBpr) {
    const data = new Uint8Array(bpr * h);
    const view = new DataView(data.buffer);
    for (let y = 0; y < h; y += 1) {
      const row0 = y * bpr;
      for (let x = 0; x < w; x += 1) {
        const s = (y * w + x) * 4;
        const o = row0 + x * BYTES_PER_PIXEL_RGBA16F;
        view.setFloat16(o, u8[s] / 255, true);
        view.setFloat16(o + 2, u8[s + 1] / 255, true);
        view.setFloat16(o + 4, u8[s + 2] / 255, true);
        view.setFloat16(o + 6, u8[s + 3] / 255, true);
      }
    }
    queue.writeTexture(
      { texture },
      data,
      { offset: 0, bytesPerRow: bpr, rowsPerImage: h },
      { width: w, height: h, depthOrArrayLayers: 1 },
    );
    return;
  }
  const padded = new Uint8Array(bpr * h);
  const view = new DataView(padded.buffer);
  for (let y = 0; y < h; y += 1) {
    const row0 = y * bpr;
    for (let x = 0; x < w; x += 1) {
      const s = (y * w + x) * 4;
      const o = row0 + x * BYTES_PER_PIXEL_RGBA16F;
      view.setFloat16(o, u8[s] / 255, true);
      view.setFloat16(o + 2, u8[s + 1] / 255, true);
      view.setFloat16(o + 4, u8[s + 2] / 255, true);
      view.setFloat16(o + 6, u8[s + 3] / 255, true);
    }
  }
  queue.writeTexture(
    { texture },
    padded,
    { offset: 0, bytesPerRow: bpr, rowsPerImage: h },
    { width: w, height: h, depthOrArrayLayers: 1 },
  );
}

function probeRgba16FloatSourceTextureUsable(device) {
  if (typeof DataView === 'undefined' || typeof DataView.prototype.setFloat16 !== 'function') {
    return false;
  }
  try {
    const t = device.createTexture({
      label: 'proxyWebGpu:probe-rgba16f',
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
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
 * WebGPU odpowiednik `createProxyGpuRenderer` (WebGL2). Wymaga wcześniejszego
 * `globalThis.__mlWgpu` z `proxyRenderWorker` (getOrCreatePersistentWebGpuDevice).
 */
export function createProxyWebGpuRenderer() {
  const pre = readWebGpuPre();
  if (!pre?.device) {
    throw new Error('WebGPU: brak preinit (__mlWgpu.device).');
  }
  const { device, format } = pre;
  const maxTex2d = Number(device.limits?.maxTextureDimension2D) || 0;
  const maxTex3d = Number(device.limits?.maxTextureDimension3D) || 0;
  const sourceTexFormat = probeRgba16FloatSourceTextureUsable(device) ? 'rgba16float' : 'rgba8unorm';
  const lut3dFormat = getProbeLut3dTexFormatLabel(device);
  const canvas = new OffscreenCanvas(1, 1);
  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('WebGPU: OffscreenCanvas bez kontekstu.');
  }
  context.configure({
    device,
    format,
    alphaMode: 'opaque',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const module = device.createShaderModule({ label: 'proxyWebGpu', code: proxyWgsl });
  if (import.meta.env.DEV) {
    void (async () => {
      if (typeof module.getCompilationInfo !== 'function') {
        return;
      }
      try {
        const info = await module.getCompilationInfo();
        for (const m of info?.messages ?? []) {
          if (m.type === 'error' || m.type === 'warning') {
            const where =
              m.linePos != null && m.lineNum != null
                ? `(${m.lineNum}:${m.linePos})`
                : m.lineNum != null
                  ? `(${m.lineNum})`
                  : '';
            console.warn(
              '[FilmLab][proxyWebGpu] WGSL',
              m.type,
              where,
              m.message
            );
          }
        }
      } catch {
        // noop
      }
    })();
  }
  const pipeline = device.createRenderPipeline({
    label: 'proxyWebGpu:pipeline',
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vmain',
      buffers: [
        {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: 'fmain',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-strip', cullMode: 'none' },
  });

  const samp = device.createSampler({
    label: 'proxyWebGpu:sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });

  const vbuf = device.createBuffer({
    label: 'proxyWebGpu:quad-vertices',
    size: 8 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(vbuf.getMappedRange()).set(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  vbuf.unmap();

  const uniformBuffer = device.createBuffer({
    label: 'proxyWebGpu:uniforms',
    size: 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const queue = device.queue;
  let srcTex = null;
  let srcW = 0;
  let srcH = 0;
  let lutTex = null;
  let lookTex = null;
  let lutCacheKey = '';
  let lookLutCacheKey = '';
  /** @type {GPUBindGroup | null} */
  let cachedBindGroup = null;
  let bindGroupSrc = null;
  let bindGroupLut = null;
  let bindGroupLook = null;

  function assertProxyFrameFitsDeviceLimits(sw, sh, tw, th, effectiveProfileLutS, effectiveLookLutS) {
    if (doesRectExceedMaxTexture2dEdge(sw, sh, maxTex2d)) {
      throw new Error(
        `WebGPU: źródło przekracza maxTextureDimension2D=${maxTex2d} (${sw}×${sh}).`,
      );
    }
    if (doesRectExceedMaxTexture2dEdge(tw, th, maxTex2d)) {
      throw new Error(
        `WebGPU: cel przekracza maxTextureDimension2D=${maxTex2d} (${tw}×${th}).`,
      );
    }
    if (maxTex3d > 0) {
      const pS = Math.floor(Number(effectiveProfileLutS) || 0);
      const lS = Math.floor(Number(effectiveLookLutS) || 0);
      if (wouldProxy3dLutsExceedMaxTexEdge(pS, lS, maxTex3d)) {
        if (pS > 1 && pS > maxTex3d) {
          throw new Error(
            `WebGPU: LUT profilu (rozmiar ${pS}) przekracza maxTextureDimension3D=${maxTex3d}.`,
          );
        }
        if (lS > 1 && lS > maxTex3d) {
          throw new Error(
            `WebGPU: LUT look (rozmiar ${lS}) przekracza maxTextureDimension3D=${maxTex3d}.`,
          );
        }
      }
    }
  }

  function getOrCreateBindGroup() {
    if (
      cachedBindGroup &&
      bindGroupSrc === srcTex &&
      bindGroupLut === lutTex &&
      bindGroupLook === lookTex
    ) {
      return cachedBindGroup;
    }
    bindGroupSrc = srcTex;
    bindGroupLut = lutTex;
    bindGroupLook = lookTex;
    cachedBindGroup = device.createBindGroup({
      label: 'proxyWebGpu:bindGroup-0',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: srcTex.createView() },
        { binding: 1, resource: samp },
        { binding: 2, resource: lutTex.createView() },
        { binding: 3, resource: samp },
        { binding: 4, resource: lookTex.createView() },
        { binding: 5, resource: samp },
        { binding: 6, resource: { buffer: uniformBuffer } },
      ],
    });
    return cachedBindGroup;
  }

  function ensureSrcTexture(w, h) {
    if (srcTex && srcW === w && srcH === h) {
      return;
    }
    if (srcTex) {
      srcTex.destroy();
    }
    srcTex = device.createTexture({
      label: sourceTexFormat === 'rgba16float' ? 'proxyWebGpu:source-rgba16f' : 'proxyWebGpu:source-rgba8',
      size: { width: w, height: h },
      format: sourceTexFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    srcW = w;
    srcH = h;
  }

  function updateLutTexture(lutSize, lutData) {
    const normalized = normalizeByteLutPayload('Profile', lutSize, lutData);
    const key = normalized ? buildDataSignature(normalized.size, normalized.data) : 'none';
    if (lutCacheKey === key) {
      return;
    }
    lutCacheKey = key;
    if (lutTex) {
      lutTex.destroy();
    }
    if (!normalized) {
      lutTex = device.createTexture({
        label: 'proxyWebGpu:profile-lut-empty',
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        dimension: '3d',
        format: lut3dFormat,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      if (lut3dFormat === 'rgba16float') {
        const z = new Uint8Array(8);
        const v = new DataView(z.buffer);
        v.setFloat16(0, 0, true);
        v.setFloat16(2, 0, true);
        v.setFloat16(4, 0, true);
        v.setFloat16(6, 1, true);
        queue.writeTexture({ texture: lutTex }, z, {}, { width: 1, height: 1, depthOrArrayLayers: 1 });
      } else {
        queue.writeTexture(
          { texture: lutTex },
          new Uint8Array([0, 0, 0, 255]),
          {},
          { width: 1, height: 1, depthOrArrayLayers: 1 },
        );
      }
      return;
    }
    const { size, data } = normalized;
    const rgba = buildRgbaCube(size, data);
    lutTex = device.createTexture({
      label: lut3dFormat === 'rgba16float' ? 'proxyWebGpu:profile-lut-3d-rgba16f' : 'proxyWebGpu:profile-lut-3d',
      size: { width: size, height: size, depthOrArrayLayers: size },
      dimension: '3d',
      format: lut3dFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    if (lut3dFormat === 'rgba16float') {
      write3dRgba16FloatFromU8Cube(queue, lutTex, size, rgba);
    } else {
      write3dRgbaBytes(queue, lutTex, size, rgba);
    }
  }

  function updateLookLutTexture(lookLutSize, lookLutData, extraKey) {
    const normalized = normalizeByteLutPayload('Look', lookLutSize, lookLutData);
    const key = normalized
      ? buildDataSignature(normalized.size, normalized.data, extraKey || '')
      : `none:${extraKey || ''}`;
    if (lookLutCacheKey === key) {
      return;
    }
    lookLutCacheKey = key;
    if (lookTex) {
      lookTex.destroy();
    }
    if (!normalized) {
      lookTex = device.createTexture({
        label: 'proxyWebGpu:look-lut-empty',
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        dimension: '3d',
        format: lut3dFormat,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      if (lut3dFormat === 'rgba16float') {
        const z = new Uint8Array(8);
        const v = new DataView(z.buffer);
        v.setFloat16(0, 0, true);
        v.setFloat16(2, 0, true);
        v.setFloat16(4, 0, true);
        v.setFloat16(6, 0, true);
        queue.writeTexture({ texture: lookTex }, z, {}, { width: 1, height: 1, depthOrArrayLayers: 1 });
      } else {
        queue.writeTexture(
          { texture: lookTex },
          new Uint8Array([0, 0, 0, 0]),
          {},
          { width: 1, height: 1, depthOrArrayLayers: 1 },
        );
      }
      return;
    }
    const { size, data } = normalized;
    const rgba = buildRgbaCube(size, data);
    lookTex = device.createTexture({
      label: lut3dFormat === 'rgba16float' ? 'proxyWebGpu:look-lut-3d-rgba16f' : 'proxyWebGpu:look-lut-3d',
      size: { width: size, height: size, depthOrArrayLayers: size },
      dimension: '3d',
      format: lut3dFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    if (lut3dFormat === 'rgba16float') {
      write3dRgba16FloatFromU8Cube(queue, lookTex, size, rgba);
    } else {
      write3dRgbaBytes(queue, lookTex, size, rgba);
    }
  }

  let currentW = 1;
  let currentH = 1;

  function ensureCanvasSize(w, h) {
    if (currentW === w && currentH === h) {
      return;
    }
    currentW = w;
    currentH = h;
    canvas.width = w;
    canvas.height = h;
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
  }

  function prepareAndEncodeUniforms(params) {
    const {
      sourcePixels,
      sourceWidth,
      sourceHeight,
      targetWidth,
      targetHeight,
      film = {},
      adjustments = {},
      profileLutSize = 0,
      profileLutData = null,
      lookLut = null,
      outputTile = null,
    } = params;
    const lookLutPayload = resolveLookLutPayload(lookLut);
    const hasProfileLut = Number(profileLutSize) > 1 && Boolean(profileLutData);
    const hasLookLut = Number(lookLutPayload.size) > 1 && Boolean(lookLutPayload.data);

    assertProxyFrameFitsDeviceLimits(
      sourceWidth,
      sourceHeight,
      targetWidth,
      targetHeight,
      hasProfileLut ? profileLutSize : 0,
      hasLookLut ? lookLutPayload.size : 0,
    );

    updateLutTexture(profileLutSize, profileLutData);
    updateLookLutTexture(lookLutPayload.size, lookLutPayload.data, lookLutPayload.key);

    if (!lutTex || !lookTex) {
      throw new Error('WebGPU: brak tekstur LUT (wewnętrzny błąd inicjacji).');
    }

    ensureSrcTexture(sourceWidth, sourceHeight);
    const safe = normalizeSourcePixelView(sourcePixels, sourceWidth, sourceHeight);
    const up = safe ?? sourcePixels;
    if (sourceTexFormat === 'rgba16float') {
      write2dRgba16Float(queue, srcTex, sourceWidth, sourceHeight, up);
    } else {
      write2dRgba8Unorm(queue, srcTex, sourceWidth, sourceHeight, up);
    }

    const u = buildProxyWebGpuUBlockFloat32({
      film,
      adjustments,
      profileLutSize,
      profileLutData,
      lookLut,
      targetWidth,
      targetHeight,
      outputTile,
    });
    queue.writeBuffer(uniformBuffer, 0, u);

    return { targetWidth, targetHeight };
  }

  async function render(params) {
    const { targetWidth, targetHeight } = prepareAndEncodeUniforms(params);
    ensureCanvasSize(targetWidth, targetHeight);
    const bindGroup = getOrCreateBindGroup();
    const swapTex = context.getCurrentTexture();
    const encoder = device.createCommandEncoder({ label: 'proxyWebGpu:encode-frame' });
    const pass = encoder.beginRenderPass({
      label: 'proxyWebGpu:pass-mains',
      colorAttachments: [
        {
          view: swapTex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vbuf, 0, 8 * 4);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4, 1, 0, 0);
    pass.end();
    const readbackChroma = String(format);
    const readbackBuf = device.createBuffer({
      label: 'proxyWebGpu:swap-readback-1x1',
      size: 256,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    let readbackRgba8 = null;
    try {
      encoder.copyTextureToBuffer(
        { texture: swapTex, origin: { x: 0, y: 0, z: 0 } },
        { buffer: readbackBuf, offset: 0, bytesPerRow: 256, rowsPerImage: 1 },
        { width: 1, height: 1, depthOrArrayLayers: 1 },
      );
    } catch {
      readbackBuf.destroy();
      queue.submit([encoder.finish()]);
      if (typeof queue.onSubmittedWorkDone === 'function') {
        await queue.onSubmittedWorkDone();
      }
      return {
        width: targetWidth,
        height: targetHeight,
        bitmap: canvas.transferToImageBitmap(),
        readbackRgba8,
        readbackChroma,
      };
    }
    queue.submit([encoder.finish()]);
    if (typeof queue.onSubmittedWorkDone === 'function') {
      await queue.onSubmittedWorkDone();
    }
    try {
      const mapMode = typeof GPUMapMode !== 'undefined' ? GPUMapMode.READ : 1;
      await readbackBuf.mapAsync(mapMode, 0, 4);
      const range = readbackBuf.getMappedRange(0, 4);
      const tmp = new Uint8Array(new Uint8Array(range));
      readbackBuf.unmap();
      if (readbackChroma === 'bgra8unorm') {
        readbackRgba8 = new Uint8Array([tmp[2], tmp[1], tmp[0], tmp[3]]);
      } else {
        readbackRgba8 = tmp;
      }
    } catch {
      readbackRgba8 = null;
    }
    readbackBuf.destroy();
    return {
      width: targetWidth,
      height: targetHeight,
      bitmap: canvas.transferToImageBitmap(),
      readbackRgba8,
      readbackChroma,
    };
  }

  /**
   * Render do tekstury 2D + `copyTextureToBuffer` (bez `getImageData` / 2D canvas).
   * Oczekuj `await` (mapAsync). Wynik: RGBA8 jak w WebGL2 `readPixels` po flip Y (wiersz 0 = góra obrazu).
   */
  async function renderToRgba8Pixels(params) {
    const { targetWidth, targetHeight } = prepareAndEncodeUniforms(params);
    const bindGroup = getOrCreateBindGroup();
    const outTex = device.createTexture({
      label: 'proxyWebGpu:readback-rt',
      size: { width: targetWidth, height: targetHeight, depthOrArrayLayers: 1 },
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const unpaddedBpr = targetWidth * 4;
    const bytesPerRow = (unpaddedBpr + 255) & ~255;
    const readBuf = device.createBuffer({
      label: 'proxyWebGpu:readback-cpu',
      size: bytesPerRow * targetHeight,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = device.createCommandEncoder({ label: 'proxyWebGpu:encode-readback' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: outTex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vbuf, 0, 8 * 4);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4, 1, 0, 0);
    pass.end();
    encoder.copyTextureToBuffer(
      { texture: outTex, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
      { buffer: readBuf, bytesPerRow, offset: 0 },
      { width: targetWidth, height: targetHeight, depthOrArrayLayers: 1 },
    );
    queue.submit([encoder.finish()]);
    outTex.destroy();
    const mapMode = typeof GPUMapMode !== 'undefined' ? GPUMapMode.READ : 1;
    await readBuf.mapAsync(mapMode);
    const raw = readBuf.getMappedRange();
    const isBgra = format === 'bgra8unorm';
    const pixels = tightRgba8FromPaddedReadback(
      raw,
      0,
      targetWidth,
      targetHeight,
      bytesPerRow,
      isBgra,
    );
    readBuf.unmap();
    readBuf.destroy();
    return { width: targetWidth, height: targetHeight, pixels, bitmap: null };
  }

  function destroy() {
    cachedBindGroup = null;
    bindGroupSrc = null;
    bindGroupLut = null;
    bindGroupLook = null;
    try {
      context.unconfigure();
    } catch {
      // noop
    }
    try {
      pipeline.destroy();
    } catch {
      // noop
    }
    try {
      vbuf.destroy();
    } catch {
      // noop
    }
    try {
      uniformBuffer.destroy();
    } catch {
      // noop
    }
    if (srcTex) {
      srcTex.destroy();
    }
    if (lutTex) {
      lutTex.destroy();
    }
    if (lookTex) {
      lookTex.destroy();
    }
  }

  return {
    render,
    renderToRgba8Pixels,
    destroy,
    __gpuBackend: 'webgpu',
    __maxTexture2d: maxTex2d,
    __maxTexture3d: maxTex3d,
    __proxySourceTexFormat: sourceTexFormat,
    __proxyLut3dTexFormat: lut3dFormat,
  };
}
