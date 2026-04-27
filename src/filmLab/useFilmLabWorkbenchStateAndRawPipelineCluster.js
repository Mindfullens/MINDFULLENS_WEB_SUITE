import { useFilmLabRawPipelinePreferences } from './useFilmLabRawPipelinePreferences.js';
import { useFilmLabWorkbenchState } from './useFilmLabWorkbenchState.js';

/** Core workbench React state + persisted RAW pipeline toggles (FilmLabPro cluster). */
export function useFilmLabWorkbenchStateAndRawPipelineCluster() {
  const workbenchState = useFilmLabWorkbenchState();
  const rawPipeline = useFilmLabRawPipelinePreferences();

  return { ...workbenchState, ...rawPipeline };
}
