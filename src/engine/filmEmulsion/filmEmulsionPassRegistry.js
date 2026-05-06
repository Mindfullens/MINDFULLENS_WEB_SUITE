import { FILM_EMULSION_PASS_IDS } from './filmEmulsionShaderContract.js';

/**
 * Rejestr przejść emulsji — przygotowanie pod podłączenie do silnika (WebGL/WebGPU).
 * Obiekty `descriptor` opisują tylko konfigurację; kompilacja shaderów nastąpi w warstwie rendererów.
 */

export function createFilmEmulsionPassRegistry() {
  /** @type {Map<string, import('./filmEmulsionShaderContract.js').FilmEmulsionPassDescriptor>} */
  const passes = new Map();

  return {
    passes,
    /**
     * @param {string} id
     * @param {import('./filmEmulsionShaderContract.js').FilmEmulsionPassDescriptor} descriptor
     */
    register(id, descriptor) {
      passes.set(id, descriptor);
    },
    get(id) {
      return passes.get(id);
    },
  };
}

/** Fabryka domyślnego rejestru ze stubami pod ziarno i halację (uniformy = kontrakty, bez GLSL). */
export function createDefaultFilmEmulsionPassRegistry() {
  const r = createFilmEmulsionPassRegistry();

  r.register(FILM_EMULSION_PASS_IDS.grainHalftoneScatter, {
    id: FILM_EMULSION_PASS_IDS.grainHalftoneScatter,
    family: 'grain',
    anchors: ['post_lut'],
    uniforms: [
      { name: 'u_grainIntensity', glslType: 'float', dynamicPerFrame: false },
      { name: 'u_grainScalePx', glslType: 'float', dynamicPerFrame: true },
      { name: 'u_noisePhase', glslType: 'vec2', dynamicPerFrame: true },
    ],
    requiresSceneLinearInput: true,
  });

  r.register(FILM_EMULSION_PASS_IDS.halationElderGlow, {
    id: FILM_EMULSION_PASS_IDS.halationElderGlow,
    family: 'halation',
    anchors: ['post_lut', 'pre_export'],
    uniforms: [
      { name: 'u_halationGain', glslType: 'float', dynamicPerFrame: false },
      { name: 'u_highlightThreshold', glslType: 'float', dynamicPerFrame: false },
      { name: 'u_scatterRadiusPx', glslType: 'float', dynamicPerFrame: true },
      { name: 'u_halationTint', glslType: 'vec3', dynamicPerFrame: false },
    ],
    requiresSceneLinearInput: true,
  });

  return r;
}
