/**
 * Raster formats supported across Film Lab export (UI, engine, batch, manifest contracts).
 *
 * Checklist when adding a **raster** ID: branches in `filmLabExportEncode.js` (canvas + imageData paths);
 * optional-scenario matrix / semantics in `filmLabExportManifestReaderExamples.js`;
 * `filmLab.exportModal.format.<id>` in `en.json` + `pl.json` (see `test-film-lab-export-format-i18n.mjs` + `FILM_LAB_EXPORT_MODAL_FORMAT_IDS`);
 * if lossy: `opts.lossyQuality` in encoder + modal slider + prefs.
 * **PSD** / **DNG (derivative light)** — modal + `exportImage` / `batchProcessor` only (not in `FILM_LAB_EXPORT_RASTER_FORMAT_IDS`).
 */

export const FILM_LAB_EXPORT_RASTER_FORMAT_IDS = Object.freeze(['jpeg', 'png', 'webp', 'tiff', 'avif']);

export const FILM_LAB_EXPORT_RASTER_FORMAT_SET = new Set(FILM_LAB_EXPORT_RASTER_FORMAT_IDS);

/** Modal pills = raster codecs + PSD + DNG (wariant A). */
export const FILM_LAB_EXPORT_MODAL_FORMAT_IDS = Object.freeze([...FILM_LAB_EXPORT_RASTER_FORMAT_IDS, 'psd', 'dng']);

/** `optionalScenarios[].export.fileFormat` whitelist in manifest digest reader examples (raster + PSD + DNG). */
export const FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_IDS = Object.freeze([
  ...FILM_LAB_EXPORT_RASTER_FORMAT_IDS,
  'psd',
  'dng',
]);

export const FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_SET = new Set(
  FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_IDS
);

/** Subset of raster IDs that accept a lossy codec quality factor (0–1) in `filmLabExportEncode.js`. */
export const FILM_LAB_EXPORT_LOSSY_FORMAT_IDS = Object.freeze(['jpeg', 'webp', 'avif']);

export const FILM_LAB_EXPORT_LOSSY_FORMAT_SET = new Set(FILM_LAB_EXPORT_LOSSY_FORMAT_IDS);

const DEFAULT_LOSSY_QUALITY_BY_FORMAT = Object.freeze({
  jpeg: 0.95,
  webp: 0.92,
  avif: 0.9,
});

/**
 * @param {unknown} fileFormat
 * @param {string} [fallback='jpeg']
 */
export function normalizeFilmLabExportFileFormat(fileFormat, fallback = 'jpeg') {
  const id = typeof fileFormat === 'string' ? fileFormat.toLowerCase() : String(fileFormat ?? '').toLowerCase();
  return FILM_LAB_EXPORT_RASTER_FORMAT_SET.has(id) ? id : fallback;
}

/** PSD / DNG — eksperymentalne formaty modala (ten sam tor renderu co raster). */
export function normalizeFilmLabExportModalFileFormat(fileFormat, fallback = 'jpeg') {
  const id = typeof fileFormat === 'string' ? fileFormat.trim().toLowerCase() : '';
  if (id === 'psd') {
    return 'psd';
  }
  if (id === 'dng') {
    return 'dng';
  }
  return normalizeFilmLabExportFileFormat(fileFormat, fallback);
}

export function defaultFilmLabExportLossyQualityForFormat(fileFormat) {
  const id = normalizeFilmLabExportFileFormat(fileFormat);
  return DEFAULT_LOSSY_QUALITY_BY_FORMAT[id] ?? 0.92;
}

/**
 * Resolved lossy codec quality for manifest / recipe `export` payloads.
 * @param {unknown} fileFormat
 * @param {unknown} lossyQuality from UI; `undefined` uses per-format encoder default
 * @returns {number|undefined} omitted for PNG/TIFF
 */
export function manifestLossyQualityForFilmLabExport(fileFormat, lossyQuality) {
  const raw = typeof fileFormat === 'string' ? fileFormat.trim().toLowerCase() : '';
  if (raw === 'psd' || raw === 'dng') {
    return undefined;
  }
  const ff = normalizeFilmLabExportFileFormat(fileFormat);
  if (!FILM_LAB_EXPORT_LOSSY_FORMAT_SET.has(ff)) {
    return undefined;
  }
  if (typeof lossyQuality === 'number' && Number.isFinite(lossyQuality)) {
    return Math.min(1, Math.max(0.35, lossyQuality));
  }
  return defaultFilmLabExportLossyQualityForFormat(ff);
}
