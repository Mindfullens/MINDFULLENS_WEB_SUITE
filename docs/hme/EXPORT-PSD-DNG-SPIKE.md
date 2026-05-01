# Roadmap eksportu PSD / DNG — SPIKE (źródło robocze)

Dokument pomaga ustalić **kolejny epik** po zamknięciu Etapu 16 („raster PRO + manifest v1”). Nie jest kontraktem kodu ani częścią `FILM_LAB_EXPORT_RASTER_FORMAT_IDS`.

**Powiązane:** `docs/hme/NORTH-STAR.md` (sekcja eksportu i decyzja 2026-04-30).

---

## 1. Cele produktowe (do doprecyzowania)

| Kierunek | Hipoteza wartości | Pytania blokujące MVP |
|----------|---------------------|------------------------|
| **PSD** | Dostarczenie pliku edytowalnego w ekosystemie Adobe / interoperacyjność z retuszem zewnętrznym. | Czy MVP = **jedna warstwa kompozytowa + opcjonalnie maski jako kanały**, czy od razu **pełny stack warstw z Recipe**? |
| **DNG** | Archiwizacja „jak RAW” lub pochodna z osadzoną miniaturą i metadanymi. | Czy wyjściem jest **renderowany RGB wbudowany w kontener**, czy **wyłącznie metadane + JPEG preview** (derivative light)? |

Bez odpowiedzi na powyższe nie da się szacować ani wybrać biblioteki.

---

## 2. Ograniczenia środowiska (przeglądarka)

- **Pamięć i czas:** duże PSD z wieloma warstwami 45 MP rosną szybko; rozważny jest **worker** i/lub **streaming chunków** zamiast jednego bufora na głównym wątku.
- **`canvas.toBlob`:** wystarcza dla rastra; **PSD/DNG wymagają dedykowanych encoderów** (czysty JS, WASM lub hybryda).
- **Licencje:** sprawdzenie licencji wybranej biblioteki zapisu PSD oraz ewentualnego SDK DNG przed integracją w produkcie.

---

## 3. PSD — szkic ścieżki technicznej

1. **SPIKE binarny:** wygenerować minimalny, poprawnie otwierający się plik PSD (np. jedna warstwa RGB) *poza* pełnym Recipe — walidacja w Photoshop / Affinity.
2. **Mapowanie danych:** które elementy Recipe → warstwy / grupy / smart objects (jeśli w ogóle). Tu potrzebna jest **decyzja produktowa** (flatten vs warstwy).
3. **Integracja:** nowy kanał eksportu równoległy do `filmLabExportEncode` (osobny moduł + ewentualnie wpis w manifeście nowej wersji profilu — poza `filmLab.export.manifest.v1` dopóki nie ustalimy schematu).

---

## 4. DNG — szkic ścieżki technicznej

DNG w aplikacji jest już **wejściem** (ingest RAW przez worker LibRaw — patrz `src/engine/pipeline/raw/`, rozszerzenia w `vite.config.js`). Ten epik dotyczy **wyjścia** (zapis pliku `.dng`), co jest osobnym problemem (kontener TIFF-like, tagi, polityka Adobe vs „kompatybilność na best-effort”).

### 4.1 Dwa warianty MVP (wybór produktowy przed biblioteką)

| Wariant | Opis | Złożoność | Typowa wartość dla użytkownika |
|--------|------|-----------|----------------------------------|
| **A — „derivative light”** | Nowy plik DNG z **wbudowanym preview JPEG** (lub mały TIFF/JPEG w znanych IFD), minimalny zestaw metadanych + np. hash Recipe w XMP (namespace roboczy). **Bez** pełnego mosaic RAW w wyjściu. | Niższa; bliżej „eksport archiwalny z metadanymi” | Pakiet kompatybilny z Adobe Camera Raw / Lightroom bez udawania pełnego sensor RAW |
| **B — „re-wrap / kontener”** | Osadzenie **istniejącego** sensor data (lub jego części) + nowe preview po developie; bliżej prawdziwego DNG jako kontenera. | Wyższa; ryzyko licencyjne i walidacyjne | Zachowanie „RAWowości” przy jednoczesnym dopinaniu wyrenderowanego rezultatu |

