/**
 * Bloom hybrydowy (Faza B): rozmycie jasności w D65 Lab — zamiana L na rozmytą,
 * chrominancja a/b z oryginału, potem ten sam kompozyt `screen` co `applyBloom` (RGB).
 */

const XN = 95.047;
const YN = 100;
const ZN = 108.883;
const EPS = 216 / 24389;
const KAP = 24389 / 27;

function clampByte(value) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

function srgbByteToLinear(byte) {
  const u = (byte ?? 0) / 255;
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(linear) {
  const v =
    linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return clampByte(v * 255);
}

function linearRgbToXyz100(linR, linG, linB) {
  const X = (linR * 0.4124564 + linG * 0.3575761 + linB * 0.1804375) * 100;
  const Y = (linR * 0.2126729 + linG * 0.7151522 + linB * 0.072175) * 100;
  const Z = (linR * 0.0193339 + linG * 0.119192 + linB * 0.9503041) * 100;
  return [X, Y, Z];
}

function labF(t) {
  return t > EPS ? Math.cbrt(t) : (KAP * t + 16) / 116;
}

function xyz100ToLab(x, y, z) {
  const fx = labF(x / XN);
  const fy = labF(y / YN);
  const fz = labF(z / ZN);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return { L, a, b };
}

function labFInv(t) {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAP;
}

function lab100ToXyz100(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const X = XN * labFInv(fx);
  const Y = YN * labFInv(fy);
  const Z = ZN * labFInv(fz);
  return [X, Y, Z];
}

function xyz100ToLinearRgb(X, Y, Z) {
  const x = X / 100;
  const y = Y / 100;
  const z = Z / 100;
  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  let g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  let b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  r = Math.min(1, Math.max(0, r));
  g = Math.min(1, Math.max(0, g));
  b = Math.min(1, Math.max(0, b));
  return [r, g, b];
}

export function srgbBytesToLab(redByte, greenByte, blueByte) {
  const r = srgbByteToLinear(redByte);
  const g = srgbByteToLinear(greenByte);
  const b = srgbByteToLinear(blueByte);
  const [x, y, z] = linearRgbToXyz100(r, g, b);
  return xyz100ToLab(x, y, z);
}

export function labToSrgbBytes(L, a, b) {
  const Lc = Math.min(100, Math.max(0, L));
  const [x, y, z] = lab100ToXyz100(Lc, a, b);
  const [lr, lg, lb] = xyz100ToLinearRgb(x, y, z);
  return [linearToSrgbByte(lr), linearToSrgbByte(lg), linearToSrgbByte(lb)];
}

/** Jednorazowy canvas pomocniczy do rozmycia (nie można blurować „samego siebie”). */
let blurScratchCanvas = null;

function ensureOffscreenCanvas(ref, width, height) {
  if (!ref.current) {
    ref.current = document.createElement('canvas');
  }
  if (ref.current.width !== width) {
    ref.current.width = width;
  }
  if (ref.current.height !== height) {
    ref.current.height = height;
  }
  return ref.current;
}

function get2d(canvas, options = {}) {
  return (
    canvas.getContext('2d', {
      colorSpace: 'srgb',
      ...options,
    }) || canvas.getContext('2d', options)
  );
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {HTMLCanvasElement} canvas
 * @param {{ current: HTMLCanvasElement | null }} fxCanvasRef
 * @param {number} amount 0..1 (jak dotychczasowy bloom /100)
 */
export function applyBloomLabLuminance(context, canvas, fxCanvasRef, amount) {
  if (!(amount > 0)) {
    return;
  }

  const { width, height } = canvas;
  if (width < 2 || height < 2) {
    return;
  }

  const original = context.getImageData(0, 0, width, height);
  const src = original.data;
  const grayData = new Uint8ClampedArray(src.length);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i += 1) {
    const p = i * 4;
    const { L } = srgbBytesToLab(src[p], src[p + 1], src[p + 2]);
    const g = clampByte((L / 100) * 255);
    grayData[p] = g;
    grayData[p + 1] = g;
    grayData[p + 2] = g;
    grayData[p + 3] = 255;
  }

  const grayImage = new ImageData(grayData, width, height);

  const fxCanvas = ensureOffscreenCanvas(fxCanvasRef, width, height);
  const fxContext = get2d(fxCanvas, { willReadFrequently: true });
  if (!fxContext) {
    return;
  }

  fxContext.putImageData(grayImage, 0, 0);
  const blurPx = Math.round(amount * 20);

  if (!blurScratchCanvas) {
    blurScratchCanvas = document.createElement('canvas');
  }
  blurScratchCanvas.width = width;
  blurScratchCanvas.height = height;
  const blurCtx = get2d(blurScratchCanvas, { willReadFrequently: true });
  if (!blurCtx) {
    return;
  }
  blurCtx.clearRect(0, 0, width, height);
  blurCtx.filter = `blur(${blurPx}px)`;
  blurCtx.drawImage(fxCanvas, 0, 0);
  blurCtx.filter = 'none';

  const blurred = blurCtx.getImageData(0, 0, width, height);
  const bd = blurred.data;

  const bloomLayer = new ImageData(width, height);
  const out = bloomLayer.data;

  for (let i = 0; i < pixelCount; i += 1) {
    const p = i * 4;
    const Lb = (bd[p] / 255) * 100;
    const chroma = srgbBytesToLab(src[p], src[p + 1], src[p + 2]);
    const [br, bg, bb] = labToSrgbBytes(Lb, chroma.a, chroma.b);
    out[p] = br;
    out[p + 1] = bg;
    out[p + 2] = bb;
    out[p + 3] = 255;
  }

  fxContext.putImageData(bloomLayer, 0, 0);

  context.putImageData(original, 0, 0);
  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = amount * 0.5;
  context.drawImage(fxCanvas, 0, 0);
  context.restore();
}
