import { useFilmLabSessionPersistenceBundle } from './useFilmLabSessionPersistenceBundle.js';
import { useFilmLabSessionPersistenceEffects } from './useFilmLabSessionPersistenceEffects.js';

/** Session restore/decline API plus debounced IDB persistence wiring. */
export function useFilmLabSessionPersistence({ sessionPersistTimerRef, ...bundleProps }) {
  const bundleResult = useFilmLabSessionPersistenceBundle(bundleProps);

  useFilmLabSessionPersistenceEffects({
    pendingAutosavePayloadRef: bundleProps.pendingAutosavePayloadRef,
    setSessionRestorePrompt: bundleProps.setSessionRestorePrompt,
    skipNextPersistRef: bundleProps.skipNextPersistRef,
    sessionPersistTimerRef,
    sessionPersistFingerprint: bundleResult.sessionPersistFingerprint,
    flushSessionToIdb: bundleResult.flushSessionToIdb,
    uploadedFile: bundleProps.uploadedFile,
    hasImage: bundleProps.hasImage,
  });

  return bundleResult;
}
