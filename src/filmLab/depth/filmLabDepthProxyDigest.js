/**
 * Skrót stabilny dla invalidacji cache maski głębi (bufor Float32 0–1).
 */

/**
 * @param {Float32Array} buf
 * @returns {string}
 */
export function hashDepthProxyFloat32(buf) {
  if (!(buf instanceof Float32Array) || buf.length === 0) {
    return 'empty';
  }
  let h = 2166136261;
  const step = Math.max(1, Math.floor(buf.length / 4096));
  for (let i = 0; i < buf.length; i += step) {
    const v = buf[i];
    const x = Math.round(Number(v) * 1e6);
    h ^= x;
    h = Math.imul(h, 16777619);
  }
  return `${buf.length}:${(h >>> 0).toString(16)}`;
}

/**
 * Lekki „odcisk” ramki RGBA do debouncingu inferencji (nie kryptograficzny).
 *
 * @param {ImageData} imageData
 * @returns {string}
 */
export function fingerprintImageDataSample(imageData) {
  const d = imageData?.data;
  if (!(d instanceof Uint8ClampedArray) || d.length < 16) {
    return '0';
  }
  let h = 2166136261;
  const step = Math.max(48, Math.floor(d.length / 8192));
  for (let i = 0; i < d.length; i += step) {
    h ^= d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
