# Smoke test — eksport DNG derivative light (Film Lab)

Procedura **ręczna** przed releasem lub po zmianach w `filmLabExportDngVariantA.js`, gałęzi DNG w `useFilmLabEngine` / `batchProcessor` / modalu eksportu.

**Kiedy uruchomić:** przy **release candidate** lub przed **publicznym** wdrożeniem buildu zawierającego eksport DNG; oraz po istotnych zmianach w kodzie ścieżki DNG. Po przejściu kroków wpisz wyniki do [**Rejestru wykonania**](#rejestr-wykonania-release-candidate) (ticket wewnętrzny, wiki albo komentarz do PR — poza git jeśli tak macie w zwyczaju).

**Zakres:** jakość wydania i regresja UX, nie pełna walidacja binarna.

**Czego ten dokument nie zastępuje**

- Automatycznych testów CI: `npm run test:film-lab-export-gates` (m.in. `test-film-lab-export-dng-variant-a`, manifest digest reader).
- Bramki „Camera Raw musi otworzyć” — według SPIKE **§4.7** plik `.dng` z UTIF może pozostać **nieakceptowany** przez Adobe Camera Raw do czasu ewent. epiku Linear DNG.

Wzór struktury: [`DEPTH-ONNX-SMOKE.md`](DEPTH-ONNX-SMOKE.md).

---

## Przygotowanie

1. `npm run dev` lub zbudowany preview (`npm run build && npm run preview`).
2. Zdjęcie testowe (JPEG lub RAW z biblioteki), z widoczną korektą HME — żeby eksport nie był identyczny z „before”.
3. Opcjonalnie stress: bardzo duża rozdzielczość źródła — wtedy obserwuj czas i responsywność UI (por. backlog **worker** w [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) §3 Faza B).

---

## Kroki — pojedynczy eksport

1. Otwórz dialog eksportu, wybierz format **DNG**.
2. Sprawdź, że pod wyborem formatu pojawia się notatka (pochodna archiwalna, nie RAW z matrycy; ograniczenia ACR) — klucze i18n `filmLab.exportModal.formatDngNote` / tooltip na przycisku.
3. Uruchom eksport dla presetów **Social**, **Web** i **Full** (co najmniej jeden „mały” i jeden „pełny”).
4. Dla każdego pobranego pliku: rozmiar > 0 B; opcjonalnie szybka weryfikacja struktury (np. `exiftool`, `tiffdump`) — kontener TIFF-like, nie pusty.

---

## Kroki — batch

1. Wgraj paczkę z co najmniej dwoma plikami (np. JPEG + RAW), wybierz **DNG**, uruchom eksport paczki.
2. Rozpakuj ZIP: oczekiwane pliki `.dng`, spójność nazw z konwencją batch; manifest w ZIP zgodny z ustawieniami (recipe / sidecary według checkboxów).

---

## Zewnętrzne aplikacje (oczekiwane zachowania, §4.7)

Zapisuj wersje aplikacji i OS przy raporcie regresji.

| Narzędzie | Co sprawdzić | Uwaga |
|-----------|----------------|--------|
| **Adobe Photoshop** | **Otwórz** plik jako zwykły dokument | Często działa interpretacja TIFF-like / podgląd; **nie** jest to obietnica SPIKE dla każdej wersji. |
| **Camera Raw** (PS / Bridge) | Otwarcie jako RAW | **Może FAIL** — założenie SPIKE; UI aplikacji ostrzega użytkownika. |
| **Lightroom Classic** | Import | Może odrzucić — traktować jako informację, nie twardy FAIL MVP A. |
| **Podgląd / przeglądarka** | Podgląd miniatury / otwarcie | Zależnie od systemu; brak miniatury nie musi być błędem enkodera. |

---

## Świadome „niepowodzenia” (nie zawsze bug)

- **ACR odrzuca `.dng`** — zgodne z **§4.7**; eskalacja tylko jeśli produkt uzna Linear DNG za priorytet (osobny epik).
- **Długi czas zapisu lub krótkie zamrożenie UI** na bardzo dużym eksporcie — znane ograniczenie ścieżki main-thread + `utif`; mitigacja: backlog worker (plan Faza B pkt 5).
- **Brak rozszerzonych XMP** (hash Recipe itd.) — nie jest częścią obecnego MVP; osobny backlog produktowy ([`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) §1, §5).

---

## Rejestr wykonania (release candidate)

**Cel:** ślad audytowy — przy kolejnej regresji wiadomo, z jakim **buildem** i **wersjami zewnętrznych aplikacji** porównywać zachowanie. Nie zastępuje automatycznego CI.

Skopiuj szablon do narzędzia projektowego albo wklej jako komentarz pod RC.

### Szablon (wypełnić)

| Pole | Wartość |
|------|---------|
| **Data** | |
| **Film Lab** — commit / tag / identyfikator buildu | |
| **Środowisko** | `npm run dev` · `vite preview` · hosting staging · inne: ___ |
| **Tester** | |
| **System operacyjny** | np. macOS 15.x · Windows 11 … |
| **Adobe Photoshop** | wersja (np. 2025 26.x); **Otwórz** `.dng`: OK / FAIL / nie testowano |
| **Camera Raw** (z Photoshop / Bridge) | wersja modułu jeśli znana; wynik na `.dng`: OK / FAIL — przy FAIL MVP A często **oczekiwane** (§4.7) |
| **Adobe Bridge** | opcjonalnie; wersja / wynik |
| **Lightroom Classic** | opcjonalnie; wersja / import: OK / FAIL |
| **Kroki pojedynczy eksport** | OK / uwagi (preset Social/Web/Full, notatka i18n widoczna) |
| **Kroki batch + ZIP** | OK / uwagi |
| **Uwagi ogólne** | np. czas eksportu na dużym pliku, zamrożenie UI |

### Minimalny zapis (jeśli pełna tabela jest za ciężka)

Jedna linia tekstowa: **data · commit/tag · OS · PS x.y · ACR: oczekiwany FAIL lub OK · pojedynczy+batch OK.**

---

## Powiązane

- Plan i backlog: [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md)  
- SPIKE: [`EXPORT-PSD-DNG-SPIKE.md`](EXPORT-PSD-DNG-SPIKE.md) §4  
- STOP integracji: [`stop-2026-04-30-dng-variant-a-product-integration`](../../reports/hme/stop-2026-04-30-dng-variant-a-product-integration.md)
