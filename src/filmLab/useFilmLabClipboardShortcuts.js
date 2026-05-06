import { useEffect } from 'react';
import { markFilmLabE2eKeyboardE2eIntent } from './previewE2ePointerMark.js';

/** Cmd/Ctrl+C / Cmd/Ctrl+V for edit clipboard when focus is not in a form field. Shift+Cmd/Ctrl+V nie jest tutaj obsługiwane — zarezerwowane dla wklejania recipe (Render Debug). */
export function useFilmLabClipboardShortcuts({ copyToClipboard, pasteFromClipboard }) {
  useEffect(() => {
    const handleCopyPasteShortcuts = (event) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      const pressed = String(event.key || '').toLowerCase();
      const hasPrimaryModifier = Boolean(event.metaKey || event.ctrlKey);
      if (!hasPrimaryModifier || event.altKey) {
        return;
      }

      if (pressed === 'c') {
        event.preventDefault();
        copyToClipboard();
        return;
      }

      if (pressed === 'v' && !event.shiftKey) {
        event.preventDefault();
        markFilmLabE2eKeyboardE2eIntent();
        pasteFromClipboard();
      }
    };

    window.addEventListener('keydown', handleCopyPasteShortcuts);
    return () => {
      window.removeEventListener('keydown', handleCopyPasteShortcuts);
    };
  }, [copyToClipboard, pasteFromClipboard]);
}