**Decyzja blokująca:** **A vs B** (lub jawny „nie teraz”). Bez tego nie da się dobrać biblioteki (SDK Adobe, parser TIFF + ręczne IFD, WASM, usługa poza przeglądarką).

### 4.2 Pipeline względem Film Lab

- **Spójność z renderem:** jeśli wyjście ma odzwierciedlać **to, co widać po Recipe**, źródłem bitmapy jest ten sam tor co eksport TIFF/JPEG (canvas po renderze), nie surowy Bayer z dysku — chyba że wybrano wariant **B** i produkt akceptuje rozdzielenie „preview vs RAW payload”.
- **Batch:** analogicznie do PSD/rastra (`batchProcessor`) — jeden wpis manifestu na źródło; `fileFormat: dng` dopiero po dopisaniu do kontraktu (`filmLabExportFormats.js`, modal, digest — poza Etapem 16).
- **Worker:** dla dużych rozdzielczości rozważyć **enkoder DNG w workerze** (jak dla PSD w SPIKE §2), żeby nie blokować UI i ograniczyć szczyt RAM na wątku głównym.

### 4.3 Walidacja i zgodność

- **Smoke:** Adobe Camera Raw / Lightroom / DNG Converter (macOS/Windows) — *„otwiera się bez błędu krytycznego”* jako pierwszy pragmatyczny próg dla wariantu A lub uproszczonego B.
- **Metadane:** `exiftool` / porównanie tagów z oczekiwanym zestawem minimalnym (lista do ustalenia po wyborze wariantu).
- **Regresja rozmiaru:** górny limit rozdzielczości preview vs czas zip w batchu — KPI jak przy PSD (profilowanie w osobnym epiku).

### 4.4 Pozostałe z §4 (historycznie)

1. **SPIKE formatu:** dokładna lista IFD / tagów dla wybranego wariantu (preview, crop, XMP, fingerprint Recipe).
2. **Walidacja:** narzędzia CLI / Adobe DNG Converter jako smoke test — szczegóły w §4.3.

### 4.5 Propozycja robocza — pierwszy SPIKE = wariant **A**

**Hipoteza inżynierska (do potwierdzenia przez produkt):** pierwszy epik zapisu DNG w repo celuje w **§4.1 wariant A** („derivative light”), bo daje najkrótszą ścieżkę do pliku **otwieralnego w Adobe Camera Raw / Lightroom** bez implementacji pełnego mosaic RAW ani re-wrap istniejącego sensor streamu.

- **Wariant B** pozostaje w grze roadmapy, ale wymaga **osobnego** opisu minimalnego pliku i tabeli PASS zanim powstanie kod — nie jest domyślną ścieżką pierwszego commitu enkodera.

### 4.6 Minimalny plik — MVP wariant **A** (propozycja robocza)

Założenia na **pierwszy działający plik binarny** (szczegóły IFD doprecyzuje SPIKE kodowy + STOP z hex/Exif):

- Plik **`.dng`**, kontener **TIFF-like** na tyle poprawny, by typowe czytniki go **nie odrzucały** na wejściu (best-effort, bez gwarancji pełnej zgodności z każdą wersją ACR).
- **Podgląd:** wbudowany **baseline JPEG** (lub równoważny preview) reprezentujący **wyrenderowany** rezultat Recipe (ten sam sens co eksport JPEG z modala), nie surowy Bayer.
- **Bez** sensownego „pełnego RAW” w sensie archiwum sensora — komunikat produktowy / UI musi później jasno ustawić oczekiwania (poza zakresem samego SPIKE binarnego).
- **XMP:** pakiet z **identyfikatorem / fingerprint** eksportu (np. odniesienie do `filmLab.recipe.export.v1` lub hash manifestu) w **namespace roboczym** Mindfullens — finalna nazwa i shape po legal/brand review.
- **Metadane EXIF (opcjonalnie w SPIKE):** kopiowanie wybranych pól ze źródła lub stałe robocze (`Make`/`Model` / software tag) — lista minimalna ustala się przy pierwszym pliku referencyjnym.
- **Rozdzielczość preview:** jak aktywny **profil eksportu** (`social` / `web` / `full`) albo twardy limit na pierwszy SPIKE (np. max **2048 px** dłuższy bok) — decyzja przy implementacji, udokumentowana w raporcie STOP.

