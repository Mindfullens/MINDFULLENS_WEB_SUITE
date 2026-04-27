import { useFilmLabAutoDevelopActions } from './useFilmLabAutoDevelopActions.js';
import { useFilmLabColorGradeLiveUpdates } from './useFilmLabColorGradeLiveUpdates.js';

/** Mixer / color grade / calibration live updates plus auto exposure & color. */
export function useFilmLabAutoDevelopAndColorGradeCluster({ colorGradeLiveArgs, autoDevelopArgs }) {
  const colorGrade = useFilmLabColorGradeLiveUpdates(colorGradeLiveArgs);
  const autoDevelop = useFilmLabAutoDevelopActions(autoDevelopArgs);
  return { ...colorGrade, ...autoDevelop };
}
