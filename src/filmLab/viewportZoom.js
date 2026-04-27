function clampZoomValue(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export const MIN_CANVAS_ZOOM = 0.05;
export const MAX_CANVAS_ZOOM = 64;
export const ZOOM_STEP = 0.12;
export const ZOOM_STOPS = Object.freeze([
  0.25,
  0.33,
  0.5,
  0.67,
  0.75,
  0.85,
  1,
  1.25,
  1.5,
  2,
  3,
  4,
  6,
  8,
  12,
  16,
  24,
]);

export const PAN_KEY_STEP = 40;
export const ZOOM_MODE_STORAGE_KEY = 'mindfullens_zoom_mode';
export const ZOOM_MODE = Object.freeze({
  SIGNATURE_FIT: 'signature-fit',
  CLASSIC: 'classic',
});
export const FIT_UI_ZOOM = 1;
export const FIT_DOUBLE_CLICK_THRESHOLD = FIT_UI_ZOOM + 0.05;
export const WHEEL_ZOOM_PERCENT_STEP = 0.01;
export const WHEEL_MOUSE_NOTCH_MIN_DELTA = 40;
export const WHEEL_MOUSE_NOTCH_DELTA = 120;
export const WHEEL_TRACKPAD_STEP_DELTA = 1;
export const PAN_ACTIVATION_OVERFLOW_PX = 0;

export function resolveNextZoomStop(currentZoom, direction = 1, stops = ZOOM_STOPS) {
  const safeZoom = clampZoomValue(Number(currentZoom) || 1, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM);
  const normalizedDirection = direction >= 0 ? 1 : -1;
  const sortedStops = stops.filter(Number.isFinite).sort((left, right) => left - right);

  if (!sortedStops.length) {
    return clampZoomValue(
      safeZoom + normalizedDirection * ZOOM_STEP,
      MIN_CANVAS_ZOOM,
      MAX_CANVAS_ZOOM
    );
  }

  if (normalizedDirection > 0) {
    const next = sortedStops.find((stop) => stop > safeZoom + 0.0001);
    return next ?? sortedStops[sortedStops.length - 1] ?? MAX_CANVAS_ZOOM;
  }

  const reversed = [...sortedStops].reverse();
  const prev = reversed.find((stop) => stop < safeZoom - 0.0001);
  return prev ?? sortedStops[0] ?? MIN_CANVAS_ZOOM;
}
