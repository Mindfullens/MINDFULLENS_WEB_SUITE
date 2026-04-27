// ============================================================
// POPRAWIONE SYMULACJE FILMOWE — Grain & Light
// Bazowane na oficjalnych datasheet'ach Kodak/Fuji/Ilford,
// recenzjach z The Darkroom, Analog.cafe, Casual Photophile,
// oraz kolorimetrycznych analizach emulsji.
// ============================================================

// ❌ PROBLEM #1: KODACHROME — "Kultowy Slajd"
// BYŁO: Liniowe kanały R/G/B, vibrance/saturation/contrast = 0, grain 18
// POWINNO BYĆ: Ciepłe czerwienie i żółcie, głębokie niebieskie,
// wyraźny ale naturalny kontrast, drobne ziarno (ISO 64),
// lekko przycięte czernie i biele (typowe dla slajdu)
// Źródła: Kodak datasheet E-55/E-88, DPReview forum analysis,
// Fuji X Weekly recipe research, analog.cafe, Gavin Gough profiles

{"name":"Kodachrome","sub":"Kultowy Slajd","cat":"slide","free":true,"bw":false,"curves":{"rgb":[[0,8],[42,32],[84,72],[128,128],[192,195],[255,238]],"r":[[0,0],[38,32],[82,78],[128,135],[185,198],[255,255]],"g":[[0,0],[42,34],[90,82],[128,125],[180,182],[255,248]],"b":[[0,5],[45,42],[90,88],[128,132],[175,182],[255,248]]},"vibrance":18,"saturation":2,"contrast":15,"grain":10},

// Uzasadnienie:
// - RGB: S-krzywa z podniesionym [0,8] i przyciętą bielą [255,238]
//   = typowy slajdowy crunch z lekkim fade w cieniach
// - R: Podniesione średnie tony i światła (128→135, 185→198)
//   = ciepłe, bogate czerwienie i żółcie — wizytówka Kodachrome
// - G: Lekko obniżone w cieniach, delikatnie w światłach
//   = zielenie "khaki" (nie soczystozielone jak Fuji) — potwierdzone w DPReview
// - B: Minimalnie podniesione w średnich tonach (128→132)
//   = te "głębokie, aksamitne niebieskie" ale bez dominacji
// - Vibrance 18: Umiarkowana żywość — Kodachrome był nasycony ale naturalnie,
//   NIE jak Velvia (+50). Źródło: "vibrant but true" (Steve McCurry)
// - Saturation +2: Minimalne podniesienie ogólnej saturacji
// - Contrast 15: Wyraźny kontrast — "punchy but believable" (x-equals.com)
// - Grain 10: ISO 64 = drobne ziarno. Oryginalnie ultra-fine grain dzięki K-14


// ❌ PROBLEM #2: ILFORD HP5 120BW — "Klasyczne Ziarno"
// BYŁO: contrast 100, grain 18
// POWINNO BYĆ: Medium to low contrast (~50), grain ~20
// Źródła: Ilford oficjalny datasheet, The Darkroom Lab, analog.cafe,
// My Favourite Lens review, Tim Layton guide

{"name":"Ilford HP5 120BW","sub":"Klasyczne Ziarno","cat":"bw","free":true,"bw":true,"curves":{"rgb":[[0,4],[55,58],[128,130],[200,200],[255,246]],"r":[[0,0],[255,255]],"g":[[0,0],[255,255]],"b":[[0,0],[255,255]]},"vibrance":0,"saturation":0,"contrast":50,"grain":20,"grayMixer":{"red":4,"green":-28,"blue":-3}},

// Uzasadnienie:
// - Contrast 50 (było 100): Ilford oficjalnie opisuje HP5 jako
//   "medium contrast" film. The Darkroom: "subtle tones, lower contrast".
//   Analog.cafe: "medium contrast when exposed perfectly".
//   My Favourite Lens: "a lot of shots did come out on the flatter side".
//   Dla porównania: Tri-X (znany z wyższego kontrastu) ma 85 — HP5 MUSI być niżej.
// - Grain 20 (było 18): HP5 ma nieco więcej widocznego ziarna niż Delta 400.
//   Analog.cafe: "fairly grainy, even when shot at box speed, slightly grittier
//   than Kodak Tri-X 400". Podniesione z 18 do 20 dla lepszego odróżnienia.
// - Krzywa RGB: Lekko podniesiony [0,4] i przycięte biele [255,246]
//   = delikatny vintage look z miękkimi przejściami tonalnymi
// - GrayMixer zachowany bez zmian — green -28 to ciekawy mix kanałów


