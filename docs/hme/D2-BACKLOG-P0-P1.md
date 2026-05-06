# D2 — Backlog P0 / P1 (Film Lab)

**Okno:** tydzień wykonawczy (D2)  
**Źródła:** testy w `package.json`, zestaw referencyjny [`reference-set-v1`](../../data/reference-sets/reference-set-v1/README.md), otwarte PR toolchain.

## Stan gałęzi (snapshot 2026-05-06)

| Element | Wartość |
| --- | --- |
| **`main` (lokalny worktree)** | `vite` ^6.4.2, `tailwindcss` ^3.4.14, `postcss.config.js`: `tailwindcss` + `autoprefixer` (klasyczny pipeline v3). |
| **PR toolchain** | [PR #9 — Bump the development group…](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/9): **OPEN** (niezmergowany) — na gałęzi Dependabota są m.in. Vite 8, Tailwind 4, `@tailwindcss/postcss`. |
| **Implikacja** | „Rozjazd dokumentacji pod Tailwind 4” dotyczy **dopiero po ewentualnym merge PR #9**; obecny `main` nie wymaga D2-P1-01 poza przyszłym krokiem. |

## Ownerzy (domyślnie)

| Rola | Osoba |
| --- | --- |
| Produkt / priorytet | Łukasz (kontakt@mindfullens.pl) |
| Inżynieria / merge | Łukasz (Mindfullens Web Suite) |

*(Doprecyzuj podział „produkt vs dev” w zespole — wpisy w tabeli można przypisać 1:1.)*

## Exit criteria D2

- [x] Lista **≤ 15** pozycji; każda ma **P0 lub P1**, **krótki repro** i **owner**.
- [x] Wszystkie **P0** mają plan zamknięcia (data lub „w D3”).
- [x] Brak pozycji w stylu „kiedyś poprawimy” bez klasyfikacji.

---

## P0 — blokuje merge / release albo łamie kontrakt

| ID | Opis | Repro / dowód | Owner | Plan |
| --- | --- | --- | --- | --- |
| **D2-P0-01** | **Rozstrzygnij PR #9 (Dependabot / dev group):** `main` zostaje na Vite 6 + Tailwind 3 **dopóki** PR jest otwarty. Przed release: **merge** (po review i zielonym CI) **albo** **zamknij** PR z krótkim uzasadnieniem (odłożone / odrzucone), żeby nie było niejawnej „drugiej linii” toolchain bez decyzji. | [PR #9](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/9) `state: OPEN`; porównaj `package.json` na `main` vs gałąź PR. | Łukasz | Decyzja w D2/D3; po merge — jeden zielony `npm run ci` na `main`. |
| **D2-P0-02** | **Release candidate na `main`:** `npm run ci` musi przechodzić na commicie, który idzie w release (lint, testy, `vite build`, `audit`). | `git checkout main && npm ci && npm run ci` — pierwszy FAIL = blokada. | Łukasz | Regresje naprawiać w D3 przed tagiem; brak zielonego CI = brak release. |

---

## P1 — nie blokuje natychmiast, ale podnosi ryzyko jakości / utrzymania

| ID | Opis | Repro / dowód | Owner | Notatka |
| --- | --- | --- | --- | --- |
| **D2-P1-01** | **Dokumentacja toolchain vs repo:** *po merge PR #9* zaktualizuj `docs/hme` / README root (Vite 8, Tailwind 4, `@tailwindcss/postcss`). **Na obecnym `main` (snapshot powyżej) rozjazdu z kodem nie ma — brak obowiązkowej edycji docs w D2 przed merge PR #9.** | Po merge: `package.json` + `postcss.config.js` vs dokumentacja. | Łukasz | |
| **D2-P1-02** | **Referencyjny zestaw vs RAW gate:** `reference-set-v1` = 16 kadrów; manifest RAW w `data/raw/reference` często liczy **≥ 30** wpisów — ustal jedną politykę (podzbiór, osobny gate „release”, albo rozszerzenie zestawu). | `npm run raw:reference:gate` na czystym klonie + `reference-manifest.json`. | Łukasz | |
| **D2-P1-03** | **Bootstrap assetów po `git clone`:** RAW pod `assetRelativePath` są w `.gitignore` — skrypt `npm run reference-set:sync-assets -- --from "<DAM>"` (+ `MINDFULLENS_RAW_ROOT`, `--dry-run`). Szczegóły: `data/reference-sets/reference-set-v1/assets/README.md`. | Klon bez plików w `assets/rs-v1-*` (poza `.gitkeep`). | Łukasz | |
| **D2-P1-04** | **Diag / KPI:** raporty `render-debug` mają **E2E WARN** / **fc-gate:HOLD** — decyzja produktu: akceptacja przed release vs osobny próg latency. | `data/raw/reference/reports/*.json` → `runtimeStatusBadge`, `previewE2eKpiState`. | Łukasz | |
| **D2-P1-05** | **Panel A (ingest / kalibracja):** domknięcie modelu danych + testów recipe (`defaultAdjustments`, import recipe). | Codebase vs brak jednego „source of truth”. | Łukasz | |
| **D2-P1-06** | **`npm audit` w CI:** po każdym bumpie zależności sprawdź advisory; nie ignoruj bez wpisu. | `npm run audit` na gałęzi release. | Łukasz | |
| **D2-P1-07** | **Pliki `._*` (AppleDouble) na wolumenach sieciowych** przy kopiowaniu RAW — root `.gitignore` ma już `._*`; pilnuj `git status` po pracy na LS10X. | Dodanie assetów z macOS + share. | Łukasz | |

---

## Po D2

- **D3:** zamknięcie wszystkich P0 + część P1.  
- **D4:** quality gate na `reference-set-v1` + checklisty z manifestu.  
- **D5:** decyzja merge / release.

---

## D3 — postęp

| P0 | Status | Notatka |
| --- | --- | --- |
| **D2-P0-02** | Zrobione (weryfikacja lokalna) | Na `main` @ `737f61b`: `npm ci && npm run ci` → **PASS** (2026-05-06). |
| **D2-P0-01** | Oczekuje na ownera | [PR #9](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/9): merge albo zamknięcie z uzasadnieniem — nie da się zautomatyzować z tego środowiska. |

---

## D4 — quality gate (iteracja 2026-05-06)

**Zakres:** automatyczne bramki na `main` + lokalna spójność `reference-set-v1` (nie ocena wizualna kadru po kadrze).

| Krok | Wynik | Notatka |
| --- | --- | --- |
| `npm run preflight` | **PASS** | lint + pełny `npm test`. |
| `npm run preflight:full` (= `npm run ci`) | **PASS** | Powtórzone w tej iteracji: pełny `ci` (build + audit) zielony. |
| `npm run raw:reference:gate` | **PASS** | 39 wpisów RAW reference; brak regresji trendu względem snapshotu. Wygenerowane pliki trendu w `data/raw/reference/out/` **cofnięte**, żeby nie zaśmiecać diffu. |
| `npm run test:reference-set-v1-assets` | **PASS** (lokalnie) | 16/16 plików pod `assetRelativePath` obecne na dysku (po kopii z DAM). **Nie** włączone do `ci` — świeży klon bez RAW-ów by nie przechodził. |

**Poza zakresem tej iteracji:** ręczna checklista „pass/fail” wg `minAcceptanceCriteria` w manifeście (D4 wizualny / produktowy).  
**Blokada release:** **D2-P0-01** nadal może być otwarta — D4 nie zastępuje decyzji o PR #9.

**Polityka zestawów (nadal D2-P1-02):** `reference-set-v1` = 16 kadrów (golden manual); RAW gate = 39 raportów (regresja techniczna). Oba mogą być zielone równolegle; jedna pisemna polityka „co jest gate’em release” pozostaje do ustalenia.

---

## D5 — release readiness (2026-05-06)

**Stan wejścia:** `main` lokalnie **zielony** (`preflight`, `ci`, RAW gate w D4). **PR #9** nadal **OPEN** — to osobna ścieżka (Vite 8 / Tailwind 4), nie blokuje wydania **obecnej** linii na `main`, o ile świadomie ją publikujesz jako „0.1.x / Vite 6”.

### Decyzja (wypełnij przed tagiem)

| Opcja | Kiedy | Działanie |
| --- | --- | --- |
| **A — Release z obecnego `main`** | Chcesz opublikować to, co jest na `main` (Vite 6, Tailwind 3). | Poniżej checklista A; **PR #9** zostaw na później lub zamknij z notatką. |
| **B — Najpierw toolchain z PR #9** | Chcesz produkcję na Vite 8 / Tailwind 4. | Zmerguj lub zrebasuj PR po review; powtórz **D4** na wynikowym `main`; dopiero potem tag. |
| **C — Odłożenie** | Brak czasu na decyzję o #9 i brak presji na release. | Brak tagu; utrzymaj D2-P1-02/P1 w backlogu. |

**Rekomendacja robocza:** **A** — opublikuj stabilną linię z `main`; **B** jako osobny release po zielonym CI na zmergowanym toolchainie.

### Checklista A (release z bieżącego `main`)

- [ ] `git push origin main` (lokalna gałąź była **ahead** względem `origin` — zsynchronizuj).
- [ ] Na GitHubie: **Actions** zielone na ostatnim commicie `main`.
- [ ] (Opcjonalnie) Utwórz **GitHub Release** / tag semver zgodny z `package.json` (`0.1.0` lub podbicie patch).
- [ ] Notatka w release: D1–D4 (reference set freeze, bramki, PR #9 nadal open jeśli dotyczy).
- [ ] 24–48 h: szybki rzut na Issues + ewentualny rollback plan (revert commit).

### Zamknięcie D2-P0-01 (PR #9)

| Działanie | Status |
| --- | --- |
| Merge PR #9 | _TBD — owner_ |
| Zamknij bez merge (uzasadnienie w PR) | _TBD — owner_ |
| Zostaw OPEN na kolejny sprint | **Stan na 2026-05-06** |

Po wyborze jednej ścieżki zaktualizuj tabelę w **D3** i usuń nieaktualne wiersze w kolejnym commicie.
