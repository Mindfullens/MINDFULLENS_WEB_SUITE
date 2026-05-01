# STOP — Etap 9 — Zakładka Maski v1 (HME Builder shell)

**Data:** 2026-05-01  
**Status:** Done

## Kryteria STAGES.md

| Kryterium | Wynik |
|-----------|--------|
| Lista masek | Spełnione — lewy pas (`FilmLabLocalMaskWorkbenchListRail`), lista w panelu Detal (embedded) |
| Overlay | Spełnione — `localMaskShowOverlay`, canvas (`FilmLabCanvasArea`), przyciski / tryb Range |
| Skróty M / Shift+M / X | **Uzupełnione w tej iteracji** — w zakładce Maski (`workspace=masks`), przy załadowanym obrazie: **M** nakładka, **Shift+M** przełącz pędzel, **X** wymaż (tryb pędzla) lub wycisz aktywną maskę (inne tryby). Pozostałe skróty Alt+* bez zmian. |
| 5 sekcji buildera | Spełnione — `maskStudioSectionIds.js` (geometry, range, combine, ai, output) + nawigacja w `FilmLabLocalMaskWorkbenchToolsRail` |

## Zmiany (pliki)

- `src/engine/shortcutActions.js` — `studioWorkspace`, priorytet skrótów M / Shift+M / X na zakładce Maski
- `src/filmLab/useFilmLabGlobalKeydown.js` — `studioWorkspace`, obsługa `localMaskStudioShiftM`, `localMaskStudioEraseToggle`, intent E2E przy akcjach maski
- `src/filmLab/shellPropBuilders.js`, `src/filmLab/filmLabFilmLabProBuildCanvasViewportDebugCurveShellArgs.js` — przekazanie `studioWorkspace` do keydown
- `src/FilmLabShortcutHelp.jsx`, `src/i18n/locales/pl.json`, `src/i18n/locales/en.json` — opis skrótów + `stackMoveUp` / `stackMoveDown`
- `src/FilmLabLocalMaskWorkbench.jsx` — przyciski kolejności stacku przez i18n
- `scripts/regression-film-lab.mjs` — asercje skrótów mask workspace
- `src/filmLab/buildInfo.js` — bezpieczny dostęp do `import.meta.env` poza Vite (Node / ESLint)

## Weryfikacja

```bash
npm run test:i18n-parity   # OK
npm run lint               # OK
npm run test:regression    # na tej maszynie: FAIL w runExifOrientationGuards (niezwiązane z etapem 9); po nim następują m.in. runShortcutActionChecks
```

Skróty można sprawdzić ręcznie: `?workspace=masks`, załaduj obraz — **M** / **Shift+M** / **X**.

## Powiązanie

- `docs/hme/STAGES.md` — wiersz Etap 9 → Done, link do tego pliku.
