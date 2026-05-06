# STOP Etap 8 — 2026-04-30 — Mask-aware sliders (Develop)

## Etap

- Numer: `8`
- Nazwa: Mask-aware sliders w Develop
- Status: `GO`

## Zakres wdrożony (pliki/moduły)

- `src/filmLab/useFilmLabMaskBindings.js` — wspólna logika UI: `getActiveMaskSlotGraphNodeId`, `isAdjustmentBoundToMask`, `toggleAdjustmentMaskBinding`, re-export `parseMaskSlotIndexFromNodeId`.
- `src/filmLab/maskAdjustmentBindingApply.js` — **`applyAdjustmentBindingsForTonePipeline`**: dla przypięcia **exposure** do `mask_slot_n` wyzerowanie globalnego `exposure` w kopiowym stanie i przeniesienie wartości do **exposure** slotu w `localMasks[n]` lub (gdy brak wpisu) do `brushMaskExposure` przy zgodnym indeksie aktywnej maski.
- `src/engine/useFilmLabEngine.js` — ścieżka tonacji CPU + `buildLocalMaskStackSnapshot` używają wyniku `applyAdjustmentBindingsForTonePipeline(adjustments)` (jako `toneAdj`) dla **userExposure** z `toneAdj` oraz stacku masek.
- `src/FilmLabSliderRenderers.jsx` — pinezka suwaków standardowych korzysta z modułu mask bindings.
- `scripts/test-mask-adjustment-binding-apply.mjs` — regresja merge exposure → slot.
- `package.json` — `npm run test:mask-binding` w `test` i `ci`.

## Testy i wynik

- `npm run test:mask-binding`: PASS
- `npm run lint`: PASS

## Wpływ UX/produkt (co użytkownik już widzi)

- Przypięty **Ekspozycja** do aktywnej maski: korekta jest stosowana **przez maskę** (CPU preview), zamiast globalnej gałęzi exposure.

## Ryzyka i decyzja architektoniczna

- **MVP — tylko `exposure`**: inne klawisze suwaków nadal tylko UI przypięcia w `adjustmentBindings` (gdy w przyszności rozszerzymy listę w silniku).
- **Worker / WebGPU proxy**: pełna spójność z CPU w osobnej iteracji (ścieżka proxy może nie replikować 1:1 `toneAdj`); priorytet: zgodność głównej ścieżki CPU używanej w Develop.

## Następny etap (1 krok dalej)

- Następny etap: `9` — Zakładka Maski v1 (HME Builder shell)
- Zakres startowy: lista masek + builder sekcje (już częściowo) — dopracowanie spójności z przypięciami suwaków

---
