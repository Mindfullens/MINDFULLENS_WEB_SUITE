/**
 * Roundtrip `utif` dla enkodera DNG wariant A (bez przeglądarki).
 */
import assert from 'node:assert/strict';
import UTIF from 'utif';

import {
  encodeDerivativeLightDngArrayBuffer,
  encodeDerivativeLightRgbTiffArrayBuffer,
  FILMLAB_DNG_VARIANT_A_STRIP_BYTE_OFFSET,
} from '../src/engine/filmLabExportDngVariantA.js';

const W = 3;
const H = 2;
const rgb = new Uint8Array(W * H * 3);
for (let i = 0; i < rgb.length; i += 1) {
  rgb[i] = (i * 17 + 41) & 255;
}

function decodeRgb(ifds, bytes) {
  assert.ok(ifds?.length >= 1);
  UTIF.decodeImage(bytes, ifds[0]);
  assert.equal(ifds[0].width, W);
  assert.equal(ifds[0].height, H);
  const raw = ifds[0].data;
  assert.ok(raw != null);
  return new Uint8Array(raw.buffer ?? raw, raw.byteOffset ?? 0, raw.byteLength ?? raw.length);
}

const bufTiff = encodeDerivativeLightRgbTiffArrayBuffer(rgb, W, H, {
  software: 'Mindfullens Film Lab test',
});
const bytesTiff = new Uint8Array(bufTiff);
const ifdsTiff = UTIF.decode(bufTiff);
const roundTiff = decodeRgb(ifdsTiff, bytesTiff);
assert.equal(roundTiff.length, rgb.length);
assert.deepEqual([...roundTiff], [...rgb]);

const bufDng = encodeDerivativeLightDngArrayBuffer(rgb, W, H, {
  software: 'Mindfullens Film Lab test',
});
const bytesDng = new Uint8Array(bufDng);
const ifdsDng = UTIF.decode(bufDng);
assert.ok(ifdsDng[0].t50706 != null && ifdsDng[0].t50707 != null && ifdsDng[0].t50721 != null);
const roundDng = decodeRgb(ifdsDng, bytesDng);
assert.deepEqual([...roundDng], [...rgb]);

assert.ok(bufTiff.byteLength >= FILMLAB_DNG_VARIANT_A_STRIP_BYTE_OFFSET + rgb.length);
assert.ok(bufDng.byteLength >= FILMLAB_DNG_VARIANT_A_STRIP_BYTE_OFFSET + rgb.length);

console.log('PASS film-lab-export-dng-variant-a');
