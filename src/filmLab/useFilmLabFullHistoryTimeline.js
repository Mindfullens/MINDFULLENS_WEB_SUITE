import { useMemo } from 'react';
import { getDisplayFilm } from './displayFilm.js';
import { cloneSnapshotStackSafe } from './sessionSnapshot.js';
import { FIT_UI_ZOOM } from './viewportZoom.js';

export function useFilmLabFullHistoryTimeline({
  undoStackRef,
  filmStocks,
  activeFilmIndex,
  adjustments,
  historyRevision,
  zoom,
}) {
  return useMemo(() => {
    const normalizedHistory = cloneSnapshotStackSafe(undoStackRef.current, 20);
    const entries = normalizedHistory.map((snapshot, index) => {
      const filmIndex =
        Number.isInteger(snapshot?.activeFilmIndex) && filmStocks[snapshot.activeFilmIndex]
          ? snapshot.activeFilmIndex
          : 0;
      const film = getDisplayFilm(filmStocks[filmIndex], filmIndex);
      return {
        id: `undo-${index}`,
        isCurrent: false,
        stepLabel: `Krok ${index + 1}`,
        filmName: film?.name || 'Profil wejściowy',
        exposure: Number(snapshot?.adjustments?.exposure ?? 0),
        contrast: Number(snapshot?.adjustments?.contrast ?? 0),
        rotation: Number(snapshot?.adjustments?.rotation ?? 0),
        flipped: Boolean(snapshot?.adjustments?.flipped),
        zoom: Number(snapshot?.zoom ?? FIT_UI_ZOOM),
      };
    });

    const currentFilm = getDisplayFilm(
      filmStocks[Number.isInteger(activeFilmIndex) ? activeFilmIndex : 0],
      Number.isInteger(activeFilmIndex) ? activeFilmIndex : 0
    );
    entries.push({
      id: 'current-state',
      isCurrent: true,
      stepLabel: 'Aktualny stan',
      filmName: currentFilm?.name || 'Profil wejściowy',
      exposure: Number(adjustments?.exposure ?? 0),
      contrast: Number(adjustments?.contrast ?? 0),
      rotation: Number(adjustments?.rotation ?? 0),
      flipped: Boolean(adjustments?.flipped),
      zoom: Number(zoom ?? FIT_UI_ZOOM),
    });

    return entries;
  }, [
    activeFilmIndex,
    adjustments?.contrast,
    adjustments?.exposure,
    adjustments?.flipped,
    adjustments?.rotation,
    historyRevision,
    zoom,
  ]);
}
