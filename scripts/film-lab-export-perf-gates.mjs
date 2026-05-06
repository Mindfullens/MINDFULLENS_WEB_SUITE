/**
 * Lekki gate release dla eksportu / KPI — sprawdza obecność hooków w kodzie (bez uruchamiania przeglądarki).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FILM_LAB_KPI_AI_MASK_LATENCY_MS_TARGET,
  FILM_LAB_KPI_CRASH_FREE_TARGET_PCT,
  FILM_LAB_KPI_REFERENCE_MEGAPIXELS,
  FILM_LAB_KPI_SLIDER_LATENCY_MS_TARGET,
} from '../src/filmLab/filmLabPerfKpiTargets.js';
import { FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES } from '../src/engine/filmLabExportManifestReaderExamples.js';
import { assertFilmLabExportOptionalScenariosSemantics } from '../src/engine/filmLabExportManifestOptionalScenarioSemantics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function readUtf8(rel) {
  return fs.readFile(path.join(root, rel), 'utf8');
}

const packageJson = JSON.parse(await readUtf8('package.json'));
assert.equal(
  packageJson.scripts?.['test:film-lab-export-gates'],
  'node scripts/run-film-lab-export-gates.mjs',
  'package.json test:film-lab-export-gates must delegate to run-film-lab-export-gates.mjs'
);

assert.equal(FILM_LAB_KPI_SLIDER_LATENCY_MS_TARGET, 16);
assert.equal(FILM_LAB_KPI_AI_MASK_LATENCY_MS_TARGET, 1500);
assert.equal(FILM_LAB_KPI_CRASH_FREE_TARGET_PCT, 99.5);
assert.equal(FILM_LAB_KPI_REFERENCE_MEGAPIXELS, 45);

const exportGateSteps = await readUtf8('scripts/film-lab-export-gate-steps.mjs');
assert.match(
  exportGateSteps,
  /FILM_LAB_EXPORT_GATE_STEPS|film-lab-export-perf-gates\.mjs|test-film-lab-export-manifest-artifact-row\.mjs/,
  'Export gate steps module should list the full Film Lab export gate chain'
);
assert.match(
  exportGateSteps,
  /test-film-lab-export-format-i18n\.mjs/,
  'Export gate steps should include format i18n parity script'
);

const exportGateRunner = await readUtf8('scripts/run-film-lab-export-gates.mjs');
assert.match(exportGateRunner, /existsSync/, 'Export gate runner should verify each step file exists before spawn');

const exportDebug = await readUtf8('src/filmLab/useFilmLabExportDebugReport.js');
assert.match(
  exportDebug,
  /previewPathLabel|runtimeStatusBadge/,
  'Export debug report should surface preview path + runtime badge for perf tracing'
);

const onnxAdapter = await readUtf8('src/filmLab/onnx/filmLabOnnxRuntimeAdapter.js');
assert.match(onnxAdapter, /onnxruntime-web|getOnnxRuntimeWebLazy/, 'ONNX adapter should lazy-load runtime');

const maskIr = await readUtf8('src/filmLab/recipe/filmLabMaskGraphIR.js');
assert.match(maskIr, /MASK_GRAPH_COMBINE_OPS|migrateRecipeDocumentMaskGraphsToIrV1/, 'MaskGraphIR combine + migration present');

const exportEncode = await readUtf8('src/engine/filmLabExportEncode.js');
assert.match(
  exportEncode,
  /encodeFilmLabExportCanvas|image\/tiff/,
  'Film Lab export encoder should handle TIFF MIME'
);
assert.match(
  exportEncode,
  /FILM_LAB_EXPORT_RASTER_FORMAT_IDS|filmLabExportFormats/,
  'Film Lab export encoder should reference canonical raster format list in module docs'
);
assert.match(
  exportEncode,
  /normalizeFilmLabExportFileFormat/,
  'Film Lab export encoder should normalize fileFormat at entrypoints'
);
assert.match(
  exportEncode,
  /lossyQuality|resolveLossyCodecQuality/,
  'Film Lab export encoder should accept lossyQuality + resolver for JPEG/WebP/AVIF'
);
for (const fmt of ['png', 'webp', 'tiff', 'avif']) {
  assert.match(
    exportEncode,
    new RegExp(`fileFormat === '${fmt}'`),
    `Film Lab export encoder should include explicit branch for ${fmt}`
  );
}
assert.match(
  exportEncode,
  /mimeType: 'image\/jpeg'|'image\/jpeg', 0\.95|toDataURL\('image\/jpeg'/,
  'Film Lab export encoder should include JPEG output path'
);

const tiffExport = await readUtf8('src/engine/filmLabTiffExport.js');
assert.match(tiffExport, /imageDataToUncompressedRgbTiff/, 'TIFF encoder entrypoint present');

const manifestHelpers = await readUtf8('src/engine/filmLabExportManifestHelpers.js');
assert.match(
  manifestHelpers,
  /attachFilmLabExportManifestDigest|computeFilmLabExportManifestCapabilities|FILM_LAB_EXPORT_MANIFEST_DIGEST_VALIDATOR_HINTS/,
  'Export manifest helpers should centralize digest + capabilities'
);
assert.match(
  manifestHelpers,
  /See readerExamples for minimal artifact rows and root shapes before digest\./,
  'Manifest digest validator hints must stay aligned with reader contract'
);
assert.match(
  manifestHelpers,
  /manifest\.reader\.examples|manifest\.reader\.examples\.optional/,
  'Manifest capabilities helper should announce reader examples'
);
assert.match(
  manifestHelpers,
  /filmLabExportManifestConstants\.js/,
  'Manifest helpers should import shared manifest identity constants'
);
assert.match(
  manifestHelpers,
  /filmLabExportManifestReaderExamples\.js/,
  'Manifest helpers should import digest readerExamples blueprint'
);

const canonicalRoles = await readUtf8('src/engine/filmLabExportManifestCanonicalRoles.js');
assert.match(
  canonicalRoles,
  /export function canonicalFilmLabExportManifestArtifactRoleForVariant/,
  'Canonical roles module should define variant→artifactRole mapper (browser-safe)'
);

const manifestArtifactBuilder = await readUtf8('src/engine/filmLabExportManifestArtifact.js');
assert.match(
  manifestArtifactBuilder,
  /filmLabExportManifestCanonicalRoles\.js/,
  'Manifest artifact builder should import browser-safe canonical roles module'
);
assert.match(
  manifestArtifactBuilder,
  /canonicalFilmLabExportManifestArtifactRoleForVariant/,
  'Manifest artifact builder should enforce canonical variant→artifactRole mapping'
);

const exportFormats = await readUtf8('src/engine/filmLabExportFormats.js');
assert.match(
  exportFormats,
  /FILM_LAB_EXPORT_RASTER_FORMAT_IDS|normalizeFilmLabExportFileFormat/,
  'Film Lab export formats module should centralize raster IDs + normalization'
);
assert.match(
  exportFormats,
  /FILM_LAB_EXPORT_LOSSY_FORMAT_IDS|defaultFilmLabExportLossyQualityForFormat|manifestLossyQualityForFilmLabExport/,
  'Film Lab export formats module should declare lossy subset + default quality + manifest helper'
);
assert.match(
  exportFormats,
  /normalizeFilmLabExportModalFileFormat/,
  'Film Lab export formats should expose modal fileFormat normalizer (incl. experimental psd key)'
);
assert.match(
  exportFormats,
  /FILM_LAB_EXPORT_MODAL_FORMAT_IDS/,
  'Film Lab export formats should list modal pill IDs (raster + psd)'
);
assert.match(
  exportFormats,
  /FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_IDS/,
  'Film Lab export formats should list manifest digest optional-scenario fileFormat whitelist (raster + psd)'
);

const manifestConstants = await readUtf8('src/engine/filmLabExportManifestConstants.js');
assert.match(
  manifestConstants,
  /FILM_LAB_EXPORT_MANIFEST_SCHEMA = 'filmLab\.export\.manifest\.v1'/,
  'Export manifest schema constant must be defined once'
);
assert.match(
  manifestConstants,
  /FILM_LAB_EXPORT_MANIFEST_PROFILE = 'pro-export-audit-v1'/,
  'Export manifest profile constant must be pro-export-audit-v1'
);
assert.match(
  manifestConstants,
  /FILM_LAB_EXPORT_MANIFEST_SCHEMA_REFS/,
  'Export manifest schemaRefs bundle must exist'
);

const engineCore = await readUtf8('src/engine/useFilmLabEngine.js');
assert.match(
  engineCore,
  /filmLabExportManifestHelpers\.js/,
  'Single export should import shared manifest helpers'
);
assert.match(
  engineCore,
  /buildFilmLabExportManifestRootBase\(/,
  'Single export should build manifest root from shared helper'
);
assert.match(
  engineCore,
  /normalizeFilmLabExportFileFormat/,
  'Single export path should normalize raster fileFormat'
);
assert.match(
  engineCore,
  /encodeFilmLabExportPsdFromCanvas|exportAsPsd/,
  'Single export path should encode experimental PSD from export canvas when requested'
);
assert.match(
  engineCore,
  /manifestLossyQualityForFilmLabExport|manifestLossyQ/,
  'Single export manifest should record resolved lossyQuality for lossy codecs'
);
assert.match(
  engineCore,
  /buildFilmLabExportManifestArtifactRow/,
  'Single export should assemble manifest artifact rows via shared builder'
);
assert.match(
  engineCore,
  /buildLocalMaskStackSnapshot\(/,
  'Render path should share buildLocalMaskStackSnapshot with export'
);

const batchProcessorCore = await readUtf8('src/engine/batchProcessor.js');
assert.match(
  batchProcessorCore,
  /filmLabExportManifestHelpers\.js/,
  'Batch export should import shared manifest helpers'
);
assert.match(
  batchProcessorCore,
  /buildFilmLabExportManifestRootBase\(/,
  'Batch export should build manifest root from shared helper'
);
assert.match(
  batchProcessorCore,
  /manifestLossyQualityForFilmLabExport|batchManifestLossyQ/,
  'Batch export manifest should record resolved lossyQuality for lossy codecs'
);
assert.match(
  batchProcessorCore,
  /FILM_LAB_EXPORT_RASTER_FORMAT_IDS|normalizeFilmLabExportFileFormat/,
  'Batch processor should tie ZIP export to canonical raster formats (doc or normalization)'
);
assert.match(
  batchProcessorCore,
  /encodeFilmLabExportPsdFromCanvas|batchExportAsPsd/,
  'Batch export should encode PSD primary when fileFormat is psd'
);
assert.match(
  batchProcessorCore,
  /buildFilmLabExportManifestArtifactRow/,
  'Batch export should assemble manifest artifact rows via shared builder'
);

const exportModal = await readUtf8('src/FilmLabExportModal.jsx');
assert.match(
  exportModal,
  /FILM_LAB_EXPORT_MODAL_FORMAT_IDS/,
  'Export modal should build format pills from raster list plus PSD'
);
assert.match(
  exportModal,
  /EXPORT_MODAL_PREFS_KEY|normalizeFilmLabExportModalFileFormat|lastSizeProfile|lossyQuality|Escape/,
  'Export modal should persist prefs (format incl. PSD + lastSizeProfile + lossyQuality), normalize fileFormat, and handle Escape'
);
assert.match(
  exportModal,
  /document\.contains\(previous\)|restore.*focus|previous\.focus/,
  'Export modal should restore focus to the prior active element when closing'
);
assert.match(
  exportModal,
  /queryExportModalFocusables/,
  'Export modal should query focusable nodes for Tab containment within the dialog'
);
assert.match(
  exportModal,
  /role=["']button["']/,
  'Export modal size cards should be exposed as buttons for keyboard users'
);
assert.match(
  exportModal,
  /export-options-grid[\s\S]*role=["']group["']/,
  'Export modal should group size preset cards with an accessible group role'
);
assert.match(
  exportModal,
  /FILM_LAB_EXPORT_SIZE_PRESETS_HEADING_ID[\s\S]*aria-labelledby=\{FILM_LAB_EXPORT_SIZE_PRESETS_HEADING_ID\}/,
  'Export modal size preset group should be labelled by the visible section heading'
);
assert.match(
  exportModal,
  /FILM_LAB_EXPORT_FORMAT_HEADING_ID[\s\S]*aria-labelledby=\{FILM_LAB_EXPORT_FORMAT_HEADING_ID\}/,
  'Export modal format pill group should be labelled by the visible format subtitle'
);
assert.match(
  exportModal,
  /aria-pressed=\{fileFormat === id\}/,
  'Export modal format pills should expose selection state (aria-pressed)'
);

const filmLabPageCss = await readUtf8('src/filmLabPage.css');
assert.match(
  filmLabPageCss,
  /\.export-option-card:focus-visible/,
  'Film Lab page CSS should style keyboard focus on export size preset cards'
);
assert.match(
  filmLabPageCss,
  /\.export-format-pill:focus-visible/,
  'Film Lab page CSS should style keyboard focus on export format pills'
);
assert.match(
  filmLabPageCss,
  /\.export-modal-mask-row:has\(input:focus-visible\)/,
  'Film Lab page CSS should style keyboard focus on export modal checkbox rows'
);

const manifestReaderExamples = await readUtf8('src/engine/filmLabExportManifestReaderExamples.js');
assert.match(
  manifestReaderExamples,
  /FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES|schemaHint|examplesVersion|singleModeRootBeforeDigest|batchModeRootBeforeDigest|optionalScenarios/,
  'Export manifest should ship digest readerExamples blueprint'
);
assert.match(
  manifestReaderExamples,
  /FILM_LAB_EXPORT_RASTER_FORMAT_IDS|filmLabExportFormats/,
  'Reader examples notes should reference canonical raster format list'
);
assert.match(
  manifestReaderExamples,
  /singlePsdNoRecipe|batchPsdNoRecipe|singlePsdWithRecipe|batchPsdWithRecipe|singlePsdWithBeforeNoRecipe|batchPsdWithBeforeNoRecipe|singlePsdWithBeforeAndRecipe|batchPsdWithBeforeAndRecipe|singlePsdWithMaskNoRecipe|batchPsdWithMaskNoRecipe|singlePsdWithMaskAndRecipe|batchPsdWithMaskAndRecipe|singlePsdWithBeforeWithMaskAndRecipe|batchPsdWithBeforeWithMaskAndRecipe/,
  'Export manifest reader examples should ship PSD optional digest scenarios (no/recipe/before/mask)'
);
const optionalScenarioNames = Object.keys(
  FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES?.optionalScenarios ?? {}
);
assert.ok(optionalScenarioNames.length > 0, 'Export manifest should ship at least one optional scenario');
for (const scenarioName of optionalScenarioNames) {
  const escaped = scenarioName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(
    manifestReaderExamples,
    new RegExp(escaped),
    `Export manifest reader examples source should include optional scenario: ${scenarioName}`
  );
}
assertFilmLabExportOptionalScenariosSemantics(FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES.optionalScenarios);
assert.match(
  manifestReaderExamples,
  /validatorFlow: clone manifest -> remove manifestDigest -> JSON\.stringify with 2-space indent -> UTF-8 encode -> SHA-256 -> compare with manifest\.manifestDigest\.sha256/,
  'Export manifest reader examples should include validator flow blueprint'
);
assert.match(
  manifestReaderExamples,
  /optionalScenarios artifacts are intentionally minimal:/,
  'Export manifest reader examples should document minimal optional artifact contract'
);
assert.match(
  manifestReaderExamples,
  /contract matrix \(text\): minimal optional artifact -> stable keys variant\+artifactRole\+fileName\+mimeType \| full artifactRow -> append canonical runtime tail byteLength\+sha256\+exportSessionId\+pipelineKind\./,
  'Export manifest reader examples should document minimal vs full artifact contract matrix'
);
assert.match(
  manifestReaderExamples,
  /migration: historical exports may list variant before with artifactRole primary; canonical contract uses sidecar \(identify by variant=before, not by role\)\./,
  'Export manifest reader examples should document before artifactRole migration hint'
);

const batchPerfModule = await readUtf8('src/engine/batchPerf.js');
assert.match(
  batchPerfModule,
  /mindfullens\.batch-perf\.v1/,
  'Batch perf should emit a versioned schema id for release tooling'
);
assert.match(batchPerfModule, /measureAsync/, 'Batch perf should expose measureAsync');
assert.match(batchPerfModule, /IS_BATCH_PERF_ENABLED/, 'Batch perf should gate instrumentation on env flag');

const batchProcForPerf = await readUtf8('src/engine/batchProcessor.js');
assert.match(
  batchProcForPerf,
  /recordBatchPerfFile|logBatchPerfSummary/,
  'Batch processor should record batch perf entries'
);
assert.match(
  batchProcForPerf,
  /Free memory aggressively/,
  'Batch processor should document aggressive teardown between files (OOM safety)'
);

const proxyDownscale = await readUtf8('src/engine/proxySourceDownscale.js');
assert.match(
  proxyDownscale,
  /MAX_DOWNSCALE_OUTPUT_PIXELS/,
  'Proxy downscale should cap RGBA8 pixel budget (OOM guard)'
);
assert.match(
  proxyDownscale,
  /isDownscaleOutputWithinPixelBudget/,
  'Proxy downscale should expose pixel budget predicate for worker scheduling'
);

const tilePlan = await readUtf8('src/engine/proxyImageTilePlan.js');
assert.match(tilePlan, /planImageTileGrid/, 'Tile plan module should expose planImageTileGrid');

const proxyWorker = await readUtf8('src/engine/workers/proxyRenderWorker.js');
assert.match(
  proxyWorker,
  /planImageTileGrid|copyRgba8TileIntoBuffer/,
  'Proxy render worker should composite GPU output via tile grid helpers'
);
assert.match(proxyWorker, /tile_rgba8|tilesNeededAtEdge/, 'Proxy worker should document tiled readback path');

console.log('OK Film Lab export / perf gate hooks');
