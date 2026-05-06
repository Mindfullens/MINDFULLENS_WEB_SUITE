import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { filmStocks } from '../engine/filmProfiles.js';
import { getDisplayFilm } from './displayFilm.js';

function translateInputProfileFilm(film, t) {
  if (!film?.isInputProfile) {
    return film;
  }
  return {
    ...film,
    name: t('filmLab.inputProfile.name'),
    sub: t('filmLab.inputProfile.sub'),
  };
}

export function useFilmLabFilmCatalog({ activeFilmIndex, searchQuery, activeCategory }) {
  const { t } = useI18n();

  const activeFilm = useMemo(
    () => translateInputProfileFilm(getDisplayFilm(filmStocks[activeFilmIndex], activeFilmIndex), t),
    [activeFilmIndex, t],
  );
  const isInputProfile = Boolean(activeFilm?.isInputProfile);

  const visibleFilms = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return filmStocks
      .map((film, index) => ({
        index,
        film: translateInputProfileFilm(getDisplayFilm(film, index), t),
      }))
      .filter(({ film }) => {
        const matchesCategory = activeCategory === 'all' || film.cat === activeCategory;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          film.name.toLowerCase().includes(normalizedQuery) ||
          film.sub.toLowerCase().includes(normalizedQuery);

        return matchesCategory && matchesQuery;
      });
  }, [activeCategory, searchQuery, t]);

  return { activeFilm, isInputProfile, visibleFilms };
}
