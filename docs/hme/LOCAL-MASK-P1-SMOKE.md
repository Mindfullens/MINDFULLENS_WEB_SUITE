# Smoke — maska lokalna P1 (chroma, Shift+klik, krawędź pędzla)

Krótka checklista QA przed mergem zmian w zakresie maski **Hue / pędzel**. Kod: [`filmLabLocalMaskRangeMath.js`](../../src/engine/filmLabLocalMaskRangeMath.js), [`FilmLabCanvasArea.jsx`](../../src/FilmLabCanvasArea.jsx), [`canvasLumaSobelSample.js`](../../src/filmLab/canvasLumaSobelSample.js).

## Automaty CI / lokalnie

```bash
npm run test:local-mask-p1
```

(Wewnętrznie: `test:range-mask` + `test:luma-sobel-sample`.)

### Playwright (Shift+klik na podglądzie)

To **nie zastępuje** krótkiego smoke ręcznego — **uzupełnia** go regresją w CI: job GitHub Actions **`e2e-playwright`** (workflow [`ci.yml`](../../.github/workflows/ci.yml)) uruchamia dokładnie `npm run test:e2e` na tym scenariuszu Hue.

Wymaga Chromium (`npx playwright install chromium` przy pierwszym uruchomieniu):

```bash
npm run test:e2e
```

Scenariusz: [`e2e/shift-click-hue-mask.spec.js`](../../e2e/shift-click-hue-mask.spec.js) — workspace Maski, fixture dwutonowy, Shift+klik zmienia **Hue center**.

**Lokalnie (macOS / niektóre wolumeny):** jeśli Playwright zgłosi **`ENOTEMPTY`** przy czyszczeniu `test-results/`, często winne są pliki **`._*`** (AppleDouble). Usuń katalog `test-results/` (np. `rm -rf test-results`) i uruchom test ponownie.

## Chroma range (maska color)

1. **Film Lab Pro** → maska lokalna włączona → tryb **Hue / Zakres koloru**.
2. Ustaw wąski zakres **Chroma min / max** (np. min 40, max 100): **wysokie nasycenie** w wybranym odcieniu przechodzi maskę; **szarość / niska saturacja** — maska znika (zakres „zgasza” obszar).
3. Suwaki **Hue center / width / feather** nadal działają jak wcześniej; chroma **mnoży** się z wagą odcienia.

## Shift + klik (środek odcienia z podglądu)

1. Ten sam tryb **Hue**.
2. **Shift + lewy klik** na kolorowy fragment podglądu → **Hue center** ustawia się na odcień piksela (wartość zaokrąglona).
3. Bez Shift — zwykłe zachowanie podglądu (np. pan po przytrzymaniu spacji — wg ustawień).

## Pędzel — krawędź (Sobel lumy)

1. Tryb **Brush** lub **Depth** (tam też są suwaki pędzla).
2. **Pędzel: krawędź** > 0: znaczki **mocniejsze przy krawędziach jasności** (kontrast sąsiadów).
3. Wartość 0 — zachowanie jak klasyczny pędzel bez wzmocnienia krawędzi.

## Regresja receptury

- Import / eksport maski ze strokami i `edgeSensitivity` — istniejące testy recipe (`test:recipe-import`); przy zmianach w `semantic.brush_strokes` uruchom pełniejszy `npm test` lub `npm run ci`.

## Powiązane

- North Star (P1): [`NORTH-STAR.md`](NORTH-STAR.md)  
- Głębia ONNX (osobny smoke): [`DEPTH-ONNX-SMOKE.md`](DEPTH-ONNX-SMOKE.md)
