/**
 * Canonical variant → artifactRole for Film Lab export manifest rows (emitters + reader contract).
 * Browser-safe — no Node-only imports.
 */

/**
 * @param {string} variant
 * @returns {'primary'|'sidecar'|'aux-mask'|null}
 */
export function canonicalFilmLabExportManifestArtifactRoleForVariant(variant) {
  const v = String(variant ?? '');
  if (v === 'after') {
    return 'primary';
  }
  if (v === 'mask') {
    return 'aux-mask';
  }
  if (v === 'before' || v.includes('recipe') || v === 'depth_proxy' || v === 'depth_proxy_data') {
    return 'sidecar';
  }
  return null;
}
