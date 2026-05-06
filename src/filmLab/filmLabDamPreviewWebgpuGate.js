/**
 * Trwała blokada `decodeDamPreview` dla assetu po `NEEDS_WEBGPU_DECODE` z workera
 * (TIFF/DNG bez żadnego SOI w `bruteForceJpegSearch`) — przetrwa `previewEpoch++`, żeby nie spamować kolejki i konsoli.
 * Czyść przy usuwaniu assetu / sesji.
 */

/** @type {Map<string, Set<string>>} */
const permanentBySession = new Map();

function sidKey(sessionId) {
  return String(sessionId ?? '');
}

export function markDamPreviewWebgpuPermanent(sessionId, assetId) {
  const s = sidKey(sessionId);
  const id = String(assetId ?? '');
  if (!s || !id) {
    return;
  }
  let set = permanentBySession.get(s);
  if (!set) {
    set = new Set();
    permanentBySession.set(s, set);
  }
  set.add(id);
}

export function isDamPreviewWebgpuPermanent(sessionId, assetId) {
  return permanentBySession.get(sidKey(sessionId))?.has(String(assetId ?? '')) ?? false;
}

/** Po `previewEpoch` — odtwórz zbiory terminalne w hooku miniatury. */
export function listDamPreviewWebgpuPermanentIds(sessionId) {
  const set = permanentBySession.get(sidKey(sessionId));
  return set ? [...set] : [];
}

export function clearDamPreviewWebgpuPermanentForAsset(sessionId, assetId) {
  const set = permanentBySession.get(sidKey(sessionId));
  if (!set) {
    return;
  }
  set.delete(String(assetId ?? ''));
  if (set.size === 0) {
    permanentBySession.delete(sidKey(sessionId));
  }
}

export function clearDamPreviewWebgpuPermanentSession(sessionId) {
  permanentBySession.delete(sidKey(sessionId));
}

export function pruneDamPreviewWebgpuPermanent(sessionId, allowedAssetIdSet) {
  const s = sidKey(sessionId);
  const set = permanentBySession.get(s);
  if (!set) {
    return;
  }
  for (const id of [...set]) {
    if (!allowedAssetIdSet.has(id)) {
      set.delete(id);
    }
  }
  if (set.size === 0) {
    permanentBySession.delete(s);
  }
}
