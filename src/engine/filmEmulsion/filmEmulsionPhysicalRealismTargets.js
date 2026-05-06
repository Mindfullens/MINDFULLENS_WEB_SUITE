/**
 * Cel architektury „creative / Dehancer-style” w Film Lab:
 *
 * - Narzędzia charakteru obrazu (halacja, ziarno, rozszczepienie, tonacja emulsji) MUSZą być mapowane
 *   głównie jako **emulacja profilu błony** (film strength, film profile, odsprzężona dynamika) —
 *   patrz `activeFilm` + shadery / warstwa `filmEmulsion*`, a nie jako pojedynczy statyczny 3D LUT
 *   nakładany na płasko na końcu.
 * - Presety / LUT służą jako **kierunek tonacji** tylko tam, gdzie cały stos już respektuje `FILM_EMULSION_*`
 *   i `filmEmulsionShaderContract.js`.
 * - Ziarno, halacja i korekcje koloru z zachowaniem dynamiki: **proceduralne / wieloprzebiegowe**,
 *   nie „jeden plik .cube nadpisuje wszystko”.
 *
 * Wskaźnik poniżej: próg, od którego wymagana jest zgodność z tym modelem w QA (nie jasność piksel-po-pikselu).
 *
 * @see filmEmulsionShaderContract.js
 */

/** Docelowy poziom zgodności z behawiorem chemicznego nośnika (punkt odniesienia dla QA). */
export const FILM_EMULSION_PHYSICAL_REALISM_TARGET = 0.9;
