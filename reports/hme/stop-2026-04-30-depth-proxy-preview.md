# STOP — Depth proxy w pipeline podglądu (P2)

**Data:** 2026-04-30  
**Zakres:** pierwsza iteracja „mapy głębi” w Film Lab = **proxy z luminancji** × maska pędzla (nie model ML ani EXIF depth).

## Co dostarczono

- **Silnik:** `computeLocalMaskWeightAtPixel` — tryb `depth`: `waga = pędzel × pasmo jasności` (ta sama logika co luma range, inna semantyka).
- **snapshot / podpis maski:** `buildLocalMaskSignature` i `buildLocalMaskStackSnapshot` uwzględniają `depthMask*`; eksport grayscale maski PNG — gałąź `depth` jak w preview.
- **UI:** suwaki `depthMaskMin` / `depthMaskMax` / `depthMaskFeather` (Detal + Maski → zakres); nakładka „Luma” na canvasie współdzielona z trybem głębi (proxy jasności); kopiowanie i18n `depthProxyHelp`.
- **Recipe:** `depth` w `serializeMaskSlot` / `serializeLiveSlotFromAdjustments` (`filmLabRecipeMaskProjection.js`).
- **Regresja:** `scripts/test-film-lab-range-mask.mjs` — dwa przypadki depth proxy.

## Ograniczenia (świadomie)

- To **nie** jest prawdziwa głębia optyczna; **jasność po develop** = heurystyka.
- Kolejne kroki: dedykowana mapa (ONNX / bufor głębi), ewent. `semantic.depth_range.v1` w pełnym sensie rasterowym.
