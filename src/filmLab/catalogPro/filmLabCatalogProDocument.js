const FILMLAB_CATALOG_PRO_SCHEMA = 'mindfullens.catalog-pro.v0';
const FILMLAB_CATALOG_PRO_FINGERPRINT_ALGO = 'djb2-stable-v1';

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const VOLATILE_KEYS = new Set(['generatedAt', 'updatedAt', 'fingerprintStable']);

function stripVolatileDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripVolatileDeep(item));
  }
  if (value && typeof value === 'object') {
    const next = {};
    for (const key of Object.keys(value)) {
      if (VOLATILE_KEYS.has(key)) {
        continue;
      }
      next[key] = stripVolatileDeep(value[key]);
    }
    return next;
  }
  return value;
}

function safeSourceFileMeta(fileMeta) {
  if (!fileMeta || typeof fileMeta !== 'object') {
    return null;
  }
  const name = typeof fileMeta.name === 'string' ? fileMeta.name : '';
  if (name.trim() === '') {
    return null;
  }
  return {
    name,
    type: typeof fileMeta.type === 'string' ? fileMeta.type : '',
    size: Number.isFinite(Number(fileMeta.size)) ? Number(fileMeta.size) : null,
    lastModified: Number.isFinite(Number(fileMeta.lastModified)) ? Number(fileMeta.lastModified) : null,
  };
}

export function buildCatalogProDocument({
  sessionId = 'active-session',
  sourceFileMeta = null,
  hasDecodedFrame = false,
  activeCollectionId = 'inbox',
} = {}) {
  const nowIso = new Date().toISOString();
  const source = safeSourceFileMeta(sourceFileMeta);
  const assets = source
    ? [
        {
          id: 'asset_1',
          sourceName: source.name,
          sourceType: source.type,
          sourceSize: source.size,
          sourceLastModified: source.lastModified,
          hasDecodedFrame: Boolean(hasDecodedFrame),
          rating: 0,
          pick: 'unreviewed',
          labels: [],
          /** Semantyka importu — bez generowania masek przy imporcie (tylko indeks/hints). */
          semanticIndex: {
            version: 1,
            tags: [],
            objects: [],
          },
          exif: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ]
    : [];
  const collections = [
    {
      id: 'inbox',
      name: 'Inbox',
      kind: 'system',
      assetIds: assets.map((item) => item.id),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
  return {
    schema: FILMLAB_CATALOG_PRO_SCHEMA,
    version: 0,
    generatedAt: nowIso,
    meta: {
      sessionId: String(sessionId),
      activeCollectionId: String(activeCollectionId || 'inbox'),
      fingerprintAlgorithm: FILMLAB_CATALOG_PRO_FINGERPRINT_ALGO,
      fingerprintStable: null,
    },
    collections,
    assets,
    capabilities: {
      sqliteOpfs: false,
      xmpSidecarReadWrite: false,
      fastCulling: false,
      collections: true,
      batchSync: false,
    },
  };
}

export function fingerprintCatalogProDocumentStable(doc) {
  const stable = stripVolatileDeep(JSON.parse(JSON.stringify(doc ?? null)));
  return djb2(JSON.stringify(stable));
}

export function withCatalogProFingerprint(doc) {
  if (!doc || typeof doc !== 'object') {
    return doc;
  }
  const copy = JSON.parse(JSON.stringify(doc));
  if (!copy.meta || typeof copy.meta !== 'object') {
    copy.meta = {};
  }
  copy.meta.fingerprintAlgorithm = FILMLAB_CATALOG_PRO_FINGERPRINT_ALGO;
  copy.meta.fingerprintStable = fingerprintCatalogProDocumentStable(copy);
  return copy;
}

export { FILMLAB_CATALOG_PRO_FINGERPRINT_ALGO, FILMLAB_CATALOG_PRO_SCHEMA };
