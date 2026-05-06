/**
 * Simple vs Pro workspace gating — musi być zgodne z `src/filmLab/useFilmLabUiMode.js`
 * i aktualną listą zakładek w `src/filmLab/studioWorkspaceTabs.js`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rightPanelSource = fs.readFileSync(path.join(root, 'src/FilmLabRightPanel.jsx'), 'utf8');

assert.match(
  rightPanelSource,
  /section\.maskStudioHybrid/,
  'Hybrid Mask Studio intent entrypoint should be present in right panel'
);
assert.match(
  rightPanelSource,
  /section\.panel10WorkflowQc/,
  'Workflow and QC panel section should be present in right panel'
);
assert.match(
  rightPanelSource,
  /snapshotSave|snapshotApply/,
  'Workflow QC should expose snapshot save/apply actions'
);
assert.match(
  rightPanelSource,
  /section\.panelJDepthExport/,
  'Panel J depth/export roadmap section should be present in right panel'
);

console.log('film-lab-ui-mode tests OK');
