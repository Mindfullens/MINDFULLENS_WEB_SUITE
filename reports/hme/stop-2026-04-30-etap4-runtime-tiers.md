# STOP Etap 4 — 2026-04-30 — Runtime tiers A/B/C + fallback (UX)

## Etap

- Numer: `4`
- Nazwa: Runtime tiers A/B/C + fallback policy
- Status: `GO`

## Zakres wdrożony (pliki/moduły)

- `src/filmLab/runtimeTier.js` — `runtimeTierSourceToI18nLeaf()` + mapowanie slugów źródeł tieru na klucze i18n
- `src/filmLab/useFilmLabRenderDebugStatusLabels.js` — segment statusu `tier {tier}: {sourceLabel}` (tekst PL/EN zamiast surowego slug-a); rozszerzony słownik `proxyWorkerReason` (`proxy frame error`, `preferred:cpu`, `preferred:gpu`)
- `src/i18n/locales/pl.json`, `src/i18n/locales/en.json` — `filmLab.runtimeStatus.tierSource.*`, nowe komunikaty fallback
- `scripts/test-runtime-tier-resolution.mjs` — regresja `resolveRuntimeTier` / leaf i18n
- `package.json` — `npm run test:runtime-tier` w `test` i `ci`

## Testy i wynik

- `npm run lint`: PASS
- `npm run test:i18n-parity`: PASS
- `npm run test:runtime-tier`: PASS

## Wpływ UX/produkt (co użytkownik już widzi)

- Pasek diagnostyczny / tooltip nad badge runtime pokazuje **czytelny opis źródła tieru** (PL/EN) zamiast `main-webgpu` itd.
- Znane kody powodu fallback z workera mają **krótkie komunikaty UX** zamiast surowego kodu (tam gdzie dopisano mapowanie).

## Ryzyka i decyzje architektoniczne

- Nieznany slug źródła tieru: wyświetlany jest **surowy** techniczny string (fail-safe).
- Nadal możliwe **niezmapowane** `proxyWorkerReason` (np. długi komunikat błędu) — wtedy UI pokazuje surowy tekst.

## Następny etap (1 krok dalej)

- Następny etap: `5` — Kontrakt Recipe v1 (nieniszczący zapis)
- Zakres startowy: walidacja recipe / fingerprint przy kolejnych zmianach mask graph

---
