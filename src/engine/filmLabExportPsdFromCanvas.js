/**
 * PSD export from the same sharpened HTMLCanvasElement used for raster codecs.
 * Experimental: triggered when `fileFormat === 'psd'` (prefs / advanced only — no modal pill yet).
 *
 * @see docs/hme/EXPORT-PSD-DNG-SPIKE.md
 */

import { writePsd } from 'ag-psd';

/**
 * @param {HTMLCanvasElement} canvas Export canvas (already sharpened by caller when needed).
 * @param {{ layerName?: string }} [opts]
 * @returns {{ bytes: Uint8Array, extension: 'psd', mimeType: string }}
 */
export function encodeFilmLabExportPsdFromCanvas(canvas, opts = {}) {
  const layerName = opts.layerName ?? 'Export';
  const w = canvas.width;
  const h = canvas.height;

  const layer = {
    name: layerName,
    top: 0,
    left: 0,
    bottom: h,
    right: w,
    blendMode: 'normal',
    opacity: 1,
    canvas,
  };

  const psd = {
    width: w,
    height: h,
    channels: 3,
    bitsPerChannel: 8,
    colorMode: 3,
    children: [layer],
    canvas,
  };

  const buffer = writePsd(psd, { noBackground: true });
  return {
    bytes: new Uint8Array(buffer),
    extension: 'psd',
    mimeType: 'application/vnd.adobe.photoshop',
  };
}
