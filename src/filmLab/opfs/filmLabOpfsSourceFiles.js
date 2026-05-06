/**
 * Original import files in OPFS for reopening assets after reload (DAM sources).
 */

function canUseOpfs() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
  );
}

async function getOpfsRoot() {
  return navigator.storage.getDirectory();
}

async function ensurePath(root, segments) {
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  return dir;
}

function safeSegment(id) {
  return encodeURIComponent(String(id ?? '').replace(/[^\w.-]+/g, '_')).slice(0, 200);
}

function sourceVirtualSegments(sessionId, assetId) {
  return ['dam-sources', 'v1', safeSegment(sessionId), safeSegment(assetId)];
}

/**
 * @param {string} sessionId
 * @param {string} assetId
 * @param {File | Blob} blob
 * @returns {Promise<boolean>}
 */
export async function writeCatalogSourceFile(sessionId, assetId, blob) {
  if (!canUseOpfs()) {
    return false;
  }
  try {
    const root = await getOpfsRoot();
    const segments = sourceVirtualSegments(sessionId, assetId);
    const fileName = 'source.bin';
    const dir = await ensurePath(root, segments);
    const fh = await dir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    const buf = blob instanceof File ? await blob.arrayBuffer() : await blob.arrayBuffer();
    await writable.write(buf);
    await writable.close();
    return true;
  } catch (e) {
    console.warn('[FilmLab] DAM source OPFS write failed', e);
    return false;
  }
}

export function mimeFromFilename(name) {
  const l = String(name).toLowerCase();
  if (l.endsWith('.jpg') || l.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (l.endsWith('.png')) {
    return 'image/png';
  }
  if (l.endsWith('.webp')) {
    return 'image/webp';
  }
  if (l.endsWith('.tif') || l.endsWith('.tiff')) {
    return 'image/tiff';
  }
  if (l.endsWith('.arw')) {
    return 'image/x-sony-arw';
  }
  if (l.endsWith('.cr2') || l.endsWith('.cr3')) {
    return 'image/x-canon-cr2';
  }
  if (l.endsWith('.nef')) {
    return 'image/x-nikon-nef';
  }
  if (l.endsWith('.dng')) {
    return 'image/x-adobe-dng';
  }
  return 'application/octet-stream';
}

/**
 * Odczyt całego `source.bin` przez `arrayBuffer()` — **nie** wywołuj na głównym wątku dla dużych RAW (np. 50 MB):
 * użyj workerowej ścieżki `readCatalogSourceBytes` (`filmLabOpfsWorkerRead.js`) / `scheduleOpfsCatalogSourceRead`.
 *
 * @param {string} sessionId
 * @param {string} assetId
 * @param {object | null} catalogAsset — catalog row for stable name/size/lastModified (must match merge + decode hints)
 * @returns {Promise<File|null>}
 */
export async function readCatalogSourceFile(sessionId, assetId, catalogAsset = null) {
  if (!canUseOpfs()) {
    return null;
  }
  try {
    const root = await getOpfsRoot();
    const segments = [...sourceVirtualSegments(sessionId, assetId), 'source.bin'];
    const fileName = segments.pop();
    let dir = root;
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg);
    }
    const fh = await dir.getFileHandle(fileName);
    const file = await fh.getFile();
    const name =
      typeof catalogAsset?.sourceName === 'string' && catalogAsset.sourceName.trim() !== ''
        ? catalogAsset.sourceName.trim()
        : 'source.bin';
    const lastMod =
      catalogAsset != null && Number.isFinite(Number(catalogAsset.sourceLastModified))
        ? Number(catalogAsset.sourceLastModified)
        : file.lastModified;
    return new File([file], name, {
      type: mimeFromFilename(name),
      lastModified: lastMod,
    });
  } catch {
    return null;
  }
}

/**
 * Remove stored source for a catalog asset (OPFS tree under dam-sources/.../assetId).
 * @param {string} sessionId
 * @param {string} assetId
 * @returns {Promise<boolean>}
 */
export async function deleteCatalogSourceFile(sessionId, assetId) {
  if (!canUseOpfs()) {
    return false;
  }
  try {
    const root = await getOpfsRoot();
    const dam = await root.getDirectoryHandle('dam-sources');
    const v1 = await dam.getDirectoryHandle('v1');
    const sess = await v1.getDirectoryHandle(safeSegment(sessionId));
    await sess.removeEntry(safeSegment(assetId), { recursive: true });
    return true;
  } catch {
    return false;
  }
}
