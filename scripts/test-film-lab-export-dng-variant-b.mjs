/**
 * Contract test for DNG variant B XMP payload.
 */
import assert from 'node:assert/strict';
import UTIF from 'utif';

import {
  encodeDerivativeLightDngArrayBuffer,
  stripRgbPackedFromImageData,
} from '../src/engine/filmLabExportDngVariantA.js';

const W = 3;
const H = 2;

const rgba = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < rgba.length; i += 4) {
  rgba[i] = (i * 5 + 11) & 255;
  rgba[i + 1] = (i * 7 + 13) & 255;
  rgba[i + 2] = (i * 9 + 17) & 255;
  rgba[i + 3] = 255;
}

const imageDataLike = { width: W, height: H, data: rgba };
const strip = stripRgbPackedFromImageData(imageDataLike);
UTIF.ttypes[700] = 2;
const xmpPacket =
  '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
  '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
  '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about="" xmlns:ml="https://mindfullens.pl/ns/film-lab/1.0/">' +
  '<ml:dngVariant>B</ml:dngVariant>' +
  '<ml:depthMapSource>onnx</ml:depthMapSource>' +
  '<ml:depthProxyDigest>abc123</ml:depthProxyDigest>' +
  '<ml:pipelineKind>raw</ml:pipelineKind>' +
  '</rdf:Description>' +
  '</rdf:RDF>' +
  '</x:xmpmeta>' +
  '<?xpacket end="w"?>';

const buf = encodeDerivativeLightDngArrayBuffer(strip, W, H, {
  software: 'Mindfullens Film Lab test',
  extraIfdFields: {
    t700: [xmpPacket],
    t50721: ['Mindfullens Film Lab (DNG B)'],
  },
});

const ifds = UTIF.decode(buf);
assert.ok(ifds?.length > 0, 'UTIF should decode at least one IFD');
assert.ok(ifds[0].t700 != null, 'DNG variant B should include XMP tag t700');
assert.match(String(ifds[0].t700[0] ?? ''), /<ml:dngVariant>B<\/ml:dngVariant>/);
assert.match(String(ifds[0].t700[0] ?? ''), /<ml:depthMapSource>onnx<\/ml:depthMapSource>/);
assert.match(String(ifds[0].t700[0] ?? ''), /<ml:depthProxyDigest>abc123<\/ml:depthProxyDigest>/);
assert.match(String(ifds[0].t700[0] ?? ''), /<ml:pipelineKind>raw<\/ml:pipelineKind>/);
assert.equal(String(ifds[0].t50721?.[0] ?? ''), 'Mindfullens Film Lab (DNG B)');

console.log('PASS film-lab-export-dng-variant-b');
