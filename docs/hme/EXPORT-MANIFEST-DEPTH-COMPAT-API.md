# Export Manifest Depth Compat API

Mała nota dla integratorów czytających `manifest.json` i `*_after_recipe.json` z różnych wersji eksportu.

## Cel

Ujednolicić odczyt depth diagnostics dla:

- nowych manifestów (`export.depthProxyPresent`, `export.depthProxyVariant`),
- starszych manifestów bez tych pól,
- starszych `after_recipe` bez `export.depthTraceVersion` / `depthMapSource` / `depthProxyDigest`.

## Publiczny adapter

Użyj `normalizeLegacyManifestDepthDiagnostics(manifest, afterRecipe)` z:

- `src/engine/filmLabExportManifestHelpers.js`

Zwraca:

- `manifest` — znormalizowany blok `export` (z fallback derive dla depth),
- `afterRecipe` — podniesiony payload `after_recipe` (jeśli był legacy),
- `compatibilityWarning` — reason string albo `null`.

## Minimalny przykład

```js
import { normalizeLegacyManifestDepthDiagnostics } from '../src/engine/filmLabExportManifestHelpers.js';

const normalized = normalizeLegacyManifestDepthDiagnostics(manifestJson, afterRecipeJson);

const manifest = normalized.manifest;
const afterRecipe = normalized.afterRecipe;

// Stabilny odczyt po normalizacji:
const depthProxyPresent = Boolean(manifest?.export?.depthProxyPresent);
const depthProxyVariant = String(manifest?.export?.depthProxyVariant ?? 'none'); // none|json|json+f32
const depthTraceVersion = Number(afterRecipe?.export?.depthTraceVersion ?? 0); // 1 dla current contract
const depthMapSource = afterRecipe?.export?.depthMapSource ?? null;
const depthProxyDigest = afterRecipe?.export?.depthProxyDigest ?? null;
```

## Legacy input -> normalized output

| Legacy input | Normalized output |
|---|---|
| `manifest.export.depthProxyVariant` brak, `artifacts` zawiera `depth_proxy` | `depthProxyPresent=true`, `depthProxyVariant='json'` |
| `manifest.export.depthProxyVariant` brak, `artifacts` zawiera `depth_proxy` + `depth_proxy_data` | `depthProxyPresent=true`, `depthProxyVariant='json+f32'` |
| `manifest.export.depthProxyVariant` brak, `artifacts` brak/null/puste | `depthProxyPresent=false`, `depthProxyVariant='none'` |
| `after_recipe.export` brak `depthTraceVersion/depthMapSource/depthProxyDigest`, a manifest ma depth proxy | adapter doda `depthTraceVersion=1`, `depthMapSource='luminance'`, `depthProxyDigest=''` |
| `after_recipe.export` brak `depthTraceVersion/depthMapSource/depthProxyDigest`, a manifest nie ma depth proxy | adapter doda `depthTraceVersion=1`, `depthMapSource=null`, `depthProxyDigest=null` |

## Best-practice reader flow

```js
import {
  normalizeLegacyManifestDepthDiagnostics,
  warnFilmLabExportDepthDiagnosticsCompatibility,
} from '../src/engine/filmLabExportManifestHelpers.js';

const manifestJson = JSON.parse(manifestText);
const afterRecipeJson = afterRecipeText ? JSON.parse(afterRecipeText) : null;

const normalized = normalizeLegacyManifestDepthDiagnostics(manifestJson, afterRecipeJson);

// Optional: report inconsistent payloads but don't break processing.
warnFilmLabExportDepthDiagnosticsCompatibility(
  normalized.manifest,
  'my-integrator.reader',
  { silent: false }
);

const manifest = normalized.manifest;
const afterRecipe = normalized.afterRecipe;
// consume normalized values below
```

## Do not do this

- Nie opieraj logiki wyłącznie o surowe `manifest.export.depthProxyPresent` bez wcześniejszej normalizacji legacy payloadu.
- Nie zakładaj, że stare `after_recipe` zawsze ma `export.depthMapSource` / `export.depthProxyDigest` — adapter może je dopiero dopisać.
- Nie ignoruj `depthTraceVersion`; nowe rozszerzenia depth trace powinny być obsługiwane wersyjnie.

## Versioning policy (`depthTraceVersion`)

- `depthTraceVersion=1` oznacza aktualny kontrakt: `depthMapSource` + `depthProxyDigest` w `after_recipe.export` dla `variant='after'`.
- Adapter nie nadpisuje istniejącego `depthTraceVersion` jeśli payload już ma komplet pól depth trace (forward compatibility).
- Integrator powinien traktować `depthTraceVersion > 1` jako nowszy kontrakt i stosować fallback „read what you know, ignore unknown fields”.

