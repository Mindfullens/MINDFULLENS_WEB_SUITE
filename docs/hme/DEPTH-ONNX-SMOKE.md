# Smoke test — mapa głębi ONNX (Film Lab)

Krótka procedura przed mergem lub przy pierwszym podpięciu modelu. Kod ścieżki: `filmLabDepthOnnxInference.js`, opcjonalnie worker `filmLabDepthOnnx.worker.js` + `filmLabDepthOnnxWorkerClient.js`; UI statusu: wiersz pod przełącznikiem źródła mapy (Głębia → ONNX).

## Przygotowanie

1. Hostuj plik `.onnx` pod **HTTPS** z **CORS** (`GET`, bez credentials) albo kładź plik w `public/` i ustaw URL względem `BASE_URL`.
2. W `.env` lokalnie (przed `npm run dev`):

```bash
VITE_FILMLAB_DEPTH_ONNX_MODEL_URL=https://twoja-domena/depth.onnx
# opcjonalnie, zgodnie z modelem:
# VITE_FILMLAB_DEPTH_ONNX_IMAGENET_NORM=1
# VITE_FILMLAB_DEPTH_ONNX_MAX_SIDE=512
# Wiele wyjść ONNX — nazwa tensora (wg Netron / sesji) lub indeks w outputNames:
# VITE_FILMLAB_DEPTH_ONNX_OUTPUT_NAME=depth
# VITE_FILMLAB_DEPTH_ONNX_OUTPUT_INDEX=0
# Wyjście wielokanałowe: pierwszy kanał albo średnia (NCHW / NHWC):
# VITE_FILMLAB_DEPTH_ONNX_DEPTH_CHANNELS=first
# VITE_FILMLAB_DEPTH_ONNX_DEPTH_CHANNELS=mean
# Start inferencji na wątku głównym: requestIdleCallback (max. opóźnienie w ms, domyślnie 480):
# VITE_FILMLAB_DEPTH_ONNX_IDLE_TIMEOUT_MS=480
# WASM w osobnym wątku (mniej blokady UI); przy błędzie — automatyczny fallback na główny wątek:
# VITE_FILMLAB_DEPTH_ONNX_USE_WORKER=1
```

3. Uruchom `npm run dev`, wejdź w **Film Lab Pro**, wczytaj zdjęcie z treścią (nie jednolity kolor).

## Kroki w UI

1. **Maska lokalna** → tryb **Głębia** (pędzel + zakres).
2. **Proxy: ONNX** — pod przyciskami pojawia się krótki status:
   - *„Budowanie mapy głębi…"* — inferencja w toku (pierwsze uruchomienie WASM może trwać dłużej). Start `run` jest planowany w **idle** (po krótkim debounce 200 ms), żeby zdążyć narysować klatkę — przy bardzo szybkim przesuwaniu suwaków kolejne klatki **anulują** poprzedni idle; to normalne.
   - Komunikat **żółty / ostrzegawczy** — ONNX nie zwrócił mapy; maska używa **jasności** (fallback). Treść wskazuje typ problemu (brak URL, pobranie, kształt tensora itd.).
   - Tryb testu: `VITE_FILMLAB_DEPTH_ONNX_USE_LUMA_FALLBACK=1` → *„tryb testu (jasność)"*.
3. Porusz suwakami zakresu głębi — odpowiedź powinna być płynna; przy zacięciach zmniejsz `VITE_FILMLAB_DEPTH_ONNX_MAX_SIDE` i przebuduj.
4. Gdy mapa jest „płaska” lub odwrócona: spróbuj `VITE_FILMLAB_DEPTH_ONNX_INPUT_LAYOUT=nhwc` lub `nchw`, ewent. `IMAGENET_NORM`.
5. Gdy model ma **wiele wyjść** (np. logits vs depth): ustaw `OUTPUT_NAME` zgodnie z nazwą w grafie albo `OUTPUT_INDEX` (kolejność jak w `session.outputNames`). Zły wybór często daje losowy szum lub stałą mapę — wtedy popraw nazwę / indeks.
6. Gdy wyjście ma **wiele kanałów** (np. 3 × mapa): jeśli pierwszy kanał nie jest głębią, wypróbuj `DEPTH_CHANNELS=mean` albo dopasuj `OUTPUT_*` do tensora z pojedynczą płaszczyzną.

## Oczekiwane niepowodzenia (świadome)

- Brak zmiennej `VITE_FILMLAB_DEPTH_ONNX_MODEL_URL` → status *brak adresu modelu*.
- 404 / sieć → *nie udało się pobrać modelu*.
- Model z **wieloma wejściami** lub innym layoutem niż NCHW/NHWC RGB → *nieobsługiwany kształt* — wymaga kolejnej iteracji kodu lub innego eksportu.
- Brak tensora wyjścia dopasowanego przez `OUTPUT_NAME` / `OUTPUT_INDEX` / pierwsze wyjście → stan fallbacku związany z brakiem mapy (w kodzie: `output_missing`).

## Powiązane

- Raport STOP: [`reports/hme/stop-2026-05-02-depth-onnx-integration.md`](../../reports/hme/stop-2026-05-02-depth-onnx-integration.md)  
- SPIKE: [`DEPTH-REAL-MAP-SPIKE.md`](DEPTH-REAL-MAP-SPIKE.md)
