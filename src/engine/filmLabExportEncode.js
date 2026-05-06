/**
 * Shared Film-Lab export encoding (JPEG + EXIF, PNG, WebP, uncompressed TIFF, AVIF).
 * Every `fileFormat` branch below must stay aligned with `FILM_LAB_EXPORT_RASTER_FORMAT_IDS`
 * in `./filmLabExportFormats.js` (modal, engine normalization, manifest optional scenarios).
 * Entrypoints normalize `opts.fileFormat` via `normalizeFilmLabExportFileFormat` as a last-resort guard.
 */

import piexif from 'piexifjs';
import {
  defaultFilmLabExportLossyQualityForFormat,
  FILM_LAB_EXPORT_LOSSY_FORMAT_SET,
  normalizeFilmLabExportFileFormat,
} from './filmLabExportFormats.js';
import { applyOutputSharpening } from './outputSharpening.js';
import { imageDataToUncompressedRgbTiff } from './filmLabTiffExport.js';

function resolveLossyCodecQuality(opts, fileFormat) {
  if (!FILM_LAB_EXPORT_LOSSY_FORMAT_SET.has(fileFormat)) {
    return null;
  }
  const raw = opts?.lossyQuality;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(1, Math.max(0.35, raw));
  }
  return defaultFilmLabExportLossyQualityForFormat(fileFormat);
}

function dataUrlToUint8(dataUrl) {
  const byteString = atob(dataUrl.split(',')[1]);
  const buffer = new ArrayBuffer(byteString.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < byteString.length; i += 1) {
    view[i] = byteString.charCodeAt(i);
  }
  return view;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} context
 * @param {object} opts
 * @param {string} opts.filmName
 * @param {string} opts.sizeProfile
 * @param {'jpeg'|'png'|'webp'|'tiff'|'avif'} opts.fileFormat Same union as `FILM_LAB_EXPORT_RASTER_FORMAT_IDS`.
 * @param {number} opts.sharpeningStrength
 * @param {number} [opts.lossyQuality] JPEG/WebP/AVIF codec quality in (0,1]; outside range is clamped; omitted uses per-format defaults.
 * @returns {Promise<{ bytes: Uint8Array, extension: string, mimeType: string }>}
 */
export async function encodeFilmLabExportCanvas(canvas, context, opts) {
  const { filmName, sizeProfile, fileFormat: rawFileFormat, sharpeningStrength } = opts;
  const fileFormat = normalizeFilmLabExportFileFormat(rawFileFormat);
  const lossyQ = resolveLossyCodecQuality(opts, fileFormat);
  const w = canvas.width;
  const h = canvas.height;

  applyOutputSharpening(context, w, h, sharpeningStrength);

  if (fileFormat === 'png') {
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (!blob) {
      throw new Error('PNG encoding failed');
    }
    const ab = await blob.arrayBuffer();
    return {
      bytes: new Uint8Array(ab),
      extension: 'png',
      mimeType: 'image/png',
    };
  }

  if (fileFormat === 'webp') {
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', lossyQ ?? defaultFilmLabExportLossyQualityForFormat('webp'));
    });
    if (!blob) {
      throw new Error('WebP encoding failed');
    }
    const ab = await blob.arrayBuffer();
    return {
      bytes: new Uint8Array(ab),
      extension: 'webp',
      mimeType: 'image/webp',
    };
  }

  if (fileFormat === 'tiff') {
    const imageData = context.getImageData(0, 0, w, h);
    const bytes = imageDataToUncompressedRgbTiff(imageData);
    return {
      bytes,
      extension: 'tif',
      mimeType: 'image/tiff',
    };
  }

  if (fileFormat === 'avif') {
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/avif', lossyQ ?? defaultFilmLabExportLossyQualityForFormat('avif'));
    });
    if (!blob) {
      throw new Error('AVIF encoding failed');
    }
    const ab = await blob.arrayBuffer();
    return {
      bytes: new Uint8Array(ab),
      extension: 'avif',
      mimeType: 'image/avif',
    };
  }

  const jpegDataUrl = canvas.toDataURL(
    'image/jpeg',
    lossyQ ?? defaultFilmLabExportLossyQualityForFormat('jpeg')
  );
  let finalDataUrl = jpegDataUrl;
  try {
    const zeroth = {};
    const exifIfd = {};
    zeroth[piexif.ImageIFD.Make] = 'MindfulLens';
    zeroth[piexif.ImageIFD.Model] = 'Film-Lab Web Engine';
    zeroth[piexif.ImageIFD.Software] = 'MindfulLens Film-Lab v1.0';
    zeroth[piexif.ImageIFD.ImageDescription] = `Film profile: ${filmName} | Size: ${sizeProfile}`;
    zeroth[piexif.ImageIFD.Copyright] = 'Processed with MindfulLens Film-Lab';
    zeroth[piexif.ImageIFD.Artist] = 'MindfulLens User';
    zeroth[piexif.ImageIFD.Orientation] = 1;
    exifIfd[piexif.ExifIFD.DateTimeOriginal] = new Date()
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
    exifIfd[piexif.ExifIFD.UserComment] = `Exported from Film-Lab | Profile: ${filmName}`;

    const exifObj = { '0th': zeroth, Exif: exifIfd };
    const exifBytes = piexif.dump(exifObj);
    finalDataUrl = piexif.insert(exifBytes, jpegDataUrl);
  } catch (e) {
    console.warn('[Film-Lab] EXIF injection skipped:', e);
  }

  return {
    bytes: dataUrlToUint8(finalDataUrl),
    extension: 'jpg',
    mimeType: 'image/jpeg',
  };
}

