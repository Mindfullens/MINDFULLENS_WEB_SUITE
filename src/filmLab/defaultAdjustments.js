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
  brushMaskEnabled: false,
  localMaskMode: 'brush',
  localMaskShowOverlay: false,
  localMaskOpacity: 100,
  localMaskBlend: 'normal',
  localMaskName: 'Maska 1',
  localMaskEnabled: true,
  localMaskSoloIndex: -1,
  aiAssistBackend: 'none',
  aiAssistRuns: 0,
  aiAssistLastLatencyMs: null,
  aiAssistTotalLatencyMs: 0,
  aiAssistBestLatencyMs: null,
  aiAssistWorstLatencyMs: null,
  activeLocalMaskIndex: 0,
  localMasks: [],
  brushMaskRadius: 80,
  brushMaskFeather: 65,
  brushMaskExposure: 35,
  brushMaskErase: false,
  /** 0–100: przy >0 znaczki pędzla ważą Sobel lumy — mocniejsze na krawędziach (P1 edge brush). */
  brushMaskEdgeSensitivity: 0,
  brushMaskStrokes: [],
  linearMaskAngle: 0,
  linearMaskFeather: 55,
  linearMaskOffset: 0,
  radialMaskCenterX: 50,
  radialMaskCenterY: 50,
  radialMaskRadius: 35,
  radialMaskFeather: 55,
  lumaMaskMin: 0,
  lumaMaskMax: 100,
  lumaMaskFeather: 35,
  /** Proxy depth (jasność sceny): zakres 0–100 jak luma; × pędzel w trybie „Głębia”. */
  depthMaskMin: 0,
  depthMaskMax: 100,
  depthMaskFeather: 35,
  /** Źródło mapy głębi: `luminance` (domyślnie); przyszłe wartości po ONNX / buforze. */
  depthMapSource: 'luminance',
  /** Invalidacja cache maski przy podłączeniu zewnętrznego bufora głębi (np. skrót SHA); null = brak bufora. */
  depthProxyDigest: null,
  colorMaskHueCenter: 210,
  colorMaskHueWidth: 90,
  colorMaskFeather: 35,
  /** Zakres saturacji (chroma) w masce „color”: 0–100 → HSL S 0–1 */
  colorMaskChromaMin: 0,
  colorMaskChromaMax: 100,

  /** Mask graph v0: combine two stack slots, then apply exposure once (driver = aktywna maska). */
  localMaskGraphEnabled: false,
  localMaskGraphOp: 'intersect',
  localMaskGraphIndexA: 0,
  localMaskGraphIndexB: 1,

  /** Widok Maski (PRO): aktywna sekcja buildera prawego pasa. */
  maskStudioBuilderSection: 'geometry',

  /** Przypięcia suwaków Develop → węzeł maski (recipe / HME). */
  adjustmentBindings: [],

  /** `simple` ukrywa zaawansowany graf maski; jeden stan adjustments. */
  uiMode: 'pro',

  /** Warstwy v0 — kolejność listy = kolejność aplikacji po maskach HME. */
  recipeLayersV0: [],
  recipeLayersSelectedIndex: 0,

  /** Retusz v1: `none` | `heal` | `clone` | `removeObject` — podgląd CPU spójny z zakładką Retusz. */
  retouchTool: 'none',
  /** `global` — cały kadr; `masked` — waga wg maski HME (max ze stacku lub graf). */
  retouchScope: 'masked',
  /** 0–100: siła mieszania Heal (rozmycie 3×3). */
  retouchHealStrength: 40,
  /** Placeholder AI usuwania obiektu: `idle` | `pending` | `done` | `error`. */
  retouchRemoveObjectState: 'idle',

  /** Etap 15: przy eksporcie wsadowym — ponów heurystykę masek AI-assist per plik. */
  batchRecomputeAiMasksHeuristic: false,

  /** P2: przybliżony „soft proof” CMYK na podglądzie CPU (bez ICC); eksport pozostaje sRGB. */
  cmykSoftProofEnabled: false,

  /** P2: znacznik recipe — węzeł `semantic.generative_stub.v1` w projekcji maskGraph (bez renderu generacji). */
  generativeAiStubIntent: false,
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
