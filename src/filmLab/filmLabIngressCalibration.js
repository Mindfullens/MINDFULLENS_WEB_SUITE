/**
 * Epik A (Panel I): kalibracja wejścia — format kadra, push/pull, pomarańczowa maska (negatyw).
 * Epik C (Panel III): chemia błony — kształt H&D (cienki bias), reciprocity, ostrość krawędzi → Clarity.
 *
 * `mergeIngressCalibrationIntoAdjustments` zwraca **kopię** — nie mutuje stanu React.
 *
 * Backlog (silnik): integral mask levels I–III jako osobny graf maski; D-min/D-max jako densytometria
 * zamiast proxy na Blacks/Whites; pełna krzywa Schwarzschild z czasem ekspozycji; konwolucyjny MTF zamiast Clarity.
 */

/** @typedef {'35mm'|'120'|'4x5'|'8x10'|'digital'} FilmFormatId */

export const FILM_FORMAT_IDS = Object.freeze(['35mm', '120', '4x5', '8x10', 'digital']);

/** Skala względem 35 mm — ziarno / halacja / aberracja (optyka „większego formatu”). */
const FORMAT_SCALE = Object.freeze({
  '35mm': { grainSize: 1, halRadius: 1, chromAb: 1 },
  /** 120: większy negatyw → nieco większe ziarno i szersza halacja */
  '120': { grainSize: 1.12, halRadius: 1.08, chromAb: 1.05 },
  '4x5': { grainSize: 1.22, halRadius: 1.12, chromAb: 1.08 },
  '8x10': { grainSize: 1.35, halRadius: 1.18, chromAb: 1.12 },
  /** „Cyfrowe źródło” — nieco mniejszy wpływ analogowych skal (nadajesz wygląd bez dużego negatywu). */
  digital: { grainSize: 0.92, halRadius: 0.95, chromAb: 0.9 },
});

/** ~1 EV na jednostkę push/pull na skali ekspozycji Develop (-100…100). */
export const PUSH_PULL_UNITS_PER_EV = 34;

/** @typedef {'linear'|'log'|'s_curve'} FilmToneResponseShape */

export const FILM_TONE_RESPONSE_SHAPES = Object.freeze(['linear', 'log', 's_curve']);

/**
 * Profil „H&D” jako delikatny bias na `curveLumaMix` (RGB vs luma) — bez osobnego modelu densytometrii.
 *
 * @param {unknown} raw
 * @returns {FilmToneResponseShape}
 */
export function normalizeFilmToneResponseShape(raw) {
  const s = String(raw ?? 'linear')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (s === 'log') {
    return 'log';
  }
  if (s === 's_curve' || s === 'scurve') {
    return 's_curve';
  }
  return 'linear';
}

/**
 * @param {unknown} id
 * @returns {keyof typeof FORMAT_SCALE}
 */
export function normalizeFilmFormatId(id) {
  const s = String(id ?? '').trim();
  return FILM_FORMAT_IDS.includes(s) ? s : '35mm';
}

/**
 * Mapowanie polityki RAW → opcje LibRaw `open` (worker WASM).
 * `auto` = zachowanie jak dotąd (ENV / domyślne).
 *
 * @typedef {'auto'|'camera_embed'|'generic_matrix'} RawColorimetryPolicy
 */

/**
 * @param {unknown} policy
 * @returns {RawColorimetryPolicy}
 */
export function normalizeRawColorimetryPolicy(policy) {
  const p = String(policy ?? 'auto').trim().toLowerCase();
  if (p === 'camera_embed' || p === 'generic_matrix') {
    return p;
  }
  return 'auto';
}

/**
 * @param {RawColorimetryPolicy} policy
 * @returns {{ useCameraMatrix?: number; cameraProfile?: string } | null}
 */
export function librawOpenOptsFromColorimetryPolicy(policy) {
  const p = normalizeRawColorimetryPolicy(policy);
  if (p === 'auto') {
    return null;
  }
  if (p === 'camera_embed') {
    return { useCameraMatrix: 3, cameraProfile: 'embed' };
  }
  /** generic_matrix — mniej agresywna macierz aparatu (fallback kolorymetryczny). */
  return { useCameraMatrix: 0 };
}

/**
 * @param {object | null | undefined} adjustments
 * @returns {object}
 */
export function mergeIngressCalibrationIntoAdjustments(adjustments) {
  if (!adjustments || typeof adjustments !== 'object') {
    return adjustments ?? {};
  }

  const out = { ...adjustments };
  const fmt = normalizeFilmFormatId(out.filmFormatId);
  out.filmFormatId = fmt;

  const sc = FORMAT_SCALE[fmt] ?? FORMAT_SCALE['35mm'];

  let gs = Number(out.userGrainSize ?? 10);
  gs = Math.round(Math.min(100, Math.max(10, gs * sc.grainSize)));
  out.userGrainSize = gs;

  let hr = Number(out.halRadius ?? 30);
  hr = Math.round(Math.min(80, Math.max(5, hr * sc.halRadius)));
  out.halRadius = hr;

  let cab = Number(out.chromAb ?? 0);
  cab = Math.min(100, Math.max(0, cab * sc.chromAb));
  out.chromAb = cab;

  const ev = clamp(Number(out.pushPullEv ?? 0), -3, 3);
  out.pushPullEv = ev;
  out.exposure = Number(out.exposure ?? 0) + ev * PUSH_PULL_UNITS_PER_EV;

  let ug = Number(out.userGrain ?? 0);
  ug = Math.min(100, Math.max(0, ug + Math.abs(ev) * 6));
  out.userGrain = ug;

  const workflow = String(out.inputWorkflowMode ?? 'digital') === 'negative_film' ? 'negative_film' : 'digital';
  out.inputWorkflowMode = workflow;

  if (workflow === 'negative_film') {
    const om = clamp(Number(out.orangeMaskCorrection ?? 0), 0, 100) / 100;
    out.temp = Number(out.temp ?? 0) - om * 28;
    out.tint = Number(out.tint ?? 0) - om * 18;
  }

  const toneShape = normalizeFilmToneResponseShape(out.filmToneResponseShape);
  out.filmToneResponseShape = toneShape;
  let clm = Number(out.curveLumaMix ?? 72);
  if (!Number.isFinite(clm)) {
    clm = 72;
  }
  if (toneShape === 'log') {
    clm = Math.min(100, clm + 14);
  } else if (toneShape === 's_curve') {
    clm = Math.max(0, clm - 10);
  }
  out.curveLumaMix = clm;

  const reciprocity = clamp(Number(out.emulsionReciprocityComp ?? 0), 0, 100);
  out.emulsionReciprocityComp = reciprocity;
  if (reciprocity > 0) {
    const extraEv = (reciprocity / 100) * 0.55;
    out.exposure = Number(out.exposure ?? 0) + extraEv * PUSH_PULL_UNITS_PER_EV;
  }

  const edgeAc = clamp(Number(out.emulsionEdgeAcutance ?? 0), 0, 100);
  out.emulsionEdgeAcutance = edgeAc;
  if (edgeAc > 0) {
    out.clarity = Number(out.clarity ?? 0) + edgeAc * 0.42;
  }

  return out;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
