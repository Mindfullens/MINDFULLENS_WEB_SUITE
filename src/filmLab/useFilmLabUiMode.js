/**
 * Simple vs Pro UI gating — jeden silnik, dwa poziomy złożoności (NORTH-STAR).
 * Pro: pełny graph warstw / automation AI w nawigacji.
 * Simple: te zakładki są ukryte; mask graph w panelu Maski pozostaje ukryty osobno (FilmLabLocalMaskWorkbench).
 */

/** Studio tabs hidden in Simple mode (still reachable via recipe/engine, not via top nav). */
export const SIMPLE_MODE_HIDDEN_STUDIO_WORKSPACE_IDS = Object.freeze(['layers', 'ai']);

export function normalizeUiMode(mode) {
  return mode === 'simple' ? 'simple' : 'pro';
}

export function isStudioWorkspaceAllowedInUiMode(workspaceId, uiMode) {
  const id = String(workspaceId ?? '');
  if (normalizeUiMode(uiMode) !== 'simple') {
    return true;
  }
  return !SIMPLE_MODE_HIDDEN_STUDIO_WORKSPACE_IDS.includes(id);
}

/**
 * When entering Simple or landing on a forbidden tab, fall back to Develop.
 */
export function resolveStudioWorkspaceForUiMode(currentWorkspace, uiMode) {
  if (isStudioWorkspaceAllowedInUiMode(currentWorkspace, uiMode)) {
    return currentWorkspace;
  }
  return 'develop';
}

export function clampStudioWorkspaceTabForUiMode(nextId, uiMode) {
  return resolveStudioWorkspaceForUiMode(nextId, uiMode);
}

export function filterStudioWorkspaceTabsForUiMode(tabs, uiMode) {
  if (!Array.isArray(tabs)) {
    return [];
  }
  if (normalizeUiMode(uiMode) !== 'simple') {
    return tabs;
  }
  const hidden = new Set(SIMPLE_MODE_HIDDEN_STUDIO_WORKSPACE_IDS);
  return tabs.filter((t) => t && !hidden.has(t.id));
}

/**
 * @param {string | undefined} uiMode
 * @returns {{ isSimple: boolean, isPro: boolean }}
 */
export function getFilmLabUiModeFlags(uiMode) {
  const simple = normalizeUiMode(uiMode) === 'simple';
  return { isSimple: simple, isPro: !simple };
}
