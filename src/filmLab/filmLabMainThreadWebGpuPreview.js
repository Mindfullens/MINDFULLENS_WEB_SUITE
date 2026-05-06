import {
  createMainThreadProbe3dLutTextures,
  getProbeLut3dTexFormatLabel,
} from '../engine/proxyWebGpuLut3dWrite.js';
import { stripProxyWebGpuUBlockLutTextureBindings } from '../engine/proxyWebGpuUniformBlock.js';
import { u8RgbaToHalfFloatRgbaForTexImage } from '../engine/webglU8RgbaToHalfFloat.js';
import {
  getOrCreatePersistentWebGpuDevice,
  getOrProbeWebGpuAdapter,
  getWebGpuApiExposure,
} from '../engine/webGpuEnvironment.js';

/**
 * Początkowa wartość w `renderDebugInfo` do czasu `probeMainThreadWebGpuPreviewStatus()` w silniku.
 * Po sondzie: etykieta wyniku (m.in. `ok_minimal_queue_submit`, `unavailable_no_api`, `error_…`) + opcj. `maxTextureDimension2d` / `maxTextureDimension3d`, `mainThreadWebGpuLut3dTexFormat` (jak worker 3D LUT) oraz flagi canvas / rys / tex / proxy z `probeMainThreadWebGpuPreview()`; wejście workbencha: `mainThreadWebGpuHostSourceProxyPass` w silniku.
 */
export const FILM_LAB_MAIN_THREAD_WEBGPU_PREVIEW_STATUS = 'pending';

const MAIN_THREAD_DEVICE_LABEL = 'ml-film-lab-main-preview';

/** Pełnoekranowy trójkąt (bez VBO) + kolor — minimalny rysunek, §5.1.1.3. */
const MAIN_THREAD_TRIANGLE_WGSL = `
@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  return vec4f(p[vi], 0.0, 1.0);
}

@fragment
fn fmain() -> @location(0) vec4f {
  return vec4f(0.12, 0.24, 0.55, 1.0);
}
`;

/** Pełnoekranowy trójkąt + `textureSample` 2D (parity z `proxyWebGpu` źródłem 2D), §5.1.1.3. */
const MAIN_THREAD_TEX_SAMPLE_WGSL = `
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var u = array<vec2f, 3>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0));
  var o: VOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = u[vi];
  return o;
}

@group(0) @binding(0) var tSrc: texture_2d<f32>;
@group(0) @binding(1) var sSrc: sampler;

@fragment
fn fmain(i: VOut) -> @location(0) vec4f {
  return textureSample(tSrc, sSrc, i.uv);
}
`;

/**
 * Minimalne `queue.submit` (copyBufferToBuffer) — dowód, że wątek główny może wykonać pracę na GPU.
 * Nie zastępuje pełnego `createFastPreviewRenderer`; Etap 1 / plan §5.1.1.3.
 */
