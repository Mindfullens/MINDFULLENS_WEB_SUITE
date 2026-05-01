import { useEffect, useRef } from 'react';
import { isMaskStudioBuilderSectionId, resolveMaskStudioSectionFromLocation } from './maskStudioSectionIds.js';

/**
 * Dwukierunkowa synchronizacja `adjustments.maskStudioBuilderSection` z `?maskSection=` (zakładka Maski).
 */
export function useFilmLabMaskStudioUrlSync({
  studioWorkspace,
  maskStudioBuilderSection,
  updateAdjustment,
}) {
  const appliedInitial = useRef(false);

  useEffect(() => {
    if (studioWorkspace !== 'masks' || appliedInitial.current) {
      return;
    }
    appliedInitial.current = true;
    const fromUrl = resolveMaskStudioSectionFromLocation();
    if (fromUrl !== maskStudioBuilderSection) {
      updateAdjustment('maskStudioBuilderSection', fromUrl);
    }
  }, [studioWorkspace, maskStudioBuilderSection, updateAdjustment]);

  useEffect(() => {
    if (studioWorkspace !== 'masks' || !isMaskStudioBuilderSectionId(maskStudioBuilderSection)) {
      return;
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('maskSection', maskStudioBuilderSection);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
  }, [studioWorkspace, maskStudioBuilderSection]);
}
