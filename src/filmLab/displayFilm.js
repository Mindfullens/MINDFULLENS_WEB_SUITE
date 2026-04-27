export const INPUT_PROFILE_NAME = 'Zdjęcie wejściowe';
export const INPUT_PROFILE_SUB = 'Bez profilu';

export function getDisplayFilm(film, index) {
  if (!film || index !== 0) {
    return film;
  }

  return {
    ...film,
    name: INPUT_PROFILE_NAME,
    sub: INPUT_PROFILE_SUB,
    isInputProfile: true,
  };
}
