# Mask Studio — interfejs hybrydowy (progressive disclosure)

Dokument roboczy: krytyka obecnego układu technicznego i cel UX („Kowalski” ↔ Pro) bez narzucania harmonogramu implementacji.

## Diagnoza obecnego UI (repo)

Prawy pas zakładki **Maski** jest podzielony na sekcje zsynchronizowane z `?maskSection=`:

| Id (stan kodu) | Rola techniczna | Typowy problem UX |
|----------------|------------------|---------------------|
| `geometry` | Tryby pędzla / gradient / radial / linear | „Geometria” jako osobna mentalność |
| `range` | Luma, color, depth + ONNX | Przeładowanie suwaków „na start” |
| `combine` | Graf masek (AND/OR…) | Matematyka na pierwszym planie |
| `ai` | Presety AI | Rozdzielone od reszty przepływu |
| `output` | Nazwa, opacity, blend | Sensowne, ale za daleko od intencji |

Źródło: `src/filmLab/maskStudioSectionIds.js`, `FilmLabLocalMaskWorkbenchToolsRail` w `FilmLabLocalMaskWorkbench.jsx`.

To jest klasyczny podział **według warstwy silnika**, nie według **zadania użytkownika** („wytnij niebo”, „popraw krawędź”, „zawęź po jasności”).

---

## Cele produktowe (progressive disclosure)

### Poziom 1 — pierwsze wrażenie (użytkownik casual)

- Na wejściu: **intencje**, nie suwaki techniczne.
- Duże kafelki AI w stylu narzędzi konsumenckich: obiekt, niebo, tło, osoba (copy PL zgodne z brandem).
- Po wyborze: **natychmiastowy efekt** maski + **proste** korekty (np. ekspozycja, kontrast, temperatura) — bez konieczności rozumienia trybu `localMaskMode`.

### Poziom 2 — zarządzanie maską (zaawansowany amator)

- Przy masce na liście: **Dodaj** / **Odejmij** z prostym podmenu (pędzel, gradient, punkt).
- Silnik nadal używa operacji grafu (np. subtract); **etykiety dla użytkownika** pozostają „odejmij”, nie „subtract”.

### Poziom 3 — precyzja (profesjonalista)

- **Auto mask / krawędź** przy narzędziu pędzla (checkbox „Wykrywaj krawędzie”) — jawne spięcie z istniejącym `brushMaskEdgeSensitivity` tam, gdzie ma sens.
- **„Dopracuj zakres”** przy slocie maski: dopiero wtedy rozwijają się suwaki Luma/Chroma/Depth — zamiast osobnej zakładki „Range” jako pierwszego kontaktu.

### Poziom 4 — maska punktowa (U Point–like)

- Narzędzie **„Maska punktowa”**: klik → lokalny obszar na podstawie próbki barwy/jasności; tolerancja przy punkcie, bez osobnej zakładki „geometry/range” dla tego przypadku.

---

## Zasada projektowa

**Pokaż tylko to, co potrzebne w danym kroku.** Pełny inwentarz techniczny zostaje dostępny, ale **schowany** za intencją lub za akcją „dopracuj”.

---

## Implementacja w repo (orientacyjne fazy — nie kontrakt)

1. **UX shell bez zmiany silnika:** jeden widok „startowy” (kafelki AI + lista masek); istniejące sekcje jako **drawer / accordion** lub tryb „Zaawansowane” zamiast pięciu równorzędnych tabów.
2. **Przepięcie URL:** `maskSection=` może zostać dla deep linków Pro, albo zostać zastąpione stanem UI bez przeładowania całego panelu.
3. **Spięcie korekt po AI:** osobny mini-blok suwaków po presetach AI (wymaga decyzji: czy korekty są globalne Develop vs maskowe — kontrakt Recipe).
4. **„Dopracuj zakres”** jako entry point do obecnych suwaków range przy wybranej masce.
5. **Maska punktowa:** nowy tryb semantyczny / narzędzie — osobny podnoszenie kontraktu Recipe i silnika.

---

## Powiązania

- Silnik grafu masek: `src/filmLab/localMaskGraph.js`, recipe semantic nodes.
- AI presety: `FilmLabLocalMaskWorkbenchToolGrid`, `applyAiAssistMaskPreset`.
- Zakładki buildera: `MASK_STUDIO_BUILDER_SECTIONS`, `useFilmLabMaskStudioUrlSync.js`.

---

*Treść krytyki i poziomów 1–4 powyżej odzwierciedla brief produktowy zespołu; dopiski „repo” i fazy są technicznym uchwytem pod planowanie epików.*
