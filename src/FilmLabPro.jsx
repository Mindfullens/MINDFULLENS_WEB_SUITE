import FilmLabShellContainer from './FilmLabShellContainer.jsx';
import { useFilmLabFilmLabPro } from './filmLab/useFilmLabFilmLabPro.js';

export default function FilmLabPro() {
  const { shellRef, viewMode, isPreviewFullMode, bundleArgs } = useFilmLabFilmLabPro();
  return (
    <FilmLabShellContainer
      shellRef={shellRef}
      viewMode={viewMode}
      isPreviewFullMode={isPreviewFullMode}
      bundleArgs={bundleArgs}
    />
  );
}
