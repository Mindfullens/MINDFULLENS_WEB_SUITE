/**
 * Lekka warstwa „coherence” Develop (jedna semantyka interakcji dla UI + efektów podglądu).
 * Docelowy kierunek: więzy multi-way (slider ↔ histogram ↔ canvas) — na razie jawne predykaty.
 */

/** @param {unknown} interactionKind */
export function isDevelopSliderInteraction(interactionKind) {
  return typeof interactionKind === 'string' && interactionKind.startsWith('slider:');
}
