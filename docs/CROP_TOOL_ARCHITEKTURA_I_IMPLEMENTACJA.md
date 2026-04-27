# Crop Studio — Architektura i Implementacja

## Cel
Wyodrębnić kadrowanie z `FilmLab` do niezależnego narzędzia `Crop Studio` (trasa `/crop`) z własną warstwą domenową, osobnym UI i eksportem recipe.

## Warstwy

### 1) UI (`src/CropToolPage.jsx`)
- Osobny ekran narzędzia z trzema strefami: panel sterowania, stage, panel eksportu.
- Interaktywna ramka kadru z uchwytami (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`).
- Tryb manualny + auto-crop + historia undo/redo.
- Eksport JPG i eksport `recipe.json`.

### 2) Domain Geometry (`src/crop/domain/geometry.js`)
- Normalizacja i ograniczanie prostokąta kadru do zakresu `[0..1]`.
- Resize z obsługą uchwytów i blokadą aspektu.
- Konwersje `rect <-> pixels`.
- Presety proporcji (`free`, `1:1`, `4:5`, `3:4`, `3:2`, `16:9`, `21:9`, `9:16`).

### 3) Domain Saliency (`src/crop/domain/saliency.js`)
- Budowa mapy istotności (edge, colorfulness, skin prior, local contrast, center bias).
- Integrale (`integral image`) dla szybkiego skanowania kandydatów kadru.
- Auto-crop z heurystyką kompozycji (rule-of-thirds) i profilem analizy (`balanced`, `portrait`, `product`).
- Scoring aktualnego kadru (`meanScore`, `composition`, `total`).

### 4) Domain Recipe (`src/crop/domain/recipe.js`)
- Niezależny zapis nieniszczących ustawień:
  - `cropRect`
  - `aspectPreset`
  - `rotation`, `flipX`
  - stan przewodników UI
  - metryki ostatniej sugestii auto-crop

## Przepływ danych
1. Użytkownik ładuje obraz.
2. UI dekoduje obraz i uruchamia saliency pipeline.
3. Stage renderuje podgląd (obrót/flip + opcjonalna heatmapa).
4. Użytkownik kadruje manualnie lub uruchamia auto-crop.
5. Stan narzędzia trafia do historii (undo/redo) jako snapshot.
6. Eksport:
   - JPG: render transformacji na canvas + wycięcie prostokąta.
   - Recipe JSON: serializacja stanu nieniszczącego.

## Decyzje architektoniczne
- **Nieniszcząco**: operujemy na normalized rect i recipe, nie modyfikujemy źródła.
- **Domena oddzielona od UI**: geometria/saliency/recipe są niezależne i testowalne.
- **Wydajność**: auto-crop korzysta z integral image, nie liczy sum pikseli per kandydat od zera.
- **Skalowalność**: profile heurystyk przygotowane pod kolejne rozszerzenia (np. face detector).

## Następne kroki (Roadmap)
1. WebWorker dla saliency i auto-crop (pełne odciążenie głównego wątku).
2. Detekcja twarzy/oczu jako dodatkowa mapa priorytetów.
3. Batch crop z wspólną strategią kadrowania dla całej serii.
4. Tryb presetów publikacyjnych (Instagram, YouTube, Stories, Print) z walidacją safe area.
5. Integracja recipe z `FilmLab` i pozostałymi narzędziami pakietu.
