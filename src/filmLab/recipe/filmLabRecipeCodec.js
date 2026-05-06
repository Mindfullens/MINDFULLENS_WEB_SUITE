import { buildAiIndexFromAdjustments } from './filmLabRecipeAiIndex.js';
import { buildRecipeEnvelopeMeta } from './filmLabRecipeMeta.js';
import {
  buildMaskGraphsFromAdjustments,
  buildRecipeLayersEnvelopeFromAdjustments,
} from './filmLabRecipeMaskProjection.js';
import { buildRecipeStatsFromAdjustments } from './filmLabRecipeStats.js';
import { fingerprintRecipeDocumentStable } from './filmLabRecipeFingerprint.js';

/**
 * Recipe document model — persistence envelope for Film Lab edits.
 *
 * Legacy sessions stored a flat snapshot at `recipe`. V1 wraps the same global state
 * under `global` and reserves `maskGraphs`, `layers`, `aiIndex` for the roadmap.
 *
 * @typedef {1} FilmLabRecipeFormatVersion
 */

/** @type {FilmLabRecipeFormatVersion} */
export const FILMLAB_RECIPE_FORMAT_VERSION = 1;

export const FILMLAB_RECIPE_ENGINE_ID = 'mindfullens-film-lab';

/**
 * Top-level persisted recipe (IndexedDB session, future sidecar JSON).
 *
 * @typedef {object} FilmLabRecipeDocumentV1
 * @property {FilmLabRecipeFormatVersion} formatVersion
 * @property {typeof FILMLAB_RECIPE_ENGINE_ID} engine
 * @property {FilmLabRecipeGlobalSlice} global — develop look + viewport (today’s flat snapshot core)
 * @property {FilmLabMaskGraph[]} maskGraphs — node graphs (targets HME); empty until wired
 * @property {FilmLabAdjustmentLayer[]} layers — ordered stack; empty until wired
 * @property {Record<string, unknown>} aiIndex — semantic hints / lazy AI masks; stub
 * @property {object} [meta] — encoder stamp + czas zapisu
 * @property {object} [recipeStats] — liczniki slotów / warstw / stroke (invalidacja, batch)
 * @property {unknown[]} [history] — miejsce na przyszłe recipe-level history pointers
 */

/**
 * Slice that maps 1:1 to today’s `createSnapshot` output (minus transient `sourceRestoreFile`).
 *
 * @typedef {object} FilmLabRecipeGlobalSlice
 * @property {number} activeFilmIndex
 * @property {object} adjustments
 * @property {object} userCurves
 * @property {object} colorMixer
 * @property {object} colorGrading
 * @property {object} colorCalibration
 * @property {number} zoom
 * @property {{ x: number, y: number }} panOffset
 */

/** @typedef {object} FilmLabMaskGraph — placeholder for mask-as-graph */
/** @typedef {object} FilmLabAdjustmentLayer — placeholder for layer + mask ref */

/**
 * @param {unknown} value
 * @returns {value is FilmLabRecipeDocumentV1}
 */
export function isFilmLabRecipeDocumentV1(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    value.formatVersion === FILMLAB_RECIPE_FORMAT_VERSION &&
    value.engine === FILMLAB_RECIPE_ENGINE_ID &&
    typeof value.global === 'object' &&
    value.global != null
  );
}

/**
 * Wrap a flat workbench snapshot (from `createSnapshot` / `captureCurrentSnapshot`) for storage.
 * Strips `sourceRestoreFile` — bytes live beside the recipe in session payload.
 *
 * @param {object} flatSnapshot
 * @returns {FilmLabRecipeDocumentV1}
 */
export function encodeFlatSnapshotToRecipeDocument(flatSnapshot) {
  if (!flatSnapshot || typeof flatSnapshot !== 'object') {
    return createEmptyRecipeDocument();
  }

  const {
    activeFilmIndex,
    adjustments,
    userCurves,
    colorMixer,
    colorGrading,
    colorCalibration,
    zoom,
    panOffset,
  } = flatSnapshot;

  const adj = adjustments && typeof adjustments === 'object' ? adjustments : {};

  const document = {
    formatVersion: FILMLAB_RECIPE_FORMAT_VERSION,
    engine: FILMLAB_RECIPE_ENGINE_ID,
    global: {
      activeFilmIndex: Number.isInteger(activeFilmIndex) ? activeFilmIndex : 0,
      adjustments: adj,
      userCurves: userCurves && typeof userCurves === 'object' ? userCurves : {},
      colorMixer: colorMixer && typeof colorMixer === 'object' ? colorMixer : {},
      colorGrading: colorGrading && typeof colorGrading === 'object' ? colorGrading : {},
      colorCalibration: colorCalibration && typeof colorCalibration === 'object' ? colorCalibration : {},
      zoom: typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
      panOffset:
        panOffset && typeof panOffset === 'object'
          ? {
              x: Number.isFinite(Number(panOffset.x)) ? Number(panOffset.x) : 0,
              y: Number.isFinite(Number(panOffset.y)) ? Number(panOffset.y) : 0,
            }
          : { x: 0, y: 0 },
    },
    maskGraphs: buildMaskGraphsFromAdjustments(adj),
    layers: buildRecipeLayersEnvelopeFromAdjustments(adj),
    aiIndex: buildAiIndexFromAdjustments(adj),
    meta: buildRecipeEnvelopeMeta(),
    recipeStats: buildRecipeStatsFromAdjustments(adj),
    history: [],
  };
  const fingerprintStable = fingerprintRecipeDocumentStable(document);
  document.meta = {
    ...(document.meta && typeof document.meta === 'object' ? document.meta : {}),
    fingerprintAlgorithm: 'djb2-stable-v1',
    fingerprintStable,
  };
  return document;
}

function createEmptyRecipeDocument() {
  const document = {
    formatVersion: FILMLAB_RECIPE_FORMAT_VERSION,
    engine: FILMLAB_RECIPE_ENGINE_ID,
    global: {
      activeFilmIndex: 0,
      adjustments: {},
      userCurves: {},
      colorMixer: {},
      colorGrading: {},
      colorCalibration: {},
      zoom: 1,
      panOffset: { x: 0, y: 0 },
    },
    maskGraphs: buildMaskGraphsFromAdjustments({}),
    layers: buildRecipeLayersEnvelopeFromAdjustments({}),
    aiIndex: buildAiIndexFromAdjustments({}),
    meta: buildRecipeEnvelopeMeta(),
    recipeStats: buildRecipeStatsFromAdjustments({}),
    history: [],
  };
  const fingerprintStable = fingerprintRecipeDocumentStable(document);
  document.meta = {
    ...(document.meta && typeof document.meta === 'object' ? document.meta : {}),
    fingerprintAlgorithm: 'djb2-stable-v1',
    fingerprintStable,
  };
  return document;
}

/**
 * Decode stored `recipe` to a flat snapshot suitable for `cloneSnapshotSafe` / `restoreSnapshot`.
 * Supports legacy flat objects (no envelope) and V1 documents.
 *
 * @param {unknown} recipe
 * @returns {object | null} flat snapshot fields, or null
 */
export function decodeRecipeToFlatSnapshot(recipe) {
  if (!recipe || typeof recipe !== 'object') {
    return null;
  }

  if (isFilmLabRecipeDocumentV1(recipe)) {
    return { ...recipe.global };
  }

  return { ...recipe };
}
