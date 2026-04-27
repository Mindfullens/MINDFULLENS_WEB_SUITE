/**
 * Kopiowanie pikseli RGBA8 z prostokąta kafla do pełnego bufora wyjścia (wiersz po wierszu).
 * @param {Uint8ClampedArray} out — `fullW * fullH * 4`
 * @param {number} fullW
 * @param {number} originX
 * @param {number} originY
 * @param {number} tileW
 * @param {number} tileH
 * @param {Uint8ClampedArray} src — `tileW * tileH * 4`
 */
export function copyRgba8TileIntoBuffer(out, fullW, originX, originY, tileW, tileH, src) {
  const rowBytes = tileW * 4;
  for (let row = 0; row < tileH; row += 1) {
    const dstOff = ((originY + row) * fullW + originX) * 4;
    const srcOff = row * rowBytes;
    out.set(src.subarray(srcOff, srcOff + rowBytes), dstOff);
  }
}

/**
 * WebGL `readPixels` zwraca pierwszy wiersz pamięci = dół obrazu; ta funkcja
 * odraca w miejscu do kolejności wierszy jak w Canvas (`getImageData` / góra→dół).
 * @param {Uint8ClampedArray} rgba — `w * h * 4`
 * @param {number} w
 * @param {number} h
 */
export function flipRgba8ImageYInPlace(rgba, w, h) {
  if (h < 2) {
    return;
  }
  const rowBytes = w * 4;
  const u8 = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const tmp = new Uint8Array(rowBytes);
  const half = h >> 1;
  for (let y = 0; y < half; y += 1) {
    const top = y * rowBytes;
    const bot = (h - 1 - y) * rowBytes;
    tmp.set(u8.subarray(top, top + rowBytes));
    u8.copyWithin(top, bot, bot + rowBytes);
    u8.set(tmp, bot);
  }
}

/**
 * Odczyt `copyTextureToBuffer` (wiersz 256B) → gęste RGBA8 (jak `getImageData`).
 * @param {ArrayBuffer} ab
 * @param {number} byteOffset
 * @param {number} w
 * @param {number} h
 * @param {number} bytesPerRow
 * @param {boolean} isBgra — `bgra8unorm` w buforze to BGRA, zamień na RGBA
 * @returns {Uint8ClampedArray}
 */
export function tightRgba8FromPaddedReadback(ab, byteOffset, w, h, bytesPerRow, isBgra) {
  const out = new Uint8ClampedArray(w * h * 4);
  const src = new Uint8Array(ab, byteOffset);
  const tight = w * 4;
  for (let y = 0; y < h; y += 1) {
    out.set(src.subarray(y * bytesPerRow, y * bytesPerRow + tight), y * tight);
  }
  if (isBgra) {
    for (let i = 0; i < out.length; i += 4) {
      const t = out[i];
      out[i] = out[i + 2];
      out[i + 2] = t;
    }
  }
  return out;
}
