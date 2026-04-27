import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

/**
 * Regresja: ścieżka WebGPU w workerze proxy (Etap 1) — wymagane identyfikatory w źródłach.
 * Nie uruchamia przeglądarki ani workera. Uruchom z katalogu głównego repo.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const worker = read('src/engine/workers/proxyRenderWorker.js');
assert.match(worker, /from ['"]\.\.\/\.\.\/filmLab\/runtimeEnv\.js['"]/);
assert.match(worker, /readEnvFlag\(\s*import\.meta\?\.env\?\.VITE_FILMLAB_WEBGPU_PROXY/);
assert.match(worker, /readEnvFlag\(\s*import\.meta\?\.env\?\.VITE_FILMLAB_PROXY_OUTPUT_TILES/);
assert.match(worker, /tryCpuOutputTiles/, 'proxyRenderWorker: CPU pełen nominal gdy kafle GPU (parity)');
assert.match(worker, /proxyWorkerCpuFullNominalParity/);
assert.match(worker, /cpuFullNominalParityField/);
assert.match(worker, /getProxyCpuYieldEveryRowCount/);
assert.match(worker, /from ['"]\.\.\/proxySourceDownscale\.js['"]/);
assert.match(worker, /tryAttachPersistentWebGpu/);
assert.match(worker, /proxyWebGpuReady/);
assert.match(worker, /reinitWebGpu/);
assert.match(worker, /attachProxyWebGpuPersistentContext/);
assert.match(worker, /proxyWebGpuDeviceLost/);
assert.match(worker, /webGpuWorkerBootPromise/);
assert.match(worker, /pickWebGpuDeviceLimitsSnapshot/);
assert.match(worker, /deviceLimits/);
assert.match(worker, /proxyWorkerWebGpuSourceTexFormat/);
assert.match(worker, /proxyWorkerWebGpuLut3dTexFormat/);
assert.match(worker, /proxyWorkerWebGpuReadbackRgba8/);
assert.match(worker, /proxyGpuRenderMs/);
assert.match(worker, /proxyCpuRenderMs/);
assert.match(worker, /proxyWorkerWebGlMaxTex2d/);
assert.match(worker, /getProxyRendererMaxTexture2dEdge/);
assert.match(worker, /getOrBuildGpuSourceTexturePayload/);
assert.match(worker, /wouldProxy3dLutsExceedMaxTexEdge/);
assert.match(worker, /from ['"]\.\.\/proxyGpuLut3dLimit\.js['"]/);
assert.match(worker, /from ['"]\.\.\/proxyNominalOutputFit\.js['"]/);
assert.match(worker, /fitNominalToMaxTexture2dEdge/);
assert.match(worker, /function fitNominalProxyOutputToRendererMax2d/);
assert.match(worker, /fitNominalProxyOutputToRendererMax2d\(/);
assert.match(worker, /proxyWorkerProxyOutputFitted/);
assert.match(worker, /proxyWorkerProxyOutputRequestedW/);
assert.match(worker, /gpuSourceOverrideCache/);
const lut3d = read('src/engine/proxyGpuLut3dLimit.js');
assert.match(lut3d, /export function wouldProxy3dLutsExceedMaxTexEdge/);
const rect2d = read('src/engine/proxyGpu2dRectLimit.js');
assert.match(rect2d, /export function doesRectExceedMaxTexture2dEdge/);
const nominalOut = read('src/engine/proxyNominalOutputFit.js');
assert.match(nominalOut, /export function fitNominalToMaxTexture2dEdge/);
const proxyTelemetry = read('src/filmLab/proxyWorkerGpuInputTelemetry.js');
assert.match(proxyTelemetry, /export function getProxyWorkerOutputFitStatusLabel/);
const renderDebugPanel = read('src/FilmLabRenderDebugPanel.jsx');
assert.match(renderDebugPanel, /getProxyWorkerOutputFitStatusLabel/);
const downscale = read('src/engine/proxySourceDownscale.js');
assert.match(downscale, /export function downscaleRgba8Bilinear/);
assert.match(downscale, /export function downscaleRgba8ToTargetStaged/);
assert.match(downscale, /export function downscaleRgba8BoxHalf/);
assert.match(downscale, /export function fitSourceInsideMaxTextureEdge/);
assert.match(downscale, /export function isDownscaleOutputWithinPixelBudget/);
assert.match(downscale, /MAX_DOWNSCALE_OUTPUT_PIXELS/);
assert.match(worker, /proxyWorkerGpuTexW/);
assert.match(worker, /proxyWorkerGpuInputDownscaleMs/);

const exportDebug = read('src/filmLab/useFilmLabExportDebugReport.js');
assert.match(exportDebug, /proxyWorkerGpuInputTexDownscaled/);
assert.match(exportDebug, /isProxyWorkerGpuInputTexDownscaled/);
assert.match(exportDebug, /isProxyWorkerProxyOutputFitted/);
assert.match(exportDebug, /getProxyWorkerOutputFitStatusLabel/);
assert.match(exportDebug, /proxyWorkerOutputFitStatusLabel/);
assert.match(exportDebug, /proxyWorkerProxyOutputRequestedW/);
assert.match(exportDebug, /proxyWorkerProxyOutputTargetW/);

const engine = read('src/engine/useFilmLabEngine.js');
assert.match(engine, /proxyWebGpuReady/);
assert.match(engine, /proxyWebGpuReinitOk/);
assert.match(engine, /proxyWebGpuReinitFailed/);
assert.match(engine, /ENABLE_WORKER_WEBGPU_PROXY/);
assert.match(engine, /proxyWorkerWebGpuCanvasFormat/);
assert.match(engine, /proxyWorkerWebGpuDeviceLimits/);
assert.match(engine, /deviceLimits/);
assert.match(engine, /proxyWorkerWebGpuSourceTexFormat/);
assert.match(engine, /proxyWorkerWebGpuLut3dTexFormat/);
assert.match(engine, /proxyWorkerWebGpuReadbackRgba8/);
assert.match(engine, /proxyWorkerGpuRenderMs/);
assert.match(engine, /proxyGpuRenderMs/);
assert.match(engine, /proxyWorkerCpuRenderMs/);
assert.match(engine, /proxyCpuRenderMs/);
assert.match(engine, /proxyWorkerWebGlMaxTex2d/);
assert.match(engine, /proxyWorkerProxyOutputRequestedW/);
assert.match(engine, /frameProxyOutputTargetW/);

const wgslPath = path.join(root, 'src/engine/workers/proxyWebGpuShaders.wgsl');
assert.ok(fs.existsSync(wgslPath), 'brak pliku proxyWebGpuShaders.wgsl');
const wgsl = read('src/engine/workers/proxyWebGpuShaders.wgsl');
assert.match(wgsl, /@fragment/);
assert.match(wgsl, /struct UBlock/);

const proxyGl = read('src/engine/workers/proxyGpuRenderer.js');
assert.match(proxyGl, /assertProxyFrameFitsWebGlLimits/);
assert.match(proxyGl, /from ['"]\.\.\/proxyGpuLut3dLimit\.js['"]/);
assert.match(proxyGl, /from ['"]\.\.\/proxyGpu2dRectLimit\.js['"]/);
assert.match(proxyGl, /wouldProxy3dLutsExceedMaxTexEdge/);
assert.match(proxyGl, /doesRectExceedMaxTexture2dEdge/);
assert.match(proxyGl, /MAX_TEXTURE_SIZE/);
assert.match(proxyGl, /MAX_3D_TEXTURE_SIZE/);
assert.match(proxyGl, /__glMaxTexture2d/);
assert.match(proxyGl, /__webgl2Rgba16fFbo/);
assert.match(proxyGl, /__webgl2ProxyFboRgba16fBlit/);
assert.match(proxyGl, /__webgl2Proxy3dLutRgba16f/);
assert.match(proxyGl, /VITE_FILMLAB_FAST_FBO16F/);
assert.match(proxyGl, /BLIT_VERTEX_SOURCE/);
assert.match(proxyGl, /probeWebgl2Rgba16fFboUsable/);
assert.match(proxyGl, /probeWebgl2Rgba16f3dLutUsable/);
assert.match(proxyGl, /from ['"]\.\.\/webglU8RgbaToHalfFloat\.js['"]/);
assert.match(proxyGl, /u8RgbaToHalfFloatRgbaForTexImage/);

const ubo = read('src/engine/proxyWebGpuUniformBlock.js');
assert.match(ubo, /export function buildProxyWebGpuUBlockFloat32/);
assert.match(ubo, /stripProxyWebGpuUBlockLutTextureBindings/);

const lut3dW = read('src/engine/proxyWebGpuLut3dWrite.js');
assert.match(lut3dW, /export function probeRgba16Float3dLutUsable/);
assert.match(lut3dW, /export function getProbeLut3dTexFormatLabel/);
assert.match(lut3dW, /createMainThreadProbe3dLutTextures/);
assert.match(lut3dW, /export function buildRgbaCube/);
assert.match(lut3dW, /export function write3dRgbaTightToTexture/);
assert.match(lut3dW, /export function write3dRgbaBytes/);

const webgpuRenderer = read('src/engine/workers/proxyWebGpuRenderer.js');
assert.match(webgpuRenderer, /from ['"]\.\.\/proxyWebGpuUniformBlock\.js['"]/);
assert.match(webgpuRenderer, /from ['"]\.\.\/proxyWebGpuLut3dWrite\.js['"]/);
assert.match(webgpuRenderer, /buildRgbaCube/);
assert.match(webgpuRenderer, /buildProxyWebGpuUBlockFloat32/);
assert.match(webgpuRenderer, /from ['"]\.\.\/proxyGpuLut3dLimit\.js['"]/);
assert.match(webgpuRenderer, /from ['"]\.\.\/proxyGpu2dRectLimit\.js['"]/);
assert.match(webgpuRenderer, /wouldProxy3dLutsExceedMaxTexEdge/);
assert.match(webgpuRenderer, /doesRectExceedMaxTexture2dEdge/);
assert.match(webgpuRenderer, /createProxyWebGpuRenderer/);
assert.match(webgpuRenderer, /__gpuBackend:\s*'webgpu'/);
assert.match(webgpuRenderer, /getCompilationInfo/);
assert.match(webgpuRenderer, /label:\s*'proxyWebGpu'/);
assert.match(webgpuRenderer, /label:\s*'proxyWebGpu:pipeline'/);
assert.match(webgpuRenderer, /label:\s*'proxyWebGpu:encode-frame'/);
assert.match(webgpuRenderer, /getOrCreateBindGroup/);
assert.match(webgpuRenderer, /probeRgba16FloatSourceTextureUsable/);
assert.match(webgpuRenderer, /write2dRgba16Float/);
assert.match(webgpuRenderer, /__maxTexture2d:\s*maxTex2d/);
assert.match(webgpuRenderer, /__proxySourceTexFormat:\s*sourceTexFormat/);
assert.match(webgpuRenderer, /__proxyLut3dTexFormat:\s*lut3dFormat/);
assert.match(webgpuRenderer, /getProbeLut3dTexFormatLabel/);
assert.match(webgpuRenderer, /write3dRgba16FloatFromU8Cube/);
assert.match(webgpuRenderer, /write3dRgbaBytes/);
assert.match(webgpuRenderer, /assertProxyFrameFitsDeviceLimits/);
assert.match(webgpuRenderer, /maxTextureDimension2D/);
assert.match(webgpuRenderer, /readbackRgba8/);
assert.match(webgpuRenderer, /copyTextureToBuffer/);

const webGpuEnv = read('src/engine/webGpuEnvironment.js');
assert.match(webGpuEnv, /getOrCreatePersistentWebGpuDevice/);
assert.match(webGpuEnv, /device\.lost/);
assert.match(webGpuEnv, /powerPreference:\s*'high-performance'/);
assert.match(webGpuEnv, /ml-proxy-persistent/);

const pkg = JSON.parse(read('package.json'));
const scripts = pkg.scripts ?? {};
assert.ok(scripts['test:proxy'], 'package.json: brak scripts[test:proxy]');
assert.match(String(scripts['test:proxy']), /test:proxy-webgpu/);
assert.match(String(scripts['test:proxy']), /test:proxy-downscale/);
assert.ok(scripts['test:proxy-webgpu'], 'package.json: brak scripts[test:proxy-webgpu]');
assert.ok(scripts['dev:webgpu'], 'package.json: brak scripts[dev:webgpu]');
assert.match(String(scripts['dev:webgpu']), /VITE_FILMLAB_WEBGPU_PROXY/);
assert.ok(scripts['dev:match-proxy'], 'package.json: brak scripts[dev:match-proxy]');
assert.match(String(scripts['dev:match-proxy']), /VITE_FILMLAB_PROXY_MATCH_PREVIEW/);
assert.ok(scripts['dev:match-proxy:webgpu'], 'package.json: brak scripts[dev:match-proxy:webgpu]');
assert.match(String(scripts['dev:match-proxy:webgpu']), /VITE_FILMLAB_WEBGPU_PROXY/);
assert.match(String(scripts['dev:match-proxy:webgpu']), /VITE_FILMLAB_PROXY_MATCH_PREVIEW/);
assert.ok(scripts['build:preview:webgpu'], 'package.json: brak scripts[build:preview:webgpu]');
assert.ok(scripts['preview:webgpu'], 'package.json: brak scripts[preview:webgpu]');
assert.ok(scripts['dev:proxy-output-tiles'], 'package.json: brak dev:proxy-output-tiles');
assert.match(String(scripts['dev:proxy-output-tiles']), /VITE_FILMLAB_PROXY_OUTPUT_TILES/);
assert.ok(scripts['build:preview:proxy-output-tiles'], 'package.json: brak build:preview:proxy-output-tiles');
assert.ok(scripts['dev:proxy-cpu-yield'], 'package.json: brak dev:proxy-cpu-yield');
assert.match(String(scripts['dev:proxy-cpu-yield']), /VITE_FILMLAB_PROXY_CPU_YIELD_EVERY/);
assert.ok(scripts['dev:proxy-output-tiles:yield'], 'package.json: brak dev:proxy-output-tiles:yield');
assert.match(String(scripts['dev:proxy-output-tiles:yield']), /VITE_FILMLAB_PROXY_OUTPUT_TILES/);
assert.match(String(scripts['dev:proxy-output-tiles:yield']), /VITE_FILMLAB_PROXY_CPU_YIELD_EVERY/);
assert.ok(scripts['build:preview:proxy-cpu-yield'], 'package.json: brak build:preview:proxy-cpu-yield');
assert.match(String(scripts['build:preview:proxy-cpu-yield']), /VITE_FILMLAB_PROXY_CPU_YIELD_EVERY/);

process.stdout.write('PASS proxy-webgpu-wiring\n');
