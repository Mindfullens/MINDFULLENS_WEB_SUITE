/**
 * Film Lab Pro: jedna funkcja do invalidacji async `loadDevelopAssetFromCatalog`
 * przy NOWYM źródle z poza tej ścieżki (upload, undo restore, session snapshot).
 * Rejestrowana z `useFilmLabFilmLabPro` przez `setFilmLabProDevelopCatalogLoadBump`.
 */
let registeredBump = () => {};

export function setFilmLabProDevelopCatalogLoadBump(fn) {
  registeredBump = fn == null || typeof fn !== 'function' ? () => {} : fn;
}

/** Wywoływane z `useFilmLabUploadedSourceRestore` przed `applyUploadedSource`, gdy nie `skipDevelopCatalogLoadGen`. */
export function bumpDevelopCatalogLoadFromNonCatalogSource() {
  registeredBump();
}
