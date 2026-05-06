# STOP Etap 14 — 2026-04-30 — Retusz v1 z integracją masek

## Etap

- Numer: `14`
- Nazwa: Retusz v1 z integracją masek
- Status: `GO` (MVP)

## Zakres wdrożony

### Shell / UX

- **`FilmLabRetouchWorkspace.jsx`** — zakładka **Retusz** zamiast placeholderu: lewy pas narzędzi (Heal / Clone / Remove object / Off), środek **`FilmLabCanvasArea`**, prawy pas opcji.
- **`FilmLabShell.jsx`** — routing workspace `retouch`; placeholder zostaje tylko dla **AI**.

### Stan (`adjustments`)

- **`retouchTool`**: `none` | `heal` | `clone` | `removeObject`
- **`retouchScope`**: `global` | `masked` — dla **Heal** w silniku
- **`retouchHealStrength`**: 0–100
- **`retouchRemoveObjectState`**: stub workflow (`idle` / `pending` / `done`)

### Silnik (CPU preview)

- **`filmLabRetouchPreviewPass.js`** — **`computeRetouchMaskWeightAtPixel`** (graf combine jak w maskach + **max** wag ze stacku przy zwykłym stacku); **`applyRetouchHealBoxBlurPass`** (mieszanie z rozmytym sąsiedztwem 3×3).
- **`useFilmLabEngine.js`** — po ditherze preview, przed black-output guard: przy **`retouchTool === 'heal'`** jedna iteracja Heal zgodnie z zakresem i siłą.

### Narzędzia vs kryteria

| Narzędzie | Global / masked | Stan |
|-------------|-----------------|------|
| **Heal** | Tak (`retouchScope`) | Działa w podglądzie (aproksymacja „heal” przez blur) |
| **Clone** | — | UI + komunikat **wkrótce** (brak interakcji źródła) |
| **Remove Object AI** | — | **Stub** przycisku (stan `pending`→`done`, bez zmiany pikseli) — pod przyszły ONNX / lokalne modele |

### i18n

- `filmLab.retouch.*` (PL/EN), parity: `npm run test:i18n-parity`

### Testy

- **`scripts/test-film-lab-retouch-pass.mjs`**, `npm run test:retouch-pass` (w `test` / `ci`).

## Ryzyka / następne kroki

- Heal to **edukacyjny** podgląd (blur), nie pełny inpainting.
- Clone wymaga **WIP** (punkt źródłowy, pędzel).
- Remove Object — integracja z **lokalnym** pipeline (por. Etap 10 ONNX) w osobnej iteracji.
