# Roadmap eksportu PSD / DNG — SPIKE (źródło robocze)

Dokument pomaga ustalić **kolejny epik** po zamknięciu Etapu 16 („raster PRO + manifest v1”). Nie jest kontraktem kodu ani częścią `FILM_LAB_EXPORT_RASTER_FORMAT_IDS`.

**Powiązane:** `docs/hme/NORTH-STAR.md` (sekcja eksportu i decyzja 2026-04-30).

**Duże tematy DNG (osobne epiki — nie „reszta pracy” nad wariantem A):** *Wariant B* (re-wrap), *pełny mosaic RAW* w wyjściu, *Linear DNG* / **Adobe DNG SDK** — opis i granica: **§11.3**; tabela tematów: [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) sekcja *Poza MVP wariantu A*. **Nie** traktujcie tego jako naturalnego „kroku 2” po obecnym derivative light (`utif`, `filmLabExportDngVariantA` — **§11.2** MVP).

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
- **Batch:** analogicznie do PSD/rastra (`batchProcessor`) — jeden wpis manifestu na źródło; `fileFormat: dng` w kontrakcie (`filmLabExportFormats.js`, modal, digest).
- **Worker (backlog):** obecnie enkoder DNG ładuje się przez **dynamiczny import** na wątku głównym po przygotowaniu canvas; dla bardzo dużych eksportów nadal można wyciągnąć **kodowanie** do **Web Workera** (jak rozważane dla PSD w §2), żeby ograniczyć blokady UI i szczyt RAM. Szczegóły: [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) §3 Faza B pkt 5, §5.

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
- **Bez** sensownego „pełnego RAW” w sensie archiwum sensora — komunikat produktowy w UI ustawia oczekiwania: **`FilmLabExportModal`** — i18n `filmLab.exportModal.formatDngPillTitle` (tooltip na przycisku DNG), `filmLab.exportModal.formatDngNote` (widoczna notatka przy wybranym DNG); bez obietnicy zgodności z Adobe Camera Raw ani „otwiera się wszędzie” (**§4.7**).
- **XMP:** pakiet z **identyfikatorem / fingerprint** eksportu (np. odniesienie do `filmLab.recipe.export.v1` lub hash manifestu) w **namespace roboczym** Mindfullens — finalna nazwa i shape po legal/brand review.
- **Metadane EXIF (opcjonalnie w SPIKE):** kopiowanie wybranych pól ze źródła lub stałe robocze (`Make`/`Model` / software tag) — lista minimalna ustala się przy pierwszym pliku referencyjnym.
- **Rozdzielczość preview:** jak aktywny **profil eksportu** (`social` / `web` / `full`) albo twardy limit na pierwszy SPIKE (np. max **2048 px** dłuższy bok) — decyzja przy implementacji, udokumentowana w raporcie STOP.

**Backlog (nie część domknięcia MVP A):** pełna realizacja **bogatego XMP** oraz **rozszerzonego EXIF** według powyższych punktów zależy od **decyzji produktowej** (zakres, namespace, zgodność z sidecarem). Szczegóły techniczne i kolejność: [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) **§5** (wiersz *Metadane XMP / EXIF rozszerzone*). Obecny tor derivative light może pozostać przy **minimalnych** tagach w kontenerze.

### 4.7 Definicja **PASS** — SPIKE binarny, wariant **A**

| Obszar | PASS (minimalny, na pierwszy merge SPIKE) |
|--------|-------------------------------------------|
| **Referencyjny TIFF (SPIKE)** | **`spike-mindfullens-minimal.tif`** — roundtrip `UTIF.decode`; **Photoshop** otwiera plik (potwierdzone w praktyce — jedyna ścieżka PASS dla PS w obecnym SPIKE). |
| **Plik `.dng` (UTIF + tagi DNG)** | **`spike-mindfullens-minimal.dng`** — blob pod roundtrip w kodzie / badania; **Adobe Photoshop (Camera Raw) nie otwiera** tego kontenera — do czasu osobnej implementacji **Linear DNG** (SDK / pełny zestaw tagów), nie traktować jako kryterium „działa w PS”. |
| **Batch / rozmiar** | Udokumentowany w STOP: maks. rozdzielczość źródła / czas dla jednej ramki na referencyjnej maszynie (nie twardy gate CI w pierwszej iteracji). |

**FAIL:** crash przy dekodowaniu UTIF, plik 0 B, TIFF niepodlegający otwarciu w Photoshopie przy ścieżce referencyjnej **§10**.