## Changelog (depth trace)

- **v1** — dodane pola `after_recipe.export.depthTraceVersion=1`, `depthMapSource`, `depthProxyDigest` oraz diagnostyka manifestu (`depthProxyPresent`, `depthProxyVariant`).
- **v2+** — kontrakt może rozszerzać depth trace o nowe pola; adapter zachowuje istniejące `depthTraceVersion` i nie obniża wersji.
- **2026-05-06 (Type safety hardening)** — dodana polityka `Type Safety Policy`, compile-time gate `test:engine-types-usage-tsc`, agregat `test:types` (usage + negative fixtures) i snapshot public API `src/engine/index.d.ts`.

## Variant -> expected artifacts

| `manifest.export.depthProxyVariant` | Oczekiwane artefakty |
|---|---|
| `none` | brak `depth_proxy`, brak `depth_proxy_data` |
| `json` | obecny `depth_proxy` |
| `json+f32` | obecny `depth_proxy` i `depth_proxy_data` |

## Error codes / reasons

Aktualne reason stringi zwracane przez validator:

- `export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts`
- `export.depthProxyVariant='json|json+f32' requires depth_proxy/depth_proxy_data artifacts`
- `export.depthProxyVariant='json+f32' requires depth_proxy_data artifact`

Rekomendacja integracyjna:

- **warn mode**: użyj `warnFilmLabExportDepthDiagnosticsCompatibility(...)`, zaloguj reason i kontynuuj po normalizacji.
- **strict mode**: użyj `assertFilmLabExportDepthDiagnosticsCompatibility(...)`, mapuj reason na komunikat UI/API i przerwij przetwarzanie.

## Machine-readable integration

Dla integracji kodowej użyj helpera:

- `mapDepthDiagnosticsReasonToCode(reason)` z `filmLabExportManifestHelpers.js`
- `getDepthDiagnosticsCompatibilityReport(manifest)` z `filmLabExportManifestHelpers.js`
- `isDepthDiagnosticsStrictFailure(manifest)` z `filmLabExportManifestHelpers.js`

Mapowanie reason -> enum/code:

| Reason string | Enum/code |
|---|---|
| `export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts` | `DEPTH_VARIANT_NONE_WITH_ARTIFACTS` |
| `export.depthProxyVariant='json\|json+f32' requires depth_proxy/depth_proxy_data artifacts` | `DEPTH_VARIANT_JSON_WITHOUT_ARTIFACTS` |
| `export.depthProxyVariant='json+f32' requires depth_proxy_data artifact` | `DEPTH_VARIANT_JSONF32_WITHOUT_F32` |

## Integration checklist

1. **Parse** `manifest.json` i opcjonalny `after_recipe.json`.
2. **Normalize** przez `normalizeLegacyManifestDepthDiagnostics(...)`.
3. **Validate** przez `getDepthDiagnosticsCompatibilityReport(...)`.
4. **Map code** (`report.code`) do komunikatu domenowego/API.
5. **Decision**:
   - `report.isStrictFailure === true` -> fail (strict) lub warn + continue (non-strict),
   - `false` -> kontynuuj normalny pipeline.

### Backend mini-example (HTTP 422)

```js
import { getDepthDiagnosticsCompatibilityReport } from '../src/engine/filmLabExportManifestHelpers.js';

const report = getDepthDiagnosticsCompatibilityReport(manifestJson);

if (report.isStrictFailure) {
  return res.status(422).json({
    error: 'DEPTH_DIAGNOSTICS_INCOMPATIBLE',
    reason: report.reason,
    code: report.code, // może być null dla custom/unknown reason
  });
}
```

### Backend mini-example (warn mode, HTTP 200)

```js
import { getDepthDiagnosticsCompatibilityReport } from '../src/engine/filmLabExportManifestHelpers.js';

const report = getDepthDiagnosticsCompatibilityReport(manifestJson);

// non-strict policy: continue, but expose warning metadata
return res.status(200).json({
  ok: true,
  warnings: report.isStrictFailure
    ? [
        {
          type: 'DEPTH_DIAGNOSTICS_WARNING',
          reason: report.reason,
          code: report.code,
        },
      ]
    : [],
});
```

### Helper for warn API responses

```js
import {
  getDepthDiagnosticsCompatibilityReport,
  toHttpDepthDiagnosticsWarningOnly,
  toHttpDepthDiagnosticsWarning,
} from '../src/engine/filmLabExportManifestHelpers.js';

const report = getDepthDiagnosticsCompatibilityReport(manifestJson);
const warn = toHttpDepthDiagnosticsWarning(report);
return res.status(warn.status).json(warn.body);

// Or embed warning object inside a larger response:
const warning = report.isStrictFailure ? toHttpDepthDiagnosticsWarningOnly(report) : null;
```

