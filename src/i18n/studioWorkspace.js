import { STUDIO_WORKSPACE_IDS } from '../filmLab/studioWorkspaceTabs.js';

/** Etykiety zakładek powłoki edytora — pod drugi język wystarczy drugi plik locale. */
export function studioWorkspaceTabsFromTranslator(t) {
  return STUDIO_WORKSPACE_IDS.map((id) => ({
    id,
    label: t(`filmLab.studio.${id}.label`),
    shortLabel: t(`filmLab.studio.${id}.short`),
  }));
}
