# Generacja lokalna (ONNX) — SPIKE roboczy

**Status:** po **`semantic.generative_stub.v1`** (intent UI bez renderu).

## Cel

Lokalna inferencja (bez uploadu), zgodnie z North Star: ONNX runtime, lazy-loading modeli, cache — analogicznie do **AI Mask MVP** (`filmLabOnnxRuntimeAdapter.js`).

## Etapy (skrót)

1. **Kontrakt recipe**: nowy typ semantyczny (np. `semantic.generative_local.v1`) z `modelId`, `seed`, maską wejściową — osobna decyzja vs rozszerzenie stubu.
2. **Worker / GPU**: ciężkie inferencje poza głównym wątkiem; graf maski pozostaje źródłem prawdy dla composite.
3. **PASS**: brak regresji presetów; gate jakości (checksum / fixture PNG) w CI warunkowo.
