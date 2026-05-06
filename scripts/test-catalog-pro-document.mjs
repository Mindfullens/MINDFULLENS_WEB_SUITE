import assert from 'node:assert/strict';
import {
  buildCatalogProDocument,
  FILMLAB_CATALOG_PRO_SCHEMA,
  withCatalogProFingerprint,
} from '../src/filmLab/catalogPro/filmLabCatalogProDocument.js';

const emptyDoc = withCatalogProFingerprint(
  buildCatalogProDocument({
    sessionId: 'test-empty',
    sourceFileMeta: null,
    hasDecodedFrame: false,
  })
);

assert.equal(emptyDoc.schema, FILMLAB_CATALOG_PRO_SCHEMA);
assert.equal(emptyDoc.assets.length, 0);
assert.equal(emptyDoc.collections.length, 1);
assert.equal(emptyDoc.meta.activeCollectionId, 'inbox');
assert.equal(typeof emptyDoc.meta.fingerprintStable, 'string');
assert.equal(emptyDoc.meta.fingerprintStable.length, 8);

const filledDoc = withCatalogProFingerprint(
  buildCatalogProDocument({
    sessionId: 'test-filled',
    sourceFileMeta: {
      name: 'sample.raw',
      type: 'image/x-adobe-dng',
      size: 1234,
      lastModified: 1711111111111,
    },
    hasDecodedFrame: true,
  })
);

assert.equal(filledDoc.assets.length, 1);
assert.equal(filledDoc.assets[0].sourceName, 'sample.raw');
assert.equal(filledDoc.assets[0].hasDecodedFrame, true);
assert.equal(filledDoc.collections[0].assetIds[0], 'asset_1');

console.log('OK Catalog PRO document v0');
