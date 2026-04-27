/** Shared 3D LUT (RGB cube) bounds for main thread ↔ proxy worker transfer. */

export const CUBE_LUT_MIN_DIMENSION = 2;
export const CUBE_LUT_MAX_DIMENSION = 256;
export const CUBE_LUT_MAX_BYTES = 64 * 1024 * 1024;

/**
 * @param {number} size
 * @returns {number | null} RGB byte length (size³×3) or null if out of range / non-finite
 */
export function expectedCubeLutRgbByteLength(size) {
  const dim = Math.round(Number(size)) || 0;
  if (!Number.isFinite(dim)) {
    return null;
  }
  if (dim < CUBE_LUT_MIN_DIMENSION || dim > CUBE_LUT_MAX_DIMENSION) {
    return null;
  }
  const cube = dim * dim * dim;
  if (!Number.isFinite(cube)) {
    return null;
  }
  const total = cube * 3;
  if (!Number.isFinite(total) || total > CUBE_LUT_MAX_BYTES) {
    return null;
  }
  return total;
}

/**
 * Validates a cube LUT object before ArrayBuffer transfer to the proxy worker (F0.6).
 * @param {unknown} lut
 * @returns {{ size: number, srgbData: Uint8Array } | null}
 */
export function validateCubeLutSrgbForWorkerTransfer(lut) {
  if (!lut || typeof lut !== 'object') {
    return null;
  }
  const rawSize = Number(lut.size);
  if (!Number.isFinite(rawSize)) {
    return null;
  }
  const size = Math.round(rawSize);
  const expectedLength = expectedCubeLutRgbByteLength(size);
  if (expectedLength == null) {
    return null;
  }
  const dataCandidate = lut.srgbData ?? lut.data ?? null;
  const typedData =
    dataCandidate instanceof Uint8Array
      ? dataCandidate
      : dataCandidate instanceof Uint8ClampedArray
        ? new Uint8Array(dataCandidate.buffer, dataCandidate.byteOffset, dataCandidate.byteLength)
        : null;
  if (!typedData || typedData.length !== expectedLength) {
    return null;
  }
  return { size, srgbData: typedData };
}
