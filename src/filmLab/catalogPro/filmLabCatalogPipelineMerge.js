import {
  buildCatalogExifSnapshot,
  buildCatalogSemanticIndexFromImport,
} from './filmLabCatalogSemanticImport.js';

function snapshotComparable(asset) {
  return JSON.stringify({
    h: asset?.hasDecodedFrame ?? null,
    sem: asset?.semanticIndex ?? null,
    exif: asset?.exif ?? null,
  });
}

/**
 * Enriches the primary catalog asset (first / `asset_1`) with decode state, semantic tags, and EXIF snapshot.
 *
 * @param {object | null | undefined} doc
 * @param {object} input
 * @param {File | null} [input.uploadedFile]
 * @param {boolean} [input.hasImage]
 * @param {object | null} [input.exifMeta]
 * @param {object | null} [input.imageMeta]
 * @returns {object | null} — cloned document or `null` if unchanged / invalid
 */
function findAssetIndexForUploadedFile(doc, uploadedFile) {
  if (!uploadedFile || !(uploadedFile instanceof File)) {
    return -1;
  }
  const exact = doc.assets.findIndex(
    (a) =>
      a &&
      String(a.sourceName ?? '') === String(uploadedFile.name) &&
      Number(a.sourceSize) === uploadedFile.size &&
      Number(a.sourceLastModified) === uploadedFile.lastModified
  );
  if (exact >= 0) {
    return exact;
  }
  /** OPFS/restored File objects may not preserve lastModified — match name + size */
  return doc.assets.findIndex(
    (a) =>
      a &&
      String(a.sourceName ?? '') === String(uploadedFile.name) &&
      Number(a.sourceSize) === uploadedFile.size
  );
}

export function mergeCatalogDocumentWithPipelineSnapshot(doc, { uploadedFile, hasImage, exifMeta, imageMeta }) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.assets) || doc.assets.length === 0) {
    return null;
  }
  const byFile = findAssetIndexForUploadedFile(doc, uploadedFile);
  const byLegacy = doc.assets.findIndex((a) => a?.id === 'asset_1');
  const i = byFile >= 0 ? byFile : byLegacy >= 0 ? byLegacy : 0;
  const asset = doc.assets[i];
  if (!asset || typeof asset !== 'object') {
    return null;
  }

  const semanticIndex = buildCatalogSemanticIndexFromImport({
    sourceName: uploadedFile && typeof uploadedFile.name === 'string' ? uploadedFile.name : asset.sourceName,
    sourceType: uploadedFile && typeof uploadedFile.type === 'string' ? uploadedFile.type : asset.sourceType,
    exifMeta,
  });
  const exif = buildCatalogExifSnapshot(exifMeta, imageMeta);
  const nextAsset = {
    ...asset,
    hasDecodedFrame: Boolean(hasImage),
    semanticIndex,
    exif,
    updatedAt: new Date().toISOString(),
  };

  if (snapshotComparable(asset) === snapshotComparable(nextAsset)) {
    return null;
  }

  const assets = doc.assets.slice();
  assets[i] = nextAsset;
  return {
    ...doc,
    assets,
  };
}