**Produkt / UX:** enkoder produkcyjny (`filmLabExportDngVariantA`) korzysta z tej samej klasy kontenera co SPIKE referencyjny; **Camera Raw może nadal odrzucać** plik — UI **nie** obiecuje interoperacyjności z ACR/Lr (patrz klucze i18n powyżej i §4.6).

### 4.8 Licencje — kierunki due diligence (nie porada prawna)

Przed wyborem stacku technicznego warto zestawić krótką notatkę (może być pod tą listą lub w osobnym ADR):

- **Pierwszy publiczny release z bundlem zawierającym enkoder DNG (derivative light, `utif`)** — wewnętrzny **przegląd prawny / compliance** (OSS w bundlu, model dystrybucji); szczegóły i synchronizacja z checklistą **§9** → [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) sekcja *Compliance i release*.
- **Adobe DNG SDK / Linear DNG (pełna zgodność ACR/Lr)** — **osobny epik** względem MVP derivative light na UTIF; **nie** jest częścią obowiązku zamknięcia wariantu A. SDK i specyfikacja — warunki użycia vs aplikacja webowa i redystrybucja bundla **tylko jeśli** podejmiecie ten tor produktowy.
- **SPIKE dev:** **`utif`** (MIT), **`canvas`** (node-canvas); przyszły stack DNG (SDK / WASM / serwis) — osobna notatka przed produkcją.
- **Otwarte stosy TIFF + metadane** (np. libtiff, biblioteki EXIF/XMP w WASM) — klasy licencji vs polityka produktu.
- Unikanie powielania materiałów objętych restrykcyjnymi warunkami tam, gdzie wystarczy interoperacyjność „na best-effort”.

**Notatka inżynierska (due diligence stosu MVP wariantu A):** [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) — `utif` (MIT), `pako` (transitive), rekomendacja **bez** Adobe DNG SDK na pierwszy export derivative light; SDK = osobna decyzja prawna przed ewent. Linear DNG.

### 4.9 Backlog inżynierski (po integracji MVP A — opcjonalny)

Zbiorczo: **Web Worker** pod kodowanie DNG przy dużych jobach; **XMP/EXIF** po uzgodnieniu produktowym; **smoke ręczny** przy RC — [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) **§5** (tabele *Backlog techniczny* + *Smoke QA*; **§5.1** — kiedy wyciągać worker / XMP z backlogu). Procedura smoke: [`DNG-EXPORT-SMOKE.md`](DNG-EXPORT-SMOKE.md). **§4.6** — rozszerzone metadane opisane jako backlog w akapicie pod listą punktów. Żaden z tych punktów **nie** jest kryterium zamknięcia MVP wariantu A ani substytutem CI.

**Odróżnienie:** wariant **B**, **mosaic RAW**, **Linear DNG / SDK** — **nie** mieszczą się w tym backlogu; to **§11.3** (osobne epiki vs derivative light).

---

## 5. Proponowane fazy (kolejność prac)

1. **Product:** jedna strona decyzji — MVP PSD vs MVP DNG (albo kolejność priorytetów).
2. **SPIKE kodowy (krótki):** proof-of-write dla wybranego formatu w workerze + limity rozmiaru.
3. **Kontrakt:** dopiero po SPIKE — manifest / nazewnictwo artefaktów / ZIP batch (osobny dokument lub podniesienie wersji manifestu).

---

## 6. Odniesienia w repozytorium

- **RAW / DNG jako wejście (ingest):** `src/engine/pipeline/raw/` (np. `rawDecode.worker.js`) — osobny tor od **eksportu DNG** opisanego w **§4**.
- Formaty rastra i normalizacja: `src/engine/filmLabExportFormats.js`
- Kodowanie rastra: `src/engine/filmLabExportEncode.js`, TIFF: `src/engine/filmLabTiffExport.js`, DNG derivative light (SPIKE / faza A): `src/engine/filmLabExportDngVariantA.js`
- Manifest: `src/engine/filmLabExportManifest*.js`, batch: `src/engine/batchProcessor.js`
- UI eksportu: `src/FilmLabExportModal.jsx`
- Smoke ręczny eksportu DNG (QA, nie CI): [`DNG-EXPORT-SMOKE.md`](DNG-EXPORT-SMOKE.md)
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

