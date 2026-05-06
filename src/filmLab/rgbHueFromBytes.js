/**
 * Hue (0–360°) z RGB 8-bit — ta sama geometria co `rgbToHsl` w `filmLabLocalMaskRangeMath.js`.
 */
export function rgbBytesToHueDegrees(red, green, blue) {
  const r = Math.max(0, Math.min(255, Number(red) || 0)) / 255;
  const g = Math.max(0, Math.min(255, Number(green) || 0)) / 255;
  const b = Math.max(0, Math.min(255, Number(blue) || 0)) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max === min) {
    return 0;
  }

  const delta = max - min;
  let hue = 0;

  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
  }

  const hueDeg = (hue / 6) * 360;
  return ((hueDeg % 360) + 360) % 360;
}
