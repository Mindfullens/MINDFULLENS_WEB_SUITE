# DNG wariant A — due diligence licencji + plan implementacji

**Status:** dokument techniczny uzupełniający [`EXPORT-PSD-DNG-SPIKE.md`](EXPORT-PSD-DNG-SPIKE.md) §4.8 i §9. **Fazy A–C** są **wdrożone w repo**. **Faza D:** raport STOP [`stop-2026-04-30-dng-variant-a-product-integration`](../../reports/hme/stop-2026-04-30-dng-variant-a-product-integration.md); procedura smoke QA — [`DNG-EXPORT-SMOKE.md`](DNG-EXPORT-SMOKE.md); **compliance** przed publicznym releasem — nadal otwarte (*Compliance i release* poniżej).  
**Zakres produktowy:** wariant **A** (derivative light) — decyzja zamknięta w SPIKE **§11.2**.

**Poza tym zakresem (osobne epiki):** *Wariant B*, *pełny mosaic RAW*, *Linear DNG / SDK* — poniżej sekcja *Poza MVP wariantu A*; uzupełnienie w SPIKE **§11.3**. **Nie** jest to następny krok implementacji po `filmLabExportDngVariantA` / UTIF.

**Disclaimer:** to nie jest porada prawna.

### Compliance i release (poza samym kodem)

1. **Przegląd prawny / sign-off compliance** — przed pierwszym **publicznym** releasem produktu, który **wysyła do użytkownika bundel frontowy zawierający ścieżkę zapisu DNG** (derivative light: `utif` / `filmLabExportDngVariantA.js` w artefaktach buildu Vite). Dotyczy to **polityki licencji OSS w bundlu**, ewentualnych zastrzeżeń dystrybucji oraz modelu produktu (web / źródło); realizacja **wewnętrzna** (dział prawny lub compliance). Ta bramka jest zsynchronizowana z nieodhaczonym polem **„Licencje (formalny sign-off)”** w [`EXPORT-PSD-DNG-SPIKE.md`](EXPORT-PSD-DNG-SPIKE.md) **§9**. Sam merge do repo **nie** zastępuje tego kroku.

   **Przygotowka inżynierska przed sign-off (fakty — nie porada prawna):** ułatwia wejście prawnikowi / compliance, co faktycznie jadę w kliencie.
   - **Zakres binarny DNG w MVP A:** zapis kontenera przez bibliotekę **`utif`** (MIT) i kompresję transytywnie **`pako`** — zob. §1 poniżej oraz `node_modules/utif/package.json`, `node_modules/pako/package.json`.
   - **Kod własny:** `src/engine/filmLabExportDngVariantA.js` (logika tagów DNG / TIFF-like); **brak** dołączonego **Adobe DNG SDK** w tym torze.
   - **Trigger releasu:** pierwsza publikacja (lub aktualizacja) **buildu produkcyjnego** (`npm run build` / artefakty Vite), którą **użytkownik końcowy** pobiera jako statyczny front — czyli moment, w którym OSS trafia w praktyce do dystrybucji; do uzgodnienia z polityką firmy, czy np. wewnętrzne / zamknięte wdrożenia wymagają tej samej bramki.
   - **Osobna decyzja później:** ewentualny **Adobe DNG SDK** albo **Linear DNG** — inny epik; ten sign-off dotyczy **obecnego** stosu derivative light, chyba że compliance rozszerzy zakres.
   - **Po formalnym zatwierdzeniu:** można odhaczyć pole w SPIKE **§9** i zapisać datę / właściciela w notatce wewnętrznej (poza tym repo, jeśli polityka tak wymaga).

2. **Adobe DNG SDK oraz Linear DNG (pełna zgodność z Adobe Camera Raw / Lightroom)** — **nie** wchodzą w zakres MVP **wariantu A** opartego o **UTIF** i ten dokument. Są **osobnym epikiem** inżynierskim i często osobną decyzją licencyjną; podejmujecie je tylko wtedy, gdy celem produktowym jest m.in. **nieodrzucanie pliku przez ACR/Lr** na poziomie kontenera Linear DNG / tagów zgodnych z ekosystemem Adobe. Patrz SPIKE **§4.7**, **§4.8**, **§11.2** (roadmapa vs MVP).

