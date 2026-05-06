# Reference set `reference-set-v1` (D1)

Zamknięty zestaw **10–20** zdjęć referencyjnych do regresji jakości Film Lab (ingest, preview, eksport, depth/DNG gdy dotyczy).  
Wersja jest **zamrożona na czas iteracji tygodniowej** (D2–D5): bez dokładania/usuwania plików ani zmiany ID bez nowej wersji zestawu (`reference-set-v2`).

## Owner i zamknięcie dnia

| Pole | Wartość |
| --- | --- |
| **Owner (produkt / jakość)** | _wpisz_ |
| **Owner (techniczny — manifest + ścieżki)** | _wpisz_ |
| **Data zamknięcia D1** | 2026-05-06 (UTC+2) |
| **Zatwierdzenie freeze** | `frozenAt` w `REFERENCE-SET-MANIFEST.json` |

## Exit criteria (D1 = DONE tylko gdy wszystkie poniżej są spełnione)

1. **Liczba**: w repo jest **od 10 do 20** pozycji w `REFERENCE-SET-MANIFEST.json` (nie w szablonie).
2. **Komplet metadanych**: każda pozycja ma wypełnione: `id`, `category`, `sourceType`, `sceneOneLiner`, `lightingCondition`, `whiteBalanceNote`, `primaryRisksForFilmLab`, `minAcceptanceCriteria`, `privacy`.
3. **Ścieżki**: każda pozycja ma **niepusty** `assetRelativePath` wskazujący na plik w repozytorium (lub ustaloną lokalizację LFS — wtedy wpisz ścieżkę i upewnij się, że polityka repo na to pozwala).
4. **Pokrycie kategorii**: checklista w manifeście (`coverage`) ma **100%** dla wymaganych etykiet (patrz niżej).
5. **Powiązanie z gate RAW (opcjonalnie ale zalecane)**: dla plików RAW, gdy macie już raport DIAG, ustaw `diagReportPath` na istniejący plik pod `data/raw/reference/reports/`, żeby ten sam kadr był widoczny w `npm run test:raw-reference`.

## Wymagane pokrycie (coverage)

Minimalny zestaw etykiet — **każda musi wystąpić co najmniej raz** wśród 10–20 zdjęć:

| Etykieta | Intencja testowa |
| --- | --- |
| `exposure-high-key` | jasne tony, ryzyko utraty detalu w światłach |
| `exposure-low-key` | cienie, szum po liftcie, „crush” |
| `mixed-wb` | mieszane światło (np. dzień + sztuczne) |
| `skin-tones` | skóra, separacja od tła |
| `foliage-green` | zieleń, moiré/fake neon |
| `night-artificial` | noc, sztuczne źródła, flare |
| `high-iso-noise` | wyraźny szum / małe SNR |
| `highlight-clipping-risk` | bliski clipping (lub kontrolowany clipping) |
| `shadow-detail-risk` | głębokie cienie z oczekiwanym detalem |
| `fine-detail-texture` | tekstura (tkanina, liście, architektura) |

Dla zestawu **≥ 14** zdjęć dodaj co najmniej **dwa** ujęcia z listy „trudnych” (wybierz w manifeście pole `stressTags`).

## Konwencja plików

- **Manifest roboczy (uzupełniony ścieżkami + DIAG)**: `REFERENCE-SET-MANIFEST.json` — powiązanie z `data/raw/reference/reports/*.json` i docelowe `assetRelativePath` per `rs-v1-NNN`.
- **Szablon pusty**: `REFERENCE-SET-MANIFEST.template.json` (kopie na kolejne wersje zestawu).
- **Zasoby**: `data/reference-sets/reference-set-v1/assets/<id>/` — szczegóły w [`assets/README.md`](assets/README.md). Unikaj spacji w nazwach plików.
- **Prywatność**: wpisy z `privacy: internal-only` **nie** powinny trafiać do publicznego repo bez osobnej decyzji.

## Następny krok po D1

- D2: backlog P0/P1 powiązany z tym zestawem (repro na konkretnym `id`).
- D4: quality gate — każde `id` ma krótką checklistę „pass/fail” w arkuszu lub issue.
