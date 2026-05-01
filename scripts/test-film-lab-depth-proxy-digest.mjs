/**
 * Regresja skrótu bufora proxy głębi + fingerprint próbki ImageData.
 */
import assert from 'node:assert/strict';
import {
  fingerprintImageDataSample,
  hashDepthProxyFloat32,
} from '../src/filmLab/depth/filmLabDepthProxyDigest.js';

const a = new Float32Array(8);
a.fill(0.5);
const h1 = hashDepthProxyFloat32(a);
assert.ok(typeof h1 === 'string' && h1.length > 4);
assert.equal(hashDepthProxyFloat32(a), h1);

// Node nie ma globalnego ImageData; stub wystarczy — fingerprint czyta tylko `.data`.
const rgba = new Uint8ClampedArray(4 * 2 * 4);
for (let i = 0; i < rgba.length; i += 1) {
  rgba[i] = i % 255;
}
const id = { data: rgba, width: 4, height: 2 };
const fp = fingerprintImageDataSample(id);
assert.ok(typeof fp === 'string' && fp.length > 2);

console.log('OK depth proxy digest');
