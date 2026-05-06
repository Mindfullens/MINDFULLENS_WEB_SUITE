/**
 * Wyodrębnianie wbudowanych JPEG z bufora (np. plik RAW — createImageBitmap nie dekoduje całości).
 * Skanuje SOI (FFD8) i parsuje markery do EOI (FFD9), bez zewnętrznych zależności.
 */

function readU16be(u8, i) {
  return (u8[i] << 8) | u8[i + 1];
}

/**
 * Po SOS: dane entropijne do FF D9 (EOI); FF 00 = „stuffing”.
 * @param {Uint8Array} u8
 * @param {number} pos — pierwszy bajt po nagłówku SOS
 * @returns {number} indeks tuż za EOI lub u8.length
 */
function skipEntropyToEoi(u8, pos) {
  let i = pos;
  while (i < u8.length - 1) {
    if (u8[i] === 0xff) {
      const b = u8[i + 1];
      if (b === 0xd9) {
        return i + 2;
      }
      if (b === 0x00) {
        i += 2;
        continue;
      }
      if (b >= 0xd0 && b <= 0xd7) {
        i += 2;
        continue;
      }
    }
    i += 1;
  }
  return u8.length;
}

/**
 * Po SOI: skok do następnego markera (ITU T.81 — opcjonalne bajty wypełnienia 0xFF przed markiem).
 * Zwraca indeks pierwszego bajtu 0xFF rozpoczynającego marker (nie typ markera).
 */
function advanceToNextMarkerStart(u8, pos) {
  while (pos < u8.length - 1) {
    if (u8[pos] !== 0xff) {
      return null;
    }
    /** Wiele 0xFF z rzędu: pierwsze rozpoczyna marker, kolejne to „fill” przed typem. */
    while (pos + 1 < u8.length && u8[pos + 1] === 0xff) {
      pos += 1;
    }
    if (pos + 1 >= u8.length) {
      return null;
    }
    return pos;
  }
  return null;
}

/**
 * Jedna spójna ramka JPEG od SOI (offset `soi`) do końca EOI.
 * @returns {number | null} koniec wycinka (exclusive), jak w slice
 */
function findJpegEndAfterSoi(u8, soi) {
  if (soi >= u8.length - 1 || u8[soi] !== 0xff || u8[soi + 1] !== 0xd8) {
    return null;
  }
  let pos = soi + 2;
  while (pos < u8.length - 1) {
    const ms = advanceToNextMarkerStart(u8, pos);
    if (ms == null) {
      return null;
    }
    pos = ms;
    const m = u8[pos + 1];
    if (m === 0xd9) {
      return pos + 2;
    }
    if (m === 0xd8) {
      return null;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      pos += 2;
      continue;
    }
    if (m === 0xda) {
      if (pos + 3 >= u8.length) {
        return null;
      }
      const segLen = readU16be(u8, pos + 2);
      if (segLen < 2 || pos + 2 + segLen > u8.length) {
        return null;
      }
      pos += 2 + segLen;
      const after = skipEntropyToEoi(u8, pos);
      if (after < 2 || u8[after - 2] !== 0xff || u8[after - 1] !== 0xd9) {
        return null;
      }
      return after;
    }
    if (pos + 3 >= u8.length) {
      return null;
    }
    const segLen = readU16be(u8, pos + 2);
    if (segLen < 2 || pos + 2 + segLen > u8.length) {
      return null;
    }
    pos += 2 + segLen;
  }
  return null;
}

/**
 * Klasyfikuje jeden segment JPEG [soi, endExclusive) dla wyboru podglądu dekodowalnego w przeglądarce.
 * Odrzuca segment z pierwszym markerem SOF3 (`FF C3` po SOI) — lossless JPEG.
 * Preferuje SOF0 (`FF C0`) / SOF2 (`FF C2`) oraz pierwszy marker APP0 (`FF E0`) / APP1 (`FF E1`).
 * @param {Uint8Array} u8
 * @param {number} soi
 * @param {number} endExclusive
 */
function classifyEmbeddedJpegCandidate(u8, soi, endExclusive) {
  if (endExclusive - soi < 10 || u8[soi] !== 0xff || u8[soi + 1] !== 0xd8) {
    return { skip: true, score: -1 };
  }
  const msFirst = advanceToNextMarkerStart(u8, soi + 2);
  if (msFirst == null) {
    return { skip: true, score: -1 };
  }
  const firstM = u8[msFirst + 1];
  if (firstM === 0xc3) {
    return { skip: true, score: -1 };
  }
  let pos = soi + 2;
  let hasSof0OrSof2 = false;
  while (pos < endExclusive - 1) {
    const ms = advanceToNextMarkerStart(u8, pos);
    if (ms == null) {
      return { skip: true, score: -1 };
    }
    pos = ms;
    const m = u8[pos + 1];
    if (m === 0xd9) {
      break;
    }
    if (m === 0xd8) {
      return { skip: true, score: -1 };
    }
    if (m === 0xc0 || m === 0xc2) {
      hasSof0OrSof2 = true;
    }
    if (m === 0xda) {
      break;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      pos += 2;
      continue;
    }
    if (pos + 3 >= endExclusive) {
      break;
    }
    const segLen = readU16be(u8, pos + 2);
    if (segLen < 2 || pos + 2 + segLen > endExclusive) {
      break;
    }
    pos += 2 + segLen;
  }
  const preferredApp = firstM === 0xe0 || firstM === 0xe1;
  const len = endExclusive - soi;
  let score = len;
  if (hasSof0OrSof2) {
    score += 1e15;
  }
  if (preferredApp) {
    score += 1e12;
  }
  return { skip: false, score, hasSof0OrSof2, preferredApp, len };
}

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {ArrayBuffer | null} kopia zakresu lub null
 */
/** Większość podglądów JPEG jest w pierwszych ~40 MB pliku RAW — reszta rzadko potrzebna do miniatury. */
const MAX_RAW_JPEG_SCAN = 40 * 1024 * 1024;

/** SubIFDs (DNG / Adobe TIFF) — wskaźniki do dodatkowych IFD z podglądem JPEG. */
const TAG_SUB_IFDS = 0x014a;
/** StripOffsets — zapasowa ścieżka: pojedynczy strip = pełny JPEG od SOI. */
const TAG_STRIP_OFFSETS = 0x0111;
const TAG_STRIP_BYTE_COUNTS = 0x0117;
/** TileOffsets / TileByteCounts — Adobe DNG bywa kafelkowany zamiast stripów. */
const TAG_TILE_OFFSETS = 0x0144;
const TAG_TILE_BYTE_COUNTS = 0x0145;
/** Compression: 6 / 7 = JPEG w TIFF — reszta (1 uncompressed, 33003 lossless JPEG, …) omijamy przy szukaniu podglądu dla createImageBitmap. */
const TAG_COMPRESSION = 0x0103;
/** DefaultCropSize (Adobe DNG) — proporcje kadru do weryfikacji podglądu. */
const TAG_DEFAULT_CROP_SIZE = 0xc615;

/** Strip/kafelek JPEG w TIFF — nigdy nie dekoduj całego pliku RAW jako „strip”. */
const MAX_STRIP_DECODE_BYTES = 12 * 1024 * 1024;
/** JPEG TIFF (Compression 6/7): akceptuj małe miniatury IFD1 — lepszy mały podgląd niż pustka. */
const MIN_JPEG_STRIP_PREVIEW_BYTES = 64;

/** Preferuj podgląd „średniego” rozmiaru (Adobe DNG): nie thumb 20 KB, nie cały bufor RAW. */
const PREVIEW_JPEG_SWEET_MIN = 100 * 1024;
const PREVIEW_JPEG_SWEET_MAX = 5 * 1024 * 1024;

/**
 * @param {number} byteLen
 */
function previewJpegByteLengthMultiplier(byteLen) {
  const n = byteLen >>> 0;
  if (n >= PREVIEW_JPEG_SWEET_MIN && n <= PREVIEW_JPEG_SWEET_MAX) {
    return 8;
  }
  if (n < PREVIEW_JPEG_SWEET_MIN) {
    return 1;
  }
  return 1.15;
}

/**
 * Tag 0x0103 (Compression) z pojedynczego IFD.
 * @returns {number | null}
 */
function readCompressionTagFromIfd(u8, ifdOff, read16, read32, le, limit) {
  const n = read16(ifdOff);
  if (n < 1 || ifdOff + 2 + n * 12 > limit) {
    return null;
  }
  for (let e = 0; e < n; e += 1) {
    const ent = ifdOff + 2 + e * 12;
    const tag = read16(ent);
    if (tag !== TAG_COMPRESSION) {
      continue;
    }
    const typ = read16(ent + 2);
    const cnt = read32(ent + 4);
    const vo = ent + 8;
    if (typ === 3 && cnt === 1) {
      return le ? readU16Le(u8, vo) : readU16be(u8, vo);
    }
    if (typ === 4 && cnt === 1) {
      return read32(vo) >>> 0;
    }
  }
  return null;
}

/**
 * Tablica LONG / IFD / SLONG z wpisu IFD (typy 4, 13, 18); pojedyncza wartość inline, wiele — przez offset.
 * @param {Uint8Array} u8
 * @param {number} tiffStart
 * @param {number} ent
 * @param {boolean} le
 */
function readTiffLongArrayFromEntry(u8, tiffStart, ent, le) {
  const type = le ? readU16Le(u8, ent + 2) : readU16be(u8, ent + 2);
  const count = le ? readU32Le(u8, ent + 4) : readU32Be(u8, ent + 4);
  /** LONG (4), SLONG (9), IFD (13), „SLONG” (18) — offsety SubIFD w DNG/Adobe. */
  if ((type !== 4 && type !== 9 && type !== 13 && type !== 18) || count < 1 || count > 64) {
    return [];
  }
  const vo = ent + 8;
  const valueBytes = count * 4;
  const out = [];
  if (valueBytes <= 4) {
    const v0 = le ? readU32Le(u8, vo) : readU32Be(u8, vo);
    out.push(v0 >>> 0);
    return out;
  }
  const ptr = le ? readU32Le(u8, vo) : readU32Be(u8, vo);
  const base = tiffStart + (ptr >>> 0);
  if (base + count * 4 > u8.length) {
    return [];
  }
  for (let k = 0; k < count; k += 1) {
    const v = le ? readU32Le(u8, base + k * 4) : readU32Be(u8, base + k * 4);
    out.push(v >>> 0);
  }
  return out;
}

