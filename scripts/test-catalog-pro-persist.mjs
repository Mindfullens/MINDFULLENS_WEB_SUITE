import assert from 'node:assert/strict';
import {
  buildFilmLabCatalogPersistKey,
  detectFilmLabCatalogStorageRuntime,
  normalizeLoadedFilmLabCatalogDocument,
} from '../src/engine/filmLabCatalogProPersist.js';

assert.equal(
  buildFilmLabCatalogPersistKey('session-1'),
  'mindfullens-filmlab-catalog-pro-v0:session-1'
);
assert.equal(
  buildFilmLabCatalogPersistKey(''),
  'mindfullens-filmlab-catalog-pro-v0:active-session'
);

const runtime = detectFilmLabCatalogStorageRuntime();
assert.equal(typeof runtime.opfsAvailable, 'boolean');
assert.equal(typeof runtime.indexedDbAvailable, 'boolean');
assert.ok(['opfs-planned', 'idb-keyval', 'memory-only'].includes(runtime.selectedBackend));

const normalized = normalizeLoadedFilmLabCatalogDocument({
  v: 0,
  savedAt: 1711111111111,
  sessionId: 's1',
  document: {
    schema: 'mindfullens.catalog-pro.v0',
    collections: [{ id: 'inbox' }],
    assets: [{ id: 'asset_1' }],
  },
});

assert.ok(normalized);
assert.equal(normalized.sessionId, 's1');
assert.equal(normalized.document.schema, 'mindfullens.catalog-pro.v0');
assert.equal(Array.isArray(normalized.document.collections), true);
assert.equal(Array.isArray(normalized.document.assets), true);

assert.equal(normalizeLoadedFilmLabCatalogDocument(null), null);
assert.equal(normalizeLoadedFilmLabCatalogDocument({ document: {} }), null);

console.log('OK Catalog PRO persist bridge');
