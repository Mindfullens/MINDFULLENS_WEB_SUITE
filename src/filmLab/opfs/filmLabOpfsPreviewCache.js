/**
 * DAM preview blobs: OPFS primary + idb-keyval fallback + LRU eviction metadata.
 * See docs/hme/DAM-PREVIEW-CONTRACT.md
 */

import { del, get, set } from 'idb-keyval';
import { buildDamPreviewVirtualPath, safeSegment } from './filmLabDamPreviewPaths.js';

export { buildDamPreviewVirtualPath, safeSegment };

const LRU_META_KEY = 'mindfullens-filmlab-dam-preview-lru-v1';
const FALLBACK_KEY_PREFIX = 'mindfullens-dam-thumb-fallback:';

/** @typedef {'embedded' | 'standard' | 'smart'} DamPreviewTier */

function fallbackStorageKey(sessionId, assetId, tier) {
  return `${FALLBACK_KEY_PREFIX}${safeSegment(sessionId)}:${safeSegment(assetId)}:${tier}`;
}

export function isOpfsPreviewSupported() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
  );
}

async function getOpfsRoot() {
  return navigator.storage.getDirectory();
}

/**
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function ensurePath(root, segments) {
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  return dir;
}

/**
 * @param {string} virtualPath
 */
async function removeOpfsByVirtualPath(virtualPath) {
  if (!isOpfsPreviewSupported()) {
    return false;
  }
  const parts = virtualPath.split('/').filter(Boolean);
  if (parts.length < 2) {
    return false;
  }
  const fileName = parts[parts.length - 1];
  const dirSegments = parts.slice(0, -1);
  try {
    const root = await getOpfsRoot();
    let dir = root;
    for (const seg of dirSegments) {
      dir = await dir.getDirectoryHandle(seg);
    }
    await dir.removeEntry(fileName);
    return true;
  } catch {
    return false;
  }
}

async function readLruState() {
  try {
    const raw = await get(LRU_META_KEY);
    if (!raw || typeof raw !== 'object') {
      return { entries: [], totalBytes: 0 };
    }
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    const totalBytes = Number.isFinite(Number(raw.totalBytes)) ? Number(raw.totalBytes) : 0;
    return { entries, totalBytes };
  } catch {
    return { entries: [], totalBytes: 0 };
  }
}

async function writeLruState(state) {
  try {
    await set(LRU_META_KEY, state);
  } catch {
    // ignore
  }
}

async function resolveStorageBudgetBytes() {
  try {
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      const quota = Number(est.quota) || 256 * 1024 * 1024;
      const usage = Number(est.usage) || 0;
      const headroom = Math.max(0, quota - usage);
      return Math.min(120 * 1024 * 1024, Math.max(12 * 1024 * 1024, headroom * 0.12));
    }
  } catch {
    // ignore
  }
  return 48 * 1024 * 1024;
}

async function evictUntilBudget(incomingBytes) {
  let { entries, totalBytes } = await readLruState();
  const maxTotal = await resolveStorageBudgetBytes();

  while (entries.length > 0 && totalBytes + incomingBytes > maxTotal) {
    entries.sort((a, b) => (Number(a.lastUsed) || 0) - (Number(b.lastUsed) || 0));
    const victim = entries.shift();
    if (!victim?.virtualPath) {
      totalBytes = entries.reduce((s, e) => s + (Number(e.bytes) || 0), 0);
      await writeLruState({ entries, totalBytes });
      continue;
    }
    await removeOpfsByVirtualPath(victim.virtualPath);
    try {
      await del(victim.fallbackKey);
    } catch {
      // noop
    }
    totalBytes -= Number(victim.bytes) || 0;
    if (totalBytes < 0) {
      totalBytes = 0;
    }
    await writeLruState({ entries, totalBytes });
  }
}

async function touchLruEntry(virtualPath, fallbackKey, byteSize) {
  let { entries, totalBytes } = await readLruState();
  const now = Date.now();
  const filtered = entries.filter((e) => e.virtualPath !== virtualPath);
  filtered.push({
    virtualPath,
    fallbackKey: fallbackKey ?? null,
    bytes: byteSize,
    lastUsed: now,
  });
  totalBytes = filtered.reduce((s, e) => s + (Number(e.bytes) || 0), 0);
  await writeLruState({ entries: filtered, totalBytes });
}

