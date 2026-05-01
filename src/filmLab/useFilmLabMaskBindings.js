import { parseMaskSlotIndexFromNodeId } from './maskAdjustmentBindingApply.js';

/**
 * Active mask slot index → graph node id (`mask_slot_{n}`) used by slider pin UI.
 *
 * @param {object | null | undefined} adjustments
 * @returns {string}
 */
export function getActiveMaskSlotGraphNodeId(adjustments) {
  const maskIdx = Number.isFinite(Number(adjustments?.activeLocalMaskIndex))
    ? Math.round(Number(adjustments.activeLocalMaskIndex))
    : 0;
  return `mask_slot_${Math.max(0, maskIdx)}`;
}

/**
 * @param {object | null | undefined} adjustments
 * @param {string} adjustmentKey
 * @returns {boolean}
 */
export function isAdjustmentBoundToMask(adjustments, adjustmentKey) {
  const bindings = Array.isArray(adjustments?.adjustmentBindings) ? adjustments.adjustmentBindings : [];
  return bindings.some((b) => b && typeof b === 'object' && b.adjustmentKey === adjustmentKey);
}

/**
 * @param {object | null | undefined} adjustments
 * @param {string} adjustmentKey
 * @param {function(string, unknown): void} updateAdjustment
 */
export function toggleAdjustmentMaskBinding(adjustments, adjustmentKey, updateAdjustment) {
  if (typeof updateAdjustment !== 'function') {
    return;
  }
  const bindings = Array.isArray(adjustments?.adjustmentBindings) ? [...adjustments.adjustmentBindings] : [];
  const nodeId = getActiveMaskSlotGraphNodeId(adjustments);
  const idx = bindings.findIndex((b) => b && typeof b === 'object' && b.adjustmentKey === adjustmentKey);
  const already = idx >= 0;

  if (already) {
    bindings.splice(idx, 1);
  } else {
    bindings.push({
      version: 1,
      adjustmentKey,
      maskGraphNodeId: nodeId,
    });
  }
  updateAdjustment('adjustmentBindings', bindings);
}

export { parseMaskSlotIndexFromNodeId };
