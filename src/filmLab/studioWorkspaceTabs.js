/** Top-level Film Lab workspaces (hybrid editor shell). */
export const STUDIO_WORKSPACE_IDS = [
  'library',
  'develop',
  'masks',
  'layers',
  'retouch',
  'ai',
  'export',
];

export const STUDIO_WORKSPACE_TABS = [
  { id: 'library', label: 'Biblioteka', shortLabel: 'Bibl.' },
  { id: 'develop', label: 'Develop', shortLabel: 'Dev' },
  { id: 'masks', label: 'Maski', shortLabel: 'Maski' },
  { id: 'layers', label: 'Warstwy', shortLabel: 'Warst.' },
  { id: 'retouch', label: 'Retusz', shortLabel: 'Retusz' },
  { id: 'ai', label: 'AI', shortLabel: 'AI' },
  { id: 'export', label: 'Eksport', shortLabel: 'Eksport' },
];

export function resolveInitialStudioWorkspaceFromLocation() {
  if (typeof window === 'undefined') {
    return 'develop';
  }
  const param = new URLSearchParams(window.location.search).get('workspace');
  if (param && STUDIO_WORKSPACE_IDS.includes(param)) {
    return param;
  }
  return 'develop';
}