/**
 * Wskaźniki SubIFD (0x014A): zwykle LONG/IFD/SLONG; sporadycznie SHORT.
 * @param {Uint8Array} u8
 * @param {number} tiffStart
 * @param {number} ent
 * @param {boolean} le
 * @returns {number[]}
 */
function readSubIfdPointerArray(u8, tiffStart, ent, le) {
  const type = le ? readU16Le(u8, ent + 2) : readU16be(u8, ent + 2);
  const count = le ? readU32Le(u8, ent + 4) : readU32Be(u8, ent + 4);
  if (count < 1 || count > 64) {
    return [];
  }
  if (type === 4 || type === 9 || type === 13 || type === 18) {
    return readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
  }
  if (type !== 3) {
    return [];
  }
  const vo = ent + 8;
  const valueBytes = count * 2;
  const out = [];
  if (valueBytes <= 4) {
    for (let k = 0; k < count; k += 1) {
      const v = le ? readU16Le(u8, vo + k * 2) : readU16be(u8, vo + k * 2);
      out.push(v & 0xffff);
    }
    return out;
  }
  const ptr = le ? readU32Le(u8, vo) : readU32Be(u8, vo);
  const base = tiffStart + (ptr >>> 0);
  if (base + count * 2 > u8.length) {
    return [];
  }
  for (let k = 0; k < count; k += 1) {
    const v = le ? readU16Le(u8, base + k * 2) : readU16be(u8, base + k * 2);
    out.push(v & 0xffff);
  }
  return out;
}

/**
 * Przechodzi wszystkie IFD (0, SubIFD, łańcuch „next”) — wspólna kolejka BFS jak przy ekstrakcji JPEG.
 * `visitor(ifdRelOffset, visitIdx)` — `visitIdx` rośnie w kolejności odwiedzin (0 = pierwszy IFD).
 * @param {Uint8Array} u8
 * @param {(ifdRelOffset: number, visitIdx: number) => void | boolean} visitor — zwróć `false`, aby przerwać BFS
 */
function forEachRawTiffIfdRelativeOffset(u8, visitor) {
  if (u8.length < 8 || (u8[0] === 0xff && u8[1] === 0xd8)) {
    return;
  }
  const endian = tiffEndianAt(u8, 0);
  if (!endian) {
    return;
  }
  const { le } = endian;
  const read16 = le ? (i) => readU16Le(u8, i) : (i) => readU16be(u8, i);
  const read32 = le ? (i) => readU32Le(u8, i) : (i) => readU32Be(u8, i);
  if (read16(2) !== 0x002a) {
    return;
  }
  const tiffStart = 0;
  const limit = u8.length;
  const queue = [];
  const visited = new Set();
  const pushBack = (rel) => {
    const o = rel >>> 0;
    if (o < 8 || o + 2 > limit || visited.has(o)) {
      return;
    }
    visited.add(o);
    queue.push(o);
  };
  const pushFront = (rel) => {
    const o = rel >>> 0;
    if (o < 8 || o + 2 > limit || visited.has(o)) {
      return;
    }
    visited.add(o);
    queue.unshift(o);
  };
  pushBack(read32(4));
  let hops = 0;
  let visitIdx = 0;
  while (queue.length > 0 && hops < 420) {
    hops += 1;
    const ifdOff = queue.shift();
    if (ifdOff == null) {
      break;
    }
    const n = read16(ifdOff);
    if (n < 1 || n > 512 || ifdOff + 2 + n * 12 > limit) {
      continue;
    }
    const keepGoing = visitor(ifdOff, visitIdx);
    visitIdx += 1;
    if (keepGoing === false) {
      break;
    }
    for (let e = 0; e < n; e += 1) {
      const ent = ifdOff + 2 + e * 12;
      const tag = read16(ent);
      if (tag === TAG_SUB_IFDS) {
        const subs = readSubIfdPointerArray(u8, tiffStart, ent, le);
        for (let s = subs.length - 1; s >= 0; s -= 1) {
          pushFront(subs[s]);
        }
      }
    }
    const nextPtr = ifdOff + 2 + n * 12;
    if (nextPtr + 4 <= limit) {
      const nextIfd = read32(nextPtr);
      if (nextIfd !== 0) {
        pushBack(nextIfd);
      }
    }
  }
}

/**
 * Zbiera wycinki stripów z jednego IFD (pojedyncze lub scalone).
 * @returns {Array<{ off: number; len: number } | { buffer: ArrayBuffer }>}
 */
function collectTiffStripSlicesFromIfd(u8, tiffStart, ifdOff, read16, read32, le, limit) {
  /** @type {Array<{ off: number; len: number } | { buffer: ArrayBuffer }>} */
  const out = [];
  const n = read16(ifdOff);
  if (n < 1 || n > 512 || ifdOff + 2 + n * 12 > limit) {
    return out;
  }
  let stripOff = null;
  let stripLen = null;
  let stripOffList = null;
  let stripLenList = null;
  for (let e = 0; e < n; e += 1) {
    const ent = ifdOff + 2 + e * 12;
    const tag = read16(ent);
    const typ = read16(ent + 2);
    const cnt = read32(ent + 4);
    const vo = ent + 8;
    if (tag === TAG_STRIP_OFFSETS && typ === 4 && cnt >= 1) {
      if (cnt === 1) {
        stripOff = read32(vo);
      } else {
        stripOffList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
      }
    }
    if (tag === TAG_STRIP_BYTE_COUNTS && typ === 4 && cnt >= 1) {
      if (cnt === 1) {
        stripLen = read32(vo);
      } else {
        stripLenList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
      }
    }
  }
  if (stripOff != null && stripLen != null) {
    out.push({ off: stripOff >>> 0, len: stripLen >>> 0 });
  }
  if (stripOffList?.length && stripLenList?.length === stripOffList.length) {
    if (stripOffList.length > 1) {
      let total = 0;
      for (let i = 0; i < stripLenList.length; i += 1) {
        total += stripLenList[i] >>> 0;
      }
      if (total >= 256 && total <= MAX_STRIP_DECODE_BYTES) {
        const merged = new Uint8Array(total);
        let pos = 0;
        let ok = true;
        for (let i = 0; i < stripOffList.length; i += 1) {
          const o = stripOffList[i] >>> 0;
          const L = stripLenList[i] >>> 0;
          if (o + L > limit) {
            ok = false;
            break;
          }
          merged.set(u8.subarray(o, o + L), pos);
          pos += L;
        }
        if (ok) {
          out.push({
            buffer: merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength),
          });
        }
      }
    } else {
      out.push({ off: stripOffList[0] >>> 0, len: stripLenList[0] >>> 0 });
    }
  }
  return out;
}

/**
 * Pierwszy kafelek (0x0144 / 0x0145) z IFD — często podgląd DNG.
 * @returns {Array<{ off: number; len: number }>}
 */
function collectTiffTileSlicesFromIfd(u8, tiffStart, ifdOff, read16, read32, le, limit) {
  /** @type {Array<{ off: number; len: number }>} */
  const out = [];
  const n = read16(ifdOff);
  if (n < 1 || n > 512 || ifdOff + 2 + n * 12 > limit) {
    return out;
  }
  let tileOff = null;
  let tileLen = null;
  let tileOffList = null;
  let tileLenList = null;
  for (let e = 0; e < n; e += 1) {
    const ent = ifdOff + 2 + e * 12;
    const tag = read16(ent);
    const typ = read16(ent + 2);
    const cnt = read32(ent + 4);
    const vo = ent + 8;
    if (tag === TAG_TILE_OFFSETS && typ === 4 && cnt >= 1) {
      if (cnt === 1) {
        tileOff = read32(vo);
      } else {
        tileOffList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
      }
    }
    if (tag === TAG_TILE_BYTE_COUNTS && typ === 4 && cnt >= 1) {
      if (cnt === 1) {
        tileLen = read32(vo);
      } else {
        tileLenList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
      }
    }
  }
  if (tileOff != null && tileLen != null) {
    out.push({ off: tileOff >>> 0, len: tileLen >>> 0 });
  }
  if (tileOffList?.length && tileLenList?.length === tileOffList.length) {
    out.push({ off: tileOffList[0] >>> 0, len: tileLenList[0] >>> 0 });
  }
  return out;
}

/**
 * SOF0 / SOF2 po SOI — do „luźnego” stripa bez pełnego EOI w buforze.
 * @returns {{ w: number, h: number } | null}
 */
function readJpegSof0DimensionsAfterSoi(u8, soi, endExclusive) {
  const max = Math.min(endExclusive, soi + 512 * 1024);
  let i = soi + 2;
  while (i + 9 < max) {
    if (u8[i] !== 0xff) {
      i += 1;
      continue;
    }
    const m = u8[i + 1];
    if (m === 0xd8 || m === 0xd9) {
      return null;
    }
    if (m === 0xc0 || m === 0xc2) {
      const h = readU16be(u8, i + 5);
      const w = readU16be(u8, i + 7);
      return w > 0 && h > 0 ? { w, h } : null;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 3 >= max) {
      break;
    }
    const segLen = readU16be(u8, i + 2);
    if (segLen < 2 || i + 2 + segLen > max) {
      break;
    }
    i += 2 + segLen;
  }
  return null;
}

/**
 * DefaultCropSize (0xC615): dwa RATIONAL (typ 5, count 2).
 * @returns {{ w: number, h: number } | null}
 */
function readDefaultCropSizePixels(u8, tiffStart, ent, le) {
  const type = le ? readU16Le(u8, ent + 2) : readU16be(u8, ent + 2);
  const count = le ? readU32Le(u8, ent + 4) : readU32Be(u8, ent + 4);
  if (type !== 5 || count !== 2) {
    return null;
  }
  const vo = ent + 8;
  const need = 16;
  const readU32 = le ? readU32Le : readU32Be;
  let base = vo;
  if (need > 4) {
    const ptr = readU32(u8, vo);
    base = tiffStart + (ptr >>> 0);
    if (base + need > u8.length) {
      return null;
    }
  }
  const num0 = readU32(u8, base);
  const den0 = readU32(u8, base + 4);
  const num1 = readU32(u8, base + 8);
  const den1 = readU32(u8, base + 12);
  if (!den0 || !den1) {
    return null;
  }
  const w = num0 / den0;
  const h = num1 / den1;
  return w > 1 && h > 1 ? { w, h } : null;
}

