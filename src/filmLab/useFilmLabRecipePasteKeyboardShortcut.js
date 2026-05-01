import { useEffect } from 'react';
import {
  applyRecipeTextToWorkbench,
  dispatchRecipeApplyUiResult,
} from './applyRecipeTextToWorkbench.js';
import { RECIPE_IMPORT_UI_CODE, recipeImportUiDetailLine } from './recipe/filmLabRecipeImportUiCodes.js';
import { markFilmLabE2eKeyboardE2eIntent } from './previewE2ePointerMark.js';

/**
 * Shift+Cmd/Ctrl+V: wklej JSON recipe ze schowka (gdy Render Debug jest dostępny).
 * Nie koliduje z Cmd/Ctrl+V ustawień — tam jest sam V bez Shift.
 */
export function useFilmLabRecipePasteKeyboardShortcut({ applyRecipeDocument, enabled }) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onKey = (event) => {
      const pressed = String(event.key || '').toLowerCase();
      const hasPrimaryModifier = Boolean(event.metaKey || event.ctrlKey);
      if (pressed !== 'v' || !hasPrimaryModifier || !event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      markFilmLabE2eKeyboardE2eIntent();
      void (async () => {
        try {
          if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
            dispatchRecipeApplyUiResult({
              ok: false,
              detail: RECIPE_IMPORT_UI_CODE.CLIPBOARD_READ_TEXT_UNAVAILABLE,
            });
            return;
          }
          const text = await navigator.clipboard.readText();
          if (typeof text !== 'string' || text.trim() === '') {
            dispatchRecipeApplyUiResult({
              ok: false,
              detail: RECIPE_IMPORT_UI_CODE.CLIPBOARD_EMPTY_RECIPE_TEXT,
            });
            return;
          }
          const result = applyRecipeTextToWorkbench(text.trim(), applyRecipeDocument);
          dispatchRecipeApplyUiResult(result);
        } catch (e) {
          dispatchRecipeApplyUiResult({
            ok: false,
            detail: recipeImportUiDetailLine(RECIPE_IMPORT_UI_CODE.CLIPBOARD_READ_FAILED, e?.message ?? e),
          });
        }
      })();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyRecipeDocument, enabled]);
}
