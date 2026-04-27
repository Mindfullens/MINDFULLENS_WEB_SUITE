/**
 * RGBA8 full-frame size helpers (worker ↔ main thread guard).
 */

/**
 * @param {number} width
 * @param {number} height
 * @returns {number} Non-negative byte length; 0 if dimensions invalid.
 */
export function expectedRgbaImageDataByteLength(width, height) {
  return Math.max(0, (Number(width) || 0) * (Number(height) || 0) * 4);
}

/**
 * @param {unknown} payload ArrayBuffer, SharedArrayBuffer, or ArrayBufferView
 * @returns {number}
 */
export function getRgbaBufferByteLength(payload) {
  if (!payload) {
    return 0;
  }
  if (payload instanceof ArrayBuffer) {
    return payload.byteLength;
  }
  if (typeof SharedArrayBuffer === 'function' && payload instanceof SharedArrayBuffer) {
    return payload.byteLength;
  }
  if (typeof payload === 'object' && 'byteLength' in payload) {
    const n = Number(payload.byteLength);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}
