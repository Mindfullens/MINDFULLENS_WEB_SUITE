/**
 * Regresja: `proxyImageTilePlan.js` — geometria siatki kafli pod limit 2D.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countImageTilesForMaxEdge,
  planImageTileGrid,
  sumTilePixelAreas,
} from '../src/engine/proxyImageTilePlan.js';
import {
  copyRgba8TileIntoBuffer,
  flipRgba8ImageYInPlace,
  tightRgba8FromPaddedReadback,
} from '../src/engine/proxyOutputTileComposite.js';
import { getProxyWorkerOutputTileStatusLabel } from '../src/filmLab/proxyWorkerGpuInputTelemetry.js';

function assertThrows(fn, msg) {
  assert.throws(fn, (e) => e instanceof Error && String(e.message).includes(msg));
}

assert.deepEqual(planImageTileGrid(0, 100, 4096).tiles, []);
assert.deepEqual(planImageTileGrid(100, 0, 4096).tiles, []);
assert.equal(planImageTileGrid(100, 100, 4096).tileCount, 1);
assert.equal(planImageTileGrid(100, 100, 4096).cols, 1);
assert.equal(planImageTileGrid(100, 100, 4096).rows, 1);

const single = planImageTileGrid(800, 600, 4096);
assert.equal(single.tileCount, 1);
assert.equal(single.tiles[0].w, 800);
assert.equal(single.tiles[0].h, 600);
assert.equal(sumTilePixelAreas(single.tiles), 800 * 600);

const split = planImageTileGrid(5000, 3000, 2000);
assert.equal(split.cols, 3);
assert.equal(split.rows, 2);
assert.equal(split.tileCount, 6);
for (const t of split.tiles) {
  assert.ok(t.w <= 2000 && t.w >= 1);
  assert.ok(t.h <= 2000 && t.h >= 1);
}
assert.equal(sumTilePixelAreas(split.tiles), 5000 * 3000);

const exact = planImageTileGrid(4096, 4096, 4096);
assert.equal(exact.tileCount, 1);
assert.equal(exact.tiles[0].x, 0);
assert.equal(exact.tiles[0].y, 0);

const onePxOver = planImageTileGrid(4097, 1, 4096);
assert.equal(onePxOver.cols, 2);
assert.equal(onePxOver.tiles[0].w, 4096);
assert.equal(onePxOver.tiles[1].w, 1);

// Pokrycie bez dziur: każdy piksel dokładnie jeden kafel
function assertPartitionCoversImage(imageW, imageH, M) {
  const g = planImageTileGrid(imageW, imageH, M);
  const acc = new Uint8Array(imageW * imageH);
  for (const t of g.tiles) {
    for (let yy = 0; yy < t.h; yy += 1) {
      for (let xx = 0; xx < t.w; xx += 1) {
        const ix = t.x + xx;
        const iy = t.y + yy;
        const i = iy * imageW + ix;
        acc[i] += 1;
      }
    }
  }
  for (let i = 0; i < acc.length; i += 1) {
    assert.equal(acc[i], 1, `pixel ${i} should be covered exactly once`);
  }
}

assertPartitionCoversImage(7, 5, 3);
assertPartitionCoversImage(200, 150, 50);

assertThrows(() => planImageTileGrid(100, 100, 64, { overlap: 1 }), 'not supported yet');

// maxTileEdge < 1 → traktowane jako 1 (tak jak w innych modułach z Math.max(1, …))
const minEdge = planImageTileGrid(3, 3, 0);
assert.equal(minEdge.maxTileEdge, 1);
assert.equal(minEdge.tileCount, 9);

assert.equal(countImageTilesForMaxEdge(5000, 3000, 2000), 6);
assert.equal(countImageTilesForMaxEdge(10, 10, 20), 1);
assert.equal(countImageTilesForMaxEdge(1, 1, 0), null);
assert.equal(countImageTilesForMaxEdge(0, 10, 64), null);

assert.equal(getProxyWorkerOutputTileStatusLabel(null), '—');
assert.equal(getProxyWorkerOutputTileStatusLabel({ proxySourceReady: false }), '—');
assert.equal(getProxyWorkerOutputTileStatusLabel({ proxySourceReady: true }), 'brak max 2D');
assert.equal(
  getProxyWorkerOutputTileStatusLabel({
    proxySourceReady: true,
    proxyWorkerOutputTileCountNominal: 1,
    proxyWorkerOutputTileCountTarget: 1,
  }),
  '1 kafel',
);
assert.equal(
  getProxyWorkerOutputTileStatusLabel({
    proxySourceReady: true,
    proxyWorkerOutputTileCountNominal: 6,
    proxyWorkerOutputTileCountTarget: 1,
  }),
  '6 nominalnie → 1 (wyj.)',
);

const comp = new Uint8ClampedArray(10 * 8 * 4);
const red = new Uint8ClampedArray(3 * 2 * 4);
for (let i = 0; i < red.length; i += 4) {
  red[i] = 200;
  red[i + 1] = 10;
  red[i + 2] = 20;
  red[i + 3] = 255;
}
copyRgba8TileIntoBuffer(comp, 10, 2, 1, 3, 2, red);
const iAt = (x, y) => (y * 10 + x) * 4;
assert.equal(comp[iAt(2, 1)], 200);
assert.equal(comp[iAt(4, 1) + 1], 10);
assert.equal(comp[iAt(0, 0) + 3], 0);

const flip2 = new Uint8ClampedArray(2 * 2 * 4);
flip2[0] = 1;
flip2[1 * 2 * 4] = 2;
flip2[1 * 2 * 4 + 1] = 3;
flip2[1 * 2 * 4 + 2] = 4;
flipRgba8ImageYInPlace(flip2, 2, 2);
assert.equal(flip2[0], 2);
assert.equal(flip2[1 * 2 * 4], 1);

const bpr8 = 8; // 2*4, 256-padded 8
const host = new ArrayBuffer(16);
const hv = new Uint8Array(host);
hv.set([0, 0, 2, 255, 0, 0, 0, 0], 0);
hv.set([0, 0, 0, 0, 0, 0, 0, 0], 8);
const tight2 = tightRgba8FromPaddedReadback(host, 0, 2, 1, bpr8, true);
assert.equal(tight2[0], 2);
assert.equal(tight2[2], 0);

const _root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const _proxyWorker = fs.readFileSync(
  path.join(_root, 'src/engine/workers/proxyRenderWorker.js'),
  'utf8',
);
assert.match(
  _proxyWorker,
  /tryCpuOutputTiles/,
  'proxyRenderWorker: CPU pełen nominal gdy VITE_FILMLAB_PROXY_OUTPUT_TILES + >1 kafel (parity z GPU)',
);
assert.match(_proxyWorker, /tilesNeededCpu/);

console.log('PASS proxy-image-tile-plan');
