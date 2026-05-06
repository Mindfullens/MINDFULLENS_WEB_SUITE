/**
 * Jednoznaczna identyfikacja „ustalonej klatki” Develop po stronie hosta
 * (po zakończeniu fast/full renderu — `renderVersion` z `useFilmLabEngine`).
 *
 * Używaj tego samego kształtu klucza dla efektów ubocznych (OPFS standard JPEG,
 * przyszłe dirty tiles), żeby uniknąć wyścigów między sesją / assetem / rewizją renderu.
 * Geometryczny „damage” w silniku WebGL fast preview: `fastPreviewConstants.js`
 * (`normDamageRectToViewportPx`, `resolveFastPreviewDamageNormRect`, `damageScope` local vs full).
 *
 * To nie zastępuje synchronizacji GPU ↔ CPU w workerze — tylko warstwę React/host.
 */

/**
 * @param {{ sessionId?: string|null, assetId?: string|null, renderVersion?: number|null }} p
 * @returns {string}
 */
export function makeDevelopPreviewFrameKey({ sessionId, assetId, renderVersion }) {
  const rv = Number(renderVersion);
  return `${String(sessionId ?? '')}:${String(assetId ?? '')}:${Number.isFinite(rv) ? rv : 0}`;
}