/** Skan FF D8 FF i podobny — tylko pierwsze 1 MB (pełny IFD/RAW bez limitu w wyższej warstwie). */
const TIFF_BRUTE_BYTE_SCAN_HEAD = 1024 * 1024;

/** Wycinek od każdego SOI w skanie „ostatniej szansy” — dekoder domyka JPEG w obrębie bufora. */
const BRUTE_FORCE_JPEG_CHUNK_BYTES = 256 * 1024;

/**
 * Ostatnia szansa dla DNG: pełny skan binarny pod SOI (`FF D8` + typowy trzeci bajt `FF` markera APP).
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {number} [maxBytes=2000000]
 * @returns {{ offsets: number[]; slices: ArrayBuffer[] }}
 */
/**
 * @param {{ silent?: boolean } | void} [options]
 */
export function bruteForceJpegSearch(buffer, maxBytes = 2000000, options) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const scanEnd = Math.min(u8.length, maxBytes >>> 0);
  /** @type {number[]} */
  const offsets = [];
  for (let i = 0; i + 2 < scanEnd; i += 1) {
    if (u8[i] === 0xff && u8[i + 1] === 0xd8 && u8[i + 2] === 0xff) {
      offsets.push(i);
    }
  }
  if (!options?.silent) {
    console.log('[Brute Force Scanner] Found JPEG headers at offsets:', offsets);
  }
  /** @type {ArrayBuffer[]} */
  const slices = [];
  for (const off of offsets) {
    const len = Math.min(BRUTE_FORCE_JPEG_CHUNK_BYTES, u8.length - off);
    if (len < 64) {
      continue;
    }
    slices.push(u8.buffer.slice(u8.byteOffset + off, u8.byteOffset + off + len));
  }
  return { offsets, slices };
}

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {ArrayBuffer[]}
 */
export function collectBrute512kFfd8ffJpegSlices(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const head = Math.min(u8.length, TIFF_BRUTE_BYTE_SCAN_HEAD);
  if (head < 4) {
    return [];
  }
  /** @type {number[]} */
  const starts = [];
  for (let i = 0; i + 2 < head; i += 1) {
    if (u8[i] === 0xff && u8[i + 1] === 0xd8 && u8[i + 2] === 0xff) {
      starts.push(i);
    }
  }
  /** @type {ArrayBuffer[]} */
  const out = [];
  const seenSoi = new Set();
  for (const soi of starts) {
    if (seenSoi.has(soi)) {
      continue;
    }
    seenSoi.add(soi);
    let endEx = findJpegEndAfterSoi(u8, soi);
    if (endEx == null || endEx <= soi + 100) {
      endEx = Math.min(soi + 4 * 1024 * 1024, u8.length);
    }
    if (endEx - soi < 256) {
      continue;
    }
    out.push(u8.buffer.slice(u8.byteOffset + soi, u8.byteOffset + endEx));
  }
  return out;
}

/**
 * TIFF/Exif: tagi 0x0201 (JPEGInterchangeFormat) + 0x0202 (długość) — CR2; DNG często w SubIFD (0x014A).
 * Strip 0x0111/0x0117: Adobe bywa bez pełnego EOI w segmencie — `StripByteCounts` jako długość + luźna walidacja SOF.
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {{ assetId?: string } | void} [options]
 * @returns {{ buffer: ArrayBuffer | null; subIfdQueued: number; fallbackSlices: ArrayBuffer[] }}
 */
