/**
 * Remove catalog assets and prune collection references.
 *
 * @param {object} doc
 * @param {string[]} assetIds
 * @returns {object | null}
 */
export function removeAssetsFromCatalogDocument(doc, assetIds) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.assets)) {
    return null;
  }
  const remove = new Set(assetIds.map((id) => String(id)));
  if (remove.size === 0) {
    return doc;
  }
  const assets = doc.assets.filter((a) => a?.id != null && !remove.has(String(a.id)));
  const collections = Array.isArray(doc.collections)
    ? doc.collections.map((c) => ({
        ...c,
        assetIds: Array.isArray(c?.assetIds) ? c.assetIds.filter((id) => !remove.has(String(id))) : [],
      }))
    : [];
  const nowIso = new Date().toISOString();
  return {
    ...doc,
    assets,
    collections,
    generatedAt: nowIso,
  };
}