### Poza MVP wariantu A — epiki następnej klasy (nie „reszta” obecnej ścieżki)

**Nie są kolejnym krokiem** po obecnym derivative light — ani kolejną iteracją [`filmLabExportDngVariantA.js`](../../src/engine/filmLabExportDngVariantA.js) / UTIF. To **osobne epiki**, nie „dokończenie” MVP A. Granica produktowo‑techniczna jest zsynchronizowana ze SPIKE [**§11.3**](EXPORT-PSD-DNG-SPIKE.md).

Nie są to kolejne sprinty nad tym samym modułem — to **osobna architektura**, osobny zakres testów i często **Adobe DNG SDK** (lub równoważny stos) plus **review licencyjny / compliance**.

| Temat | Charakter |
|--------|-----------|
| **Wariant B („re-wrap”)** | Osadzenie istniejącego strumienia sensora (lub jego części) w kontenerze DNG + nowy preview po developie — inny model danych niż „tylko wyrenderowany RGB” w derivative light. |
| **Pełny mosaic RAW w wyjściu** | Zapis surowej siatki Bayer (lub wieloplanowej) jako payload wyjściowy — poza derivative light; własne limity RAM, worker, walidacja. |
| **Linear DNG / pełna zgodność ACR·Lr** | Zwykle **SDK**, pełniejszy zestaw tagów IFD i testy w ekosystemie Adobe — SPIKE **§4.7** traktuje obecny UTIF `.dng` jako często **nieakceptowany** przez Camera Raw. |

**Wniosek planistyczny:** planujcie te pozycje jak **nowy epik** (specyfikacja minimalnego pliku, PASS/FAIL, koszt prawny), a nie jak „dokończenie” MVP A.

---

## 1. Rekomendowany stack (MVP w przeglądarce)

| Komponent | Wybór w repo | Licencja (npm / źródło) | Uwagi due diligence |
|-----------|----------------|-------------------------|---------------------|
| **TIFF / kontener zapisu** | **`utif`** (`UTIF.encode`) — ten sam tor co [`scripts/spike-write-minimal-dng.mjs`](../../scripts/spike-write-minimal-dng.mjs) | **MIT** (`node_modules/utif/package.json`) | Spójne z istniejącym SPIKE; możliwość bundlowania w Vite. |
| **Kompresja (transitywnie)** | **`pako`** (zależność `utif`) | **(MIT AND Zlib)** | Typowy łańcuch OSS zgodny z większością polityk redystrybucji. |
| **RGB źródłowy** | Ten sam tor co eksport rastra / TIFF — bufor z renderu (`canvas` / `ImageData`), **bez** node-canvas w produkcji | — | Skrypt SPIKE używa **`canvas`** (devDependency) tylko do generacji gradientu w Node; aplikacja używa przeglądarkowego canvas. |
| **Metadane XMP / EXIF (opcjonalnie później)** | Minimalny XML jako string lub biblioteka z licencją zgodną z produktem | Do wyboru przy implementacji | Preferuj **MIT / BSD / Apache-2.0**; unikać GPL w bundlu frontowym bez review. |

**Adobe DNG SDK (natywny / WASM):** nie jest **wymagany** do „derivative light” na **UTIF** — ten tor jest zamknięty inżyniersko bez SDK (**§11.2 MVP**). **Linear DNG** i ewentualna integracja **Adobe DNG SDK** (lub innego stosu pod ACR/Lr) to **osobny epik**, nie kontynuacja tego samego MVP; przed **jakąkolwiek** redystrybucją kodu z Adobe DNG SDK lub cytowaniem fragmentów specyfikacji poza dozwolonym fair use — **obligatoryjny** przegląd licencji Adobe pod Wasz model dystrybucji.

**Wniosek:** MVP **wariant A** może bazować na **`utif` + pipeline renderu** już obecnym w Film Lab, bez Adobe SDK, przy akceptacji PASS z SPIKE §4.7 (TIFF referencyjny w PS; `.dng` z UTIF może nadal **nie** przechodzić Camera Raw — komunikat produktowy).

