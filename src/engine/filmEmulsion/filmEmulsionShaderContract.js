/**
 * Kontrakt mapowania narzędzi filmowych na GPU:
 * - **Grain**: szum zależny od rozdzielczości wyjściowej, ISO-proxy i krzywej charakterystyki kliszy;
 *   uniformy aktualizowane co klatkę / przy zmianie zoomu, nie bitmapa „grain overlay”.
 * - **Halation**: rozpraszanie w gałęzi highlightów oparte na jasności sceny i barwie halacji,
 *   parametryzowane shaderem (promień, threshold, barwa), bez stałej „glow” tekstury.
 *
 * Integracja z istniejącym pipeline: kolejne etapy `FilmEmulsionPassDescriptor` można wpiąć
 * między tonemap a grain LUT lub jako osobny podgraf — szczegóły w `filmEmulsionPassRegistry.js`.
 *
 * **Krzywe / tonacja (realizm emulsji):** regułowanie krzywych RGB/R/G/B doprowadza do GPU sprzętowe
 * próbkowanie **1D LUT** (per kanał), zamiast wielomianów w fragmencie — to standard szybkiego,
 * stabilnego mapowania tonów przy podglądzie i eksporcie.
 */

/** @typedef {'pre_grade' | 'post_lut' | 'pre_export'} FilmEmulsionPipelineAnchor */

/**
 * @typedef {object} FilmEmulsionUniformSchema
 * @property {string} name
 * @property {'float'|'vec2'|'vec3'|'vec4'|'sampler2D'} glslType
 * @property {boolean} [dynamicPerFrame] — wymaga odświeżenia przy każdej klatce preview
 */

/**
 * @typedef {object} FilmEmulsionPassDescriptor
 * @property {string} id
 * @property {'grain'|'halation'|'composite'} family
 * @property {FilmEmulsionPipelineAnchor[]} anchors — sensowne punkty montażu w grafie
 * @property {FilmEmulsionUniformSchema[]} uniforms
 * @property {boolean} requiresSceneLinearInput
 */

/** Przykładowe ID przyszłych przejść (implementacja GLSL poza tym plikiem). */
export const FILM_EMULSION_PASS_IDS = Object.freeze({
  grainHalftoneScatter: 'film_emulsion.grain_scatter.v1',
  halationElderGlow: 'film_emulsion.halation_highlight_scatter.v1',
});
