/**
 * Rysuje ImageBitmap na canvasie 2D (natychmiastowe — bez dekodowania na tym wątku).
 *
 * Worker DAM: `createFilmLabImageBitmapAsStoredInFile` (piksele jak w JPEG), orientacja EXIF 1–8
 * z TIFF/`catalogAssetMeta` / sondy `source.bin` — `drawImageBitmapToRectWithOrientation` (2–8) albo 1.
 *
 * WAŻNE: ta funkcja NIE czyści tła canvas — caller jest odpowiedzialny za `clearRect`.
 */

/**
 * @param {number} o
 * @returns {number} 1–8
 */
function clampExifOrientation(o) {
  const n = Math.floor(Number(o));
  if (n >= 1 && n <= 8) {
    return n;
  }
  return 1;
}

/**
 * Rysuje bitmapę w prostokącie (współrzędne CSS — ctx już przeskalowany przez DPR jeśli trzeba).
 * Nie czyści canvasu — caller odpowiada za clearRect/fill przed wywołaniem.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ImageBitmap} bitmap
 * @param {number} orientation — EXIF 1–8
 * @param {number} x
 * @param {number} y
 * @param {number} w  — szerokość docelowego prostokąta (px CSS)
 * @param {number} h  — wysokość docelowego prostokąta (px CSS)
 */
const MIN_BITMAP_EDGE_PX = 10;

export function drawImageBitmapToRectWithOrientation(ctx, bitmap, orientation, x, y, w, h) {
  if (!ctx || !bitmap || typeof bitmap.width !== 'number') {
    return;
  }
  const orient = clampExifOrientation(orientation);
  const bw = bitmap.width;
  const bh = bitmap.height;
  if (bw < MIN_BITMAP_EDGE_PX || bh < MIN_BITMAP_EDGE_PX || w < 1 || h < 1) {
    return;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.save();

  /**
   * EXIF 6 / 8: translate(narożnik) + rotate; pełna bitmapa → dest przez drawImage 9-arg (jedna transformacja).
   */
  if (orient === 6) {
    const s = Math.min(w / bh, h / bw);
    const dw = bw * s;
    const dh = bh * s;
    ctx.translate(x + w, y);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(bitmap, 0, 0, bw, bh, -dh, 0, dh, dw);
    ctx.restore();
    return;
  }
  if (orient === 8) {
    const s = Math.min(w / bh, h / bw);
    const dw = bw * s;
    const dh = bh * s;
    ctx.translate(x, y + h);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(bitmap, 0, 0, bw, bh, 0, -dw, dw, dh);
    ctx.restore();
    return;
  }

  /** EXIF 3: obrót 180° wokół prawego dolnego narożnika docelowego prostokąta. */
  if (orient === 3) {
    const s = Math.min(w / bw, h / bh);
    const dw = bw * s;
    const dh = bh * s;
    ctx.translate(x + w, y + h);
    ctx.rotate(Math.PI);
    ctx.drawImage(bitmap, 0, 0, bw, bh, -dw, -dh, dw, dh);
    ctx.restore();
    return;
  }

  ctx.translate(cx, cy);

  /**
   * Orientacje 5 i 7: transpose / transverse (flip + rotate 90°).
   * Efektywne wymiary jak 6/8 (zamiana osi).
   * Contain: skaluj do `bh × bw` w prostokącie `w × h`.
   */
  if (orient === 5 || orient === 7) {
    const s = Math.min(w / bh, h / bw);
    const dw = bw * s;
    const dh = bh * s;
    if (orient === 5) {
      ctx.rotate(Math.PI / 2);
      ctx.scale(-1, 1);
    } else {
      ctx.rotate(-Math.PI / 2);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    return;
  }

  /** Orientacje 1, 2, 4: contain + ewentualne odbicia (3 obsłużone wyżej). */
  const s = Math.min(w / bw, h / bh);
  const dw = bw * s;
  const dh = bh * s;

  switch (orient) {
    case 2:
      ctx.scale(-1, 1);
      break;
    case 4:
      ctx.scale(1, -1);
      break;
    default:
      break;
  }
  ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {ImageBitmap} bitmap
 * @param {number} [exifOrientation=1]
 */
/**
 * Bufor canvas = dokładnie wymiary bitmapy (1:1 piksel); skalowanie wyłącznie przez CSS (`object-fit` / max-*).
 * Bez rotacji EXIF w ctx — użyj {@link getCssTransformForExifOrientation} na kontenerze.
 * @param {HTMLCanvasElement} canvas
 * @param {ImageBitmap} bitmap
 */
export function drawPixelPerfectBitmapToCanvas(canvas, bitmap) {
  if (!(canvas instanceof HTMLCanvasElement) || !bitmap || typeof bitmap.width !== 'number') {
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const bw = bitmap.width;
  const bh = bitmap.height;
  if (bw < 1 || bh < 1) {
    return;
  }
  canvas.width = bw;
  canvas.height = bh;
  ctx.clearRect(0, 0, bw, bh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bitmap, 0, 0);
}

export function drawImageBitmapToCanvas(canvas, bitmap, exifOrientation = 1) {
  if (!(canvas instanceof HTMLCanvasElement) || !bitmap || typeof bitmap.width !== 'number') {
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 2 || h < 2) {
    return;
  }
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawImageBitmapToRectWithOrientation(ctx, bitmap, exifOrientation, 0, 0, w, h);
}

export { drawImageBitmapToRectWithOrientation as drawRotatedImageBitmapInRect };

/**
 * Globalny helper EXIF 1–8: tożsamy z {@link drawImageBitmapToRectWithOrientation} na prostokącie docelowym.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} image
 * @param {number} orientationCode
 * @param {number} destX
 * @param {number} destY
 * @param {number} destW
 * @param {number} destH
 */
export function drawRotatedImage(ctx, image, orientationCode, destX, destY, destW, destH) {
  drawImageBitmapToRectWithOrientation(ctx, image, orientationCode, destX, destY, destW, destH);
}

/**
 * Cały element canvas (client → DPR); najpierw rozmiar bufora, potem rysunek w (0,0,w,h).
 */
export function drawRotatedImageToCanvas(canvas, image, orientationCode) {
  drawImageBitmapToCanvas(canvas, image, orientationCode);
}
