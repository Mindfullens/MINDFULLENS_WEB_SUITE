import assert from 'node:assert/strict';
import { CROP_MIN_SIZE } from '../src/filmLab/crop/cropConstants.js';
import {
  areCropRectsClose,
  buildCropRectNormFromAdjustments,
  clampCropRectToBounds,
  computeCropDragRect,
  fitCropRectToAspect,
} from '../src/filmLab/crop/cropGeometry.js';
import {
  resolveDisplayedAspectRatioForCrop,
  resolveNormalizedCropAspectRatio,
} from '../src/filmLab/crop/cropAspectResolve.js';
import { resolveFilmLabSourcePixelSize } from '../src/engine/metadata/exifMetadata.js';

const snapshot = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
const aspect = 5 / 4;

function cornerRect(handle, x, y) {
  return computeCropDragRect({
    snapshotRect: snapshot,
    startPoint: { x: 0.45, y: 0.45 },
    currentPoint: { x, y },
    handle,
    aspectRatio: aspect,
    minSize: CROP_MIN_SIZE,
  });
}

// Corner resize should not jump when pointer crosses a diagonal in *delta* space
// (regression: old code used |dx| vs |dy|*aspect from drag start).
const r1 = cornerRect('se', 0.7, 0.62);
const r2 = cornerRect('se', 0.71, 0.63);
assert.ok(r2.w >= r1.w - 1e-6 && r2.h >= r1.h - 1e-6, 'corner grow should be monotonic for SE drag');

const fitted = fitCropRectToAspect({ x: 0, y: 0, w: 1, h: 1 }, 1);
assert.ok(Math.abs(fitted.w - fitted.h) < 1e-9, '1:1 fit on square');

const norm = buildCropRectNormFromAdjustments({
  cropRectX: 0.1,
  cropRectY: 0.2,
  cropRectW: 0.5,
  cropRectH: 0.4,
});
assert.equal(norm.zoom, 1 / 0.5);

const clamped = clampCropRectToBounds({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
assert.ok(clamped.x + clamped.w <= 1 + 1e-9 && clamped.y + clamped.h <= 1 + 1e-9);

assert.ok(
  areCropRectsClose({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 1e-6)
);

const dims = resolveFilmLabSourcePixelSize(
  { previewWidth: 4000, previewHeight: 3000 },
  { pixelWidth: 6000, pixelHeight: 4000 }
);
assert.equal(dims.sourceWidth, 4000);
assert.equal(dims.sourceHeight, 3000);

const disp = resolveDisplayedAspectRatioForCrop(
  { width: 4000, height: 3000 },
  { orientationTransform: { rotationDegrees: 90 } },
  { rotation: 0, cropRectX: 0, cropRectY: 0, cropRectW: 1, cropRectH: 1 }
);
assert.ok(Math.abs(disp - 3000 / 4000) < 1e-6, '90° swap uses displayed dimensions');

const normRatio = resolveNormalizedCropAspectRatio(1, { width: 100, height: 100 }, {}, { rotation: 0 });
assert.ok(normRatio != null && normRatio > 0);

console.log('test-crop-geometry: OK');
