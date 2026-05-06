/**
 * Applies UI `adjustmentBindings` for tone/mask rendering (ENGINE contract).
 * MVP: **exposure** pinned to `mask_slot_{n}` → global exposure cleared; delta merged into that mask slot / live brush exposure.
 */

/**
 * @param {string | undefined} nodeId e.g. `mask_slot_0`
 * @returns {number | null}
 */
export function parseMaskSlotIndexFromNodeId(nodeId) {
  const s = String(nodeId ?? '').trim();
  const m = /^mask_slot_(\d+)$/.exec(s);
  if (!m) {
    return null;
  }
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

/**
 * @param {object | null | undefined} adjustments
 * @returns {object}
 */
export function applyAdjustmentBindingsForTonePipeline(adjustments) {
  if (!adjustments || typeof adjustments !== 'object') {
    return adjustments ?? {};
  }
  const bindings = Array.isArray(adjustments.adjustmentBindings) ? adjustments.adjustmentBindings : [];
  const exposureBind = bindings.find(
    (b) =>
      b &&
      typeof b === 'object' &&
      b.adjustmentKey === 'exposure' &&
      typeof b.maskGraphNodeId === 'string' &&
      b.maskGraphNodeId.trim() !== ''
  );
  if (!exposureBind) {
    return adjustments;
  }

  const slot = parseMaskSlotIndexFromNodeId(exposureBind.maskGraphNodeId);
  if (slot == null) {
    return adjustments;
  }

  const delta = Number(adjustments.exposure ?? 0);
  const next = { ...adjustments, exposure: 0 };
  const lm = Array.isArray(next.localMasks) ? [...next.localMasks] : [];

  if (lm[slot]) {
    const row = { ...lm[slot] };
    row.exposure = Number(row.exposure ?? 0) + delta;
    lm[slot] = row;
    return { ...next, localMasks: lm };
  }

  const active = Math.max(0, Math.round(Number(next.activeLocalMaskIndex ?? 0)));
  if (slot === active) {
    return {
      ...next,
      brushMaskExposure: Number(next.brushMaskExposure ?? 0) + delta,
    };
  }

  return adjustments;
}