### 4.7 Definicja **PASS** — SPIKE binarny, wariant **A**

| Obszar | PASS (minimalny, na pierwszy merge SPIKE) |
|--------|-------------------------------------------|
| **Referencyjny TIFF (SPIKE)** | **`spike-mindfullens-minimal.tif`** — roundtrip `UTIF.decode`; **Photoshop** otwiera plik (potwierdzone w praktyce — jedyna ścieżka PASS dla PS w obecnym SPIKE). |
| **Plik `.dng` (UTIF + tagi DNG)** | **`spike-mindfullens-minimal.dng`** — blob pod roundtrip w kodzie / badania; **Adobe Photoshop (Camera Raw) nie otwiera** tego kontenera — do czasu osobnej implementacji **Linear DNG** (SDK / pełny zestaw tagów), nie traktować jako kryterium „działa w PS”. |
| **Batch / rozmiar** | Udokumentowany w STOP: maks. rozdzielczość źródła / czas dla jednej ramki na referencyjnej maszynie (nie twardy gate CI w pierwszej iteracji). |

**FAIL:** crash przy dekodowaniu UTIF, plik 0 B, TIFF niepodlegający otwarciu w Photoshopie przy ścieżce referencyjnej **§10**.

### 4.8 Licencje — kierunki due diligence (nie porada prawna)

Przed wyborem stacku technicznego warto zestawić krótką notatkę (może być pod tą listą lub w osobnym ADR):

- **Adobe DNG SDK / specyfikacja** — warunki użycia vs aplikacja webowa i redystrybucja bundla.
- **SPIKE dev:** **`utif`** (MIT), **`canvas`** (node-canvas); przyszły stack DNG (SDK / WASM / serwis) — osobna notatka przed produkcją.
- **Otwarte stosy TIFF + metadane** (np. libtiff, biblioteki EXIF/XMP w WASM) — klasy licencji vs polityka produktu.
- Unikanie powielania materiałów objętych restrykcyjnymi warunkami tam, gdzie wystarczy interoperacyjność „na best-effort”.

---

## 5. Proponowane fazy (kolejność prac)

1. **Product:** jedna strona decyzji — MVP PSD vs MVP DNG (albo kolejność priorytetów).
2. **SPIKE kodowy (krótki):** proof-of-write dla wybranego formatu w workerze + limity rozmiaru.
3. **Kontrakt:** dopiero po SPIKE — manifest / nazewnictwo artefaktów / ZIP batch (osobny dokument lub podniesienie wersji manifestu).

---

## 6. Odniesienia w repozytorium

- **RAW / DNG jako wejście (ingest):** `src/engine/pipeline/raw/` (np. `rawDecode.worker.js`) — osobny tor od **eksportu DNG** opisanego w **§4**.
- Formaty rastra i normalizacja: `src/engine/filmLabExportFormats.js`
- Kodowanie rastra: `src/engine/filmLabExportEncode.js`, TIFF: `src/engine/filmLabTiffExport.js`
- Manifest: `src/engine/filmLabExportManifest*.js`, batch: `src/engine/batchProcessor.js`
- UI eksportu: `src/FilmLabExportModal.jsx`
- CI eksportu: `npm run test:film-lab-export-gates`
- **Binarny SPIKE PSD (dev):** `scripts/spike-write-minimal-psd.mjs` — uruchom **`npm run spike:psd`** (zapisuje `scripts/spike-psd-output/spike-mindfullens-minimal.psd`, katalog w `.gitignore`). Biblioteki: **`ag-psd`** (MIT), **`canvas`** (node-canvas — natywne zależności platformowe; nie jest częścią domyślnego CI).
- **Binarny SPIKE DNG wariant A (dev):** `scripts/spike-write-minimal-dng.mjs` — **`npm run spike:dng`** → `scripts/spike-dng-output/` (**gitignore**):
  - **`spike-mindfullens-minimal.tif`** — TIFF RGB (UTIF + **`canvas`**) — **jedyny** plik z tego SPIKE sensowny jako „otwórz w Photoshopie”.
  - **`spike-mindfullens-minimal.dng`** — ten sam raster + kilka tagów DNG w IFD (UTIF); **Photoshop (Camera Raw) odrzuca** — zostawiony wyłącznie jako materiał do kodu / przyszłej zgodności Linear DNG (**§4.7**).
