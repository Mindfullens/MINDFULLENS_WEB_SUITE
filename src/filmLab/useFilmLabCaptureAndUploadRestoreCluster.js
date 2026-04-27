import { useFilmLabCaptureCurrentSnapshot } from './useFilmLabCaptureCurrentSnapshot.js';
import { useFilmLabUploadedSourceRestore } from './useFilmLabUploadedSourceRestore.js';

/** Session snapshot capture plus file upload / restore plumbing. */
export function useFilmLabCaptureAndUploadRestoreCluster({ captureArgs, uploadRestoreArgs }) {
  const captureCurrentSnapshot = useFilmLabCaptureCurrentSnapshot(captureArgs);
  return {
    captureCurrentSnapshot,
    ...useFilmLabUploadedSourceRestore(uploadRestoreArgs),
  };
}
