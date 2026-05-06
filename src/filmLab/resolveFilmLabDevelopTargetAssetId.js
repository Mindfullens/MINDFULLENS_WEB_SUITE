/**
 * „Active / Target Photo” (Lightroom): jeden plik będący celem edycji w Develop,
 * niekoniecznie równy całemu zaznaczeniu w siatce.
 *
 * Kolejność: primary → ostatnie zaznaczenie → pierwszy asset bieżącego katalogu.
 */
export function resolveFilmLabDevelopTargetAssetId({
  primaryAssetId,
  selectedAssetIds,
  catalogAssets,
  filteredAssets,
}) {
  const cat = Array.isArray(catalogAssets) ? catalogAssets : [];
  if (cat.length === 0) {
    return null;
  }
  const inCat = (id) =>
    id != null && cat.some((a) => String(a?.id ?? '') === String(id));

  if (primaryAssetId != null && inCat(primaryAssetId)) {
    return String(primaryAssetId);
  }
  const sel = Array.isArray(selectedAssetIds) ? selectedAssetIds : [];
  if (sel.length > 0) {
    const last = String(sel[sel.length - 1]);
    if (inCat(last)) {
      return last;
    }
  }
  const fil = Array.isArray(filteredAssets) ? filteredAssets : [];
  if (fil.length > 0 && fil[0]?.id != null) {
    return String(fil[0].id);
  }
  return cat[0]?.id != null ? String(cat[0].id) : null;
}
