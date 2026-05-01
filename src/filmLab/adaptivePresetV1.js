import { DEFAULT_ADJUSTMENTS } from './defaultAdjustments.js';
import { analyzeLocalMaskAiAssistPresetSync } from './localMaskAiAssistCore.js';

export { analyzeLocalMaskAiAssistPresetSync };

export const ADAPTIVE_PRESET_V1_SCHEMA = 'mindfullens.adaptive-preset.v1';

/** Conservative allow-list: global develop + crop snapshot fields (no arbitrary nested execution). */
export const ADAPTIVE_PRESET_PATCH_KEYS = new Set([
  'strength',
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'level',
  'fade',
  'clarity',
  'dehaze',
  'temp',
  'tint',
  'showClipping',
  'saturation',
  'vibrance',
  'curveLumaMix',
  'userGrain',
  'userGrainSize',
  'userVignette',
  'cropZoom',
  'cropX',
  'cropY',
  'cropRectX',
  'cropRectY',
  'cropRectW',
  'cropRectH',
  'cropAspect',
  'cropOverlayMode',
  'cropOverlayOrientation',
  'rotation',
  'flipped',
]);

const SHALLOW_OBJECT_PATCH_KEYS = new Set(['userCurves']);

function deepMergePlain(target, patch) {
  if (!patch || typeof patch !== 'object') {
    return target;
  }
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] != null && !Array.isArray(out[k])) {
      out[k] = deepMergePlain(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param {unknown} textOrObject
 * @returns {{ ok: true, preset: object } | { ok: false, error: string }}
 */
export function parseAdaptivePresetV1(textOrObject) {
  try {
    let data = textOrObject;
    if (typeof textOrObject === 'string') {
      data = JSON.parse(textOrObject);
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'invalid_input' };
    }
    if (data.schema !== ADAPTIVE_PRESET_V1_SCHEMA) {
      return { ok: false, error: 'bad_schema' };
    }
    if (data.version !== 1) {
      return { ok: false, error: 'bad_version' };
    }
    const patch = data.patch && typeof data.patch === 'object' ? data.patch : {};
    const steps = Array.isArray(data.steps) ? data.steps : null;
    return {
      ok: true,
      preset: {
        schema: ADAPTIVE_PRESET_V1_SCHEMA,
        version: 1,
        patch,
        ...(steps ? { steps } : {}),
      },
    };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * @param {object} adjustments
 * @param {object} patch
 * @returns {object}
 */
export function applyAdaptivePresetPatch(adjustments, patch) {
  if (!adjustments || typeof adjustments !== 'object') {
    return { ...DEFAULT_ADJUSTMENTS };
  }
  if (!patch || typeof patch !== 'object') {
    return { ...adjustments };
  }
  const next = { ...adjustments };
  for (const key of Object.keys(patch)) {
    if (!ADAPTIVE_PRESET_PATCH_KEYS.has(key) && !SHALLOW_OBJECT_PATCH_KEYS.has(key)) {
      continue;
    }
    const pv = patch[key];
    if (SHALLOW_OBJECT_PATCH_KEYS.has(key) && pv && typeof pv === 'object' && !Array.isArray(pv)) {
      const cur = next[key] && typeof next[key] === 'object' ? next[key] : {};
      next[key] = deepMergePlain(cur, pv);
      continue;
    }
    if (ADAPTIVE_PRESET_PATCH_KEYS.has(key)) {
      next[key] = pv;
    }
  }
  return next;
}

/**
 * @param {object} adjustments
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function activeCropRectNormFromAdjustments(adjustments) {
  return {
    x: Number(adjustments?.cropRectX ?? 0),
    y: Number(adjustments?.cropRectY ?? 0),
    w: Number(adjustments?.cropRectW ?? 1),
    h: Number(adjustments?.cropRectH ?? 1),
  };
}

/**
 * Re-export usage: refresh ai-assist sky/subject masks using sync heuristic analysis.
 *
 * @param {object} adjustments
 * @param {{ x: number, y: number, w: number, h: number } | null | undefined} activeCropRectNorm
 * @returns {object}
 */
export function recomputeAiAssistMasksHeuristic(adjustments, activeCropRectNorm) {
  const crop = activeCropRectNorm ?? activeCropRectNormFromAdjustments(adjustments);
  const stack = Array.isArray(adjustments?.localMasks) ? [...adjustments.localMasks] : [];
  let assistOrdinal = 0;
  for (let i = 0; i < stack.length; i += 1) {
    const entry = stack[i];
    if (!entry || entry.source !== 'ai-assist') continue;
    const kind = entry.ai?.kind;
    if (kind !== 'sky' && kind !== 'subject') continue;
    const { mask } = analyzeLocalMaskAiAssistPresetSync({
      kind,
      maskIndex: assistOrdinal,
      activeCropRectNorm: crop,
    });
    stack[i] = {
      ...mask,
      name: entry.name,
    };
    assistOrdinal += 1;
  }
  return { ...adjustments, localMasks: stack };
}

/**
 * @param {object} adjustments
 * @param {object} preset — normalized from `parseAdaptivePresetV1` (`.preset`)
 * @param {{ x: number, y: number, w: number, h: number } | null | undefined} activeCropRectNorm
 * @returns {object}
 */
export function applyAdaptivePresetV1Steps(adjustments, preset, activeCropRectNorm) {
  let next = { ...adjustments };
  const steps = Array.isArray(preset?.steps)
    ? preset.steps
    : [{ type: 'setPatch', patch: preset?.patch ?? {} }];

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const type = String(step.type ?? '');
    if (type === 'setPatch') {
      next = applyAdaptivePresetPatch(next, step.patch ?? {});
    } else if (type === 'recomputeAiMasks') {
      next = recomputeAiAssistMasksHeuristic(next, activeCropRectNorm);
    }
  }
  return next;
}
