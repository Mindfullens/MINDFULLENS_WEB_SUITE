import { clamp } from './crop/cropStraighten.js';

export const DEFAULT_ADJUSTMENTS = {
  strength: 100,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  level: 0,
  cropZoom: 100,
  cropX: 0,
  cropY: 0,
  cropAspect: 'free',
  cropOverlayMode: 'none',
  cropOverlayOrientation: 0,
  autoStraightenConfidence: 0,
  cropRectX: 0,
  cropRectY: 0,
  cropRectW: 1,
  cropRectH: 1,
  fade: 0,
  clarity: 0,
  dehaze: 0,
  temp: 0,
  tint: 0,
  showClipping: false,
  saturation: 0,
  vibrance: 0,
  curveLumaMix: 72,
  userGrain: 0,
  userGrainSize: 10,
  userVignette: 0,
  leak: 'none',
  frame: 'none',
  chromAb: 0,
  bloom: 0,
  dust: 0,
  dustVariant: -1,
  dustCycle: 0,
  rawLeakVariant: -1,
  rawLeakCycle: 0,
  frameVariant: -1,
  frameCycle: 0,
  halation: 0,
  halRadius: 30,
  halThresh: 200,
  halHue: 0,
  anamorph: 0,
  streakLen: 50,
  flipped: false,
  rotation: 0,
  compareMode: false,
  compareX: 0.5,
};

export function getFilmGrainDefaults(film) {
  const amount = Number(film?.defaultGrainAmount);
  const size = Number(film?.defaultGrainSize);

  return {
    amount: Number.isFinite(amount) ? clamp(Math.round(amount), 0, 100) : 0,
    size: Number.isFinite(size) ? clamp(Math.round(size), 10, 100) : 10,
  };
}

export function getAdjustmentDefaultValue(name, film) {
  if (name === 'userGrain' || name === 'userGrainSize') {
    const grainDefaults = getFilmGrainDefaults(film);
    return name === 'userGrain' ? grainDefaults.amount : grainDefaults.size;
  }

  return DEFAULT_ADJUSTMENTS[name];
}