### Helper for strict API responses

```js
import {
  getDepthDiagnosticsCompatibilityReport,
  toHttpDepthDiagnosticsError,
} from '../src/engine/filmLabExportManifestHelpers.js';

const report = getDepthDiagnosticsCompatibilityReport(manifestJson);
if (report.isStrictFailure) {
  const err = toHttpDepthDiagnosticsError(report);
  return res.status(err.status).json(err.body);
}
```

### Unified helper (single entrypoint)

```js
import {
  getDepthDiagnosticsCompatibilityReport,
  toHttpDepthDiagnosticsResult,
} from '../src/engine/filmLabExportManifestHelpers.js';

const report = getDepthDiagnosticsCompatibilityReport(manifestJson);
const http = toHttpDepthDiagnosticsResult(report, { strict: true }); // strict=false for warn mode
return res.status(http.status).json(http.body);
```

## API response schema

- **Error (strict mode)**:
  - `error`: string (`DEPTH_DIAGNOSTICS_INCOMPATIBLE`)
  - `reason`: string | null
  - `code`: string | null
- **Warning (non-strict mode)**:
  - `type`: string (`DEPTH_DIAGNOSTICS_WARNING`)
  - `reason`: string | null
  - `code`: string | null

## OpenAPI fragment (example)

```yaml
# Canonical source-of-truth fixture:
# docs/hme/openapi/depth-diagnostics.responses.yaml
```

## Breaking-change policy

- Reason stringi i enum kody są traktowane jako kontrakt integracyjny.
- Zmiana treści reason string lub nazwy kodu wymaga:
  1. aktualizacji fixture/testów snapshot,
  2. wpisu w changelogu,
  3. komunikatu migracyjnego dla integratorów (SDK/BE).
- Zmiany addytywne (nowe pola, nowe reason/code) są preferowane względem modyfikacji istniejących wartości.

## SDK/Client mapping

Po stronie TS/BE trzymaj lokalny enum kodów i mapuj `report.code` 1:1:

- `DEPTH_VARIANT_NONE_WITH_ARTIFACTS`
- `DEPTH_VARIANT_JSON_WITHOUT_ARTIFACTS`
- `DEPTH_VARIANT_JSONF32_WITHOUT_F32`

Przykład (TypeScript):

```ts
type DepthDiagCode =
  | 'DEPTH_VARIANT_NONE_WITH_ARTIFACTS'
  | 'DEPTH_VARIANT_JSON_WITHOUT_ARTIFACTS'
  | 'DEPTH_VARIANT_JSONF32_WITHOUT_F32';

function toClientMessage(code: DepthDiagCode | null): string {
  switch (code) {
    case 'DEPTH_VARIANT_NONE_WITH_ARTIFACTS':
      return 'Depth variant is none but depth artifacts are present.';
    case 'DEPTH_VARIANT_JSON_WITHOUT_ARTIFACTS':
      return 'Depth variant expects depth artifacts but none were found.';
    case 'DEPTH_VARIANT_JSONF32_WITHOUT_F32':
      return 'Depth variant json+f32 requires .f32 sidecar.';
    default:
      return 'Unknown depth diagnostics issue.';
  }
}
```

## TS integration (barrel import)

Canonical typy możesz importować z centralnego barrel:

```ts
import type {
  DepthDiagnosticsCompatibilityReport,
  DepthDiagnosticsErrorBody,
  DepthDiagnosticsWarningBody,
} from '../src/engine';
```

Compile-time contract jest egzekwowany CI-like w `test:film-lab-export-gates`
przez krok `scripts/test-engine-types-usage-tsc.mjs` (`tsc --noEmit` na fixture typów).

## Type Safety Policy

Każdy nowy helper depth dodawany do publicznego API musi mieć:

- równoległą deklarację w `src/engine/filmLabExportManifestHelpers.d.ts`,
- re-export w `src/engine/index.d.ts` (public API surface),
- fixture pozytywny usage (`scripts/fixtures/types/depth-diagnostics-usage.ts`),
- fixture negatywny (`scripts/fixtures/types/depth-diagnostics-negative-expectations.ts`) z `@ts-expect-error`,
- zielony compile-time check: `npm run test:engine-types-usage-tsc`.

Pełna polityka: `docs/hme/TYPE-SAFETY-POLICY.md`.

## Kontrakt aktualny

- `manifest.export.depthProxyVariant`: `none | json | json+f32`
- `manifest.export.depthProxyPresent`: `boolean`
- `after_recipe.export.depthTraceVersion`: `1` (dla `variant: "after"`)
- `after_recipe.export.depthMapSource`: `string | null`
- `after_recipe.export.depthProxyDigest`: `string | null`

