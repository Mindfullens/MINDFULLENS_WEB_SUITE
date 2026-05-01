import { CATEGORY_TABS } from '../filmLab/categoryTabs.js';
import {
  CROP_ASPECT_PRESETS,
  CROP_OVERLAY_MODES,
} from '../filmLab/crop/cropConstants.js';
import { METADATA_VIEW_MODES } from '../filmLab/workbenchConstants.js';
import { MIXER_COLORS, MIXER_GROUPS } from '../filmLab/mixerConstants.js';
import { GRADE_ZONES, PANEL_TABS } from '../filmLab/panelAndGradeTabs.js';

function cropAspectKey(id) {
  return String(id).replace(/:/g, '_');
}

export function translatePanelTabs(t) {
  return PANEL_TABS.map((tab) => ({ ...tab, label: t(`filmLab.panel.${tab.id}`) }));
}

export function translateGradeZones(t) {
  return GRADE_ZONES.map((z) => ({ ...z, label: t(`filmLab.gradeZone.${z.id}`) }));
}

export function translateMixerGroups(t) {
  return MIXER_GROUPS.map((g) => ({ ...g, label: t(`filmLab.mixerGroup.${g.id}`) }));
}

export function translateMixerColors(t) {
  return MIXER_COLORS.map((c) => ({ ...c, label: t(`filmLab.mixerColor.${c.id}`) }));
}

export function translateMetadataViewModeLabels(t) {
  return Object.fromEntries(METADATA_VIEW_MODES.map((mode) => [mode, t(`filmLab.metadataView.${mode}`)]));
}

export function translateCropOverlayModes(t) {
  return CROP_OVERLAY_MODES.map((m) => ({ ...m, label: t(`filmLab.cropOverlay.${m.id}`) }));
}

export function translateCropAspectPresets(t) {
  return CROP_ASPECT_PRESETS.map((p) => ({
    ...p,
    label: t(`filmLab.cropAspect.${cropAspectKey(p.id)}`),
  }));
}

export function translateCategoryTabs(t) {
  return CATEGORY_TABS.map((tab) => ({ ...tab, label: t(`filmLab.category.${tab.id}`) }));
}