---

## 2. Ryzyka i mitigacje

| Ryzyko | Mitigacja |
|--------|-----------|
| Użytkownik oczekuje „prawdziwego RAW” w pliku `.dng` | UI / copy: **pochodna archiwalna** (SPIKE §4.6); nie obiecywać sensor mosaic. W modalu eksportu: **`filmLab.exportModal.formatDngNote`** / **`formatDngPillTitle`** (PL/EN). |
| ACR / Lr odrzuca minimalny `.dng` | Założone w §4.7 — nie jest FAIL merge’u enkodera; UI wyjaśnia, że ACR może nie otworzyć pliku (**§4.7** produkt/UX). |
| RAM / blokada UI przy dużych preview | Enkoder w **Web Workerze** (wzór: batch / depth ONNX); limit dłuższego boku jak profil eksportu (`social` / `web` / `full`). |
| Rosnący manifest / digest | Osobny pod-epik po działającym blobie — jak przy PSD (SPIKE §9 ostatni punkt). |

---

## 3. Plan implementacji (fazy)

### Faza A — rdzeń binarny (bez modala) — **Done**

1. ~~Wyciągnąć z SPIKE funkcję czystą~~ — **`src/engine/filmLabExportDngVariantA.js`**: m.in. `encodeDerivativeLightRgbTiffArrayBuffer`, `encodeDerivativeLightDngArrayBuffer`, wyżej poziom `encodeFilmLabExportDngDerivativeLightFromCanvas`.  
2. ~~Unit testy w Node~~ — **`scripts/test-film-lab-export-dng-variant-a.mjs`** (`test:film-lab-export-gates`); roundtrip `UTIF.decode` + `decodeImage`.  
3. ~~SPIKE~~ — **`npm run spike:dng`** korzysta z tego samego toru co encoder (wyjścia referencyjne jak wcześniej, np. **13288** B przy 64×64).

### Faza B — integracja silnika — **Done** (z jednym backlogiem)

4. ~~Moduł produkcyjny~~ — **`src/engine/filmLabExportDngVariantA.js`**: wejście z **canvas** / tej samej ścieżki co raster/TIFF po przygotowaniu eksportu.  
5. **Backlog:** dedykowany **Web Worker** wyłącznie pod kodowanie DNG (duże rozdzielczości, szczyt RAM) — nadal rekomendacja; obecnie enkoder jest **dynamicznie importowany** na wątku głównym po przygotowaniu bitmapy (jak część integracji PSD).  
6. ~~**`utif`** w zależnościach produkcyjnych~~ — wpis w **`dependencies`** w `package.json` (już nie tylko dev).

### Faza C — produkt — **Done**

7. ~~`filmLabExportFormats.js`~~ — identyfikator **`dng`** (poza `FILM_LAB_EXPORT_RASTER_FORMAT_IDS`), whitelist scenariuszy manifestu.  
8. ~~Modal + silnik + batch~~ — **`FilmLabExportModal.jsx`** (format w pickerze), **`useFilmLabEngine.js`**, **`batchProcessor.js`** — gałąź równoległa do PSD.  
9. ~~Manifest / digest~~ — scenariusze reader examples, MIME `image/x-adobe-dng`, test digest reader + gate chain.

### Faza D — jakość i zamknięcie — **Częściowo**

10. ~~Smoke ręczny~~ — procedura + **rejestr wykonania** (wersje PS/OS/ACR, build): [`DNG-EXPORT-SMOKE.md`](DNG-EXPORT-SMOKE.md) sekcja *Rejestr wykonania*; **nie** zastępuje CI ani nie ustala PASS dla Camera Raw — domyka checklistę QA przy RC / release.  
11. ~~Raport STOP~~ — [`stop-2026-04-30-dng-variant-a-product-integration`](../../reports/hme/stop-2026-04-30-dng-variant-a-product-integration.md); checklista §9 SPIKE zsynchronizowana z repozytorium; **formalny sign-off compliance** przed publicznym releasem — nadal poza samym repo.

---

## 4. Odniesienia

