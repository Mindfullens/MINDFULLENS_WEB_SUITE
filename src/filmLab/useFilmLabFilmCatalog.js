import { useMemo } from 'react';
import { filmStocks } from '../engine/filmProfiles.js';
import { getDisplayFilm } from './displayFilm.js';

export function useFilmLabFilmCatalog({ activeFilmIndex, searchQuery, activeCategory }) {
  const activeFilm = useMemo(
    () => getDisplayFilm(filmStocks[activeFilmIndex], activeFilmIndex),
    [activeFilmIndex]
  );
  const isInputProfile = Boolean(activeFilm?.isInputProfile);

  const visibleFilms = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return filmStocks
      .map((film, index) => ({
        index,
        film: getDisplayFilm(film, index),
      }))
      .filter(({ film }) => {
        const matchesCategory = activeCategory === 'all' || film.cat === activeCategory;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          film.name.toLowerCase().includes(normalizedQuery) ||
          film.sub.toLowerCase().includes(normalizedQuery);

        return matchesCategory && matchesQuery;
      });
  }, [activeCategory, searchQuery]);

  return { activeFilm, isInputProfile, visibleFilms };
}
