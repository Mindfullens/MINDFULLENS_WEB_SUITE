import { useSyncStateToRef } from './useSyncStateToRef.js';

export function useFilmLabViewportStateRefs({ zoomRef, zoom, panOffsetRef, panOffset }) {
  useSyncStateToRef(zoomRef, zoom);
  useSyncStateToRef(panOffsetRef, panOffset);
}
