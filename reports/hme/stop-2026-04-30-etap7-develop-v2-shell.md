# STOP Etap 7 — 2026-04-30 — Develop v2 (shell RAW / globalny)

## Etap

- Numer: `7`
- Nazwa: Develop v2 (globalna edycja RAW)
- Status: `GO`

## Zakres wdrożony (pliki/moduły)

- `src/FilmLabShell.jsx` — jawny komentarz przy gałęzi **profil · canvas · prawy panel** (zakładka Develop i spółka).
- `src/filmLabPage.css` — **`workspace-develop`**: szersza kolumna środkowa (mniejszy narzut bocznych kolumn na desktopie + korekta w `@media (max-width: 1200px)`).
- `src/FilmLabCanvasArea.jsx` + `src/filmLab/shellPropBuilders.js` + `src/filmLab/buildFilmLabShellPropBundle.js` — dla **`studioWorkspace === 'develop'`** sekcja podglądu ma **`role="main"`** i **`aria-label`** (i18n).
- `src/i18n/locales/pl.json`, `en.json` — `filmLab.develop.canvasMainAria`.

Silnik RAW / suwaki globalne pozostają w istniejącym `FilmLabRightPanel` + `useFilmLabEngine`; Etap 7 domyka **układ produktowy** i dostępność obszaru Develop.

## Testy i wynik

- `npm run lint`: PASS
- `npm run test:i18n-parity`: PASS

## Wpływ UX/produkt (co użytkownik już widzi)

- Na zakładce **Develop** środkowa kolumna ma więcej miejsca na podgląd przy typowych szerokościach okna.
- Czytniki ekranu dostają wyraźny **główny landmark** dla podglądu Develop.

## Ryzyka i decyzje architektoniczne

- Ten sam układ 3-kolumnowy jest używany także dla **Eksport** i innych zakładek poza Biblioteka / Maski / Warstwy — tylko **`workspace-develop`** ma dedykowane szerokości siatki i landmark `main` na canvasie (unikamy wielu `main` przy przełączaniu zakładek w jednej SPA).

## Następny etap (1 krok dalej)

- Następny etap: `8` — Mask-aware sliders w Develop
- Zakres startowy: ikony maski / binding suwaków do warstw i masek zgodnie z `FilmLabSliderRenderers`

---
