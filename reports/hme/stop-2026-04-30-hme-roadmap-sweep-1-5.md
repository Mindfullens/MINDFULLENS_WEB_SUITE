# STOP — HME roadmap sweep (punkty 1–5)

**Data:** 2026-04-30

## 1 — MVP P1 (maski)

- **Edge brush**: już w silniku (`buildBrushMaskBuffer`, Sobel w canvas). Domknięcie: **`semantic.brush_strokes.v1`** zawiera `edgeSensitivity`, `edgeWeightedStrokeCount`; maski na stacku serializują `brush.edgeSensitivity`; worker payload **`hasBrushEdgeSemantic`**; debug panel + testy `test-recipe-import.mjs` / `test-recipe-envelope.mjs`.
- **Control points (color)**: Shift+klik próbkuje odcień — bez zmian w tej iteracji.

## 2 — MVP P2

- **CMYK soft proof**: wdrożone (`cmykSoftProofEnabled`, `filmLabCmykSoftProofApprox.js`).
- **Generacja**: stub recipe nadal; kolejny epik — [`docs/hme/GENERATIVE-LOCAL-ONNX-SPIKE.md`](../../docs/hme/GENERATIVE-LOCAL-ONNX-SPIKE.md).

## 3 — Głębia rzeczywista

- Proxy zamknięte wcześniej; następny krok — [`docs/hme/DEPTH-REAL-MAP-SPIKE.md`](../../docs/hme/DEPTH-REAL-MAP-SPIKE.md).

## 4 — Eksport PSD / DNG

- Bez zmian binarnych w tej iteracji; źródło prawdy — [`docs/hme/EXPORT-PSD-DNG-SPIKE.md`](../../docs/hme/EXPORT-PSD-DNG-SPIKE.md) (wariant DNG A, PSD warstwowy jako osobny epik).

## 5 — UX

- Dolny pasek: **„Maska: głębia (proxy)”** tylko przy **`brushMaskEnabled !== false`** i trybie `depth`.

## Weryfikacja

- `node scripts/check-i18n-parity.mjs`
- `node scripts/test-recipe-import.mjs`
- `node scripts/test-recipe-envelope.mjs`
