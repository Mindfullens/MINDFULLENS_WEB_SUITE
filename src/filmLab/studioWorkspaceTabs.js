/** Top-level Film Lab workspaces (hybrid editor shell). */
export const STUDIO_WORKSPACE_IDS = ['library', 'develop', 'export'];

/** Stare URL-e (?workspace=masks|layers|…) — przekierowanie na Develop */
const LEGACY_STUDIO_WORKSPACE_IDS = new Set(['masks', 'layers', 'retouch', 'ai']);

export const STUDIO_WORKSPACE_TABS = [
  { id: 'library', label: 'Biblioteka', shortLabel: 'Bibl.' },
  { id: 'develop', label: 'Develop', shortLabel: 'Dev' },
  { id: 'export', label: 'Eksport', shortLabel: 'Eksport' },
];

export function resolveInitialStudioWorkspaceFromLocation() {
  if (typeof window === 'undefined') {
    return 'library';
  }
  const param = new URLSearchParams(window.location.search).get('workspace');
  if (param && STUDIO_WORKSPACE_IDS.includes(param)) {
    return param;
  }
  if (param && LEGACY_STUDIO_WORKSPACE_IDS.has(param)) {
    return 'develop';
  }
  /** Domyślnie pierwsza zakładka — Biblioteka. */
  return 'library';
}