async function runMinimalMainThreadWebGpuQueueSmoke(device) {
  const a = device.createBuffer({
    label: 'film-lab-main-wgpu:smoke-a',
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const b = device.createBuffer({
    label: 'film-lab-main-wgpu:smoke-b',
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const enc = device.createCommandEncoder({ label: 'film-lab-main-wgpu:smoke' });
  enc.copyBufferToBuffer(a, 0, b, 0, 16);
  device.queue.submit([enc.finish()]);
  if (typeof device.queue.onSubmittedWorkDone === 'function') {
    await device.queue.onSubmittedWorkDone();
  }
}

/**
 * Osobna od workera: `HTMLCanvasElement` + `getContext('webgpu')` + `configure` + clear pass
 * (kolejny krok przed pełnym pipeline; §5.1.1.3).
 * @param {GPUDevice} device
 * @returns {Promise<boolean | null>} `null` = brak `document` (pomijamy); `true` / `false` = wynik próby
 */
async function runMainThreadCanvasWebGpuClearPass(device) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  if (typeof navigator === 'undefined' || navigator.gpu == null) {
    return false;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('webgpu');
  if (!ctx) {
    return false;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({
    device,
    format,
    alphaMode: 'opaque',
  });
  const encoder = device.createCommandEncoder({ label: 'film-lab-main-wgpu:canvas-clear' });
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  pass.end();
  device.queue.submit([encoder.finish()]);
  if (typeof device.queue.onSubmittedWorkDone === 'function') {
    await device.queue.onSubmittedWorkDone();
  }
  return true;
}

/**
 * Kompilacja WGSL + `createRenderPipeline` + `draw(3)` na canvas (swapchain) — krok w stronę `proxyWebGpuShaders.wgsl` w main.
 * @param {GPUDevice} device
 * @returns {Promise<boolean | null>}
 */
async function runMainThreadCanvasWebGpuSolidDrawPass(device) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  if (typeof navigator === 'undefined' || navigator.gpu == null) {
    return false;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('webgpu');
  if (!ctx) {
    return false;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({
    device,
    format,
    alphaMode: 'opaque',
  });
  const shader = device.createShaderModule({
    label: 'film-lab-main-wgpu:solid-tri',
    code: MAIN_THREAD_TRIANGLE_WGSL,
  });
  const pipeline = device.createRenderPipeline({
    label: 'film-lab-main-wgpu:solid-tri-pl',
    layout: 'auto',
    vertex: {
      module: shader,
      entryPoint: 'vmain',
    },
    fragment: {
      module: shader,
      entryPoint: 'fmain',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });
  const encoder = device.createCommandEncoder({ label: 'film-lab-main-wgpu:solid-draw' });
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.draw(3, 1, 0, 0);
  pass.end();
  device.queue.submit([encoder.finish()]);
  if (typeof device.queue.onSubmittedWorkDone === 'function') {
    await device.queue.onSubmittedWorkDone();
  }
  return true;
}

/**
 * `createTexture` 1×1 + `writeTexture` + `textureSample` na canvas (jak źródło 2D w workerze, bez koloru Film Lab).
 * @param {GPUDevice} device
 * @returns {Promise<boolean | null>}
 */
async function runMainThreadCanvasWebGpuTextureDrawPass(device) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  if (typeof navigator === 'undefined' || navigator.gpu == null) {
    return false;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('webgpu');
  if (!ctx) {
    return false;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({
    device,
    format,
    alphaMode: 'opaque',
  });

  const tex = device.createTexture({
    label: 'film-lab-main-wgpu:smoke-tex-1x1',
    size: { width: 1, height: 1, depthOrArrayLayers: 1 },
    dimension: '2d',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const row = new Uint8Array(256);
  row[0] = 220;
  row[1] = 80;
  row[2] = 32;
  row[3] = 255;
  device.queue.writeTexture(
    { texture: tex },
    row,
    { offset: 0, bytesPerRow: 256 },
    { width: 1, height: 1, depthOrArrayLayers: 1 },
  );

  const sampler = device.createSampler({
    label: 'film-lab-main-wgpu:smoke-sampler',
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  const shader = device.createShaderModule({
    label: 'film-lab-main-wgpu:tex-sample',
    code: MAIN_THREAD_TEX_SAMPLE_WGSL,
  });
  const pipeline = device.createRenderPipeline({
    label: 'film-lab-main-wgpu:tex-pl',
    layout: 'auto',
    vertex: { module: shader, entryPoint: 'vmain' },
    fragment: { module: shader, entryPoint: 'fmain', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const bindGroup = device.createBindGroup({
    label: 'film-lab-main-wgpu:tex-bg',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: tex.createView() },
      { binding: 1, resource: sampler },
    ],
  });

  const encoder = device.createCommandEncoder({ label: 'film-lab-main-wgpu:tex-draw' });
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.02, g: 0.02, b: 0.02, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3, 1, 0, 0);
  pass.end();
  device.queue.submit([encoder.finish()]);
  if (typeof device.queue.onSubmittedWorkDone === 'function') {
    await device.queue.onSubmittedWorkDone();
  }
  return true;
}

/** Obciążany 1× (Vite `?raw`); brak top-level `import` — `useFilmLabEngine` jest importowany w Node (regresja). */
let _cachedProxyWebGpuWgsl = /** @type {string | null} */ (null);
async function getProxyWebGpuWgslString() {
  if (_cachedProxyWebGpuWgsl != null) {
    return _cachedProxyWebGpuWgsl;
  }
  const mod = await import('../engine/workers/proxyWebGpuShaders.wgsl?raw');
  _cachedProxyWebGpuWgsl = String(mod.default);
  return _cachedProxyWebGpuWgsl;
}

/**
 * Jak `write2dRgba8Unorm` w `proxyWebGpuRenderer` — 256 B align przy h>1.
 * @param {GPUQueue} queue
 * @param {GPUTexture} texture
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array|Uint8ClampedArray} sourceBytes
 */
function writeRgba8UnormTight2d(queue, texture, w, h, sourceBytes) {
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
    padded.set(
      sourceBytes.subarray(y * unalignedBpr, (y + 1) * unalignedBpr),
      y * bpr,
    );
  }
  queue.writeTexture(
    { texture },
    padded,
    { offset: 0, bytesPerRow: bpr, rowsPerImage: h },
    { width: w, height: h, depthOrArrayLayers: 1 },
  );
}

/**
 * Jak `writeRgba8UnormTight2d`, ale dla `rgba16float` (`Uint16Array`, half-float LE).
 * @param {GPUQueue} queue
 * @param {GPUTexture} texture
 * @param {number} w
 * @param {number} h
 * @param {Uint16Array} sourceHalf
 */
function writeRgba16FloatTight2d(queue, texture, w, h, sourceHalf) {
  const bytes = new Uint8Array(sourceHalf.buffer, sourceHalf.byteOffset, sourceHalf.byteLength);
  const bpp = 8;
  const unalignedBpr = w * bpp;
  if (h <= 1) {
    queue.writeTexture(
      { texture },
      bytes,
      { offset: 0, bytesPerRow: unalignedBpr, rowsPerImage: 1 },
      { width: w, height: 1, depthOrArrayLayers: 1 },
    );
    return;
  }
  const bpr = (unalignedBpr + 255) & ~255;
  if (bpr === unalignedBpr) {
    queue.writeTexture(
      { texture },
      bytes,
      { offset: 0, bytesPerRow: bpr, rowsPerImage: h },
      { width: w, height: h, depthOrArrayLayers: 1 },
    );
    return;
  }
  const padded = new Uint8Array(bpr * h);
  for (let y = 0; y < h; y += 1) {
    const rowStart = y * unalignedBpr;
    padded.set(bytes.subarray(rowStart, rowStart + unalignedBpr), y * bpr);
  }
  queue.writeTexture(
    { texture },
    padded,
    { offset: 0, bytesPerRow: bpr, rowsPerImage: h },
    { width: w, height: h, depthOrArrayLayers: 1 },
  );
}

/** Maks. dłuższa krawędź (px) sondy host→WebGPU; pełen `getImageData` tylko na płótnie tymczasowym. */
export const MAIN_THREAD_HOST_WGPU_SOURCE_MAX_EDGE = 64;

/**
 * Z `HTMLCanvasElement` podglądu (źródło szybkiego WebGL) — `drawImage` + `getImageData` po skali w dół.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} maxEdge
 * @returns {{ width: number, height: number, data: Uint8ClampedArray } | null}
 */
export function downscaleSourceCanvasRgba8ForWebGpuHostProbe(sourceCanvas, maxEdge) {
  if (typeof document === 'undefined' || !sourceCanvas?.getContext) {
    return null;
  }
  const w0 = sourceCanvas.width;
  const h0 = sourceCanvas.height;
  if (!w0 || !h0) {
    return null;
  }
  const edge = maxEdge == null || !Number.isFinite(Number(maxEdge)) || Number(maxEdge) <= 0
    ? MAIN_THREAD_HOST_WGPU_SOURCE_MAX_EDGE
    : Number(maxEdge);
  const me = Math.max(8, Math.min(256, edge));
  const scale = Math.min(1, me / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const c2d = c.getContext('2d', { willReadFrequently: true, alpha: true });
  if (!c2d) {
    return null;
  }
  c2d.drawImage(sourceCanvas, 0, 0, w0, h0, 0, 0, w, h);
  const id = c2d.getImageData(0, 0, w, h);
  return { width: w, height: h, data: id.data };
}

/**
 * @param {GPUDevice} device
 * @param {number} srcW
 * @param {number} srcH
 * @param {Uint8Array|Uint8ClampedArray} rgba8 wierszami; dł. = 4·W·H
 * @param {Float32Array|undefined} uBlock opcj. `UBlock` (64) — `buildProxyWebGpuUBlockFloat32`
 * @param {{ profileLutSize?: number, profileLutData?: unknown, lookLut?: unknown }|undefined} hostLutCtx — 3D LUT jak w workerze; brak = 1×1 placeholdery
 * @returns {Promise<null | false | { pass: true, readbackRgba8: Uint8Array | null, readbackChroma: string, sourceTexFormat: string, canvas: HTMLCanvasElement }>}
 */
async function runMainThreadProxyWgslWithRgba8Source(device, srcW, srcH, rgba8, uBlock, hostLutCtx) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  if (typeof navigator === 'undefined' || navigator.gpu == null) {
    return false;
  }
  const n = srcW * srcH * 4;
  if (rgba8 == null || rgba8.length < n) {
    return false;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(Number(srcW) || 1));
  canvas.height = Math.max(1, Math.floor(Number(srcH) || 1));
  const ctx = canvas.getContext('webgpu');
  if (!ctx) {
    return false;
  }
  const wgsl = await getProxyWebGpuWgslString();
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({
    device,
    format,
    alphaMode: 'opaque',
    /** `copyTextureToBuffer` ze swapchain — wymaga COPY_SRC (Walidacja Dawn). */
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const sourceRgba8 = rgba8.subarray(0, n);
  const rgba16Candidate =
    getProbeLut3dTexFormatLabel(device) === 'rgba16float'
      ? u8RgbaToHalfFloatRgbaForTexImage(sourceRgba8)
      : null;
  const sourceTexFormat = rgba16Candidate ? 'rgba16float' : 'rgba8unorm';
  const srcTex = device.createTexture({
    label: 'film-lab-main-wgpu:proxy-wgsl-src',
    size: { width: srcW, height: srcH, depthOrArrayLayers: 1 },
    dimension: '2d',
    format: sourceTexFormat,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  if (sourceTexFormat === 'rgba16float' && rgba16Candidate) {
    writeRgba16FloatTight2d(device.queue, srcTex, srcW, srcH, rgba16Candidate);
  } else {
    writeRgba8UnormTight2d(device.queue, srcTex, srcW, srcH, sourceRgba8);
  }

  const {
    lut3d,
    look3d,
    useFullLutBinding,
  } = createMainThreadProbe3dLutTextures(device, device.queue, hostLutCtx ?? {});

  const module = device.createShaderModule({
    label: 'film-lab-main-wgpu:proxy-wgsl',
    code: wgsl,
  });
  const pipeline = device.createRenderPipeline({
    label: 'film-lab-main-wgpu:proxy-wgsl-pl',
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
    fragment: { module, entryPoint: 'fmain', targets: [{ format }] },
    primitive: { topology: 'triangle-strip', cullMode: 'none' },
  });
  const samp = device.createSampler({
    label: 'film-lab-main-wgpu:proxy-wgsl-samp',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });
  const vbuf = device.createBuffer({
    label: 'film-lab-main-wgpu:proxy-wgpu-quad',
    size: 8 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(vbuf.getMappedRange()).set(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  vbuf.unmap();
  const uniformBuffer = device.createBuffer({
    label: 'film-lab-main-wgpu:proxy-wgsl-u',
    size: 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const u = new Float32Array(64);
  if (uBlock != null && uBlock.length >= 64) {
    u.set(uBlock.subarray(0, 64));
  } else {
    u[0] = 1.0;
    u[1] = 1.0;
    u[2] = 0.18;
    u[3] = 1.0;
    u[4] = 1.0;
    u[5] = 0.0;
    u[6] = 1.0;
    u[7] = 1.0;
    u[8] = 1.0;
    u[9] = 0.0;
    u[10] = 0.0;
    u[11] = 0.0;
    u[12] = 0.0;
    u[13] = 0.0;
    u[14] = 1.0;
    u[15] = 1.0;
    u[16] = 1.0;
    u[20] = 0.0;
    u[21] = 0.0;
    u[22] = 0.0;
    u[23] = 0.0;
    u[24] = 0.0;
    u[25] = 0.0;
    u[26] = 1.0;
    u[27] = 1.0;
  }
  const uFinal = !useFullLutBinding ? stripProxyWebGpuUBlockLutTextureBindings(u) : u;
  device.queue.writeBuffer(uniformBuffer, 0, uFinal);

  const canvasOut = ctx.getCurrentTexture();
  const bindGroup = device.createBindGroup({
    label: 'film-lab-main-wgpu:proxy-wgsl-bg',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: srcTex.createView() },
      { binding: 1, resource: samp },
      { binding: 2, resource: lut3d.createView() },
      { binding: 3, resource: samp },
      { binding: 4, resource: look3d.createView() },
      { binding: 5, resource: samp },
      { binding: 6, resource: { buffer: uniformBuffer } },
    ],
  });

  const encoder = device.createCommandEncoder({ label: 'film-lab-main-wgpu:proxy-wgsl-enc' });
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: canvasOut.createView(),
        clearValue: { r: 0.01, g: 0.01, b: 0.01, a: 1 },
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

  /** 1×1 piksel (0,0) do porównań; swapchain BGRA → RGBA. */
  let readbackRgba8 = null;
  const readbackChroma = String(format);
  const readbackBuf = device.createBuffer({
    label: 'film-lab-main-wgpu:proxy-wgsl-readback',
    size: 256,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    encoder.copyTextureToBuffer(
      { texture: canvasOut, origin: { x: 0, y: 0, z: 0 } },
      { buffer: readbackBuf, offset: 0, bytesPerRow: 256, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );
  } catch {
    readbackBuf.destroy();
    device.queue.submit([encoder.finish()]);
    if (typeof device.queue.onSubmittedWorkDone === 'function') {
      await device.queue.onSubmittedWorkDone();
    }
    srcTex.destroy();
    lut3d.destroy();
    look3d.destroy();
    vbuf.destroy();
    uniformBuffer.destroy();
    return { pass: true, readbackRgba8, readbackChroma, sourceTexFormat, canvas };
  }
  device.queue.submit([encoder.finish()]);
  if (typeof device.queue.onSubmittedWorkDone === 'function') {
    await device.queue.onSubmittedWorkDone();
  }
  try {
    await readbackBuf.mapAsync(GPUMapMode.READ, 0, 4);
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

  srcTex.destroy();
  lut3d.destroy();
  look3d.destroy();
  vbuf.destroy();
  uniformBuffer.destroy();
  return { pass: true, readbackRgba8, readbackChroma, sourceTexFormat, canvas };
}

/**
 * Ten sam plik co `createProxyWebGpuRenderer` — 1×1 syntetyk (bootstrap).
 * @param {GPUDevice} device
 * @returns {Promise<null | false | { pass: true, readbackRgba8: Uint8Array | null, readbackChroma: string }>}
 */
async function runMainThreadCanvasWebGpuProxyShaderDrawPass(device) {
  return runMainThreadProxyWgslWithRgba8Source(
    device,
    1,
    1,
    new Uint8Array([120, 70, 40, 255]),
  );
}

/**
 * Sonda z pikselami wejścia (np. `downscaleSourceCanvasRgba8ForWebGpuHostProbe`); §5.1.1.3.
 * @param {GPUDevice} device
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array|Uint8ClampedArray} rgba8
 * @param {{ uBlock?: Float32Array, profileLutSize?: number, profileLutData?: unknown, lookLut?: unknown } | undefined} [options] — U + 3D LUT (parity worker, `proxyWebGpuLut3dWrite`)
 * @returns {Promise<null | false | { pass: true, readbackRgba8: Uint8Array | null, readbackChroma: string }>}
 */
export async function probeMainThreadWebGpuHostSourceRgba8ProxyPass(device, w, h, rgba8, options) {
  return runMainThreadProxyWgslWithRgba8Source(
    device,
    w,
    h,
    rgba8,
    options?.uBlock,
    {
      profileLutSize: options?.profileLutSize,
      profileLutData: options?.profileLutData,
      lookLut: options?.lookLut,
    },
  );
}

/**
 * Render właściwy (A/B) do canvasa przez ten sam `fmain` co worker proxy.
 * Zwraca canvas z wyrenderowaną klatką oraz readback 1×1 do diagnostyki.
 * @returns {Promise<null | false | { pass: true, canvas: HTMLCanvasElement, readbackRgba8: Uint8Array | null, readbackChroma: string, sourceTexFormat: string }>}
 */
export async function renderMainThreadWebGpuHostSourceRgba8ToCanvas(device, w, h, rgba8, options) {
  return runMainThreadProxyWgslWithRgba8Source(
    device,
    w,
    h,
    rgba8,
    options?.uBlock,
    {
      profileLutSize: options?.profileLutSize,
      profileLutData: options?.profileLutData,
      lookLut: options?.lookLut,
    },
  );
}

/**
 * Sonda WebGPU w wątku głównym: wspólne `getOrCreatePersistentWebGpuDevice` (inny cache niż worker)
 * + `runMinimalMainThreadWebGpuQueueSmoke` + odczyt `device.limits.maxTextureDimension2D` / `maxTextureDimension3D` (§5.1.1.3, por. worker `proxyWebGpuRenderer`).
 * @returns {Promise<{ status: string, maxTextureDimension2d: number | null, maxTextureDimension3d: number | null, mainThreadWebGpuLut3dTexFormat: string | null, mainThreadWebGpuCanvasClearPass: boolean | null, mainThreadWebGpuSolidDrawPass: boolean | null, mainThreadWebGpuTextureDrawPass: boolean | null, mainThreadWebGpuProxyShaderDrawPass: boolean | null }>}
 */
export async function probeMainThreadWebGpuPreview() {
  const none = {
    status: '',
    maxTextureDimension2d: null,
    maxTextureDimension3d: null,
    mainThreadWebGpuLut3dTexFormat: null,
    mainThreadWebGpuCanvasClearPass: null,
    mainThreadWebGpuSolidDrawPass: null,
    mainThreadWebGpuTextureDrawPass: null,
    mainThreadWebGpuProxyShaderDrawPass: null,
  };
  const api = getWebGpuApiExposure();
  if (!api.exposed) {
    return { ...none, status: 'unavailable_no_api' };
  }
  const pack = await getOrProbeWebGpuAdapter();
  if (pack.adapter?.status !== 'ok') {
    if (pack.adapter?.status === 'no-adapter') {
      return { ...none, status: 'unavailable_no_adapter' };
    }
    const reason = pack.adapter?.reason != null ? String(pack.adapter.reason) : 'adapter';
    return {
      ...none,
      status: `unavailable_adapter_${reason.replace(/\s+/g, '_').slice(0, 64)}`,
    };
  }
  try {
    const device = await getOrCreatePersistentWebGpuDevice({ label: MAIN_THREAD_DEVICE_LABEL });
    await runMinimalMainThreadWebGpuQueueSmoke(device);
    const raw = device.limits?.maxTextureDimension2D;
    const maxTextureDimension2d =
      raw != null && Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : null;
    const raw3 = device.limits?.maxTextureDimension3D;
    const maxTextureDimension3d =
      raw3 != null && Number.isFinite(Number(raw3)) ? Math.floor(Number(raw3)) : null;
    const mainThreadWebGpuLut3dTexFormat = getProbeLut3dTexFormatLabel(device);
    let mainThreadWebGpuCanvasClearPass = null;
    try {
      mainThreadWebGpuCanvasClearPass = await runMainThreadCanvasWebGpuClearPass(device);
    } catch {
      mainThreadWebGpuCanvasClearPass = false;
    }
    let mainThreadWebGpuSolidDrawPass = null;
    try {
      mainThreadWebGpuSolidDrawPass = await runMainThreadCanvasWebGpuSolidDrawPass(device);
    } catch {
      mainThreadWebGpuSolidDrawPass = false;
    }
    let mainThreadWebGpuTextureDrawPass = null;
    try {
      mainThreadWebGpuTextureDrawPass = await runMainThreadCanvasWebGpuTextureDrawPass(device);
    } catch {
      mainThreadWebGpuTextureDrawPass = false;
    }
    let mainThreadWebGpuProxyShaderDrawPass = null;
    try {
      const tr = await runMainThreadCanvasWebGpuProxyShaderDrawPass(device);
      mainThreadWebGpuProxyShaderDrawPass =
        tr != null && typeof tr === 'object' && tr.pass === true;
    } catch {
      mainThreadWebGpuProxyShaderDrawPass = false;
    }
    return {
      status: 'ok_minimal_queue_submit',
      maxTextureDimension2d,
      maxTextureDimension3d,
      mainThreadWebGpuLut3dTexFormat,
      mainThreadWebGpuCanvasClearPass,
      mainThreadWebGpuSolidDrawPass,
      mainThreadWebGpuTextureDrawPass,
      mainThreadWebGpuProxyShaderDrawPass,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ...none,
      status: `error_${msg.replace(/\s+/g, ' ').slice(0, 120)}`,
    };
  }
}

/**
 * Zwraca tylko etykietę statusu (API kompatybilne wstecz z wcześniejszymi importami).
 * @returns {Promise<string>}
 */
export async function probeMainThreadWebGpuPreviewStatus() {
  const { status } = await probeMainThreadWebGpuPreview();
  return status;
}