export function tryExtractJpegFromTiffIfd513514(buffer, options) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const assetId = options && typeof options.assetId === 'string' ? options.assetId : '';
  if (u8.length < 20) {
    return { buffer: null, subIfdQueued: 0, fallbackSlices: [] };
  }
  const le = u8[0] === 0x49 && u8[1] === 0x49;
  const be = u8[0] === 0x4d && u8[1] === 0x4d;
  if (!le && !be) {
    return { buffer: null, subIfdQueued: 0, fallbackSlices: [] };
  }
  const read16 = le ? (i) => readU16Le(u8, i) : (i) => readU16be(u8, i);
  const read32 = le ? (i) => readU32Le(u8, i) : (i) => readU32Be(u8, i);
  if (read16(2) !== 42) {
    return { buffer: null, subIfdQueued: 0, fallbackSlices: [] };
  }
  const tiffStart = 0;
  const limit = u8.length;

  const trySlice = (offJpeg, lenJpeg, minLen = 256) => {
    if (
      offJpeg == null ||
      lenJpeg == null ||
      lenJpeg < minLen ||
      offJpeg < 0 ||
      offJpeg + lenJpeg > limit ||
      u8[offJpeg] !== 0xff ||
      u8[offJpeg + 1] !== 0xd8
    ) {
      return null;
    }
    const slice = u8.buffer.slice(u8.byteOffset + offJpeg, u8.byteOffset + offJpeg + lenJpeg);
    const uz = new Uint8Array(slice);
    const cl = classifyEmbeddedJpegCandidate(uz, 0, uz.length);
    if (!cl.skip) {
      return slice;
    }
    /** Pełna długość z 0x0202 — bez ucinania; dekoder może domknąć JPEG gdy FF D9 jest głębiej niż heurystyka. */
    if (uz.length >= minLen && uz[0] === 0xff && uz[1] === 0xd8) {
      return slice;
    }
    return null;
  };

  /** Strip: długość z metadanych (bez wymuszania FF D9 na końcu bufora). */
  const trySliceStripLoose = (off0, len0, minLen = 256) => {
    if (
      off0 == null ||
      len0 == null ||
      len0 < minLen ||
      off0 < 0 ||
      off0 + len0 > limit ||
      u8[off0] !== 0xff ||
      u8[off0 + 1] !== 0xd8
    ) {
      return null;
    }
    const slice = u8.buffer.slice(u8.byteOffset + off0, u8.byteOffset + off0 + len0);
    const uz = new Uint8Array(slice);
    const cl = classifyEmbeddedJpegCandidate(uz, 0, uz.length);
    if (!cl.skip) {
      return { buf: slice, score: cl.score };
    }
    const dim = readJpegSof0DimensionsAfterSoi(uz, 0, uz.length);
    if (dim) {
      return { buf: slice, score: len0 + 1e12 };
    }
    /** Cały StripByteCounts — zachowujemy 100% długości z tagu (Adobe). */
    return { buf: slice, score: len0 };
  };

  const tryMergedStrips = (offs, lens, minTotalBytes = 256) => {
    if (!offs?.length || offs.length !== lens.length || offs.length > 32) {
      return null;
    }
    let total = 0;
    for (let i = 0; i < lens.length; i += 1) {
      total += lens[i] >>> 0;
    }
    if (total < minTotalBytes || total > MAX_STRIP_DECODE_BYTES) {
      return null;
    }
    const merged = new Uint8Array(total);
    let pos = 0;
    for (let i = 0; i < offs.length; i += 1) {
      const o = offs[i] >>> 0;
      const L = lens[i] >>> 0;
      if (o + L > limit) {
        return null;
      }
      merged.set(u8.subarray(o, o + L), pos);
      pos += L;
    }
    if (merged[0] !== 0xff || merged[1] !== 0xd8) {
      return null;
    }
    const cl = classifyEmbeddedJpegCandidate(merged, 0, merged.length);
    if (!cl.skip) {
      return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
    }
    const dim = readJpegSof0DimensionsAfterSoi(merged, 0, merged.length);
    if (dim) {
      return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
    }
    /** Pełna suma StripByteCounts — bez ucinania przy „ślepym” SOF0. */
    return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
  };

  /** Jak `tryMergedStrips`, ale bez wymogu SOI — surowe strip-y z SubIFD (Adobe). */
  const tryMergedStripsOpaque = (offs, lens) => {
    if (!offs?.length || offs.length !== lens.length || offs.length > 32) {
      return null;
    }
    let total = 0;
    for (let i = 0; i < lens.length; i += 1) {
      total += lens[i] >>> 0;
    }
    if (total < 256 || total > MAX_STRIP_DECODE_BYTES) {
      return null;
    }
    const merged = new Uint8Array(total);
    let pos = 0;
    for (let i = 0; i < offs.length; i += 1) {
      const o = offs[i] >>> 0;
      const L = lens[i] >>> 0;
      if (o + L > limit) {
        return null;
      }
      merged.set(u8.subarray(o, o + L), pos);
      pos += L;
    }
    return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
  };

  /** @type {number[]} */
  const queue = [];
  const visited = new Set();
  let subIfdQueued = 0;
  const pushIfdBack = (rel) => {
    const o = rel >>> 0;
    if (o < 8 || o + 2 > limit || visited.has(o)) {
      return;
    }
    visited.add(o);
    queue.push(o);
  };
  const pushIfdFront = (rel) => {
    const o = rel >>> 0;
    if (o < 8 || o + 2 > limit || visited.has(o)) {
      return;
    }
    visited.add(o);
    queue.unshift(o);
  };

  pushIfdBack(read32(4));

  let bestSlice = null;
  let bestScore = -1;
  /** @type {{ w: number, h: number } | null} */
  let cropHint = null;
  /** Kandydaci SOF0/2 (bez SOF3) — po nieudanym decode największego próbujemy mniejszych (np. IFD1 / thumbnail). */
  /** @type {ArrayBuffer[]} */
  const decodableFallback = [];
  /** @type {ArrayBuffer[]} — strip-y z SubIFD bez SOI (Adobe — surowy podgląd). */
  const opaqueStripFallbacks = [];

  const rememberDecodableJpeg = (ab, minBytes = MIN_JPEG_STRIP_PREVIEW_BYTES) => {
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < minBytes) {
      return;
    }
    const z = new Uint8Array(ab);
    if (z.length < 2 || z[0] !== 0xff || z[1] !== 0xd8) {
      return;
    }
    const cl = classifyEmbeddedJpegCandidate(z, 0, z.length);
    if (cl.skip) {
      return;
    }
    decodableFallback.push(ab);
  };

  const scoreCropBonus = (slice) => {
    if (!cropHint || !slice) {
      return 1;
    }
    const uz = new Uint8Array(slice);
    const dim = readJpegSof0DimensionsAfterSoi(uz, 0, uz.length);
    if (!dim) {
      return 1;
    }
    const ja = dim.w / dim.h;
    const ca = cropHint.w / cropHint.h;
    const rel = Math.abs(ja - ca) / Math.max(ja, ca, 1e-6);
    return rel < 0.12 ? 1.22 : 1;
  };

  const considerStrict = (off, len, tagCompression = null) => {
    const minLen =
      tagCompression === 6 || tagCompression === 7 ? MIN_JPEG_STRIP_PREVIEW_BYTES : 256;
    const sl = trySlice(off, len, minLen);
    if (!sl) {
      return;
    }
    rememberDecodableJpeg(sl, minLen);
    const uz = new Uint8Array(sl);
    const cl = classifyEmbeddedJpegCandidate(uz, 0, uz.length);
    const score =
      (cl.skip ? sl.byteLength : cl.score) *
      scoreCropBonus(sl) *
      previewJpegByteLengthMultiplier(sl.byteLength);
    if (score > bestScore) {
      bestScore = score;
      bestSlice = sl;
    }
  };

  const considerStrip = (off, len, minStripLen = 256) => {
    const pack = trySliceStripLoose(off, len, minStripLen);
    if (!pack) {
      return;
    }
    const uz = new Uint8Array(pack.buf);
    const cl0 = classifyEmbeddedJpegCandidate(uz, 0, uz.length);
    if (!cl0.skip) {
      rememberDecodableJpeg(pack.buf, minStripLen);
    }
    const score =
      pack.score * scoreCropBonus(pack.buf) * previewJpegByteLengthMultiplier(pack.buf.byteLength);
    if (score > bestScore) {
      bestScore = score;
      bestSlice = pack.buf;
    }
  };

  const pushOpaqueStripFallback = (off, len) => {
    if (off == null || len == null) {
      return;
    }
    const L = len >>> 0;
    const o = off >>> 0;
    if (L < 256 || L > MAX_STRIP_DECODE_BYTES || o + L > limit) {
      return;
    }
    opaqueStripFallbacks.push(u8.buffer.slice(u8.byteOffset + o, u8.byteOffset + o + L));
  };

  /**
   * Jedno IFD: kolejka SubIFD (`enqueueSubsToQueue`) albo samo ekstrakcyjne przejście (DFS SubIFD).
   */
  /**
   * @param {boolean} enqueueSubsToQueue
   * @param {boolean} [relaxStripSoiFallback=false] — SubIFD Adobe: strip 0x0111 bez Compression 6/7, ale z FF D8 na początku.
   * @param {number} [subIfdDeepScanIndex] — jeśli ustawiony (SubIFD), log `[DNG Deep Scan]`.
   */
  const scanIfdForJpeg = (ifdOff, enqueueSubsToQueue, relaxStripSoiFallback = false, subIfdDeepScanIndex) => {
    const n = read16(ifdOff);
    if (n < 1 || n > 512 || ifdOff + 2 + n * 12 > limit) {
      return;
    }
    let offJpeg = null;
    let lenJpeg = null;
    let stripOff = null;
    let stripLen = null;
    /** @type {number[] | null} */
    let stripOffList = null;
    /** @type {number[] | null} */
    let stripLenList = null;
    let tileOff = null;
    let tileLen = null;
    /** @type {number[] | null} */
    let tileOffList = null;
    /** @type {number[] | null} */
    let tileLenList = null;
    /** @type {number | null} */
    let compressionTag = null;
    for (let e = 0; e < n; e += 1) {
      const ent = ifdOff + 2 + e * 12;
      const tag = read16(ent);
      const typ = read16(ent + 2);
      const cnt = read32(ent + 4);
      const vo = ent + 8;
      if (tag === TAG_COMPRESSION && (typ === 3 || typ === 4) && cnt === 1) {
        if (typ === 3) {
          compressionTag = le ? readU16Le(u8, vo) : readU16be(u8, vo);
        } else {
          compressionTag = read32(vo) >>> 0;
        }
      }
      if (tag === 0x0201 && typ === 4 && cnt === 1) {
        offJpeg = read32(vo);
      }
      if (tag === 0x0202 && typ === 4 && cnt === 1) {
        lenJpeg = read32(vo);
      }
      if (tag === TAG_STRIP_OFFSETS && typ === 4 && cnt >= 1) {
        if (cnt === 1) {
          stripOff = read32(vo);
        } else {
          stripOffList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
        }
      }
      if (tag === TAG_STRIP_BYTE_COUNTS && typ === 4 && cnt >= 1) {
        if (cnt === 1) {
          stripLen = read32(vo);
        } else {
          stripLenList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
        }
      }
      if (tag === TAG_TILE_OFFSETS && typ === 4 && cnt >= 1) {
        if (cnt === 1) {
          tileOff = read32(vo);
        } else {
          tileOffList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
        }
      }
      if (tag === TAG_TILE_BYTE_COUNTS && typ === 4 && cnt >= 1) {
        if (cnt === 1) {
          tileLen = read32(vo);
        } else {
          tileLenList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
        }
      }
      if (tag === TAG_DEFAULT_CROP_SIZE) {
        const crop = readDefaultCropSizePixels(u8, tiffStart, ent, le);
        if (crop) {
          cropHint = crop;
        }
      }
      if (tag === TAG_SUB_IFDS) {
        const subs = readSubIfdPointerArray(u8, tiffStart, ent, le);
        if (enqueueSubsToQueue) {
          subIfdQueued += subs.length;
          for (let s = subs.length - 1; s >= 0; s -= 1) {
            pushIfdFront(subs[s]);
          }
        }
      }
    }
    /** 0x0201 / 0x0202: Adobe DNG często pomija 0x0103 — ufamy offsetowi i długości jak JPEG. */
    /** 0x0201 / 0x0202 — „JPEGInterchangeFormat”; Adobe umieszcza tu zaszyty JPEG (priorytet przed stripami). */
    if (offJpeg != null && lenJpeg != null) {
      considerStrict(offJpeg, lenJpeg, compressionTag);
    }
    /** 0x0111/0x0117 i kafelki: TYLKO Compression 6 lub 7 — inaczej to zwykle surowa matryca (dziesiąki MB). */
    const stripIsJpegInTiff = compressionTag === 6 || compressionTag === 7;
    const jpegStripMin = MIN_JPEG_STRIP_PREVIEW_BYTES;
    if (stripIsJpegInTiff) {
      if (
        stripOff != null &&
        stripLen != null &&
        (stripLen >>> 0) <= MAX_STRIP_DECODE_BYTES
      ) {
        considerStrip(stripOff, stripLen, jpegStripMin);
      }
      if (stripOffList?.length && stripLenList?.length === stripOffList.length) {
        if (stripOffList.length > 1) {
          let mergeTotal = 0;
          for (let i = 0; i < stripLenList.length; i += 1) {
            mergeTotal += stripLenList[i] >>> 0;
          }
          if (mergeTotal <= MAX_STRIP_DECODE_BYTES) {
            const merged = tryMergedStrips(stripOffList, stripLenList, jpegStripMin);
            if (merged) {
              const uz = new Uint8Array(merged);
              const cl = classifyEmbeddedJpegCandidate(uz, 0, uz.length);
              if (!cl.skip) {
                rememberDecodableJpeg(merged);
              }
              const baseScore = cl.skip ? merged.byteLength + 5e11 : cl.score;
              const score =
                baseScore * scoreCropBonus(merged) * previewJpegByteLengthMultiplier(merged.byteLength);
              if (score > bestScore) {
                bestScore = score;
                bestSlice = merged;
              }
            }
          }
        } else if ((stripLenList[0] >>> 0) <= MAX_STRIP_DECODE_BYTES) {
          considerStrip(stripOffList[0], stripLenList[0], jpegStripMin);
        }
      }
      if (
        tileOff != null &&
        tileLen != null &&
        (tileLen >>> 0) <= MAX_STRIP_DECODE_BYTES
      ) {
        considerStrip(tileOff, tileLen, jpegStripMin);
      }
      if (tileOffList?.length && tileLenList?.length === tileOffList.length) {
        if (tileOffList.length > 1) {
          let tTotal = 0;
          for (let i = 0; i < tileLenList.length; i += 1) {
            tTotal += tileLenList[i] >>> 0;
          }
          if (tTotal <= MAX_STRIP_DECODE_BYTES) {
            const mergedT = tryMergedStrips(tileOffList, tileLenList, jpegStripMin);
            if (mergedT) {
              const uz = new Uint8Array(mergedT);
              const cl = classifyEmbeddedJpegCandidate(uz, 0, uz.length);
              if (!cl.skip) {
                rememberDecodableJpeg(mergedT);
              }
              const baseScore = cl.skip ? mergedT.byteLength + 5e11 : cl.score;
              const score =
                baseScore *
                scoreCropBonus(mergedT) *
                previewJpegByteLengthMultiplier(mergedT.byteLength);
              if (score > bestScore) {
                bestScore = score;
                bestSlice = mergedT;
              }
            }
          }
        } else if ((tileLenList[0] >>> 0) <= MAX_STRIP_DECODE_BYTES) {
          considerStrip(tileOffList[0], tileLenList[0], jpegStripMin);
        }
      }
    }
    if (relaxStripSoiFallback && typeof subIfdDeepScanIndex === 'number') {
      let scanLen = 0;
      if (stripLen != null) {
        scanLen = stripLen >>> 0;
      } else if (stripLenList?.length) {
        for (let si = 0; si < stripLenList.length; si += 1) {
          scanLen += stripLenList[si] >>> 0;
        }
      }
      console.log('[DNG Deep Scan] SubIFD Index:', subIfdDeepScanIndex, 'Compression:', compressionTag ?? '(none)', 'Size:', scanLen);
    }
    if (relaxStripSoiFallback) {
      const no0201 = offJpeg == null || lenJpeg == null;
      if (no0201 && stripOff != null && stripLen != null && (stripLen >>> 0) <= MAX_STRIP_DECODE_BYTES) {
        const o0 = stripOff >>> 0;
        if (o0 + 2 <= limit && u8[o0] === 0xff && u8[o0 + 1] === 0xd8) {
          considerStrip(stripOff, stripLen);
        }
        pushOpaqueStripFallback(stripOff, stripLen);
      }
      if (
        no0201 &&
        stripOffList?.length === 1 &&
        stripLenList?.length === 1 &&
        (stripLenList[0] >>> 0) <= MAX_STRIP_DECODE_BYTES
      ) {
        const o0 = stripOffList[0] >>> 0;
        if (o0 + 2 <= limit && u8[o0] === 0xff && u8[o0 + 1] === 0xd8) {
          considerStrip(stripOffList[0], stripLenList[0]);
        }
        pushOpaqueStripFallback(stripOffList[0], stripLenList[0]);
      }
      if (
        no0201 &&
        stripOffList &&
        stripLenList &&
        stripOffList.length > 1 &&
        stripOffList.length === stripLenList.length
      ) {
        let mergeTotal = 0;
        for (let mi = 0; mi < stripLenList.length; mi += 1) {
          mergeTotal += stripLenList[mi] >>> 0;
        }
        if (mergeTotal <= MAX_STRIP_DECODE_BYTES && mergeTotal >= 256) {
          const mergedOp = tryMergedStripsOpaque(stripOffList, stripLenList);
          if (mergedOp) {
            opaqueStripFallbacks.push(mergedOp);
          }
        }
      }
    }
    const nextPtr = ifdOff + 2 + n * 12;
    if (enqueueSubsToQueue && nextPtr + 4 <= limit) {
      const nextIfd = read32(nextPtr);
      if (nextIfd !== 0) {
        pushIfdBack(nextIfd);
      }
    }
  };

  /** IFD1 (pole „next IFD” po IFD0): typowe miejsce miniatury JPEG (Compression 6) w DNG — skanuj przed SubIFD. */
  const ifd0Root = read32(4) >>> 0;
  const ifd1Next = readNextIfdOffset(u8, tiffStart, ifd0Root);
  if (ifd1Next !== 0 && ifd1Next + 2 <= limit) {
    visited.add(ifd1Next);
    scanIfdForJpeg(ifd1Next, false, false);
  }

  /**
   * Adobe DNG: IFD1 + Compression 6 — „ratunkowa” miniatura; weź nawet bardzo krótki segment JPEG (≥2 B + SOI).
   */
  const rescueIfd1Compression6Thumbnail = () => {
    const rel = ifd1Next >>> 0;
    if (rel === 0 || rel + 2 > limit) {
      return;
    }
    const nIfd = read16(rel);
    if (nIfd < 1 || nIfd > 512 || rel + 2 + nIfd * 12 > limit) {
      return;
    }
    let comp = null;
    let jOff = null;
    let jLen = null;
    let stOff = null;
    let stLen = null;
    for (let e = 0; e < nIfd; e += 1) {
      const ent = rel + 2 + e * 12;
      const tag = read16(ent);
      const typ = read16(ent + 2);
      const cnt = read32(ent + 4);
      const vo = ent + 8;
      if (tag === TAG_COMPRESSION && (typ === 3 || typ === 4) && cnt === 1) {
        comp = typ === 3 ? (le ? readU16Le(u8, vo) : readU16be(u8, vo)) : read32(vo) >>> 0;
      }
      if (tag === 0x0201 && typ === 4 && cnt === 1) {
        jOff = read32(vo);
      }
      if (tag === 0x0202 && typ === 4 && cnt === 1) {
        jLen = read32(vo);
      }
      if (tag === TAG_STRIP_OFFSETS && typ === 4 && cnt === 1) {
        stOff = read32(vo);
      }
      if (tag === TAG_STRIP_BYTE_COUNTS && typ === 4 && cnt === 1) {
        stLen = read32(vo);
      }
    }
    if (comp !== 6 && comp !== 7) {
      return;
    }
    const rescueSlice = (off, len) => {
      if (off == null || len == null) {
        return;
      }
      const L = len >>> 0;
      const o = off >>> 0;
      if (L < 2 || L > MAX_STRIP_DECODE_BYTES || o + L > limit) {
        return;
      }
      if (u8[o] !== 0xff || u8[o + 1] !== 0xd8) {
        return;
      }
      const sl = u8.buffer.slice(u8.byteOffset + o, u8.byteOffset + o + L);
      rememberDecodableJpeg(sl, 2);
      const uz = new Uint8Array(sl);
      const cl = classifyEmbeddedJpegCandidate(uz, 0, uz.length);
      const score =
        (cl.skip ? sl.byteLength : cl.score) *
        scoreCropBonus(sl) *
        previewJpegByteLengthMultiplier(sl.byteLength);
      if (score > bestScore || bestSlice == null) {
        bestScore = score;
        bestSlice = sl;
      }
    };
    rescueSlice(jOff, jLen);
    rescueSlice(stOff, stLen);
  };
  rescueIfd1Compression6Thumbnail();

  /** Każdy offset z IFD0 → SubIFDs (0x014a) w kolejności tablicy — JPEG bywa w drugim, nie pierwszym. */
  const getIfd0SubIfdOffsetsForward = () => {
    const ifd0Off = read32(4) >>> 0;
    if (ifd0Off < 8 || ifd0Off + 2 > limit) {
      return [];
    }
    const n0 = read16(ifd0Off);
    if (n0 < 1 || ifd0Off + 2 + n0 * 12 > limit) {
      return [];
    }
    /** @type {number[]} */
    const out = [];
    for (let e = 0; e < n0; e += 1) {
      const ent = ifd0Off + 2 + e * 12;
      if (read16(ent) !== TAG_SUB_IFDS) {
        continue;
      }
      const subs = readSubIfdPointerArray(u8, tiffStart, ent, le);
      for (let si = 0; si < subs.length; si += 1) {
        out.push(subs[si] >>> 0);
      }
    }
    return out;
  };
  let subIfdDeepScanCounter = 0;
  for (const subOff of getIfd0SubIfdOffsetsForward()) {
    scanIfdForJpeg(subOff, false, true, subIfdDeepScanCounter);
    subIfdDeepScanCounter += 1;
  }

  let bfsHops = 0;
  const maxBfsHops = 420;
  while (queue.length > 0 && bfsHops < maxBfsHops) {
    bfsHops += 1;
    const ifdOff = queue.shift();
    if (ifdOff == null) {
      break;
    }
    scanIfdForJpeg(ifdOff, true, false);
  }

  const collectSubIfdDfsOrder = () => {
    /** @type {number[]} */
    const ordered = [];
    const seen = new Set();
    const walk = (rel, depth) => {
      const r = rel >>> 0;
      if (depth > 28 || r < 8 || r + 2 > limit || seen.has(r)) {
        return;
      }
      seen.add(r);
      ordered.push(r);
      const nR = read16(r);
      if (nR < 1 || nR > 512 || r + 2 + nR * 12 > limit) {
        return;
      }
      for (let e = 0; e < nR; e += 1) {
        const ent = r + 2 + e * 12;
        const tag = read16(ent);
        if (tag !== TAG_SUB_IFDS) {
          continue;
        }
        const subs = readSubIfdPointerArray(u8, tiffStart, ent, le);
        for (let si = 0; si < subs.length; si += 1) {
          walk(subs[si] >>> 0, depth + 1);
        }
      }
    };
    const ifd0Off = read32(4) >>> 0;
    if (ifd0Off >= 8 && ifd0Off + 2 <= limit) {
      const n0 = read16(ifd0Off);
      if (n0 >= 1 && ifd0Off + 2 + n0 * 12 <= limit) {
        for (let e = 0; e < n0; e += 1) {
          const ent = ifd0Off + 2 + e * 12;
          if (read16(ent) !== TAG_SUB_IFDS) {
            continue;
          }
          const subs = readSubIfdPointerArray(u8, tiffStart, ent, le);
          for (let si = 0; si < subs.length; si += 1) {
            walk(subs[si] >>> 0, 0);
          }
        }
      }
    }
    return ordered;
  };
  for (const subOff of collectSubIfdDfsOrder()) {
    scanIfdForJpeg(subOff, false, true, subIfdDeepScanCounter);
    subIfdDeepScanCounter += 1;
  }

  /** Gdy SubIFD / łańcuch nie dały JPEG — spróbuj 0x0111/0x0117 bezpośrednio w IFD0 (Adobe czasem trzyma tu preview). */
  const tryIfd0StripOffsetsFallback = () => {
    if (bestSlice != null) {
      return;
    }
    const ifd0Off = read32(4) >>> 0;
    if (ifd0Off < 8 || ifd0Off + 2 > limit) {
      return;
    }
    const n0 = read16(ifd0Off);
    if (n0 < 1 || n0 > 512 || ifd0Off + 2 + n0 * 12 > limit) {
      return;
    }
    let stripOff = null;
    let stripLen = null;
    /** @type {number[] | null} */
    let stripOffList = null;
    /** @type {number[] | null} */
    let stripLenList = null;
    for (let e = 0; e < n0; e += 1) {
      const ent = ifd0Off + 2 + e * 12;
      const tag = read16(ent);
      const typ = read16(ent + 2);
      const cnt = read32(ent + 4);
      const vo = ent + 8;
      if (tag === TAG_STRIP_OFFSETS && typ === 4 && cnt >= 1) {
        if (cnt === 1) {
          stripOff = read32(vo);
        } else {
          stripOffList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
        }
      }
      if (tag === TAG_STRIP_BYTE_COUNTS && typ === 4 && cnt >= 1) {
        if (cnt === 1) {
          stripLen = read32(vo);
        } else {
          stripLenList = readTiffLongArrayFromEntry(u8, tiffStart, ent, le);
        }
      }
    }
    if (stripOff != null && stripLen != null && (stripLen >>> 0) <= MAX_STRIP_DECODE_BYTES) {
      considerStrip(stripOff, stripLen);
    }
    if (stripOffList?.length && stripLenList?.length === stripOffList.length) {
      if (stripOffList.length > 1) {
        let mergeTotal = 0;
        for (let i = 0; i < stripLenList.length; i += 1) {
          mergeTotal += stripLenList[i] >>> 0;
        }
        if (mergeTotal <= MAX_STRIP_DECODE_BYTES) {
          const merged = tryMergedStrips(stripOffList, stripLenList);
          if (merged) {
            const uz = new Uint8Array(merged);
            const cl = classifyEmbeddedJpegCandidate(uz, 0, uz.length);
            if (!cl.skip) {
              rememberDecodableJpeg(merged);
            }
            const baseScore = cl.skip ? merged.byteLength + 5e11 : cl.score;
            const score =
              baseScore * scoreCropBonus(merged) * previewJpegByteLengthMultiplier(merged.byteLength);
            if (score > bestScore) {
              bestScore = score;
              bestSlice = merged;
            }
          }
        }
      } else if ((stripLenList[0] >>> 0) <= MAX_STRIP_DECODE_BYTES) {
        considerStrip(stripOffList[0], stripLenList[0]);
      }
    }
  };
  tryIfd0StripOffsetsFallback();
  if (bestSlice == null && opaqueStripFallbacks.length > 0) {
    bestSlice = opaqueStripFallbacks.reduce((a, b) => (a.byteLength >= b.byteLength ? a : b));
    bestScore = bestSlice.byteLength * 1e-12;
  }
  if (import.meta.env?.DEV && assetId) {
    console.log('[DNG SubIFD Search] Found', subIfdQueued, 'SubIFDs for', assetId);
  }
  const seenFb = new Set();
  /** @type {ArrayBuffer[]} */
  const fallbackSlices = [];
  for (const ab of decodableFallback) {
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < MIN_JPEG_STRIP_PREVIEW_BYTES) {
      continue;
    }
    const z = new Uint8Array(ab);
    const key = `${ab.byteLength}:${Array.from(z.slice(0, 48)).join(',')}`;
    if (seenFb.has(key)) {
      continue;
    }
    seenFb.add(key);
    fallbackSlices.push(ab);
  }
  const bruteExtra = collectBrute512kFfd8ffJpegSlices(u8);
  for (const ab of bruteExtra) {
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < 256) {
      continue;
    }
    const z = new Uint8Array(ab);
    const key = `${ab.byteLength}:${Array.from(z.slice(0, 48)).join(',')}`;
    if (seenFb.has(key)) {
      continue;
    }
    seenFb.add(key);
    fallbackSlices.push(ab);
  }
  for (const ab of opaqueStripFallbacks) {
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < 256) {
      continue;
    }
    const z = new Uint8Array(ab);
    const key = `${ab.byteLength}:${Array.from(z.slice(0, 48)).join(',')}`;
    if (seenFb.has(key)) {
      continue;
    }
    seenFb.add(key);
    fallbackSlices.push(ab);
  }
  if (bestSlice == null && fallbackSlices.length === 0) {
    const { slices: bruteSlices } = bruteForceJpegSearch(u8);
    for (const ab of bruteSlices) {
      if (!(ab instanceof ArrayBuffer) || ab.byteLength < 64) {
        continue;
      }
      const z = new Uint8Array(ab);
      const key = `${ab.byteLength}:${Array.from(z.slice(0, 48)).join(',')}`;
      if (seenFb.has(key)) {
        continue;
      }
      seenFb.add(key);
      fallbackSlices.push(ab);
    }
  }
  fallbackSlices.sort((a, b) => a.byteLength - b.byteLength);

  /** Gdy największy kandydat to surowy strip / nie-JPEG — pierwszy sensowny JPEG z fallbacków (najmniejszy = typowa miniatura IFD1). */
  const primaryIsDecodableJpeg =
    bestSlice != null &&
    bufferStartsWithJpegSoi(bestSlice) &&
    !classifyEmbeddedJpegCandidate(new Uint8Array(bestSlice), 0, bestSlice.byteLength).skip;
  if (!primaryIsDecodableJpeg && fallbackSlices.length > 0) {
    const jpegSorted = fallbackSlices
      .filter((ab) => bufferStartsWithJpegSoi(ab))
      .sort((a, b) => a.byteLength - b.byteLength);
    const smallest = jpegSorted[0];
    if (smallest) {
      bestSlice = smallest;
    }
  }

  return { buffer: bestSlice, subIfdQueued, fallbackSlices };
}

