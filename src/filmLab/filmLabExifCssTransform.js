/**
 * Mapowanie EXIF Orientation (1–8) na transform CSS kontenera — bez obracania pikseli na canvasie 2D.
 * @param {number} orientation
 * @returns {string} wartość `transform` (np. rotate(90deg))
 */
export function clampExifOrientation(o) {
  const n = Math.floor(Number(o));
  return n >= 1 && n <= 8 ? n : 1;
}

export function getCssTransformForExifOrientation(orientation) {
  switch (clampExifOrientation(orientation)) {
    case 2:
      return 'scaleX(-1)';
    case 3:
      return 'rotate(180deg)';
    case 4:
      return 'scaleY(-1)';
    case 5:
      return 'rotate(90deg) scaleX(-1)';
    case 6:
      return 'rotate(90deg)';
    case 7:
      return 'rotate(-90deg) scaleX(-1)';
    case 8:
      return 'rotate(-90deg)';
    default:
      return 'none';
  }
}
