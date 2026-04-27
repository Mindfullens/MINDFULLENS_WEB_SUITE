let prefetchPromise;

/**
 * Ciepło ładuje ten sam async chunk co trasa /film-lab w `App.jsx` (Vite bundluje
 * wspólnie), żeby po kliknięciu z landingu było mniej czekania.
 */
export function prefetchFilmLabRoute() {
  if (!prefetchPromise) {
    prefetchPromise = import('./FilmLab');
  }
  return prefetchPromise;
}