export function extractLargestEmbeddedJpegBytes(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.length < 4) {
    return null;
  }
  const scanEnd = Math.min(u8.length - 1, MAX_RAW_JPEG_SCAN);
  /** @type {{ start: number; end: number; score: number }[]} */
  const candidates = [];
  for (let i = 0; i < scanEnd; i++) {
    if (u8[i] !== 0xff || u8[i + 1] !== 0xd8) {
      continue;
    }
    const end = findJpegEndAfterSoi(u8, i);
    if (end == null || end <= i) {
      continue;
    }
    if (end < 2 || u8[end - 2] !== 0xff || u8[end - 1] !== 0xd9) {
      continue;
    }
    const len = end - i;
    if (len < 256) {
      continue;
    }
    const cl = classifyEmbeddedJpegCandidate(u8, i, end);
    if (cl.skip) {
      continue;
    }
    candidates.push({ start: i, end, score: cl.score });
  }
  if (!candidates.length) {
    return null;
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const bestStart = best.start;
  const bestEnd = best.end;
  const out = u8.buffer.slice(u8.byteOffset + bestStart, u8.byteOffset + bestEnd);
  if (import.meta.env?.DEV) {
    const head = new Uint8Array(out, 0, Math.min(10, out.byteLength));
    console.debug(
      '[FilmLab][embeddedJpeg] Hex header (first 10):',
      Array.from(head)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ')
    );
  }
  return out;
}