// ⚠️ PROBLEM #3: KODAK PORTRA 400 — "Organiczne Tony"
// BYŁO: Tylko crunch czerni/bieli, reszta liniowa, vibrance/sat/contrast/grain = 0
// POWINNO BYĆ: Ciepłe, pastelowe tony, delikatna magenta w skintones,
// niski kontrast, drobne ale widoczne ziarno, lekka vibrance
// Źródła: Kodak datasheet E-4050, Casual Photophile, The Darkroom,
// analog.cafe, decafjournal.com

{"name":"Kodak Portra 400","sub":"Organiczne Tony","cat":"neg","free":true,"bw":false,"curves":{"rgb":[[0,18],[48,52],[128,128],[200,198],[255,236]],"r":[[0,0],[45,38],[110,115],[175,188],[255,255]],"g":[[0,0],[48,42],[115,118],[180,190],[255,255]],"b":[[0,0],[50,44],[118,118],[178,185],[255,250]]},"vibrance":8,"saturation":-6,"contrast":5,"grain":12},

// Uzasadnienie:
// - RGB: Podniesione czernie [0,18] i przycięte biele [255,236]
//   = miękki, niski kontrast z ograniczoną dynamiką — "soft, forgiving contrast"
//   Lekka S-krzywa w cieniach [48,52] = delikatne fade
// - R: Ciepłe podniesienie w średnich/jasnych tonach (175→188)
//   = "overall tone tends to be on the warmer side" (Casual Photophile)
//   = "balanced for oranges, reds, and yellows" (decafjournal)
// - G: Równoległe ciepłe podniesienie ale mniej agresywne niż R
//   = naturalne, nie przegrzane kolory
// - B: Lekko obniżone w cieniach (50→44), przycięte światła (255→250)
//   = subtelne ciepłe przesunięcie bez agresywnego żółknięcia
// - Vibrance 8: Delikatna żywość — Portra NIE jest flat/desaturated,
//   ale "vibrant yet natural" (Kelsey Smith). Nie +30 jak Gold, ale nie 0.
// - Saturation -6: Lekko obniżona — "subdued in both contrast and saturation"
//   (decafjournal), "pastel-like manner" (The Darkroom), "not ultra-saturated"
// - Contrast 5: Minimalny — "low-contrast profile" (Imagen), "medium-low contrast"
//   (analog.cafe). Portra to jeden z najbardziej płaskich negatywów.
// - Grain 12: Drobne ale widoczne — "finest grain you'll find in a 400-speed"
//   (Kelsey Smith), "virtually non-existent" (Casual Photophile).
//   Nie 0 (to by znaczyło brak ziarna), ale drobne 12.


// ⚠️ PROBLEM #4: KODAK T-MAX 3200 — "Nocne Ziarno"
// BYŁO: grain 18
// POWINNO BYĆ: grain ~40-45 (porównywalny z Delta 3200 = 50)
// Źródła: Kodak datasheet, porównanie z Delta 3200 w kolekcji

{"name":"Kodak T Max 3200","sub":"Nocne Ziarno","cat":"bw","free":false,"bw":true,"curves":{"rgb":[[0,20],[54,80],[178,176],[255,253]],"r":[[0,0],[255,255]],"g":[[0,0],[255,255]],"b":[[0,0],[255,255]]},"vibrance":0,"saturation":0,"contrast":58,"grain":42},

// Uzasadnienie:
// - Grain 42 (było 18): T-Max 3200 to film ISO 3200. W kolekcji:
//   - Ilford Delta 3200 = grain 50
//   - Fuji Superia 1600 = grain 40
//   - T-Max 3200 powinien być między nimi.
//   T-Max 3200 używa T-grain (tabularny), więc jest nieco drobniejszy
//   niż tradycyjny Delta 3200, stąd 42 (nie 50).
//   Grain 18 (stara wartość) to poziom filmów ISO 100-400!
// - Reszta parametrów (krzywe, kontrast 58) — bez zmian, są poprawne.
//   Krzywa z agresywnym podniesieniem [54,80] dobrze oddaje
//   charakterystyczny push-look T-Max 3200.


