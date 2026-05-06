# D2 — Backlog P0 / P1 (Film Lab)

**Okno:** tydzień wykonawczy (D2)  
**Źródła:** ostatni duży PR (toolchain / depth / typy), testy w `package.json`, zestaw referencyjny [`reference-set-v1`](../../data/reference-sets/reference-set-v1/README.md).

## Ownerzy (domyślnie)

| Rola | Osoba |
| --- | --- |
| Produkt / priorytet | Łukasz (kontakt@mindfullens.pl) |
| Inżynieria / merge | Łukasz (Mindfullens Web Suite) |

*(Doprecyzuj podział „produkt vs dev” w komórce zespołu — wpisy w tabeli można przypisać 1:1.)*

## Exit criteria D2

- [ ] Lista **≤ 15** pozycji; każda ma **P0 lub P1**, **krótki repro** i **owner**.
- [ ] Wszystkie **P0** mają plan zamknięcia (data lub „w D3”).
- [ ] Brak pozycji w stylu „kiedyś poprawimy” bez klasyfikacji.

---

## P0 — blokuje merge / release albo łamie kontrakt

| ID | Opis | Repro / dowód | Owner | Plan |
| --- | --- | --- | --- | --- |
| **D2-P0-01** | **Decyzja merge PR z aktualizacją toolchain** (np. Dependabot: Vite 8, Tailwind 4, plugin-react 6) jest **zsynchronizowana z `main`**: albo merge po zielonym CI, albo zamknięcie PR z uzasadnieniem. | Dwa stany gałęzi (`main` vs branch PR) nie mogą rozjechać się bez dokumentu „co jest produkcyjne”. | Łukasz | Przed release: jedna wybrana linia wersji + zielony `ci`. |
| **D2-P0-02** | **Kontrakt eksportu / depth diagnostics** po zmianach: `npm run ci` (lub ustalony `preflight:full`) na wybranej gałęzi release bez regresji gate’ów eksportu. | Uruchom workflow release na commicie kandydującym; zbierz pierwszy log FAIL. | Łukasz | Naprawa w D3 przed tagiem. |

*(Jeśli na `main` nie ma jeszcze skoków wersji z PR toolchain — **D2-P0-01** zamień na: „Potwierdź, że `main` jest docelową linią release i że nie ma ukrytej gałęzi z nowszym Vite/Tailwind”.)*

---

## P1 — nie blokuje natychmiast, ale podnosi ryzyko jakości / utrzymania

| ID | Opis | Repro / dowód | Owner | Notatka |
| --- | --- | --- | --- | --- |
| **D2-P1-01** | **Zsynchronizuj dokumentację toolchain z `package.json`** po ewentualnym merge (Vite 6→8, Tailwind 3→4, PostCSS `@tailwindcss/postcss`). | `package.json` + `postcss.config.js` vs `docs/hme` / README. | Łukasz | Uniknij „README mówi inaczej niż build”. |
| **D2-P1-02** | **Referencyjny zestaw vs RAW gate:** `reference-set-v1` ma 16 kadrów; `build-raw-reference-manifest` / regresja RAW często oczekuje **≥ 30** raportów — zdefiniuj relację (podzbiór, osobny gate, lub rozszerzenie manifestu). | `npm run raw:reference:gate` na czystym klonie + manifest w `data/raw/reference`. | Łukasz | Cel: jeden jasny „oficjalny” gate przed release. |
| **D2-P1-03** | **Skrypt lub dokument „bootstrap assets”** po `git clone`: skopiowanie RAW pod `assetRelativePath` (ścieżka DAM jest w `assets/README.md`). | Fresh clone → brak plików → regresja wizualna niemożliwa. | Łukasz | Opcja: `scripts/sync-reference-set-assets.mjs` z env `MINDFULLENS_RAW_ROOT`. |
| **D2-P1-04** | **Diag / KPI:** raporty `render-debug` pokazują **E2E WARN** i **fc-gate:HOLD** — ustalić, czy to akceptowalne przed release, czy wymaga osobnego progu (produkt). | Otwórz dowolny `data/raw/reference/reports/*.json` → `runtimeStatusBadge` / `previewE2eKpiState`. | Łukasz | Nie mieszać „jakość obrazu” z „latency KPI” bez decyzji. |
| **D2-P1-05** | **Panel A (ingest / kalibracja):** domknięcie modelu danych + testów recipe (epik z planu produktowego). | Brak jednego miejsca „source of truth” dla `defaultAdjustments` / importu recipe. | Łukasz | Utrzymuj link do aktualnego opisu etapów w `docs/hme/`. |
| **D2-P1-06** | **`npm audit` w CI:** po bumpach zależności monitoruj **nowe advisory**; nie ignoruj bez wpisu w backlogu. | `npm run audit` lokalnie na gałęzi release. | Łukasz | |
| **D2-P1-07** | **Duplikaty AppleDouble (`._*`) na wolumenach sieciowych** — upewnij się, że skrypty / `.gitignore` (już `._*` w root) nie wrzucają śmieci przy dodawaniu assetów. | `git status` po pracy na LS10X. | Łukasz | |

---

## Po D2

- **D3:** zamknięcie wszystkich P0 + część P1.  
- **D4:** quality gate na `reference-set-v1` + checklisty z manifestu.  
- **D5:** decyzja merge / release.