export function bufferStartsWithJpegSoi(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xd8;
}

const RAW_EXT =
  /\.(arw|srf|sr2|nef|nrw|cr2|cr3|crw|dng|raf|orf|rw2|pef|ptx|x3f|3fr|fff|mef|mos|raw|rwl|srw|iiq)$/i;

export function isLikelyCameraRawFilename(name) {
  return RAW_EXT.test(String(name ?? ''));
}

/** TIFF nagłówek + APP1 JPEG: DNG bywa „tłusty” — IFD0 / APP1 głębiej niż 256 KiB. */
const EXIF_ORIENTATION_SCAN = 512 * 1024;

function readU16Le(u8, i) {
  return u8[i] | (u8[i + 1] << 8);
}

function readU32Le(u8, i) {
  return u8[i] | (u8[i + 1] << 8) | (u8[i + 2] << 16) | (u8[i + 3] << 24);
}

function readU32Be(u8, i) {
  return (u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3];
}

/**
 * Klucze tagów (hex) z pierwszego IFD — debug `[DNG Probe] foundTags`.
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {string[]}
 */
export function listTiffIfd0TagKeys(buffer) {
  try {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (u8.length < 12 || (u8[0] === 0xff && u8[1] === 0xd8)) {
      return [];
    }
    const le = u8[0] === 0x49 && u8[1] === 0x49;
    const be = u8[0] === 0x4d && u8[1] === 0x4d;
    if (!le && !be) {
      return [];
    }
    const read16At = (i) => (le ? readU16Le(u8, i) : readU16be(u8, i));
    const read32At = (i) => (le ? readU32Le(u8, i) : readU32Be(u8, i));
    if (read16At(2) !== 42) {
      return [];
    }
    const ifd0 = read32At(4) >>> 0;
    if (ifd0 < 8 || ifd0 + 2 > u8.length) {
      return [];
    }
    const numEntries = read16At(ifd0);
    if (numEntries < 1 || numEntries > 512 || ifd0 + 2 + numEntries * 12 > u8.length) {
      return [];
    }
    /** @type {Set<string>} */
    const seen = new Set();
    for (let e = 0; e < numEntries; e += 1) {
      const ent = ifd0 + 2 + e * 12;
      const tag = read16At(ent);
      seen.add(`0x${tag.toString(16).padStart(4, '0')}`);
    }
    return Array.from(seen).sort();
  } catch {
    return [];
  }
}

/**
 * Pierwszy sensowny strip (0x0111/0x0117) z dowolnego IFD — także gdy początek nie jest FF D8 (próba jako image/jpeg).
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {ArrayBuffer | null}
 */
export function tryExtractFirstTiffStripRawSlice(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.length < 20 || (u8[0] === 0xff && u8[1] === 0xd8)) {
    return null;
  }
  if (!tiffEndianAt(u8, 0)) {
    return null;
  }
  const le = u8[0] === 0x49 && u8[1] === 0x49;
  const read16 = le ? (i) => readU16Le(u8, i) : (i) => readU16be(u8, i);
  const read32 = le ? (i) => readU32Le(u8, i) : (i) => readU32Be(u8, i);
  if (read16(2) !== 42) {
    return null;
  }
  const limit = u8.length;
  /** @type {ArrayBuffer | null} */
  let found = null;
  forEachRawTiffIfdRelativeOffset(u8, (ifdRel) => {
    if (found) {
      return;
    }
    const segs = collectTiffStripSlicesFromIfd(u8, 0, ifdRel, read16, read32, le, limit);
    for (const seg of segs) {
      if ('off' in seg && 'len' in seg) {
        const len = seg.len >>> 0;
        const off = seg.off >>> 0;
        if (len >= 64 && len <= MAX_STRIP_DECODE_BYTES && off + len <= limit) {
          found = u8.buffer.slice(u8.byteOffset + off, u8.byteOffset + off + len);
          return;
        }
      }
      if (
        'buffer' in seg &&
        seg.buffer instanceof ArrayBuffer &&
        seg.buffer.byteLength >= 64 &&
        seg.buffer.byteLength <= MAX_STRIP_DECODE_BYTES
      ) {
        found = seg.buffer;
        return;
      }
    }
  });
  return found;
}

/**
 * Pełna identyfikacja endian TIFF nagłówka od `tiffStart`.
 * @returns {{ le: boolean, be: boolean } | null}
 */
function tiffEndianAt(u8, tiffStart) {
  const le = u8[tiffStart] === 0x49 && u8[tiffStart + 1] === 0x49;
  const be = u8[tiffStart] === 0x4d && u8[tiffStart + 1] === 0x4d;
  if (!le && !be) {
    return null;
  }
  return { le, be };
}

