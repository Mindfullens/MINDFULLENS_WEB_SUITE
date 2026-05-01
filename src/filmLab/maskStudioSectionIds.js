/** Sekcje prawego pasa Maski — zsynchronizowane z `?maskSection=`. */
export const MASK_STUDIO_BUILDER_SECTIONS = [
  { id: 'geometry', labelKey: 'filmLab.localMask.builderGeometry' },
  { id: 'range', labelKey: 'filmLab.localMask.builderRange' },
  { id: 'combine', labelKey: 'filmLab.localMask.builderCombine' },
  { id: 'ai', labelKey: 'filmLab.localMask.builderAi' },
  { id: 'output', labelKey: 'filmLab.localMask.builderOutput' },
];

export const MASK_STUDIO_BUILDER_SECTION_IDS = MASK_STUDIO_BUILDER_SECTIONS.map((s) => s.id);

export function isMaskStudioBuilderSectionId(id) {
  return typeof id === 'string' && MASK_STUDIO_BUILDER_SECTION_IDS.includes(id);
}

export function resolveMaskStudioSectionFromLocation() {
  if (typeof window === 'undefined') {
    return 'geometry';
  }
  const p = new URLSearchParams(window.location.search).get('maskSection');
  return isMaskStudioBuilderSectionId(p) ? p : 'geometry';
}