Checklista **§8 (PSD)** jest domknięta. Dla DNG: **hipoteza robocza** = wariant **A** (**§4.5**) — **potwierdzona w §11.2**; SPIKE binarny i **integracja produktowa derivative light** są w repo (**§10**). Przed **publicznym** releasem bundla nadal obowiązuje **sign-off compliance** (**§9**) oraz komunikat produktowy pod **§4.7** (ACR może odrzucać minimalny `.dng` — Linear DNG = osobny epik).

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

Historycznie blokowała rozrost zakresu bez decyzji; pozycje produktowe i inżynierskie są już odhaczone — **ostatnia otwarta pozycja** dotyczy wyłącznie **release’u publicznego**.

- [x] **Produkt:** potwierdzenie **hipotezy A** (**§4.5**) — zamknięte w **§11.2** (derivative light jako MVP DNG); wariant **B** pozostaje na roadmapie z osobną bramką.
- [x] **Minimalny opis pliku (A):** zapisany w **§4.6** — propozycja robocza do walidacji z produktem przy pierwszym pliku referencyjnym.
- [x] **Walidacja:** narzędzia referencyjne i definicja **PASS** dla SPIKE **A** — **§4.7** (nadrzędne względem ogólnych punktów **§4.3**).
- [x] **Licencje (inżynieria):** notatka — [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) (stack `utif` + transitive; Adobe SDK opcjonalny / review przed użyciem).  
- [ ] **Licencje (formalny sign-off):** **przegląd prawny / compliance wewnętrzny** przed pierwszym **publicznym** releasem aplikacji, której **build produkcyjny** zawiera bundel z **enkoderem DNG derivative light** (`utif` → `filmLabExportDngVariantA`, jak w `vite build`). Zakres typowo: zgodność polityki OSS w bundlu, model dystrybucji (web / open vs closed source), ewentualne wymogi organizacji — **poza zakresem samego repo i merge’y**. Lista faktów technicznych do przygotowania spotkania z compliance: [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) → *Compliance i release* → podpunkt **„Przygotowka inżynierska przed sign-off”**. **Uwaga:** ten punkt **nie** obejmuje Adobe DNG SDK ani Linear DNG — to **osobny epik** i osobna decyzja licencyjna (**§4.8**), wyłącznie gdy celem jest m.in. pełna zgodność z ACR/Lr. **Odhaczenie** `[x]` następuje dopiero po **realnym** zatwierdzeniu w organizacji (nie automatycznie z merge).
- [x] **Kontrakt wyjścia:** manifest / nazewnictwo / digest dla **`dng`** — `filmLabExportFormats.js`, reader examples, gate `test:film-lab-export-gates` (szczegóły: [`stop-2026-04-30-dng-variant-a-product-integration`](../../reports/hme/stop-2026-04-30-dng-variant-a-product-integration.md)).

---

## 10. Checklist — binarny SPIKE DNG (wariant A, dev) + integracja

**§10.1 — SPIKE dev (dowód zapisu, §4.7):**

- [x] Skrypt Node w repo: **`npm run spike:dng`** → `scripts/spike-write-minimal-dng.mjs`, katalog **`scripts/spike-dng-output/`** (`.gitignore`). Wyjście: **`spike-mindfullens-minimal.tif`**, **`spike-mindfullens-minimal.dng`**. Zależności: **`utif`**, **`canvas`** (dev).
- [x] **Adobe Photoshop — TIFF:** **`spike-mindfullens-minimal.tif`** — smoke test **PASS** (otwarcie w Photoshopie).
- [x] **Adobe Photoshop — DNG:** **`spike-mindfullens-minimal.dng`** — **FAIL w PS / Camera Raw** w SPIKE referencyjnym (potwierdzenie praktyczne); pełny Linear DNG = osobny epik.

**§10.2 — Integracja produktowa (derivative light, stack `utif` w przeglądarce):**

- [x] **`filmLabExportFormats.js`** — format **`dng`**, whitelist manifestu / scenariuszy digest reader.
- [x] **Encoder** — `src/engine/filmLabExportDngVariantA.js`, MIME `image/x-adobe-dng`; **`useFilmLabEngine`** + **`batchProcessor`** (dynamiczny import modułu).
- [x] **Manifest / digest** — reader examples, test MIME ↔ `.dng`, łańcuch `test:film-lab-export-gates`.
- [ ] **Worker tylko pod enkoder DNG** (opcjonalna optymalizacja dużych jobów — backlog; nie blokuje MVP integracji).

