/**
 * Spójne segmenty ścieżek OPFS/IDB dla warstw DAM — importowane z cache i z worker read.
 * Tier `smart`: WebP (~2560 px dłuższy bok), pozostałe: JPEG.
 */

const ROOT_SEGMENT = 'dam-previews';
const VERSION_SEGMENT = 'v1';

export const DAM_PREVIEW_SMART_TIER = 'smart';
export const SMART_PREVIEW_MAX_LONG_EDGE = 2560;

export function safeSegment(id) {
  return encodeURIComponent(String(id ?? '').replace(/[^\w.-]+/g, '_')).slice(0, 200);
}

/**
 * Plik w katalogu asseta: `embedded.jpg` / `standard.jpg` / `smart.webp`.
 * @param {string} tier
 */
export function damPreviewTierFileName(tier) {
  const t = String(tier ?? '');
  if (t === DAM_PREVIEW_SMART_TIER) {
    return 'smart.webp';
  }
  if (t === 'embedded' || t === 'standard') {
    return `${t}.jpg`;
  }
  return `${t}.jpg`;
}

/**
 * @param {string} sessionId
 * @param {string} assetId
 * @param {string} tier
 */
export function buildDamPreviewVirtualPath(sessionId, assetId, tier) {
  return `${ROOT_SEGMENT}/${VERSION_SEGMENT}/${safeSegment(sessionId)}/${safeSegment(assetId)}/${damPreviewTierFileName(
    tier
  )}`;
}
