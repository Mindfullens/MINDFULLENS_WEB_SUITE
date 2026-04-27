import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MANIFEST_RELATIVE = 'data/raw/reference/reference-manifest.json';
const DEFAULT_REPORTS_RELATIVE = 'data/raw/reference/reports';
const DEFAULT_MIN_ITEMS = 30;
const DEFAULT_THRESHOLDS = Object.freeze({
  maxHighlightClipRatio: 0.12,
  maxShadowClipRatio: 0.16,
  maxAbMeanDelta: 24,
  allowBlackGuard: false,
  allowSuspectedBlackFrame: false,
});

function resolveProjectRoot() {
  const currentFilePath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFilePath), '..');
}

function parseArgs(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST_RELATIVE,
    reportsDir: DEFAULT_REPORTS_RELATIVE,
    minItems: DEFAULT_MIN_ITEMS,
    /** Gdy `true` — nie łącz z poprzednim manifestem (czysta regeneracja expected/thresholds z raportów). */
    noMerge: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--no-merge') {
      options.noMerge = true;
      continue;
    }
    if (current === '--manifest' && argv[index + 1]) {
      options.manifest = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === '--reports-dir' && argv[index + 1]) {
      options.reportsDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === '--min' && argv[index + 1]) {
      const numeric = Number(argv[index + 1]);
      if (Number.isFinite(numeric) && numeric > 0) {
        options.minItems = Math.max(1, Math.floor(numeric));
      }
      index += 1;
      continue;
    }
  }

  return options;
}

function toFiniteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function formatJson(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function listJsonReports(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.json') &&
        !entry.name.startsWith('._')
    )
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right, 'en'));
}

/**
 * Pola gate'a DCP/ICC v0 / kolorymetryki — z DIAG (`pipeline.rawColorimetry` + `pipeline.info.capabilities`).
 * LibRaw (`librawDevelopSettings`, `librawMetadataSummary`) tylko gdy obecne w raporcie.
 */
function buildColorimetryExpected(reportPayload) {
  const caps = reportPayload?.pipeline?.info?.capabilities ?? {};
  const rawCm = reportPayload?.pipeline?.rawColorimetry ?? null;
  const probe =
    caps?.rawProbeSnapshot && typeof caps.rawProbeSnapshot === 'object'
      ? caps.rawProbeSnapshot
      : null;
  const stage =
    (rawCm?.colorPipeline?.stage ?? caps?.colorPipeline?.stage ?? probe?.colorPipeline?.stage ?? null)
      ?.toString?.()
      .trim() || null;
  const adapterRaw =
    rawCm?.decodeAdapterId ?? caps?.rawDecodeAdapter ?? probe?.rawDecodeAdapter ?? null;
  const adapter =
    adapterRaw != null && String(adapterRaw).trim() !== '' ? String(adapterRaw).trim() : null;

  /** @type {Record<string, unknown>} */
  const out = {};
  if (stage) {
    out.colorPipelineStage = stage;
  }
  if (adapter) {
    out.rawDecodeAdapter = adapter;
  }

  const dev = rawCm?.librawDevelopSettings ?? caps?.librawDevelopSettings ?? null;
  if (dev && typeof dev === 'object') {
    const mx = dev.useCameraMatrix;
    if (Number.isFinite(Number(mx))) {
      out.librawUseCameraMatrix = Math.floor(Number(mx));
    }
    const cp = dev.cameraProfile;
    if (cp != null && String(cp).trim() !== '') {
      const low = String(cp).trim().toLowerCase();
      out.librawCameraProfile = low === 'embed' ? 'embed' : low;
    }
  }

  const summary = rawCm?.librawMetadataSummary ?? caps?.librawMetadataSummary ?? null;
  if (summary && typeof summary === 'object') {
    const make = summary.make;
    const model = summary.model;
    if (make != null && String(make).trim() !== '') {
      out.librawMake = String(make).trim();
    }
    if (model != null && String(model).trim() !== '') {
      out.librawModel = String(model).trim();
    }
  }

  return out;
}