- SPIKE binarny: [`EXPORT-PSD-DNG-SPIKE.md`](EXPORT-PSD-DNG-SPIKE.md) §4.6–4.7, §6, §10.  
- Smoke ręczny DNG: [`DNG-EXPORT-SMOKE.md`](DNG-EXPORT-SMOKE.md).  
- Kod referencyjny: [`scripts/spike-write-minimal-dng.mjs`](../../scripts/spike-write-minimal-dng.mjs).  
- Eksport TIFF w aplikacji: `src/engine/filmLabTiffExport.js`, batch: `src/engine/batchProcessor.js`.

---

## 5. Backlog techniczny (opcjonalny — nie blokuje MVP A)

| Temat | Opis | Odniesienia |
|--------|------|-------------|
| **Web Worker dla enkodera DNG** | **Stan:** po przygotowaniu `canvas` eksportu kodowanie idzie przez **dynamiczny import** `filmLabExportDngVariantA.js` na **wątku głównym** (`useFilmLabEngine`, `batchProcessor`). **Kiedy warto:** bardzo duże rozdzielczości / długie „zamrożenie” UI lub szczyt RAM przy serializacji TIFF/DNG. **Kierunek:** osobny worker (jak rozważenia dla PSD w SPIKE §2, wzorzec: depth ONNX) — przekazać do workera **bitmapę lub bufor RGBA** (`ImageBitmap` / `ArrayBuffer` z transfer list), zwrócić `ArrayBuffer` pliku `.dng`; UI tylko orchestracja. **Poza zakresem MVP A** jako wymóg. | §3 Faza B pkt 5; SPIKE **§4.2**; §2 tabela „RAM / blokada UI” |
| **Metadane XMP / EXIF rozszerzone** | **Produkt musi najpierw ustalić zakres:** np. fingerprint `filmLab.recipe.export.v1` lub hash manifestu w **XMP** (namespace Mindfullens — SPIKE §4.6), kopiowanie wybranych pól **EXIF** ze źródła, spójność z sidecarem recipe JSON. **Stan kodu:** enkoder ma **minimalny** zestaw tagów DNG / string software (por. `filmLabExportDngVariantA.js`); pełny pakiet XMP/EXIF z §4.6 **nie** jest warunkiem zamknięcia MVP A. **Technicznie:** embed XMP w IFD TIFF-like, reuse lub minimalny XML; licencje bibliotek — SPIKE **§4.8**. | §1 tabela „Metadane XMP”; SPIKE **§4.6** (punkty XMP/EXIF), §4.4 pkt 1 |

### 5.1 Kiedy wyciągnąć z backlogu (orientacyjnie)

**Web Worker (kodowanie DNG)** — typowe **sygnały** do planowania epiku (po pomiarze / zgłoszeniach), nie twarde progi z tego dokumentu:

- zauważalne **zamrożenie UI** lub utrata responsywności podczas zapisu `.dng` przy **Full** i dużych źródłach;
- **szczyt RAM** na wątku głównym w profilowaniu podczas `UTIF.encode` / budowy bufora;
- **batch** z wieloma dużymi plikami — ryzyko kumulacji na main thread.

**Rozszerzone XMP / EXIF** — zanim wejdzie inżynieria, **produkt** dostarcza minimum:

- **co** ma być w pliku (np. tylko identyfikator recipe vs pełny fingerprint vs hash manifestu);
- **czy** EXIF ze źródła (lista tagów albo „kopiuj wybrane jak w imporcie RAW”);
- **namespace / branding** XMP (zgodnie z SPIKE §4.6 — legal/brand);
- **acceptance:** jak narzędzia zewnętrzne mają to czytać (jeśli w ogóle), albo że pole jest tylko dla waszych parserów.

Wtedy można oszacować pracę i ewentualnie podnieść wersję kontraktu manifestu — osobna decyzja.

### Smoke QA (proces, nie kod)

| Temat | Opis | Odniesienia |
|--------|------|-------------|
| **Smoke ręczny przy RC** | Kroki + rejestr wykonania — nie zastępuje CI. | [`DNG-EXPORT-SMOKE.md`](DNG-EXPORT-SMOKE.md); Faza D pkt 10 |

---

*Ostatnia aktualizacja: 2026-04-30*