// ⚠️ PROBLEM #5: VEKTRO 100 — "Retro Slajd"
// BYŁO: grain 35
// POWINNO BYĆ: grain ~12-15 (ISO 100 slajd)

{"name":"Vektro 100","sub":"Retro Slajd","cat":"slide","free":false,"bw":false,"curves":{"rgb":[[0,12],[40,45],[100,108],[160,170],[220,228],[255,250]],"r":[[0,8],[64,70],[128,135],[192,200],[255,252]],"g":[[0,10],[64,72],[128,138],[192,202],[255,252]],"b":[[0,5],[64,55],[128,112],[192,178],[255,238]]},"vibrance":15,"saturation":5,"contrast":20,"grain":14},

// Uzasadnienie:
// - Grain 14 (było 35): ISO 100 slajd powinien mieć drobne ziarno.
//   Dla porównania w kolekcji:
//   - Fuji Velvia 50 (ISO 50) = grain 10
//   - Fuji Provia 100F (ISO 100) = grain 8
//   - Kodak Ektachrome E100 (ISO 100) = grain 12
//   Grain 35 to poziom filmów ISO 800+! Dla "retro" slajdu 14 jest
//   odpowiednie — nieco więcej niż Provia (celowo retro charakter),
//   ale nie na poziomie high-ISO.
// - Reszta parametrów — bez zmian, krzywe i kolory są spójne.


// ⚠️ PROBLEM #6: KODAK PORTRA 400 SIMULATION — "Symulacja Klasyczna"
// BYŁO: vibrance 0, saturation 0, contrast 64 (bardzo wysoki!)
// POWINNO BYĆ: Lekka vibrance, delikatne ciepło, umiarkowany kontrast
// Jako "klasyczna symulacja" powinna przypominać standardową Portra 400

{"name":"Kodak Portra 400 simulation","sub":"Symulacja Klasyczna","cat":"neg","free":false,"bw":false,"curves":{"rgb":[[0,15],[68,39],[129,129],[145,145],[255,234]],"r":[[0,0],[60,55],[128,132],[190,195],[255,255]],"g":[[0,0],[255,255]],"b":[[0,0],[60,58],[128,124],[190,185],[255,248]]},"vibrance":6,"saturation":-4,"contrast":18,"grain":14},

// Uzasadnienie:
// - RGB: Zachowana oryginalna krzywa z crunchem w cieniach [68,39]
//   — to daje charakterystyczny "filmowy" wygląd, ale obniżony kontrast
//   z 64 do 18 sprawia, że nie dominuje nad resztą
// - R: Dodane lekkie ciepło w średnich tonach (128→132, 190→195)
//   = klasyczne ciepłe tony Kodaka
// - G: Zachowane liniowe — Portra nie manipuluje agresywnie zieleniami
// - B: Lekko obniżone w średnich/jasnych tonach (128→124, 190→185)
//   = subtelne ciepłe przesunięcie (mniej niebieskiego = cieplej)
// - Vibrance 6: Lekka żywość — "klasyczna" Portra powinna mieć
//   odczuwalny, choć subtelny, kolorystyczny charakter
// - Saturation -4: Typowe dla Portra przytłumienie
// - Contrast 18 (było 64!): Portra 400 to film o NISKIM kontraście.
//   64 to wartość bliższa filmom push-processed.
//   18 daje "miękki kontrast" spójny z charakterem Portra.
// - Grain 14: Drobne ale obecne ziarno


// ============================================================
// KODAK EKTAR 100 PUSHED — poprawka kategorii
// BYŁO: cat:"slide"
// POWINNO BYĆ: cat:"neg" (Ektar to negatyw C-41, nie slajd)
// Parametry bez zmian — są poprawne
// ============================================================

{"name":"Kodak Ektar 100 - pushed","sub":"Ektar Pushed","cat":"neg","free":false,"bw":false,"curves":{"rgb":[[0,10],[91,91],[196,192],[255,255]],"r":[[0,0],[44,19],[68,45],[99,100],[149,173],[194,220],[255,255]],"g":[[0,0],[29,12],[63,42],[92,84],[120,132],[149,176],[175,204],[198,224],[255,255]],"b":[[0,0],[30,14],[95,83],[123,125],[149,157],[198,221],[255,255]]},"vibrance":18,"saturation":-4,"contrast":16,"grain":18},
