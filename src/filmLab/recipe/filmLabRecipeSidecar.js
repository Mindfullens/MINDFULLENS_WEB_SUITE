/**
 * Zapis koperty recipe jako JSON (np. sidecar obok RAW).
 */

export const FILMLAB_RECIPE_SIDECAR_FILENAME_PREFIX = 'mindfullens_recipe';

/**
 * @param {object} recipeDocument
 * @param {number} [space]
 */
export function recipeDocumentToJsonString(recipeDocument, space = 2) {
  return JSON.stringify(recipeDocument, null, space);
}

/**
 * Przeglądarka: pobiera plik `.recipe.json`.
 *
 * @param {object} recipeDocument
 * @param {string} [baseName] — bez rozszerzenia
 */
export function downloadRecipeDocumentInBrowser(recipeDocument, baseName = FILMLAB_RECIPE_SIDECAR_FILENAME_PREFIX) {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const payload = recipeDocumentToJsonString(recipeDocument);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const safeBase = String(baseName || FILMLAB_RECIPE_SIDECAR_FILENAME_PREFIX).replace(/[^\w\-+.]+/g, '_');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeBase}.recipe.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
