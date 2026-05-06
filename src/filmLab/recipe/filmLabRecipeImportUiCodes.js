/**
 * Stable tokens for recipe import / clipboard feedback — translated via
 * `translateRecipeSoftWarningsLine` → `filmLab.recipeWarnings.codes.*`.
 */

export const RECIPE_IMPORT_UI_CODE = {
  APPLY_MISSING_HANDLER: 'recipe_apply_missing_handler',
  APPLY_UNRECOGNIZED_ENVELOPE: 'recipe_apply_unrecognized_envelope',
  APPLY_REJECTED: 'recipe_apply_rejected',
  SOFT_VALIDATE_PARTIAL_ENVELOPE: 'soft_validate_partial_envelope',
  CLIPBOARD_READ_TEXT_UNAVAILABLE: 'recipe_clipboard_read_text_unavailable',
  CLIPBOARD_EMPTY_RECIPE_TEXT: 'recipe_clipboard_empty_recipe_text',
  CLIPBOARD_READ_FAILED: 'recipe_clipboard_read_failed',
  IMPORT_FILE_READ_FAILED: 'recipe_import_file_read_failed',
  IMPORT_DROP_FILE_FAILED: 'recipe_import_drop_file_failed',
  IMPORT_APPLY_THREW: 'recipe_import_apply_threw',
};

/**
 * @param {string} codeKey — value from `RECIPE_IMPORT_UI_CODE` or another static code
 * @param {unknown} [detail] appended after em dash when present
 */
export function recipeImportUiDetailLine(codeKey, detail) {
  if (detail == null || String(detail).trim() === '') {
    return codeKey;
  }
  return `${codeKey} — ${String(detail)}`;
}
