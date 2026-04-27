import { useFilmLabClipboardShortcuts } from './useFilmLabClipboardShortcuts.js';
import { useFilmLabEditClipboard } from './useFilmLabEditClipboard.js';
import { useFilmLabSessionPersistence } from './useFilmLabSessionPersistence.js';

/** Edit clipboard, global shortcuts, and IndexedDB session restore/save wiring. */
export function useFilmLabClipboardSessionCluster({ editClipboardArgs, sessionPersistenceArgs }) {
  const clip = useFilmLabEditClipboard(editClipboardArgs);
  useFilmLabClipboardShortcuts({
    copyToClipboard: clip.copyToClipboard,
    pasteFromClipboard: clip.pasteFromClipboard,
  });
  const session = useFilmLabSessionPersistence(sessionPersistenceArgs);

  return { ...clip, ...session };
}