/**
 * Aktualizacja LRU po odczycie podglądu w workerze (`lruPing` z imageWorker).
 * @param {{ sessionId: string, assetId: string, tier: 'embedded' | 'standard' | string, bytes: number }} p
 */
export async function touchDamPreviewLruFromWorkerPing(p) {
  if (!p || typeof p !== 'object') {
    return;
  }
  const sessionId = String(p.sessionId ?? '');
  const assetId = String(p.assetId ?? '');
  const tier = String(p.tier ?? 'standard');
  const bytes = Number.isFinite(Number(p.bytes)) ? Number(p.bytes) : 0;
  if (!sessionId || !assetId || bytes < 1) {
    return;
  }
  const virtualPath = buildDamPreviewVirtualPath(sessionId, assetId, tier);
  const fbKey = fallbackStorageKey(sessionId, assetId, tier);
  await touchLruEntry(virtualPath, fbKey, bytes);
}

/**
 * @param {string} sessionId
 * @param {string} assetId
 * @param {DamPreviewTier} tier
 * @param {Blob} blob
 * @returns {Promise<boolean>}
 */
export async function writeDamPreviewBlob(sessionId, assetId, tier, blob) {
  const virtualPath = buildDamPreviewVirtualPath(sessionId, assetId, tier);
  const fbKey = fallbackStorageKey(sessionId, assetId, tier);
  const bytes = blob.size || (await blob.arrayBuffer()).byteLength;

  await evictUntilBudget(bytes);

  if (isOpfsPreviewSupported()) {
    try {
      const root = await getOpfsRoot();
      const segments = virtualPath.split('/').filter(Boolean);
      const fileName = segments.pop();
      const dir = await ensurePath(root, segments);
      const fh = await dir.getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable();
      await writable.write(blob);
      await writable.close();
      await touchLruEntry(virtualPath, fbKey, bytes);
      return true;
    } catch (e) {
      console.warn('[FilmLab] DAM OPFS write failed, trying IDB fallback', e);
    }
  }

  try {
    const buf = await blob.arrayBuffer();
    await set(fbKey, new Uint8Array(buf));
    await touchLruEntry(virtualPath, fbKey, bytes);
    return true;
  } catch (e) {
    console.warn('[FilmLab] DAM preview fallback write failed', e);
    return false;
  }
}

/**
 * @param {string} sessionId
 * @param {string} assetId
 * @param {DamPreviewTier} tier
 * @returns {Promise<Blob|null>}
 */
export async function readDamPreviewBlob(sessionId, assetId, tier) {
  const virtualPath = buildDamPreviewVirtualPath(sessionId, assetId, tier);
  const fbKey = fallbackStorageKey(sessionId, assetId, tier);

  if (isOpfsPreviewSupported()) {
    try {
      const root = await getOpfsRoot();
      const segments = virtualPath.split('/').filter(Boolean);
      const fileName = segments.pop();
      let dir = root;
      for (const seg of segments) {
        dir = await dir.getDirectoryHandle(seg);
      }
      const fh = await dir.getFileHandle(fileName);
      const file = await fh.getFile();
      await touchLruEntry(virtualPath, fbKey, file.size);
      return file;
    } catch {
      // fall through
    }
  }

  try {
    const u8 = await get(fbKey);
    if (u8 instanceof Uint8Array && u8.byteLength > 0) {
      await touchLruEntry(virtualPath, fbKey, u8.byteLength);
      const mime =
        String(tier) === 'smart' ? 'image/webp' : 'image/jpeg';
      return new Blob([u8], { type: mime });
    }
  } catch {
    // noop
  }
  return null;
}

/**
 * @param {string} sessionId
 * @param {string} assetId
 * @param {DamPreviewTier} tier
 */
export async function hasDamPreview(sessionId, assetId, tier) {
  const b = await readDamPreviewBlob(sessionId, assetId, tier);
  return b != null && b.size > 0;
}

/**
 * Remove OPFS + idb fallback entries for an asset (all tiers).
 * @param {string} sessionId
 * @param {string} assetId
 */
export async function deleteDamPreviewForAsset(sessionId, assetId) {
  for (const tier of ['embedded', 'standard', 'smart']) {
    const virtualPath = buildDamPreviewVirtualPath(sessionId, assetId, tier);
    const fbKey = fallbackStorageKey(sessionId, assetId, tier);
    await removeOpfsByVirtualPath(virtualPath);
    try {
      await del(fbKey);
    } catch {
      // noop
    }
  }
}
