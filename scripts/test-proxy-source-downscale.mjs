/**
 * Regresja: `proxySourceDownscale.js` + `proxyWorkerGpuInputTelemetry.js`. Uruchom z katalogu głównego repo.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fitSourceInsideMaxTextureEdge,
  isDownscaleOutputWithinPixelBudget,
  MAX_DOWNSCALE_OUTPUT_PIXELS,
  downscaleRgba8Bilinear,
  downscaleRgba8BoxHalf,
  downscaleRgba8ToTargetStaged,
} from '../src/engine/proxySourceDownscale.js';
import {
  getProxyWorkerOutputFitStatusLabel,
  hasProxyWorkerGpuTexDimensions,
  isProxyWorkerGpuInputTexDownscaled,
  isProxyWorkerProxyOutputFitted,
} from '../src/filmLab/proxyWorkerGpuInputTelemetry.js';
import { wouldProxy3dLutsExceedMaxTexEdge } from '../src/engine/proxyGpuLut3dLimit.js';
import { doesRectExceedMaxTexture2dEdge } from '../src/engine/proxyGpu2dRectLimit.js';
import { fitNominalToMaxTexture2dEdge } from '../src/engine/proxyNominalOutputFit.js';
import {
  computeProxySize,
  DEFAULT_PROXY_MAX,
  resolveProxyMaxForPreviewBuffer,
} from '../src/engine/proxyComputeSize.js';

const never = () => false;

assert.equal(isProxyWorkerGpuInputTexDownscaled(null), false);
assert.equal(
  isProxyWorkerGpuInputTexDownscaled({
    proxyWorkerGpuTexW: 100,
    proxyWorkerGpuTexH: 100,
    proxyWorkerFullSourceW: 100,
    proxyWorkerFullSourceH: 100,
  }),
  false,
);
assert.equal(
  isProxyWorkerGpuInputTexDownscaled({
    proxyWorkerGpuTexW: 50,
    proxyWorkerGpuTexH: 100,
    proxyWorkerFullSourceW: 100,
    proxyWorkerFullSourceH: 100,
  }),
  true,
);
assert.equal(hasProxyWorkerGpuTexDimensions({ proxyWorkerGpuTexW: 1, proxyWorkerGpuTexH: 2 }), true);
assert.equal(hasProxyWorkerGpuTexDimensions({ proxyWorkerGpuTexW: 1 }), false);

assert.equal(isProxyWorkerProxyOutputFitted(null), false);
assert.equal(isProxyWorkerProxyOutputFitted({ proxyWorkerProxyOutputFitted: false }), false);
assert.equal(isProxyWorkerProxyOutputFitted({ proxyWorkerProxyOutputFitted: true }), true);

assert.equal(getProxyWorkerOutputFitStatusLabel(null), '—');
assert.equal(getProxyWorkerOutputFitStatusLabel({ proxySourceReady: false }), '—');
assert.equal(
  getProxyWorkerOutputFitStatusLabel({ proxySourceReady: true, proxyWorkerProxyOutputFitted: false }),
  'nie',
);
assert.equal(
  getProxyWorkerOutputFitStatusLabel({
    proxySourceReady: true,
    proxyWorkerProxyOutputFitted: true,
  }),
  'tak',
);
assert.equal(
  getProxyWorkerOutputFitStatusLabel({
    proxySourceReady: true,
    proxyWorkerProxyOutputFitted: true,
    proxyWorkerProxyOutputRequestedW: 10_000,
    proxyWorkerProxyOutputRequestedH: 8000,
    proxyWorkerProxyOutputTargetW: 2048,
    proxyWorkerProxyOutputTargetH: 1638,
  }),
  'tak (10000×8000 → 2048×1638)',
);

assert.deepEqual(fitSourceInsideMaxTextureEdge(100, 100, 200), { width: 100, height: 100 });

const f1 = fitSourceInsideMaxTextureEdge(4000, 3000, 2048);
assert.equal(f1.width, 2048);
assert.equal(f1.height, 1536);
assert.ok(f1.width <= 2048 && f1.height <= 2048);

assert.equal(isDownscaleOutputWithinPixelBudget(100, 200), true);
const rootPx = 15_000 * 15_000;
assert.ok(rootPx > MAX_DOWNSCALE_OUTPUT_PIXELS, 'test preset should exceed budget');
assert.equal(isDownscaleOutputWithinPixelBudget(15_000, 15_000), false);
const atBudgetW = 20_000;
const atBudgetH = MAX_DOWNSCALE_OUTPUT_PIXELS / atBudgetW;
assert.equal(isDownscaleOutputWithinPixelBudget(atBudgetW, atBudgetH), true);
assert.equal(
  isDownscaleOutputWithinPixelBudget(atBudgetW, atBudgetH + 1),
  false,
  'one row over should exceed',
);
assert.equal(isDownscaleOutputWithinPixelBudget(0, 100), false);
assert.equal(isDownscaleOutputWithinPixelBudget(100, 0), false);

assert.equal(wouldProxy3dLutsExceedMaxTexEdge(0, 0, 256), false);
assert.equal(wouldProxy3dLutsExceedMaxTexEdge(1, 1, 256), false);
assert.equal(wouldProxy3dLutsExceedMaxTexEdge(0, 0, 0), false);
assert.equal(wouldProxy3dLutsExceedMaxTexEdge(64, 32, 256), false, 'typical sizes fit in 256');
assert.equal(wouldProxy3dLutsExceedMaxTexEdge(500, 2, 256), true, 'profile side alone can exceed');
assert.equal(wouldProxy3dLutsExceedMaxTexEdge(0, 400, 256), true, 'look-only oversize');
assert.equal(wouldProxy3dLutsExceedMaxTexEdge(400, 0, 256), true, 'profile-only oversize');
assert.equal(wouldProxy3dLutsExceedMaxTexEdge(33, 33, 32), true);
assert.equal(wouldProxy3dLutsExceedMaxTexEdge(32, 32, 32), false, 'at edge is ok');

assert.equal(doesRectExceedMaxTexture2dEdge(100, 100, 0), false);
assert.equal(doesRectExceedMaxTexture2dEdge(100, 100, 200), false);
assert.equal(doesRectExceedMaxTexture2dEdge(201, 10, 200), true);
assert.equal(doesRectExceedMaxTexture2dEdge(10, 201, 200), true);
assert.equal(doesRectExceedMaxTexture2dEdge(200, 200, 200), false, 'at max edge is ok');

{
  const p = fitNominalToMaxTexture2dEdge(100, 200, 0);
  assert.equal(p.fitted, false);
  assert.equal(p.w, 100);
  assert.equal(p.h, 200);
  const q = fitNominalToMaxTexture2dEdge(5000, 3000, 2048);
  assert.equal(q.fitted, true);
  assert.ok(q.w <= 2048 && q.h <= 2048);
  assert.equal(q.w, 2048);
  assert.equal(q.h, 1229);
  const s = fitNominalToMaxTexture2dEdge(100, 100, 256);
  assert.equal(s.fitted, false);
  assert.equal(s.w, 100);
  assert.equal(s.h, 100);
}

const r2 = new Uint8ClampedArray(16);
for (let i = 0; i < 4; i += 1) {
  r2[i * 4] = 255;
  r2[i * 4 + 3] = 255;
}
const h0 = downscaleRgba8BoxHalf(r2, 2, 2, never);
assert.equal(h0?.width, 1);
assert.equal(h0?.height, 1);
assert.equal(h0.pixels[0], 255);
assert.equal(h0.pixels[3], 255);

const line = new Uint8ClampedArray(8);
line.set([255, 255, 255, 255, 0, 0, 0, 255]);
const b1 = downscaleRgba8Bilinear(line, 2, 1, 1, 1, never);
assert.equal(b1?.length, 4);
assert.ok(Math.abs(b1[0] - 128) < 2);

const big = new Uint8ClampedArray(8 * 8 * 4);
for (let i = 0; i < big.length; i += 4) {
  big[i] = 10;
  big[i + 1] = 20;
  big[i + 2] = 30;
  big[i + 3] = 255;
}
const st = downscaleRgba8ToTargetStaged(big, 8, 8, 2, 2, never);
assert.equal(st?.length, 16);
assert.equal(st[0], 10);
assert.equal(st[1], 20);

const cancelled = downscaleRgba8ToTargetStaged(big, 8, 8, 2, 2, () => true);
assert.equal(cancelled, null);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerSrc = fs.readFileSync(
  path.join(root, 'src/engine/workers/proxyRenderWorker.js'),
  'utf8',
);
assert.match(
  workerSrc,
  /from ['"]\.\.\/proxySourceDownscale\.js['"]/,
  'proxyRenderWorker should import from proxySourceDownscale.js',
);
assert.match(workerSrc, /fitSourceInsideMaxTextureEdge/);
assert.match(workerSrc, /isDownscaleOutputWithinPixelBudget/);
assert.match(workerSrc, /wouldProxy3dLutsExceedMaxTexEdge/);
assert.match(
  workerSrc,
  /from ['"]\.\.\/proxyNominalOutputFit\.js['"]/,
  'worker uses shared nominal output fit module',
);
assert.match(
  workerSrc,
  /function fitNominalProxyOutputToRendererMax2d/,
  'worker wraps fitNominalToMaxTexture2dEdge with renderer edge',
);
assert.match(workerSrc, /downscaleRgba8ToTargetStaged/);
assert.match(
  workerSrc,
  /from ['"]\.\.\/proxyComputeSize\.js['"]/,
  'proxyRenderWorker should import shared computeProxySize',
);

assert.equal(DEFAULT_PROXY_MAX, 1024);
assert.deepEqual(computeProxySize(100, 100, 500), { width: 100, height: 100 });
assert.deepEqual(computeProxySize(2000, 3000, 1000), { width: 667, height: 1000 });
assert.deepEqual(computeProxySize(2000, 3000, undefined), { width: 683, height: 1024 });
// min long edge 320
assert.deepEqual(computeProxySize(4000, 5000, 200), { width: 256, height: 320 });

assert.equal(resolveProxyMaxForPreviewBuffer(1000, 1500, 720, { matchPreviewBuffer: false }), 720);
assert.equal(resolveProxyMaxForPreviewBuffer(1000, 1500, 720, { matchPreviewBuffer: true }), 1500);
assert.equal(resolveProxyMaxForPreviewBuffer(800, 600, 2000, { matchPreviewBuffer: true }), 2000);

/** §5.1.1: inwariant „match bufora” — ten sam `proxyMax` co w wątku głównym, potem `computeProxySize` (brak drugiego docięcia poniżej dłuższej krawędzi źródła, gdy się mieści w kwadracie maxEdge). */
{
  const sw = 2000;
  const sh = 3000;
  const base = 800;
  const noMatch = resolveProxyMaxForPreviewBuffer(sw, sh, base, { matchPreviewBuffer: false });
  const n1 = computeProxySize(sw, sh, noMatch);
  assert.ok(n1.width < sw || n1.height < sh, 'bez match: zwykle zmniejszenie wielkich zrodel');

  const eff = resolveProxyMaxForPreviewBuffer(sw, sh, base, { matchPreviewBuffer: true });
  assert.equal(eff, Math.max(Math.max(sw, sh), base));
  const n2 = computeProxySize(sw, sh, eff);
  assert.deepEqual(n2, { width: sw, height: sh }, 'z match: nominalnie pelne wymiary zrodlowe');

  const lo = 400;
  const hi = 600;
  const smallBase = 2000;
  const eff2 = resolveProxyMaxForPreviewBuffer(lo, hi, smallBase, { matchPreviewBuffer: true });
  assert.equal(eff2, smallBase, 'gdy juz wyzsze niz krawedz, max(base, max(s,h)) = base');
  const n3 = computeProxySize(lo, hi, eff2);
  assert.deepEqual(n3, { width: lo, height: hi });
}

{
  const sw = 10_000;
  const sh = 5000;
  const base = 720;
  const eff = resolveProxyMaxForPreviewBuffer(sw, sh, base, { matchPreviewBuffer: true });
  const nom = computeProxySize(sw, sh, eff);
  assert.ok(
    nom.width === sw && nom.height === sh,
    'duze zrodlo: match unika sztucznego zmniejszania wzgledem bufora zrodlowego (nominal=full)',
  );
}

console.log('PASS proxy-source-downscale');
