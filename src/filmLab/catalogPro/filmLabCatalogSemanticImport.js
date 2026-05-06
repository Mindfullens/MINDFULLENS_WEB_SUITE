/**
 * Semantic index for catalog assets at import time — tags/hints only (no mask generation).
 */

function fileExtensionLower(name) {
  const n = String(name ?? '');
  const i = n.lastIndexOf('.');
  if (i < 0 || i >= n.length - 1) {
    return '';
  }
  return n.slice(i + 1).toLowerCase();
}

function truncate(str, max) {
  const s = String(str ?? '').trim();
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

const RAW_EXT = new Set([
  'dng',
  'nef',
  'nrw',
  'cr2',
  'cr3',
  'arw',
  'orf',
  'rw2',
  'raf',
  'pef',
  'srw',
  '3fr',
  'erf',
  'mef',
  'mrw',
  'raw',
]);

/**
 * @param {object} input
 * @param {string} [input.sourceName]
 * @param {string} [input.sourceType]
 * @param {object | null} [input.exifMeta]
 * @returns {{ version: 1, tags: string[], objects: [] }}
 */
export function buildCatalogSemanticIndexFromImport({ sourceName, sourceType, exifMeta } = {}) {
  /** @type {string[]} */
  const tags = [];
  const ext = fileExtensionLower(sourceName);
  if (ext) {
    tags.push(`ext:${ext}`);
  }
  if (RAW_EXT.has(ext)) {
    tags.push('kind:raw');
  }
  const mime = String(sourceType ?? '').toLowerCase();
  if (mime.includes('raw') || mime === 'image/x-adobe-dng') {
    tags.push('mime:raw');
  }

  const cam = [exifMeta?.cameraMake, exifMeta?.cameraModel].filter(Boolean).join(' ').trim();
  if (cam) {
    tags.push(`camera:${truncate(cam, 48)}`);
  }

  const base = String(sourceName ?? '').replace(/\.[^.\\/]+$/, '');
  const seen = new Set(tags.map((t) => t.toLowerCase()));
  const parts = base.split(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+/).filter((p) => p.length >= 3);
  for (const p of parts) {
    if (tags.length >= 14) {
      break;
    }
    const token = `kw:${p.toLowerCase()}`;
    const low = token.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      tags.push(token);
    }
  }

  return { version: 1, tags, objects: [] };
}

/**
 * Compact EXIF snapshot stored on catalog asset (library panel); not the full engine `exifMeta`.
 *
 * @param {object | null | undefined} exifMeta
 * @param {object | null | undefined} imageMeta
 * @returns {object | null}
 */
export function buildCatalogExifSnapshot(exifMeta, imageMeta) {
  if (!exifMeta && !imageMeta) {
    return null;
  }
  const camera = [exifMeta?.cameraMake, exifMeta?.cameraModel].filter(Boolean).join(' ').trim() || null;
  const snap = {
    schema: 'mindfullens.catalog-exif-snapshot.v1',
    camera,
    lens: exifMeta?.lensModel ?? null,
    iso: Number.isFinite(Number(exifMeta?.iso)) ? Math.round(Number(exifMeta.iso)) : null,
    shutter: exifMeta?.shutter ?? null,
    aperture: exifMeta?.aperture ?? null,
    focalLength: exifMeta?.focalLength ?? null,
    dateTaken: exifMeta?.dateTaken ?? null,
    orientation: exifMeta?.orientationLabel ?? null,
    /** Numeryczny tag EXIF (1–8) — potrzebny do obracania miniatury gdy embedded JPEG nie ma własnego EXIF. */
    orientationTag:
      Number.isFinite(Number(exifMeta?.orientationTag)) && Number(exifMeta.orientationTag) >= 1
        ? Math.round(Number(exifMeta.orientationTag))
        : null,
    dimensions:
      imageMeta?.width && imageMeta?.height
        ? `${Math.round(Number(imageMeta.width))}×${Math.round(Number(imageMeta.height))}`
        : null,
    previewDimensions:
      imageMeta?.previewWidth && imageMeta?.previewHeight
        ? `${Math.round(Number(imageMeta.previewWidth))}×${Math.round(Number(imageMeta.previewHeight))}`
        : null,
  };

  const has =
    snap.camera ||
    snap.lens ||
    snap.iso != null ||
    snap.shutter ||
    snap.aperture ||
    snap.focalLength ||
    snap.dateTaken ||
    snap.orientation ||
    snap.dimensions ||
    snap.previewDimensions;

  return has ? snap : null;
}
