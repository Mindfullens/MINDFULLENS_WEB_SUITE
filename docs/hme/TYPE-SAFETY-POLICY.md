# Type Safety Policy (Depth Diagnostics)

Ta notatka definiuje minimalne zasady utrzymania type-safe kontraktu dla helperów depth diagnostics.

## Wymagania dla nowego helpera publicznego

Każdy nowy helper depth dodawany do publicznego API musi mieć:

- deklarację w `src/engine/filmLabExportManifestHelpers.d.ts`,
- re-export w `src/engine/index.d.ts` (public API surface),
- fixture pozytywny usage: `scripts/fixtures/types/depth-diagnostics-usage.ts`,
- fixture negatywny: `scripts/fixtures/types/depth-diagnostics-negative-expectations.ts` z `@ts-expect-error`,
- zielone testy: `npm run test:types`.

## Gates

- `test:engine-types-barrel` — smoke re-exportów i deklaracji.
- `test:engine-index-types-snapshot` — snapshot public API surface (`src/engine/index.d.ts`).
- `test:engine-types-usage-tsc` — compile-time check (`tsc --noEmit`) na fixture usage/negative.
- `test:types` — agregat trzech testów powyżej.

## Zasada zmian

Jeśli zmieniasz public API w `src/engine/index.d.ts`, aktualizacja snapshotu
(`scripts/test-engine-index-types-snapshot.mjs`) musi być świadoma i iść razem z
aktualizacją dokumentacji kontraktu.

## Krótka checklista merge

- szybki check lokalny: `npm run preflight`,
- przed merge do gałęzi docelowej: `npm run preflight:full`.
