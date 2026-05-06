/** Zgodnie z parserem TIFF: małe JPEG-y z IFD1 (Compression 6) są akceptowalne. */
const MIN_PREVIEW_ATTEMPT_BYTES = 64;

/**
 * Wspólna kolejność prób dekodowania slice’ów TIFF/JPEG (worker + import embedded).
 * @param {ArrayBuffer | null | undefined} primary
 * @param {ArrayBuffer[] | null | undefined} fallbacks
 * @returns {ArrayBuffer[]}
 */
export function orderTiffJpegDecodeAttempts(primary, fallbacks) {
  const keys = new Set();
  /** @type {ArrayBuffer[]} */
  const ordered = [];
  const keyOf = (ab) => {
    const z = new Uint8Array(ab);
    return `${ab.byteLength}:${Array.from(z.slice(0, 48)).join(',')}`;
  };
  const push = (buf) => {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < MIN_PREVIEW_ATTEMPT_BYTES) {
      return;
    }
    const k = keyOf(buf);
    if (keys.has(k)) {
      return;
    }
    keys.add(k);
    ordered.push(buf);
  };
  push(primary);
  const fb = Array.isArray(fallbacks) ? [...fallbacks] : [];
  fb.sort((a, b) => a.byteLength - b.byteLength);
  for (const b of fb) {
    push(b);
  }
  return ordered;
}
