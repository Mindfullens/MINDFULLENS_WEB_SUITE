import assert from 'node:assert/strict';
import { STUDIO_WORKSPACE_IDS, STUDIO_WORKSPACE_TABS } from '../src/filmLab/studioWorkspaceTabs.js';
import {
  clampStudioWorkspaceTabForUiMode,
  filterStudioWorkspaceTabsForUiMode,
  resolveStudioWorkspaceForUiMode,
  SIMPLE_MODE_HIDDEN_STUDIO_WORKSPACE_IDS,
} from '../src/filmLab/useFilmLabUiMode.js';

assert.deepEqual(SIMPLE_MODE_HIDDEN_STUDIO_WORKSPACE_IDS, ['layers', 'ai']);

const proTabs = filterStudioWorkspaceTabsForUiMode(STUDIO_WORKSPACE_TABS, 'pro');
assert.equal(proTabs.length, STUDIO_WORKSPACE_TABS.length);

const simpleTabs = filterStudioWorkspaceTabsForUiMode(STUDIO_WORKSPACE_TABS, 'simple');
assert.ok(!simpleTabs.some((t) => t.id === 'layers'));
assert.ok(!simpleTabs.some((t) => t.id === 'ai'));
assert.ok(simpleTabs.some((t) => t.id === 'develop'));

assert.equal(resolveStudioWorkspaceForUiMode('layers', 'simple'), 'develop');
assert.equal(resolveStudioWorkspaceForUiMode('layers', 'pro'), 'layers');
assert.equal(resolveStudioWorkspaceForUiMode('develop', 'simple'), 'develop');

assert.equal(clampStudioWorkspaceTabForUiMode('layers', 'simple'), 'develop');
assert.equal(clampStudioWorkspaceTabForUiMode('layers', 'pro'), 'layers');

for (const id of STUDIO_WORKSPACE_IDS) {
  if (id !== 'layers' && id !== 'ai') {
    assert.equal(clampStudioWorkspaceTabForUiMode(id, 'simple'), id);
  }
}

console.log('film-lab-ui-mode tests OK');