function buildReferenceEntry(projectRoot, absoluteReportPath) {
  const fileName = path.basename(absoluteReportPath);
  const id = fileName.replace(/\.json$/i, '');
  let reportPayload = null;
  try {
    reportPayload = JSON.parse(fs.readFileSync(absoluteReportPath, 'utf8'));
  } catch (_error) {
    console.warn(`WARN  Pomijam uszkodzony/nie-JSON raport: ${fileName}`);
    return null;
  }
  const pipelineKind = reportPayload?.pipeline?.info?.pipelineKind;
  const qualityQa = reportPayload?.render?.qualityQa ?? null;
  if (pipelineKind !== 'raw' || !qualityQa) {
    return null;
  }

  const selectedBackend = String(
    reportPayload?.pipeline?.rawBackendComparison?.selectedBackend ?? ''
  ).trim();
  const relativeReportPath = path.relative(projectRoot, absoluteReportPath).replaceAll('\\', '/');
  const metrics = qualityQa?.metrics ?? {};
  const colorimetryExpected = buildColorimetryExpected(reportPayload);
  const expected = {
    ...(selectedBackend ? { selectedBackend } : {}),
    ...colorimetryExpected,
  };

  return {
    id,
    report: relativeReportPath,
    expected,
    thresholds: {
      maxHighlightClipRatio:
        toFiniteOrNull(metrics?.highlightClipRatio) != null
          ? Math.max(DEFAULT_THRESHOLDS.maxHighlightClipRatio, Number(metrics.highlightClipRatio) * 1.35)
          : DEFAULT_THRESHOLDS.maxHighlightClipRatio,
      maxShadowClipRatio:
        toFiniteOrNull(metrics?.shadowClipRatio) != null
          ? Math.max(DEFAULT_THRESHOLDS.maxShadowClipRatio, Number(metrics.shadowClipRatio) * 1.35)
          : DEFAULT_THRESHOLDS.maxShadowClipRatio,
      maxAbMeanDelta:
        toFiniteOrNull(metrics?.abMeanDelta) != null
          ? Math.max(DEFAULT_THRESHOLDS.maxAbMeanDelta, Number(metrics.abMeanDelta) * 1.35)
          : DEFAULT_THRESHOLDS.maxAbMeanDelta,
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = resolveProjectRoot();
  const manifestPath = path.resolve(projectRoot, options.manifest);
  const reportsDirectory = path.resolve(projectRoot, options.reportsDir);

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.mkdirSync(reportsDirectory, { recursive: true });

  const existingManifest = readJsonIfExists(manifestPath);
  const existingThresholds =
    existingManifest?.defaultThresholds && typeof existingManifest.defaultThresholds === 'object'
      ? existingManifest.defaultThresholds
      : {};
  const reportFiles = listJsonReports(reportsDirectory);
  /** @type {Map<string, object>} */
  const prevByReport = new Map();
  if (!options.noMerge && Array.isArray(existingManifest?.references)) {
    for (const ref of existingManifest.references) {
      const key = String(ref?.report ?? '')
        .trim()
        .replaceAll('\\', '/');
      if (key) {
        prevByReport.set(key, ref);
      }
    }
  }

  const references = reportFiles
    .map((absolutePath) => {
      const entry = buildReferenceEntry(projectRoot, absolutePath);
      if (!entry) {
        return null;
      }
      const prev = prevByReport.get(entry.report);
      if (prev && typeof prev === 'object') {
        if (prev.expected && typeof prev.expected === 'object') {
          entry.expected = { ...prev.expected, ...entry.expected };
        }
        if (prev.thresholds && typeof prev.thresholds === 'object') {
          entry.thresholds = { ...entry.thresholds, ...prev.thresholds };
        }
      }
      return entry;
    })
    .filter(Boolean);

  const manifestPayload = {
    name: existingManifest?.name || 'mindfullens-raw-reference-v1-local',
    description:
      existingManifest?.description ||
      'Manifest generowany automatycznie z raportów DIAG JSON (RAW).',
    defaultThresholds: {
      ...DEFAULT_THRESHOLDS,
      ...existingThresholds,
    },
    references,
  };

  fs.writeFileSync(manifestPath, formatJson(manifestPayload), 'utf8');

  if (!options.noMerge && prevByReport.size > 0) {
    console.log(
      `INFO  Scalono expected/thresholds z poprzedniego manifestu (wpisy po ścieżce report). Pełna regeneracja: npm run raw:manifest:build:fresh`
    );
  }

  console.log(
    `OK  Zaktualizowano manifest RAW: ${path.relative(projectRoot, manifestPath)} (pozycji: ${references.length})`
  );
  if (references.length < options.minItems) {
    console.warn(
      `WARN  Masz ${references.length}/${options.minItems} raportów. Do bramki potrzeba minimum ${options.minItems}.`
    );
  } else {
    console.log(`OK  Minimalny próg ${options.minItems} raportów spełniony.`);
  }
}

main();