- **PSD z renderu (aplikacja):** `src/engine/filmLabExportPsdFromCanvas.js` + gałąź w `useFilmLabEngine.exportImage` i `batchProcessor` — **pill „PSD”** w modalu (`FILM_LAB_EXPORT_MODAL_FORMAT_IDS`); ten sam canvas co raster (po ostrzeniu), jedna warstwa `{nazwa filmu} export`. Sidecary **before** (jeśli włączone) przy primary PSD kodują jako **JPEG**. Batch ZIP: pliki `.psd` + manifest z `fileFormat: psd`.
- **Digest `optionalScenarios`:** m.in. `singlePsdNoRecipe`, `batchPsdNoRecipe`, `singlePsdWithRecipe`, `batchPsdWithRecipe`, `singlePsdWithBeforeNoRecipe`, `batchPsdWithBeforeNoRecipe`, `singlePsdWithBeforeAndRecipe`, `batchPsdWithBeforeAndRecipe`, `singlePsdWithMaskNoRecipe`, `batchPsdWithMaskNoRecipe`, `singlePsdWithMaskAndRecipe`, `batchPsdWithMaskAndRecipe`, `singlePsdWithBeforeWithMaskAndRecipe`, `batchPsdWithBeforeWithMaskAndRecipe` (pełny zestaw sidecarów + recipe: kolejność jak w runtime — `before` JPEG, `before_recipe`, `mask.png`, `mask_recipe`, `after_recipe` po primary PSD); whitelist `FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_IDS`.

---

## 7. Decyzja robocza — kolejność i zakres MVP (propozycja na start epiku)

Ta sekcja **nie zastępuje** decyzji produktowej, ale ustala domyślną kolejność inżynierską, żeby nie rozmyć SPIKE.

### Kolejność formatów

1. **PSD** — pierwszy **binarny SPIKE** i ewentualny pierwszy MVP w kodzie.
2. **DNG** — po PSD POC lub równolegle dopiero wtedy, gdy produkt zamrozi zakres z §1 (kontener RAW vs derivative).

**Uzasadnienie:** PSD jako „flatten + jedna warstwa” daje szybki **smoke test interoperacyjności** (Photoshop / Affinity). DNG wiąże się z polityką RAW, metadanymi i walidacją zewnętrzną — więcej niewiadomych przed pierwszym działającym plikiem.

### MVP PSD — faza 1 (przed mapowaniem pełnego Recipe)

| Element | Zakres | Poza zakresem fazy 1 |
|---------|--------|----------------------|
| Warstwy | Jedna warstwa rgb / **Background** z **spłaszczonego** renderu bieżącego podglądu (ten sam piksel co ścieżka eksportu rastra) | Oddzielne warstwy z stacku Recipe, smart objects |
| Maski | Opcjonalnie później jako kanał alfa / dodatkowa warstwa — **nie** w pierwszym SPIKE | Pełna mapa masek HME → kanały PSD |
| Walidacja | Plik otwiera się bez błędu w Photoshop lub Affinity | Parzystość piksel-po-pikselu z JPEG |

### MVP DNG — kolejna bramka po PSD

Checklista **§8 (PSD)** jest domknięta. Dla DNG: **hipoteza robocza** = wariant **A** (**§4.5**); szczegóły pliku i PASS dla pierwszego SPIKE = **§4.6–4.7**. Formalne **„go”** nadal wymaga odhaczenia pozycji produktowej w **§9** oraz due diligence licencji (**§4.8**) przed pierwszym enkoderem w produkcji.

---

## 8. Checklist — ukończenie fazy „binarny SPIKE PSD”

