/**
 * Konwersja RGBA8 (sRGB 0..255) → współrzędne half-float (LE) do `texImage2D` / `texImage3D` z `gl.HALF_FLOAT`.
 * Wspólna dla szybkiego podglądu, `webgl2Rgba16f3dLutProbe` i `proxyGpuRenderer` (§5.1.1.1).
 * @param {Uint8Array} rgba Długość wielokrotność 4.
 * @returns {Uint16Array | null}
 */
export function u8RgbaToHalfFloatRgbaForTexImage(rgba) {
  if (typeof DataView === 'undefined' || typeof DataView.prototype.setFloat16 !== 'function') {
    return null;
  }
  const out = new DataView(new ArrayBuffer((rgba.length / 4) * 8));
  let o = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    out.setFloat16(o, rgba[i] / 255, true);
    out.setFloat16(o + 2, rgba[i + 1] / 255, true);
    out.setFloat16(o + 4, rgba[i + 2] / 255, true);
    out.setFloat16(o + 6, rgba[i + 3] / 255, true);
    o += 8;
  }
  return new Uint16Array(out.buffer);
}
