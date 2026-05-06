/**
 * DNG wariant B (track techniczny) — ten sam derivative-light payload co wariant A,
 * ale z osadzonym XMP opisującym źródło depth oraz metadane pipeline.
 */
import {
  FILMLAB_EXPORT_DNG_MIME_TYPE,
  encodeDerivativeLightDngArrayBuffer,
  stripRgbPackedFromImageData,
} from './filmLabExportDngVariantA.js';
import UTIF from 'utif';

let xmpTagTypeRegistered = false;

function ensureUtifXmpTagTypeRegistered() {
  if (xmpTagTypeRegistered) {
    return;
  }
  UTIF.ttypes[700] = 2;
  xmpTagTypeRegistered = true;
}

function xmlEscape(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildVariantBXmpPacket({
  depthMapSource = 'luminance',
  depthProxyDigest = '',
  pipelineKind = '',
} = {}) {
  const source = xmlEscape(depthMapSource);
  const digest = xmlEscape(depthProxyDigest);
  const pipe = xmlEscape(pipelineKind);
  return (
    `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:ml="https://mindfullens.pl/ns/film-lab/1.0/">` +
    `<ml:dngVariant>B</ml:dngVariant>` +
    `<ml:depthMapSource>${source}</ml:depthMapSource>` +
    `<ml:depthProxyDigest>${digest}</ml:depthProxyDigest>` +
    `<ml:pipelineKind>${pipe}</ml:pipelineKind>` +
    `</rdf:Description>` +
    `</rdf:RDF>` +
    `</x:xmpmeta>` +
    `<?xpacket end="w"?>`
  );
}

/**
 * TIFF tag 700 = XMP packet, używany jako kontrakt wariantu B.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ depthMapSource?: string, depthProxyDigest?: string, pipelineKind?: string, software?: string }} [opts]
 * @returns {{ bytes: Uint8Array, extension: 'dng', mimeType: string }}
 */
export function encodeFilmLabExportDngVariantBFromCanvas(canvas, opts = {}) {
  ensureUtifXmpTagTypeRegistered();
  const w = canvas.width;
  const h = canvas.height;
  const ctx =
    canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Film Lab DNG export (variant B): 2D context unavailable');
  }
  const imageData = ctx.getImageData(0, 0, w, h);
  const strip = stripRgbPackedFromImageData(imageData);
  const xmpPacket = buildVariantBXmpPacket(opts);
  const buf = encodeDerivativeLightDngArrayBuffer(strip, w, h, {
    software: opts.software ?? 'Mindfullens Film Lab',
    extraIfdFields: {
      t700: [xmpPacket],
      t50721: ['Mindfullens Film Lab (DNG B)'],
    },
  });
  return {
    bytes: new Uint8Array(buf),
    extension: 'dng',
    mimeType: FILMLAB_EXPORT_DNG_MIME_TYPE,
  };
}

/**
 * Runtime switch for DNG flavor in export pipeline.
 * `VITE_FILMLAB_DNG_VARIANT=b` activates variant B.
 */
export function resolveFilmLabDngVariantFromEnv() {
  const raw = String(import.meta.env?.VITE_FILMLAB_DNG_VARIANT ?? 'a')
    .trim()
    .toLowerCase();
  return raw === 'b' ? 'b' : 'a';
}
