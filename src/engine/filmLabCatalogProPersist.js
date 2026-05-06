import { del, get, set } from 'idb-keyval';

const CATALOG_KEY_PREFIX = 'mindfullens-filmlab-catalog-pro-v0';

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function canUseOpfs() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
  );
}

export function buildFilmLabCatalogPersistKey(sessionId = 'active-session') {
  const safe = String(sessionId || 'active-session').trim() || 'active-session';
  return `${CATALOG_KEY_PREFIX}:${safe}`;
}

export function detectFilmLabCatalogStorageRuntime() {
  const opfsAvailable = canUseOpfs();
  const indexedDbAvailable = canUseIndexedDb();
  return {
    opfsAvailable,
    indexedDbAvailable,
    selectedBackend: opfsAvailable ? 'opfs-planned' : indexedDbAvailable ? 'idb-keyval' : 'memory-only',
  };
}

export async function saveFilmLabCatalogDocument(document, { sessionId = 'active-session' } = {}) {
  if (!document || typeof document !== 'object') {
    return false;
  }
  if (typeof document.schema !== 'string' || !document.schema.startsWith('mindfullens.catalog-pro.')) {
    return false;
  }
  const key = buildFilmLabCatalogPersistKey(sessionId);
  try {
    await set(key, {
      v: 0,
      savedAt: Date.now(),
      sessionId: String(sessionId),
      document,
    });
    return true;
  } catch (error) {
    console.warn('[FilmLab] Catalog PRO save failed', error);
    return false;
  }
}

export async function loadFilmLabCatalogDocument({ sessionId = 'active-session' } = {}) {
  const key = buildFilmLabCatalogPersistKey(sessionId);
  try {
    return (await get(key)) ?? null;
  } catch (error) {
    console.warn('[FilmLab] Catalog PRO load failed', error);
    return null;
  }
}

export async function clearFilmLabCatalogDocument({ sessionId = 'active-session' } = {}) {
  const key = buildFilmLabCatalogPersistKey(sessionId);
  try {
    await del(key);
  } catch {
    // noop
  }
}

export function normalizeLoadedFilmLabCatalogDocument(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const doc = raw.document;
  if (!doc || typeof doc !== 'object') {
    return null;
  }
  if (typeof doc.schema !== 'string' || !doc.schema.startsWith('mindfullens.catalog-pro.')) {
    return null;
  }
  const collections = Array.isArray(doc.collections) ? doc.collections : [];
  const assetsRaw = Array.isArray(doc.assets) ? doc.assets : [];
  const assets = assetsRaw.map((a) => {
    if (!a || typeof a !== 'object') {
      return a;
    }
    const next = { ...a };
    if (!next.semanticIndex || typeof next.semanticIndex !== 'object') {
      next.semanticIndex = { version: 1, tags: [], objects: [] };
    }
    if (!('exif' in next)) {
      next.exif = null;
    }
    if (!next.preview || typeof next.preview !== 'object') {
      next.preview = { embedded: null, standard: null };
    } else {
      next.preview = {
        embedded: next.preview.embedded ?? null,
        standard: next.preview.standard ?? null,
      };
    }
    return next;
  });
  return {
    v: Number.isFinite(Number(raw.v)) ? Number(raw.v) : 0,
    savedAt: Number.isFinite(Number(raw.savedAt)) ? Number(raw.savedAt) : Date.now(),
    sessionId: typeof raw.sessionId === 'string' && raw.sessionId.trim() !== '' ? raw.sessionId : 'active-session',
    document: {
      ...doc,
      collections,
      assets,
    },
  };
}

