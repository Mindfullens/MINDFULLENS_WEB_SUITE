/** Wersjonowanie metadanych koperty (nie wpływa na hash looku — tylko transport). */
export const FILMLAB_RECIPE_META_SCHEMA = 'mindfullens.recipe-meta.v1';

/**
 * @returns {{ schema: string, encoder: string, encodedAtMs: number }}
 */
export function buildRecipeEnvelopeMeta() {
  return {
    schema: FILMLAB_RECIPE_META_SCHEMA,
    encoder: 'mindfullens-film-lab-recipe-codec',
    encodedAtMs: Date.now(),
  };
}
