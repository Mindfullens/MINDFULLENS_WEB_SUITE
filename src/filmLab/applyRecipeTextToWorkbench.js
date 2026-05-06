import { parseRecipeDocumentJson } from './recipe/filmLabRecipeImport.js';
import { RECIPE_IMPORT_UI_CODE } from './recipe/filmLabRecipeImportUiCodes.js';

/** CustomEvent na `window`: synchronizacja panelu Render Debug po skrócie Shift+⌘/Ctrl+V. */
export const FILMLAB_RECIPE_APPLY_UI_EVENT = 'mindfullens-filmlab-recipe-apply-result';

/** Nazwa pliku zgodna z importem picker / drag-drop na panel Render Debug (.recipe.json lub .json). */
export function isFilmLabRecipeDropFilename(name) {
  const n = String(name || '').toLowerCase();
  return n.endsWith('.recipe.json') || n.endsWith('.json');
}

/**
 * Emisja wyniku {@link applyRecipeTextToWorkbench} lub błędu schowka — panel może pokazać Import/Wklej ✓/✕.
 *
 * @param {{ ok: true, warningsLine: string | null } | { ok: false, detail?: string }} result
 */
export function dispatchRecipeApplyUiResult(result) {
  if (typeof window === 'undefined' || !window.dispatchEvent || !result || typeof result !== 'object') {
    return;
  }
  window.dispatchEvent(new CustomEvent(FILMLAB_RECIPE_APPLY_UI_EVENT, { detail: result }));
}

/**
 * Parsuje tekst JSON i — jeśli to koperta v1 — wywołuje `applyRecipeDocument`.
 *
 * @returns {{ ok: true, warningsLine: string | null } | { ok: false, detail: string }}
 */
export function applyRecipeTextToWorkbench(text, applyRecipeDocument) {
  if (typeof applyRecipeDocument !== 'function') {
    return { ok: false, detail: RECIPE_IMPORT_UI_CODE.APPLY_MISSING_HANDLER };
  }
  const parsed = parseRecipeDocumentJson(text);
  if (!parsed?.ok || !parsed.document) {
    const fromWarnings =
      Array.isArray(parsed?.warnings) && parsed.warnings.length
        ? parsed.warnings.join(' · ')
        : '';
    const hint =
      fromWarnings ||
      (typeof parsed?.error === 'string' && parsed.error.trim() !== ''
        ? parsed.error.trim()
        : RECIPE_IMPORT_UI_CODE.APPLY_UNRECOGNIZED_ENVELOPE);
    return { ok: false, detail: hint };
  }
  const applied = applyRecipeDocument(parsed.document);
  if (!applied) {
    return { ok: false, detail: RECIPE_IMPORT_UI_CODE.APPLY_REJECTED };
  }
  const warnParts = [];
  if (Array.isArray(parsed.warnings) && parsed.warnings.length) {
    warnParts.push(parsed.warnings.join(' · '));
  }
  if (parsed.validEnvelope === false) {
    warnParts.push(RECIPE_IMPORT_UI_CODE.SOFT_VALIDATE_PARTIAL_ENVELOPE);
  }
  return {
    ok: true,
    warningsLine: warnParts.length ? warnParts.join(' — ') : null,
  };
}
