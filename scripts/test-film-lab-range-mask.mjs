/**
 * Regresja wag Luma / Hue dla lokalnych masek (`filmLabLocalMaskRangeMath.js`).
 */
import assert from 'node:assert/strict';
import {
  computeLocalMaskWeightAtPixel,
  resolveDepthProxy01,
} from '../src/engine/filmLabLocalMaskRangeMath.js';
import { rgbBytesToHueDegrees } from '../src/filmLab/rgbHueFromBytes.js';

const buf = new Float32Array(4);
buf[2] = 0.75;
const brushEntry = { mode: 'brush', buffer: buf };
assert.equal(computeLocalMaskWeightAtPixel(brushEntry, 2, 10, 20, 30), 0.75);

const lumaWide = {
  mode: 'luma',
  buffer: null,
  lumaMin: 0,
  lumaMax: 1,
  lumaFeather: 0.35,
};
const midGray = computeLocalMaskWeightAtPixel(lumaWide, 0, 120, 120, 120);
assert.ok(midGray > 0.3 && midGray <= 1, `mid-gray in full luma range: ${midGray}`);

const lumaNarrow = {
  mode: 'luma',
  buffer: null,
  lumaMin: 0.05,
  lumaMax: 0.15,
  lumaFeather: 0.2,
};
const whiteOut = computeLocalMaskWeightAtPixel(lumaNarrow, 0, 255, 255, 255);
assert.ok(whiteOut < 0.05, `white outside narrow luma band: ${whiteOut}`);

const hueEntry = {
  mode: 'color',
  buffer: null,
  colorHueCenter: 0,
  colorHueWidth: 120,
  colorFeather: 0.35,
};
const redHue = computeLocalMaskWeightAtPixel(hueEntry, 0, 255, 0, 0);
assert.ok(redHue > 0.4, `red near hue 0: ${redHue}`);

const chromaNarrow = {
  mode: 'color',
  buffer: null,
  colorHueCenter: 120,
  colorHueWidth: 90,
  colorFeather: 0.35,
  colorChromaMin: 0.35,
  colorChromaMax: 1,
};
const grayRgb = computeLocalMaskWeightAtPixel(chromaNarrow, 0, 128, 128, 128);
assert.ok(grayRgb < 0.15, `low-sat gray outside chroma band: ${grayRgb}`);

const chromaAdmitsGreen = {
  mode: 'color',
  buffer: null,
  colorHueCenter: 120,
  colorHueWidth: 90,
  colorFeather: 0.35,
  colorChromaMin: 0.15,
  colorChromaMax: 1,
};
const greenRgb = computeLocalMaskWeightAtPixel(chromaAdmitsGreen, 0, 0, 220, 0);
assert.ok(greenRgb > 0.15, `saturated green inside hue+chroma band: ${greenRgb}`);

assert.ok(Math.abs(rgbBytesToHueDegrees(255, 0, 0)) < 2);
assert.ok(rgbBytesToHueDegrees(0, 255, 0) > 115 && rgbBytesToHueDegrees(0, 255, 0) < 125);

const brushHalf = new Float32Array(4);
brushHalf.fill(0);
brushHalf[1] = 1;
const depthEntry = {
  mode: 'depth',
  buffer: brushHalf,
  depthMin: 0,
  depthMax: 1,
  depthFeather: 0.35,
};
const midGrayDepth = computeLocalMaskWeightAtPixel(depthEntry, 1, 128, 128, 128);
assert.ok(midGrayDepth > 0.4 && midGrayDepth <= 1, `depth brush × full range at mid gray: ${midGrayDepth}`);

const depthEntryDarkOnly = {
  mode: 'depth',
  buffer: brushHalf,
  depthMin: 0,
  depthMax: 0.08,
  depthFeather: 0.12,
};
const whiteLowDepth = computeLocalMaskWeightAtPixel(depthEntryDarkOnly, 1, 255, 255, 255);
assert.ok(whiteLowDepth < 0.08, `bright pixel outside narrow depth proxy band: ${whiteLowDepth}`);

const bufPx = new Float32Array(4);
bufPx[1] = 0.25;
assert.ok(Math.abs(resolveDepthProxy01({ depthProxyBuffer: bufPx }, 1, 255, 255, 255) - 0.25) < 1e-5);
assert.ok(Math.abs(resolveDepthProxy01({ depthProxyBuffer: bufPx }, 1, 0, 0, 0) - 0.25) < 1e-5);
const depthBufEntry = {
  mode: 'depth',
  buffer: brushHalf,
  depthProxyBuffer: bufPx,
  depthMin: 0,
  depthMax: 1,
  depthFeather: 0.35,
};
const bufWeighted = computeLocalMaskWeightAtPixel(depthBufEntry, 1, 255, 255, 255);
assert.ok(
  bufWeighted > 0.4 && bufWeighted <= 1,
  `depth uses buffer not RGB luma at px1: ${bufWeighted}`,
);

process.stdout.write('PASS film-lab-range-mask\n');
