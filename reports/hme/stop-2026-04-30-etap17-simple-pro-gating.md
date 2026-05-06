# STOP — Etap 17: Simple/Pro gating

**Data:** 2026-04-30  
**Zakres:** Jeden silnik, dwa poziomy UX — w trybie **Simple** ukryte są zakładki studia **Warstwy** i **AI** (jak w `SIMPLE_MODE_HIDDEN_STUDIO_WORKSPACE_IDS`), mapowanie URL `?workspace=` na **Develop**, gdy aktywny workspace jest niedozwolony; nawigacja wywołuje **clamp** zamiast przejść na ukrytą zakładkę.

## Dostarczone

- `src/filmLab/useFilmLabUiMode.js` — normalizacja trybu, filtrowanie zakładek, `resolveStudioWorkspaceForUiMode`, `clampStudioWorkspaceTabForUiMode`.
- `src/filmLab/useFilmLabStudioWorkspace.js` — `useEffect` synchronizujący workspace przy Simple + `handleStudioWorkspaceChange` z clampiem.
- `src/filmLab/buildFilmLabShellPropBundle.js` — `studioNavProps.tabs` przez `filterStudioWorkspaceTabsForUiMode`.
- `src/filmLab/filmLabFilmLabProClusterArgFactories.js` — `studioWorkspace` + `uiMode` w `studioWorkspaceArgs`.
- i18n: copy przycisku trybu (`filmLab.toolbar.uiModeTitle`) PL/EN — dopisek o zakładkach Warstwy/AI.
- Test: `npm run test:film-lab-ui-mode` (`scripts/test-film-lab-ui-mode.mjs`).

## Weryfikacja

- `npm run test:film-lab-ui-mode`
- `npm run test:i18n-parity`
- `npm run lint`
- `npm run build`

## Uwagi

- Graf masek (combine) w panelu Maski pozostaje ukryty w Simple jak wcześniej (`FilmLabLocalMaskWorkbench`); Etap 17 domyka **nawigację** poziomów Simple vs Pro.
