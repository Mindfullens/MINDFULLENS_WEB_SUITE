# Release gate policy (Film Lab)

Ten dokument zamyka **D2-P1-02**: jakie bramki są **obowiązkowe** przy release, a które są **rozszerzeniem** (RAW techniczny vs zestaw referencyjny manualny). Na końcu: **zalecana kolejka merge** Dependabot (#1–5, #7, #9) oraz uwagi do [**PR #10**](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/10).

---

## 1. Trzy warstwy gate’ów

| Warstwa | Komenda / artefakt | Co gwarantuje | Kiedy uruchamiać |
| --- | --- | --- | --- |
| **A — CI produktu (obowiązkowe)** | `npm run ci` (= ten sam łańcuch co job „CI” na GitHub Actions: lint, `npm test`, `vite build`, `npm audit`) | Regresja kodu, build produkcyjny, brak podatności w `npm audit` (0 w zielonym przebiegu). | **Każdy** merge do `main` i **każdy** release tag. |
| **B — RAW reference (techniczny, opcjonalny przed release)** | `npm run raw:reference:gate` (= `raw:manifest:build` + `test:raw-reference`) | Spójność manifestu RAW w `data/raw/reference`, trendy metryk vs snapshot (≥ 30 raportów w domyślnej konfiguracji). | Przed release **dużych zmian** w ingest/decode/kolorze RAW albo gdy zmieniacie progi w `reference-manifest.json`. Nie zastępuje warstwy A. |
| **C — Reference set manualny (`reference-set-v1`)** | Zestaw D1: [`REFERENCE-SET-MANIFEST.json`](../../data/reference-sets/reference-set-v1/REFERENCE-SET-MANIFEST.json) + pliki pod `assetRelativePath` (poza git — `.gitignore`). Skrypt: `npm run reference-set:sync-assets`; walidacja: `npm run test:reference-set-v1-assets`. | Powtarzalna **ocena jakościowa** na 16 ujęciach (kategorie pokrycia w README zestawu). | Przed release **produkto­wym** / kampanią: po zsynchronizowaniu RAW z DAM + przejściu testu assetów; checklista „pass/fail” wg `minAcceptanceCriteria` zostaje **decyzją człowieka** (nie ma jej w `npm run ci`). |

**Zasada:** **A** jest kontraktem repozytorium. **B** i **C** są uzupełnieniem — różnią się celem (regresja techniczna na dużym zbiorze DIAG vs golden set pod ocenę wizualną).

**Polityka krótka:** *Release = warstwa **A** zawsze; **B** gdy dotykacie RAW pipeline’u lub progów manifestu; **C** gdy release ma objęcie jakościowe „Mindfullens reference-set-v1”.*

---

## 2. Zalecana kolejka merge — Dependabot (batch)

Cel: **mniej konfliktów** w `.github/workflows/*.yml` i `package-lock.json`, potem **jedna zielona CI** na `main`.

### 2.1 GitHub Actions (#1–5)

Workflowy [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) i [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml) używają wspólnych akcji (`checkout`, `cache`, `setup-node`, …). Kilka osobnych PR-ów może **nakładać się na te same linie** — wtedy GitHub pokaże konflikt; rozwiązanie: jedna osoba scala lub **ręcznie** podbija wersje we wszystkich stepach i jeden commit.

**Kolejność robocza (rosnąca „inwazyjność”):**

1. [**PR #5**](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/5) — `actions/checkout` (pierwszy krok w obu workflowach).  
2. [**PR #2**](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/2) — `actions/cache`.  
3. [**PR #3**](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/3) — `actions/setup-node`.  
4. [**PR #1**](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/1) — `actions/upload-pages-artifact` (tylko `pages.yml`).  
5. [**PR #4**](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/4) — `actions/deploy-pages` (tylko `pages.yml`).

Po każdym merge: **sprawdź Actions → CI** na `main`. Przy konflikcie: `git fetch && git checkout <branch> && git merge origin/main`, popraw `*.yml`, push.

### 2.2 Zależności npm

| Kolejność | PR | Uwaga |
| --- | --- | --- |
| 1 | [**PR #7**](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/7) — *production* | Mniejszy zakres; zwykle mniej ryzyka niż pełny dev group. |
| 2 | [**PR #9**](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/9) — *development* (m.in. Vite 8, Tailwind 4) | Duży skok; po merge **powtórz D4**: `npm run ci`, ewentualnie zaktualizuj dokumentację (patrz D2-P1-01 w backlogu). |

**Nie** merguj #9 równolegle z ręcznymi zmianami w `package.json` na `main` bez rebase.

---

## 3. Feature: [PR #10](https://github.com/Mindfullens/MINDFULLENS_WEB_SUITE/pull/10)

Gałąź: `feature/raw-2d-recovery-quality-gates` — szerszy pakiet (workflow A→J, UX, QA).

- **Przed merge:** `npm run ci` na gałęzi (lub zielony CI na PR).  
- **Po merge Dependabot (#7 / #9):** jeśli PR #10 jest starszy, wykonaj **rebase** feature branch na aktualny `main` i rozwiąż konflikty w lockfile / workflow.  
- Release produktowy z feature’u: stosuj sekcję **1** (A obowiązkowo; B/C według zmian w RAW / jakości).

---

## 4. Powiązane pliki

- Backlog: [`D2-BACKLOG-P0-P1.md`](D2-BACKLOG-P0-P1.md)  
- Zestaw referencyjny: [`data/reference-sets/reference-set-v1/README.md`](../../data/reference-sets/reference-set-v1/README.md)
