/**
 * Minimal uncompressed RGB TIFF (Baseline TIFF 6.0, single strip).
 * Browser Canvas does not emit TIFF; used for Film-Lab archive / print handoff.
 */

function packRgbFromImageData(imageData) {
  const { width, height, data } = imageData;
  const n = width * height;
  const rgb = new Uint8Array(n * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return rgb;
}

/**
 * @param {ImageData} imageData
 * @returns {Uint8Array}
 */
export function imageDataToUncompressedRgbTiff(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const rgb = packRgbFromImageData(imageData);
  const stripByteCount = rgb.byteLength;

  const numEntries = 12;
  const ifdOffset = 8;
  const ifdSize = 2 + numEntries * 12 + 4;
  const auxStart = ifdOffset + ifdSize;
  const bitsPerSampleOff = auxStart;
  const xResOff = bitsPerSampleOff + 6;
  const yResOff = xResOff + 8;
  const imageDataOff = yResOff + 8;

  const totalSize = imageDataOff + stripByteCount;
  const buffer = new ArrayBuffer(totalSize);
  const out = new Uint8Array(buffer);
  const dv = new DataView(buffer);

  out[0] = 0x49;
  out[1] = 0x49;
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifdOffset, true);

  let p = ifdOffset;
  dv.setUint16(p, numEntries, true);
  p += 2;

  const wLE = (tag, type, count, value) => {
    dv.setUint16(p, tag, true);
    dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, count, true);
    dv.setUint32(p + 8, value, true);
    p += 12;
  };

  // Type 3 = SHORT, 4 = LONG, 5 = RATIONAL
  wLE(256, 4, 1, width);
  wLE(257, 4, 1, height);
  wLE(258, 3, 3, bitsPerSampleOff);
  wLE(259, 3, 1, 1);
  wLE(262, 3, 1, 2);
  wLE(273, 4, 1, imageDataOff);
  wLE(277, 3, 1, 3);
  wLE(278, 4, 1, height);
  wLE(279, 4, 1, stripByteCount);
  wLE(282, 5, 1, xResOff);
  wLE(283, 5, 1, yResOff);
  wLE(296, 3, 1, 2);

  dv.setUint32(p, 0, true);

  dv.setUint16(bitsPerSampleOff, 8, true);
  dv.setUint16(bitsPerSampleOff + 2, 8, true);
  dv.setUint16(bitsPerSampleOff + 4, 8, true);

  dv.setUint32(xResOff, 72, true);
  dv.setUint32(xResOff + 4, 1, true);
  dv.setUint32(yResOff, 72, true);
  dv.setUint32(yResOff + 4, 1, true);

  out.set(rgb, imageDataOff);

  return out;
}