Warunek wejścia w kod produkcyjny (poza branchami eksperymentalnymi):

- [x] Wybrane podejście do zapisu PSD — **`ag-psd`** (MIT); bitmapa przez **`canvas`** (node-canvas).
- [x] Skrypt Node w repo: **`npm run spike:psd`** → deterministyczny gradient 64×64 RGB.
- [x] Plik otwiera się w **Photoshop lub Affinity** bez ostrzeżeń krytycznych — **zweryfikowano:** Adobe **Photoshop 2024** (macOS), dokument **64×64 px**, RGB/8, warstwa „Film Lab gradient SPIKE”, plik `spike-mindfullens-minimal.psd`.
- [x] **Orientacyjny limit** (notatka pod integrację, nie twardy gate): SPIKE = **64×64**; docelowa integracja z Film Lab — rozdzielczość jak wybrany **profil eksportu** (`social` / `web` / `full`); pierwsza iteracja worker — **smoke ręczny** przy typowym rozmiarze źródła (np. **do ~24 MP**); sztywne KPI RAM po profilowaniu w osobnym epiku.
- [x] Odniesienie w repozytorium do tej checklisty i do §7 — łańcuch raportów STOP od integracji digestu / parity PSD (`reports/hme/stop-2026-05-01-bp.md` … `stop-2026-05-01-bw.md`), ten dokument (**§6–7**), oraz aktualizacja **`docs/hme/NORTH-STAR.md`** (sekcja eksportu). Równoważne PR/issue: dowolny merge zawierający powyższe ścieżki.

---

## 9. Checklist — bramka przed pierwszym kodem eksportu DNG

Nie zastępuje wyboru biblioteki; blokuje rozrost zakresu bez decyzji.

- [ ] **Produkt:** potwierdzenie **hipotezy A** (**§4.5**) jako pierwszego SPIKE **albo** jawny wybór **B** (wtedy przed kodem uzupełnić odpowiedniki **§4.6–4.7** dla B) **albo** „stop / nie realizujemy DNG”.
- [x] **Minimalny opis pliku (A):** zapisany w **§4.6** — propozycja robocza do walidacji z produktem przy pierwszym pliku referencyjnym.
- [x] **Walidacja:** narzędzia referencyjne i definicja **PASS** dla SPIKE **A** — **§4.7** (nadrzędne względem ogólnych punktów **§4.3**).
- [ ] **Licencje:** notatka lub ADR po wyborze stacku — **§4.8** to tylko lista tematów; zamknąć przed merge do gałęzi produkcyjnej.
- [ ] **Kontrakt wyjścia:** po pierwszym działającym SPIKE binarnym — manifest / nazewnictwo / digest (odrębny epik; nie mieszać z blueprintami PSD bez potrzeby).

---

## 10. Checklist — binarny SPIKE DNG (wariant A, dev)

Nie jest integracją z modalem ani batch — tylko dowód zapisu pliku i punkt odniesienia pod **§4.7**.

- [x] Skrypt Node w repo: **`npm run spike:dng`** → `scripts/spike-write-minimal-dng.mjs`, katalog **`scripts/spike-dng-output/`** (`.gitignore`). Wyjście: **`spike-mindfullens-minimal.tif`**, **`spike-mindfullens-minimal.dng`**. Zależności: **`utif`**, **`canvas`** (dev).
- [x] **Adobe Photoshop — TIFF:** **`spike-mindfullens-minimal.tif`** — smoke test **PASS** (otwarcie w Photoshopie).
- [x] **Adobe Photoshop — DNG:** **`spike-mindfullens-minimal.dng`** — **FAIL w PS / Camera Raw** w obecnym SPIKE (potwierdzenie praktyczne); **nie** jest celem tej iteracji — pełny Linear DNG = osobny epik.
- [ ] **Integracja produktowa:** `filmLabExportFormats`, encoder, worker, manifest, digest — dopiero po **§9** i wyborze stacku pod prawdziwy DNG.

---

*Ostatnia aktualizacja: 2026-05-01 (weryfikacja: PS otwiera TIF; `.dng` z UTIF — nie).*