Raport domknięcia inicjatywy w kodzie: [`stop-2026-04-30-dng-variant-a-product-integration`](../../reports/hme/stop-2026-04-30-dng-variant-a-product-integration.md).

---

## 11. Decyzje produktowe — zamknięcie zakresu MVP

Sekcja **zamraża** wybór z §1 i §4.1 na potrzeby planowania epików (można zmienić tylko świadomym aktem produktowym + aktualizacją tego akapitu).

### 11.1 PSD — jedna warstwa vs stack Recipe

| Decyzja | Zakres MVP | Poza MVP (następny epik) |
|--------|----------------|---------------------------|
| **MVP** | **Jedna warstwa RGB** ze **spłaszczonego** renderu bieżącego podglądu — ten sam sens pikseli co eksport rastra / obecna gałąź `filmLabExportPsdFromCanvas` + sidecary (before, maska, recipe) wg kontraktu manifestu. | — |
| **Roadmapa** | — | **PSD wielowarstwowy** mapowany z Recipe (warstwy, grupy, maski jako kanały / osobne warstwy): osobna specyfikacja mapowania HME → PSD, limity RAM, worker; **nie** stanowi kryterium „pierwszej wersji” eksportu PSD poza rastrem. |

**Uzasadnienie:** pojedyncza warstwa jest już utrwalona w kodzie i CI/manifeście; pełny stack jest rzędem wielkości trudniejszym i blokuje się na niejednoznaczności produktowej (flatten vs edytowalne warstwy developerskie).

### 11.2 DNG — wariant A vs B

| Decyzja | Zakres MVP | Poza MVP |
|--------|----------------|----------|
| **MVP** | **Wariant A — derivative light** (§4.1, §4.5–4.6): plik kontenerowy z **preview** reprezentującym wyrenderowany rezultat Recipe + kontrolowany zestaw metadanych / XMP (namespace roboczy); **bez** pełnego mosaic RAW ani re-wrap całego sensor streamu. | — |
| **Roadmapa** | — | **Wariant B** (re-wrap / „prawdziwy” kontener RAW): dopiero po zamknięciu A (PASS §4.7 dla zaakceptowanego stacku), osobna decyzja licencyjna (**§4.8**) i definicja minimalnego pliku dla B. **Adobe DNG SDK / Linear DNG** (ACR/Lr bez odrzucania pliku): **osobny epik** — poza MVP **UTIF** derivative light (**§4.8**, **§9** ostatni akapit). |

**Uzasadnienie:** A daje najkrótszą ścieżkę do pliku używalnego w ekosystemie Adobe w modelu „pochodna archiwalna”, bez ryzyka obietnicy „pełnego RAW”; B pozostaje świadomym kosztem.

### 11.3 Poza MVP A — wariant B, mosaic RAW, Linear DNG (granica epiku)

**To nie jest kontynuacja** obecnej ścieżki **derivative light** (`utif`, [`filmLabExportDngVariantA.js`](../../src/engine/filmLabExportDngVariantA.js)). **Nie są kolejnym krokiem** po zamknięciu MVP A — ani „fazą E” tego samego epiku; to **osobne inicjatywy** z własnym charterem.

- **Wariant B (re-wrap)** — „prawdziwy” kontener RAW / sensor stream w wyjściu, nie tylko wbudowany preview po Recipe.
- **Pełny mosaic RAW** w pliku wyjściowym — archiwum sensora zamiast zwykłego RGB w kontenerze TIFF-like.
- **Linear DNG / zgodność z Adobe Camera Raw · Lightroom** — zwykle **inna warstwa binarna** (często **Adobe DNG SDK** lub WASM + pełny zestaw tagów), osobna definicja PASS, często **obowiązkowy** przegląd licencji Adobe (**§4.8**).

Łączy je to, że wymagają **nowej architektury i budżetu**, a nie refactoru na bazie wyłącznie kodu wariantu A. Szczegółowa tabela tematów: [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) → sekcja **„Poza MVP wariantu A — epiki następnej klasy”** (ta sama granica co tutaj).

---

*Ostatnia aktualizacja: 2026-04-30 — §11.3 / §4.9: granica epiku B·mosaic·Linear DNG vs backlog MVP A; §4.2 worker backlog; §6: `DNG-EXPORT-SMOKE.md`; §10.2: integracja DNG wariant A; §9: compliance przed publicznym releasem — nadal otwarte.*
