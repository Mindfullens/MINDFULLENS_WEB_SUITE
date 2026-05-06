/**
 * Jednokierunkowy sygnał: zapisano tier podglądu DAM w OPFS dla `assetId`.
 * Zastępuje lawinę retry/pollingu — kafelek/filmstrip nasłuchują i wołają `loadThumb` raz.
 */
export const FILMLAB_OPFS_PREVIEW_READY = 'filmLab-opfs-preview-ready';

export function dispatchFilmLabOpfsPreviewReady(assetId) {
  const id = String(assetId ?? '').trim();
  if (!id || typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(FILMLAB_OPFS_PREVIEW_READY, { detail: { assetId: id } }));
}
