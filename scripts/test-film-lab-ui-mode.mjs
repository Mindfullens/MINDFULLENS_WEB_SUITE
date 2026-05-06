/**
 * Simple vs Pro workspace gating — musi być zgodne z `src/filmLab/useFilmLabUiMode.js`
 * i aktualną listą zakładek w `src/filmLab/studioWorkspaceTabs.js`.
 */
import assert from 'node:assert/strict';
import { STUDIO_WORKSPACE_IDS, STUDIO_WORKSPACE_TABS } from '../src/filmLab/studioWorkspaceTabs.js';
import {
  clampStudioWorkspaceTabForUiMode,
  filterStudioWorkspaceTabsForUiMode,
  resolveStudioWorkspaceForUiMode,
  SIMPLE_MODE_HIDDEN_STUDIO_WORKSPACE_IDS,
} from '../src/filmLab/useFilmLabUiMode.js';

assert.deepEqual(SIMPLE_MODE_HIDDEN_STUDIO_WORKSPACE_IDS, []);
assert.deepEqual(STUDIO_WORKSPACE_IDS, ['library', 'develop', 'export']);

const proTabs = filterStudioWorkspaceTabsForUiMode(STUDIO_WORKSPACE_TABS, 'pro');
assert.equal(proTabs.length, STUDIO_WORKSPACE_TABS.length);

const simpleTabs = filterStudioWorkspaceTabsForUiMode(STUDIO_WORKSPACE_TABS, 'simple');
assert.equal(simpleTabs.length, STUDIO_WORKSPACE_TABS.length);
assert.ok(simpleTabs.some((t) => t.id === 'develop'));
assert.ok(simpleTabs.some((t) => t.id === 'library'));
assert.ok(simpleTabs.some((t) => t.id === 'export'));

for (const id of STUDIO_WORKSPACE_IDS) {
  assert.equal(resolveStudioWorkspaceForUiMode(id, 'simple'), id);
  assert.equal(resolveStudioWorkspaceForUiMode(id, 'pro'), id);
  assert.equal(clampStudioWorkspaceTabForUiMode(id, 'simple'), id);
}

console.log('film-lab-ui-mode tests OK');
