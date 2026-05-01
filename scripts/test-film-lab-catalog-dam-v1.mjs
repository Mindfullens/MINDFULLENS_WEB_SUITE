/**
 * Regresja: Etap 6 — katalog PRO + semantic import + merge z potokiem (bez przeglądarki).
 */
import assert from 'node:assert/strict';
import { buildCatalogExifSnapshot, buildCatalogSemanticIndexFromImport } from '../src/filmLab/catalogPro/filmLabCatalogSemanticImport.js';
import { mergeCatalogDocumentWithPipelineSnapshot } from '../src/filmLab/catalogPro/filmLabCatalogPipelineMerge.js';
import { buildCatalogProDocument, withCatalogProFingerprint } from '../src/filmLab/catalogPro/filmLabCatalogProDocument.js';

const sem = buildCatalogSemanticIndexFromImport({
  sourceName: 'IMG_0001.dng',
  sourceType: 'image/x-adobe-dng',
  exifMeta: { cameraMake: 'Acme', cameraModel: 'X1' },
});
assert.ok(sem.tags.includes('kind:raw'));
assert.ok(sem.tags.some((t) => t.startsWith('camera:')));
assert.ok(sem.tags.some((t) => t.startsWith('kw:')));

const snap = buildCatalogExifSnapshot(
  { cameraMake: 'Acme', cameraModel: 'X1', iso: 400, shutter: '1/125', aperture: 'f/2.8', focalLength: '50 mm' },
  { width: 6000, height: 4000, previewWidth: 2048, previewHeight: 1365 }
);
assert.equal(snap.schema, 'mindfullens.catalog-exif-snapshot.v1');
assert.ok(String(snap.dimensions).includes('×'));

const base = withCatalogProFingerprint(
  buildCatalogProDocument({
    sessionId: 'test-s',
    sourceFileMeta: { name: 'raw.cr3', type: 'application/octet-stream', size: 1200, lastModified: 1 },
    hasDecodedFrame: false,
  })
);
const merged = mergeCatalogDocumentWithPipelineSnapshot(base, {
  uploadedFile: { name: 'raw.cr3', type: 'application/octet-stream', size: 1200, lastModified: 1 },
  hasImage: true,
  exifMeta: { cameraMake: 'Beta', iso: 200 },
  imageMeta: { width: 4000, height: 3000 },
});
assert.ok(merged);
assert.equal(merged.assets[0].hasDecodedFrame, true);
assert.ok(Array.isArray(merged.assets[0].semanticIndex.tags));
assert.ok(merged.assets[0].exif);

const merged2 = mergeCatalogDocumentWithPipelineSnapshot(merged, {
  uploadedFile: { name: 'raw.cr3', type: 'application/octet-stream', size: 1200, lastModified: 1 },
  hasImage: true,
  exifMeta: { cameraMake: 'Beta', iso: 200 },
  imageMeta: { width: 4000, height: 3000 },
});
assert.equal(merged2, null);

console.log('OK Film Lab catalog DAM v1 helpers');
