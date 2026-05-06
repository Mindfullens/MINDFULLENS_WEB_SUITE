/**
 * OPFS FileSystemSyncAccessHandle — synchroniczny odczyt/zapis dla Workerów (mmap-like).
 * Na main thread wywołuj tylko po feature-detection; w przeciwnym razie zwraca null.
 *
 * Rzeczywisty tor „mmap-like” dla tierów DAM / source.bin: `filmLabOpfsWorkerRead.js`
 * (`tryReadFileBufferViaSyncAccessHandle`).
 */

/**
 * @param {FileSystemFileHandle | null | undefined} fileHandle
 * @returns {FileSystemSyncAccessHandle | null}
 */
export function tryCreateSyncAccessHandle(fileHandle) {
  if (
    fileHandle &&
    typeof fileHandle.createSyncAccessHandle === 'function'
  ) {
    try {
      return fileHandle.createSyncAccessHandle();
    } catch {
      return null;
    }
  }
  return null;
}
