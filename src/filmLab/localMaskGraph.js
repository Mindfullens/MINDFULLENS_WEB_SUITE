/** Mask graph v0 — pixel weights combined before a single local exposure pass. */

export const LOCAL_MASK_GRAPH_OPS = ['union', 'intersect', 'subtract', 'invert', 'replace', 'protect'];

export function normalizeLocalMaskGraphOp(raw) {
  const s = String(raw ?? 'intersect').toLowerCase();
  return LOCAL_MASK_GRAPH_OPS.includes(s) ? s : 'intersect';
}

/**
 * @param {number} a
 * @param {number} b
 * @param {string} op — `union` = ADD, `intersect`, `subtract`, `invert`, `replace`, `protect` (A·(1−B))
 */
export function combineLocalMaskGraphWeights(a, b, op) {
  const x = Math.max(0, Math.min(1, Number(a)));
  const y = Math.max(0, Math.min(1, Number(b)));
  if (op === 'subtract') {
    return Math.max(0, Math.min(1, x - y));
  }
  if (op === 'intersect') {
    return Math.min(x, y);
  }
  if (op === 'invert') {
    return Math.max(0, Math.min(1, 1 - Math.min(x, y)));
  }
  if (op === 'replace') {
    return y;
  }
  if (op === 'protect') {
    return Math.max(0, Math.min(1, x * (1 - y)));
  }
  return Math.max(x, y);
}
