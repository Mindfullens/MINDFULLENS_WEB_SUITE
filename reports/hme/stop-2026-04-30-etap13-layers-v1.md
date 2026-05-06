# STOP Etap 13 — 2026-04-30 — Warstwy v1 (non-destructive core)

## Etap

- Numer: `13`
- Nazwa: Warstwy v1
- Status: `GO`

## Kryteria vs dostawa

| Kryterium | Realizacja |
|-----------|------------|
| Layer stack | `adjustments.recipeLayersV0` — kolejność od góry listy = kolejność nakładania w pętli CPU po globalnym pipeline + maskach bazowych. |
| Blend modes | **Normal** (EV + shoulder jak wcześniej), **Multiply** (mnożenie kanałów z wagą maski), **Screen** (lekki lift + przyciemnienie przy ujemnej EV) — `recipeLayerBlendApply.js`. |
| Opacity | Bez zmian — `opacity` warstwy × waga maski w helperze. |
| Visibility | Bez zmian — `enabled === false` pomija warstwę. |
| Przypisanie maski | Bez zmian — `maskIndex` / `maskGraphNodeId`; przy **dodawaniu warstwy** domyślnie **`localMaskActiveIndex`** (wcześniej zawsze slot 0 — naprawione). |

## Pliki

- **`src/engine/filmLabExposureGainShoulder.js`** — wydzielony **`applyExposureGainWithShoulder`** (współdzielony z `useFilmLabEngine` i ścieżką Normal warstw).
- **`src/filmLab/recipeLayerBlendApply.js`** — `normalizeRecipeLayerBlendMode`, `applyRecipeLayerToneRgb`.
- **`src/filmLab/recipeLayersV0.js`** — pole **`blendMode`** (domyślnie `normal`).
- **`src/FilmLabRecipeLayersStudio.jsx`** — dropdown trybu mieszania, skróty **N/M/S** na liście.
- **`src/i18n/locales/en.json`**, **`pl.json`** — `recipeLayers.blendMode`, `blend.*`, `blendShort.*`.

## Testy

- `npm run test:recipe-layer-blend`: PASS  
- `npm run lint`: PASS  
- `npm run build`: PASS  

## Ograniczenia / dalsza praca

- Tryby **multiply / screen** są **przybliżeniem** fotograficznym (nie pełny kompozytor 16-bit jak w desktopie); **normal** zachowuje shoulder jak dotąd.
- Worker GPU proxy nadal bez pełnego stacku warstw — jak dla innych lokalnych masek.

## Następny etap

- **`14`** Retusz v1 lub utwardzenie warstw (np. więcej blendów / composite dokumentu recipe).
