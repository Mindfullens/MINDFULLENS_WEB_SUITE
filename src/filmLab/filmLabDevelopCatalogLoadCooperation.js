/**
 * Film Lab Pro: jedna funkcja do invalidacji async `loadDevelopAssetFromCatalog`
 * przy NOWYM źródle z poza tej ścieżki (upload, undo restore, session snapshot).
 * Rejestrowana z `useFilmLabFilmLabPro` przez `setFilmLabProDevelopCatalogLoadBump`.
 */
let registeredBump = () => {};
/** Czyści canvas podglądu / źródła w `useFilmLabEngine` — usuwa „ghost” starego kadru przy zmianie assetu. */
let registeredGhostClear = () => {};

export function setFilmLabProDevelopCatalogLoadBump(fn) {
  registeredBump = fn == null || typeof fn !== 'function' ? () => {} : fn;
}

export function setFilmLabDevelopGhostClear(fn) {
  registeredGhostClear = fn == null || typeof fn !== 'function' ? () => {} : fn;
}

/** Wywoływane z `useFilmLabUploadedSourceRestore` przed `applyUploadedSource`, gdy nie `skipDevelopCatalogLoadGen`. */
export function bumpDevelopCatalogLoadFromNonCatalogSource() {
  registeredBump();
}

/** Przed wczytaniem nowego pliku z katalogu — natychmiastowe wyczyszczenie płótna (bez ghostingu). */
export function clearFilmLabDevelopPresentationGhost() {
  registeredGhostClear();
}