/**
 * Odczytuje Orientation (tag 0x0112) z pojedynczego IFD (offset względem początku TIFF).
 * @param {Uint8Array} u8
 * @param {number} tiffStart — początek nagłówka TIFF (II/MM…)
 * @param {number} ifdRelOffset — offset IFD od `tiffStart`
 * @param {string} [assetId='']
 * @param {number} [ifdProbeIdx=-1] — kolejność IFD w BFS (`forEachRawTiffIfdRelativeOffset`) albo lokalny indeks w SubIFD-walk
 * @returns {number | null}
 */
function readOrientationFromSingleIfd(u8, tiffStart, ifdRelOffset, assetId = '', ifdProbeIdx = -1) {
  const endian = tiffEndianAt(u8, tiffStart);
  if (!endian) {
    return null;
  }
  const { le } = endian;
  const ifd = tiffStart + ifdRelOffset;
  if (ifd + 2 > u8.length) {
    return null;
  }
  const n = le ? readU16Le(u8, ifd) : readU16be(u8, ifd);
  if (n < 1 || n > 256) {
    return null;
  }
  for (let e = 0; e < n; e += 1) {
    const ent = ifd + 2 + e * 12;
    if (ent + 12 > u8.length) {
      break;
    }
    const tag = le ? readU16Le(u8, ent) : readU16be(u8, ent);
    if (tag !== 0x0112) {
      continue;
    }
    const type = le ? readU16Le(u8, ent + 2) : readU16be(u8, ent + 2);
    const count = le ? readU32Le(u8, ent + 4) : readU32Be(u8, ent + 4);
    const vo = ent + 8;
    /** SHORT=3, BYTE=1, LONG=4 — Adobe SubIFD czasem zapisuje inaczej niż IFD0. */
    let val = null;
    if (count === 1 && type === 3) {
      val = le ? readU16Le(u8, vo) : readU16be(u8, vo);
    } else if (count === 1 && type === 1) {
      val = u8[vo];
    } else if (count === 1 && type === 4) {
      const lv = le ? readU32Le(u8, vo) : readU32Be(u8, vo);
      val = lv >>> 0;
    }
    if (val != null && val >= 1 && val <= 8) {
      if (import.meta.env?.DEV) {
        console.log(
          '[EXIF Search] Found tag 0x0112 in IFD:',
          ifdProbeIdx >= 0 ? ifdProbeIdx : `rel0x${ifdRelOffset.toString(16)}`,
          'Value:',
          val
        );
      }
      if (import.meta.env?.DEV && typeof assetId === 'string' && assetId.length > 0) {
        const raw12 = Array.from(u8.subarray(ent, Math.min(ent + 12, u8.length)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.log('[EXIF Value] Asset:', assetId, 'Tag 0x0112 exact:', {
          ifdRel: `0x${ifdRelOffset.toString(16)}`,
          type,
          count,
          value: val,
          entry12hex: raw12,
        });
      }
      return val;
    }
  }
  return null;
}

/**
 * Orientacje tylko z łańcucha SubIFD (IFD0 → 0x014a → zagnieżdżone 0x014a).
 * Gdy IFD0 ma 1, a podgląd w SubIFD ma prawdę (6/8), tu znajdziemy nie-1.
 */
function collectOrientationsSubIfdTreeOnly(u8, assetId = '') {
  const endian = tiffEndianAt(u8, 0);
  if (!endian) {
    return [];
  }
  const { le } = endian;
  const read16 = le ? (i) => readU16Le(u8, i) : (i) => readU16be(u8, i);
  const read32 = le ? (i) => readU32Le(u8, i) : (i) => readU32Be(u8, i);
  if (read16(2) !== 42) {
    return [];
  }
  const limit = u8.length;
  const tiffStart = 0;
  /** @type {number[]} */
  const vals = [];
  let subIfdOrientProbe = 0;
  const walk = (ifdRel) => {
    const ir = ifdRel >>> 0;
    if (ir < 8 || ir + 2 > limit) {
      return;
    }
    const probeIdx = subIfdOrientProbe;
    subIfdOrientProbe += 1;
    const v = readOrientationFromSingleIfd(u8, 0, ir, assetId, probeIdx);
    if (v != null) {
      vals.push(v);
    }
    const n = read16(ir);
    if (n < 1 || n > 512 || ir + 2 + n * 12 > limit) {
      return;
    }
    for (let e = 0; e < n; e += 1) {
      const ent = ir + 2 + e * 12;
      if (read16(ent) !== TAG_SUB_IFDS) {
        continue;
      }
      const subs = readSubIfdPointerArray(u8, tiffStart, ent, le);
      for (let si = 0; si < subs.length; si += 1) {
        walk(subs[si] >>> 0);
      }
    }
  };
  const ifd0 = read32(4) >>> 0;
  if (ifd0 < 8 || ifd0 + 2 > limit) {
    return vals;
  }
  const n0 = read16(ifd0);
  if (n0 < 1 || ifd0 + 2 + n0 * 12 > limit) {
    return vals;
  }
  for (let e = 0; e < n0; e += 1) {
    const ent = ifd0 + 2 + e * 12;
    if (read16(ent) !== TAG_SUB_IFDS) {
      continue;
    }
    const subs = readSubIfdPointerArray(u8, tiffStart, ent, le);
    for (let si = 0; si < subs.length; si += 1) {
      walk(subs[si] >>> 0);
    }
  }
  return vals;
}

/** Tag Exif IFD (często osobny blok metadanych). */
const TAG_EXIF_IFD_POINTER = 0x8769;

/**
 * Wartość LONG (np. wskaźnik do SubIFD) z IFD.
 * @returns {number | null}
 */
function readTagLongValue(u8, tiffStart, ifdRelOffset, tagId) {
  const endian = tiffEndianAt(u8, tiffStart);
  if (!endian) {
    return null;
  }
  const { le } = endian;
  const ifd = tiffStart + ifdRelOffset;
  if (ifd + 2 > u8.length) {
    return null;
  }
  const n = le ? readU16Le(u8, ifd) : readU16be(u8, ifd);
  if (n < 1 || n > 256) {
    return null;
  }
  for (let e = 0; e < n; e += 1) {
    const ent = ifd + 2 + e * 12;
    if (ent + 12 > u8.length) {
      break;
    }
    const tag = le ? readU16Le(u8, ent) : readU16be(u8, ent);
    if (tag !== tagId) {
      continue;
    }
    const type = le ? readU16Le(u8, ent + 2) : readU16be(u8, ent + 2);
    const count = le ? readU32Le(u8, ent + 4) : readU32Be(u8, ent + 4);
    if (type !== 4 || count !== 1) {
      continue;
    }
    const vo = ent + 8;
    const val = le ? readU32Le(u8, vo) : readU32Be(u8, vo);
    return val >>> 0;
  }
  return null;
}

/**
 * Offset następnego IFD (np. IFD1 miniatury) po liście wpisów.
 * @returns {number} 0 = brak
 */
function readNextIfdOffset(u8, tiffStart, ifdRelOffset) {
  const endian = tiffEndianAt(u8, tiffStart);
  if (!endian) {
    return 0;
  }
  const { le } = endian;
  const ifd = tiffStart + ifdRelOffset;
  if (ifd + 2 > u8.length) {
    return 0;
  }
  const n = le ? readU16Le(u8, ifd) : readU16be(u8, ifd);
  if (n < 1 || n > 512) {
    return 0;
  }
  const nextPos = ifd + 2 + n * 12;
  if (nextPos + 4 > u8.length) {
    return 0;
  }
  const next = le ? readU32Le(u8, nextPos) : readU32Be(u8, nextPos);
  return next >>> 0;
}

/**
 * IFD0 → Exif SubIFD (0x8769) → następny IFD (często IFD1 z miniaturą).
 * @returns {number | null}
 */
function readOrientationFromApp1Tiff(u8, tiffStart, assetId) {
  if (tiffStart + 8 > u8.length) {
    return null;
  }
  const endian = tiffEndianAt(u8, tiffStart);
  if (!endian) {
    return null;
  }
  const { le } = endian;
  const marker = le ? readU16Le(u8, tiffStart + 2) : readU16be(u8, tiffStart + 2);
  if (marker !== 0x002a) {
    return null;
  }
  const ifd0Off = le ? readU32Le(u8, tiffStart + 4) : readU32Be(u8, tiffStart + 4);

  const tryVal = (ifdRel, probeIdx) => {
    return readOrientationFromSingleIfd(u8, tiffStart, ifdRel, assetId, probeIdx);
  };

  let o = tryVal(ifd0Off, 0);
  if (o != null) {
    return o;
  }

  const exifSub = readTagLongValue(u8, tiffStart, ifd0Off, TAG_EXIF_IFD_POINTER);
  if (exifSub != null && exifSub > 0 && tiffStart + exifSub + 2 <= u8.length) {
    o = tryVal(exifSub, 1);
    if (o != null) {
      return o;
    }
  }

  const ifd1Off = readNextIfdOffset(u8, tiffStart, ifd0Off);
  if (ifd1Off !== 0 && tiffStart + ifd1Off + 2 <= u8.length) {
    o = tryVal(ifd1Off, 2);
    if (o != null) {
      return o;
    }
  }

  return null;
}

/**
 * Orientacja z **nagłówka TIFF** pliku RAW (DNG/CR2/NEF…): tag 0x0112 w dowolnym IFD (łańcuch + SubIFD).
 * Wartość **≠ 1** z dowolnego IFD wygrywa z Orientation: 1 z innego IFD (np. błędny JPEG w SubIFD).
 * Pomija bufory zaczynające się od SOI JPEG (to nie TIFF-RAW).
 *
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {string} [assetId=''] — log `[EXIF Value]` w DEV
 * @returns {number | null} 1–8 albo `null` (brak TIFF / brak tagu)
 */
export function getRawFileOrientation(buffer, assetId = '') {
  try {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (u8.length < 8) {
      return null;
    }
    if (u8[0] === 0xff && u8[1] === 0xd8) {
      return null;
    }
    const endian0 = tiffEndianAt(u8, 0);
    if (!endian0) {
      return null;
    }
    const { le } = endian0;
    const marker = le ? readU16Le(u8, 2) : readU16be(u8, 2);
    if (marker !== 0x002a) {
      return null;
    }
    /** Pierwszy napotkany tag 0x0112 ≠ 1 w kolejności BFS — przerywamy natychmiast. */
    let firstNon1 = null;
    forEachRawTiffIfdRelativeOffset(u8, (ifdRel, ifdIdx) => {
      const v = readOrientationFromSingleIfd(u8, 0, ifdRel, assetId, ifdIdx);
      if (v != null && v !== 1) {
        firstNon1 = v;
        return false;
      }
    });
    if (firstNon1 != null) {
      if (import.meta.env?.DEV && typeof assetId === 'string' && assetId.length > 0) {
        console.log('[RAW Orientation] Asset:', assetId, 'Value:', firstNon1, '(first IFD tag ≠1)');
      }
      return firstNon1;
    }

    const subIfdOrientations = collectOrientationsSubIfdTreeOnly(u8, assetId);
    const preferSubNot1 = subIfdOrientations.find((v) => v !== 1);

    /** Wszystkie IFD: pierwsza orientacja ≠ 1 wygrywa z „fałszywą jedynką” z innego IFD. */
    const found = [];
    forEachRawTiffIfdRelativeOffset(u8, (ifdRel, ifdIdx) => {
      const v = readOrientationFromSingleIfd(u8, 0, ifdRel, assetId, ifdIdx);
      if (v != null) {
        found.push(v);
      }
    });
    const prefer = found.find((v) => v !== 1);
    let out = prefer != null ? prefer : found.length ? found[0] : null;

    if (preferSubNot1 != null && (out == null || out === 1)) {
      out = preferSubNot1;
    }
    if (out == null || out === 1) {
      const hdr = findOrientationInRawHeader(u8);
      if (hdr != null && hdr !== 1) {
        if (import.meta.env?.DEV && typeof assetId === 'string' && assetId.length > 0) {
          console.log('[RAW Orientation] Asset:', assetId, 'Value:', hdr);
        }
        return hdr;
      }
      if (out == null && hdr != null) {
        if (import.meta.env?.DEV && typeof assetId === 'string' && assetId.length > 0) {
          console.log('[RAW Orientation] Asset:', assetId, 'Value:', hdr);
        }
        return hdr;
      }
    }
    if (
      import.meta.env?.DEV &&
      typeof assetId === 'string' &&
      assetId.length > 0 &&
      out != null
    ) {
      console.log('[RAW Orientation] Asset:', assetId, 'Value:', out);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Strip + pierwszy kafelek (0x0144/0x0145). Preferuje **największy** wycinek zaczynający się od SOI
 * (zwykły JPEG), żeby nie wybierać ogromnego surowca zamiast mniejszego podglądu.
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {{ assetId?: string } | void} [options]
 * @returns {ArrayBuffer | null}
 */
export function tryExtractLargestTiffStripAsOpaqueBuffer(buffer, options) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const assetId = options && typeof options.assetId === 'string' ? options.assetId : '';
  if (u8.length < 20 || (u8[0] === 0xff && u8[1] === 0xd8)) {
    return null;
  }
  const endian = tiffEndianAt(u8, 0);
  if (!endian) {
    return null;
  }
  const { le } = endian;
  const read16 = le ? (i) => readU16Le(u8, i) : (i) => readU16be(u8, i);
  const read32 = le ? (i) => readU32Le(u8, i) : (i) => readU32Be(u8, i);
  if (read16(2) !== 42) {
    return null;
  }
  const limit = u8.length;
  let bestAny = null;
  let bestAnyLen = 0;
  let bestJpeg = null;
  let bestJpegLen = 0;
  /** @type {{ off: number; len: number } | null} */
  let metaAny = null;
  /** @type {{ off: number; len: number } | null} */
  let metaJpeg = null;
  const bumpAny = (ab, off, len) => {
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < 64 || ab.byteLength <= bestAnyLen) {
      return;
    }
    bestAny = ab;
    bestAnyLen = ab.byteLength;
    if (off != null && len != null) {
      metaAny = { off: off >>> 0, len: len >>> 0 };
    }
  };
  const bumpJpeg = (ab, off, len) => {
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < 64) {
      return;
    }
    const z = new Uint8Array(ab);
    if (z.length >= 2 && z[0] === 0xff && z[1] === 0xd8 && ab.byteLength > bestJpegLen) {
      bestJpeg = ab;
      bestJpegLen = ab.byteLength;
      if (off != null && len != null) {
        metaJpeg = { off: off >>> 0, len: len >>> 0 };
      }
    }
  };
  const absorbSlice = (seg) => {
    if ('buffer' in seg && seg.buffer instanceof ArrayBuffer) {
      if (seg.buffer.byteLength > MAX_STRIP_DECODE_BYTES) {
        return;
      }
      bumpAny(seg.buffer, null, null);
      bumpJpeg(seg.buffer, null, null);
    } else if ('off' in seg && 'len' in seg) {
      const { off, len } = seg;
      const lenU = len >>> 0;
      if (lenU > MAX_STRIP_DECODE_BYTES) {
        return;
      }
      if (lenU >= 64 && off + len <= limit) {
        const slab = u8.buffer.slice(u8.byteOffset + off, u8.byteOffset + off + len);
        bumpAny(slab, off, len);
        bumpJpeg(slab, off, len);
      }
    }
  };
  forEachRawTiffIfdRelativeOffset(u8, (ifdOff) => {
    const compressionTag = readCompressionTagFromIfd(u8, ifdOff, read16, read32, le, limit);
    if (compressionTag !== 6 && compressionTag !== 7) {
      return;
    }
    for (const seg of collectTiffStripSlicesFromIfd(u8, 0, ifdOff, read16, read32, le, limit)) {
      absorbSlice(seg);
    }
    for (const seg of collectTiffTileSlicesFromIfd(u8, 0, ifdOff, read16, read32, le, limit)) {
      absorbSlice(seg);
    }
  });
  const result = bestJpeg ?? bestAny;
  if (import.meta.env?.DEV && assetId && result) {
    const m = bestJpeg ? metaJpeg : metaAny;
    if (m) {
      console.log('[DNG Found] Offset:', m.off, 'Length:', m.len, 'for asset:', assetId);
    } else {
      console.log(
        '[DNG Found] Offset:',
        '(merged)',
        'Length:',
        result.byteLength,
        'for asset:',
        assetId
      );
    }
  }
  return result;
}

/** Sygnatura IFD: tag 0x0112, typ 3 (SHORT), count 1 — LE. */
const BRUTE_ORIENT_LE = Uint8Array.of(0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00);
/** To samo — BE (Motorola). */
const BRUTE_ORIENT_BE = Uint8Array.of(0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01);

/**
 * Gdy IFD zwraca 1 lub nic — szukaj tagu 0x0112 w surowych bajtach pierwszych 256 KiB (IFD0 / „prawda” o obrocie).
 * Implementacja współdzielona z {@link bruteForceOrientationSearch}.
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {number | null}
 */
export function findOrientationInRawHeader(buffer) {
  return bruteForceOrientationSearch(buffer);
}

/**
 * Gdy IFD jest nietypowy: skan pierwszych 256 KiB pod kątem surowego wpisu Orientation.
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {number | null} 1–8 lub null
 */
export function bruteForceOrientationSearch(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const max = Math.min(u8.length, TIFF_BRUTE_BYTE_SCAN_HEAD);
  let fallback1 = null;
  for (let i = 0; i + 10 <= max; i += 1) {
    let leOk = true;
    for (let j = 0; j < 8; j += 1) {
      if (u8[i + j] !== BRUTE_ORIENT_LE[j]) {
        leOk = false;
        break;
      }
    }
    if (leOk) {
      const v = readU16Le(u8, i + 8);
      if (v >= 1 && v <= 8) {
        if (v !== 1) {
          return v;
        }
        if (fallback1 == null) {
          fallback1 = v;
        }
      }
    }
    let beOk = true;
    for (let j = 0; j < 8; j += 1) {
      if (u8[i + j] !== BRUTE_ORIENT_BE[j]) {
        beOk = false;
        break;
      }
    }
    if (beOk) {
      const v = readU16be(u8, i + 8);
      if (v >= 1 && v <= 8) {
        if (v !== 1) {
          return v;
        }
        if (fallback1 == null) {
          fallback1 = v;
        }
      }
    }
  }
  return fallback1;
}

/**
 * Skanuje początek JPEG-a (APP1/Exif, do `EXIF_ORIENTATION_SCAN`) i zwraca Orientation (1–8).
 * Przy braku tagu lub uszkodzonym nagłówku: **1** (normalna).
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {string} [assetId] — do logu `[EXIF Search]` w DEV
 * @returns {number}
 */
export function getExifOrientation(buffer, assetId) {
  try {
    return getExifOrientationImpl(buffer, assetId);
  } catch {
    return 1;
  }
}

function getExifOrientationImpl(buffer, assetId) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const scanLen = Math.min(u8.length, EXIF_ORIENTATION_SCAN);
  if (scanLen < 12 || u8[0] !== 0xff || u8[1] !== 0xd8) {
    return 1;
  }
  let i = 2;
  while (i < scanLen - 1) {
    if (u8[i] !== 0xff) {
      i += 1;
      continue;
    }
    const m = u8[i + 1];
    if (m === 0xd9) {
      break;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (m === 0xda) {
      break;
    }
    if (i + 4 > scanLen) {
      break;
    }
    const segLen = readU16be(u8, i + 2);
    if (segLen < 2 || i + 2 + segLen > scanLen) {
      break;
    }
    const dataStart = i + 4;
    const dataEnd = i + 2 + segLen;
    if (m === 0xe1) {
      if (
        dataStart + 8 <= dataEnd &&
        u8[dataStart] === 0x45 &&
        u8[dataStart + 1] === 0x78 &&
        u8[dataStart + 2] === 0x69 &&
        u8[dataStart + 3] === 0x66 &&
        u8[dataStart + 4] === 0 &&
        u8[dataStart + 5] === 0
      ) {
        const tiffStart = dataStart + 6;
        const o = readOrientationFromApp1Tiff(u8, tiffStart, assetId);
        if (o != null) {
          if (import.meta.env?.DEV && typeof assetId === 'string' && assetId.length > 0) {
            console.log('[RAW Orientation] Asset:', assetId, 'Value:', o);
          }
          return o;
        }
      }
    }
    i = i + 2 + segLen;
  }
  return 1;
}