/**
 * Encode ImageData directly (used for before/after sidecar exports).
 * JPEG path intentionally omits EXIF injection for deterministic payload size.
 *
 * @param {ImageData} imageData
 * @param {object} opts
 * @param {'jpeg'|'png'|'webp'|'tiff'|'avif'} opts.fileFormat Same union as `FILM_LAB_EXPORT_RASTER_FORMAT_IDS`.
 * @param {number} [opts.lossyQuality] Same semantics as `encodeFilmLabExportCanvas`.
 * @returns {Promise<{ bytes: Uint8Array, extension: string, mimeType: string }>}
 */
export async function encodeFilmLabExportImageData(imageData, opts) {
  const fileFormat = normalizeFilmLabExportFileFormat(opts?.fileFormat);
  const lossyQ = resolveLossyCodecQuality(opts, fileFormat);
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('2D context unavailable');
  }
  ctx.putImageData(imageData, 0, 0);

  if (fileFormat === 'png') {
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (!blob) {
      throw new Error('PNG encoding failed');
    }
    return { bytes: new Uint8Array(await blob.arrayBuffer()), extension: 'png', mimeType: 'image/png' };
  }

  if (fileFormat === 'webp') {
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', lossyQ ?? defaultFilmLabExportLossyQualityForFormat('webp'));
    });
    if (!blob) {
      throw new Error('WebP encoding failed');
    }
    return { bytes: new Uint8Array(await blob.arrayBuffer()), extension: 'webp', mimeType: 'image/webp' };
  }

  if (fileFormat === 'tiff') {
    return {
      bytes: imageDataToUncompressedRgbTiff(imageData),
      extension: 'tif',
      mimeType: 'image/tiff',
    };
  }

  if (fileFormat === 'avif') {
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/avif', lossyQ ?? defaultFilmLabExportLossyQualityForFormat('avif'));
    });
    if (!blob) {
      throw new Error('AVIF encoding failed');
    }
    return { bytes: new Uint8Array(await blob.arrayBuffer()), extension: 'avif', mimeType: 'image/avif' };
  }

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', lossyQ ?? defaultFilmLabExportLossyQualityForFormat('jpeg'));
  });
  if (!blob) {
    throw new Error('JPEG encoding failed');
  }
  return { bytes: new Uint8Array(await blob.arrayBuffer()), extension: 'jpg', mimeType: 'image/jpeg' };
}

export function triggerBrowserDownload(bytes, mimeType, filename) {
  const blob = new Blob([bytes], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, 100);
}

/**
 * @param {ImageData} imageData
 * @returns {Promise<Uint8Array>}
 */
export function imageDataToPngUint8Array(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('2D context unavailable'));
  }
  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('PNG blob failed'));
          return;
        }
        blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)));
      },
      'image/png'
    );
  });
}
