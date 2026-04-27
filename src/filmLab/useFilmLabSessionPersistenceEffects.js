import { useEffect } from 'react';
import {
  clearFilmLabSession,
  loadFilmLabSession,
  normalizeLoadedSession,
} from '../engine/filmLabSessionPersist.js';

const PERSIST_DEBOUNCE_MS = 1800;

/** Load persisted Film Lab session on mount; debounce-save to IDB; flush when the tab hides. */
export function useFilmLabSessionPersistenceEffects({
  pendingAutosavePayloadRef,
  setSessionRestorePrompt,
  skipNextPersistRef,
  sessionPersistTimerRef,
  sessionPersistFingerprint,
  flushSessionToIdb,
  uploadedFile,
  hasImage,
}) {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await loadFilmLabSession();
        if (cancelled || !raw) {
          return;
        }

        const normalized = normalizeLoadedSession(raw);
        if (!normalized) {
          await clearFilmLabSession();
          return;
        }

        if (cancelled) {
          return;
        }

        pendingAutosavePayloadRef.current = normalized;
        setSessionRestorePrompt({
          savedAt: normalized.savedAt,
          fileName: normalized.fileMeta.name,
        });
      } catch (error) {
        console.warn('[FilmLab] Session hydrate failed', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return undefined;
    }

    if (!uploadedFile || !(uploadedFile instanceof File) || !hasImage) {
      return undefined;
    }

    if (typeof window === 'undefined') {
      return undefined;
    }

    window.clearTimeout(sessionPersistTimerRef.current);
    sessionPersistTimerRef.current = window.setTimeout(() => {
      flushSessionToIdb();
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(sessionPersistTimerRef.current);
    };
  }, [sessionPersistFingerprint, flushSessionToIdb, uploadedFile, hasImage]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') {
        return;
      }
      if (!uploadedFile || !(uploadedFile instanceof File) || !hasImage) {
        return;
      }
      void flushSessionToIdb();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushSessionToIdb, uploadedFile, hasImage]);
}
