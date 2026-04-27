import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const MIN_REFERENCE_ITEMS = 30;
const DEFAULT_THRESHOLDS = Object.freeze({
  maxHighlightClipRatio: 0.12,
  maxShadowClipRatio: 0.16,
  maxAbMeanDelta: 24,
  allowBlackGuard: false,
  allowSuspectedBlackFrame: false,
});
const TREND_REGRESSION_THRESHOLDS = Object.freeze({
  highlightClipRatio: { absolute: 0.002, relative: 0.15 },
  shadowClipRatio: { absolute: 0.003, relative: 0.15 },
  abMeanDelta: { absolute: 0.75, relative: 0.12 },
  riskScore: { absolute: 0.08, relative: 0.12 },
});

function formatOk(label) {
  console.log(`OK  ${label}`);
}

function formatWarn(label) {
  console.warn(`WARN  ${label}`);
}

function formatInfo(label) {
  console.log(`INFO  ${label}`);
}

function parseArgs(argv) {
  const args = [...argv];
  let manifest = 'data/raw/reference/reference-manifest.json';
  let outDir = 'data/raw/reference/out';
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '--manifest' && args[index + 1]) {
      manifest = args[index + 1];
      index += 1;
      continue;
    }
    if (current === '--out-dir' && args[index + 1]) {
      outDir = args[index + 1];
      index += 1;
    }
  }
  return { manifest, outDir };
}

function resolveProjectRoot() {
  const currentFilePath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFilePath), '..');
}

function toFiniteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function ensureBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function ratio(value, denominator, fallback = 0) {
  const numerator = Number(value);
  const divisor = Number(denominator);
  if (!Number.isFinite(numerator) || !Number.isFinite(divisor) || divisor <= 0) {
    return fallback;
  }
  return numerator / divisor;
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const finite = values.filter((item) => Number.isFinite(item));
  if (!finite.length) {
    return null;
  }
  return finite.reduce((acc, item) => acc + item, 0) / finite.length;
}

function min(values) {
  const finite = values.filter((item) => Number.isFinite(item));
  if (!finite.length) {
    return null;
  }
  return Math.min(...finite);
}

function max(values) {
  const finite = values.filter((item) => Number.isFinite(item));
  if (!finite.length) {
    return null;
  }
  return Math.max(...finite);
}

function toCsvValue(value) {
  if (value == null) {
    return '';
  }
  const asText = String(value);
  if (asText.includes(',') || asText.includes('"') || asText.includes('\n')) {
    return `"${asText.replaceAll('"', '""')}"`;
  }
  return asText;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTimestampSuffix(value = new Date()) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  const hour = String(value.getUTCHours()).padStart(2, '0');
  const minute = String(value.getUTCMinutes()).padStart(2, '0');
  const second = String(value.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function quantile(values, q) {
  const finite = values.filter((item) => Number.isFinite(item)).sort((a, b) => a - b);
  if (!finite.length) {
    return null;
  }
  const clampedQ = Math.max(0, Math.min(1, Number(q)));
  const idx = (finite.length - 1) * clampedQ;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return finite[lo];
  }
  const t = idx - lo;
  return finite[lo] * (1 - t) + finite[hi] * t;
}

function srgbToLinear01(v8) {
  const x = Math.max(0, Math.min(255, Number(v8))) / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function rgb8ToLab(r8, g8, b8) {
  const r = srgbToLinear01(r8);
  const g = srgbToLinear01(g8);
  const b = srgbToLinear01(b8);

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const f = (t) => (t > 0.008856451679035631 ? t ** (1 / 3) : 7.787037037037037 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function decodePngFile(filePath) {
  const raw = fs.readFileSync(filePath);
  return PNG.sync.read(raw, { colorType: 6 });
}

function getByPath(objectValue, dotPath) {
  const pathValue = String(dotPath ?? '').trim();
  if (!pathValue) {
    return undefined;
  }
  const segments = pathValue.split('.').map((item) => item.trim()).filter(Boolean);
  let current = objectValue;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function decodePngFromDataUrl(dataUrl, contextLabel) {
  const raw = String(dataUrl ?? '');
  assert.ok(raw.startsWith('data:image/png;base64,'), `${contextLabel} is not PNG data URL.`);
  const base64 = raw.slice('data:image/png;base64,'.length);
  const buffer = Buffer.from(base64, 'base64');
  return PNG.sync.read(buffer, { colorType: 6 });
}

function roundTo(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

function computeImageQualityComparison(projectRoot, entry) {
  const qc = entry?.qualityComparison ?? null;
  const candidatePath = String(qc?.candidateImage ?? '').trim();
  const referencePath = String(qc?.referenceImage ?? '').trim();
  const candidateReportPath = String(qc?.candidateReport ?? '').trim();
  const referenceReportPath = String(qc?.referenceReport ?? '').trim();
  const dataUrlPath = String(qc?.dataUrlPath ?? 'pipeline.rawBackendComparison.diffHeatmap.dataUrl').trim();
  const useImageFiles = candidatePath && referencePath;
  const useReportDataUrls = candidateReportPath && referenceReportPath;
  if (!useImageFiles && !useReportDataUrls) {
    return null;
  }

  let cand;
  let ref;
  let sourceMeta = null;
  if (useImageFiles) {
    const absoluteCandidate = path.resolve(projectRoot, candidatePath);
    const absoluteReference = path.resolve(projectRoot, referencePath);
    assert.ok(
      fs.existsSync(absoluteCandidate),
      `Entry "${entry?.id ?? 'unknown'}" missing candidate image: ${absoluteCandidate}`
    );
    assert.ok(
      fs.existsSync(absoluteReference),
      `Entry "${entry?.id ?? 'unknown'}" missing reference image: ${absoluteReference}`
    );
    cand = decodePngFile(absoluteCandidate);
    ref = decodePngFile(absoluteReference);
    sourceMeta = {
      mode: 'image-files',
      candidateImage: candidatePath.replaceAll('\\', '/'),
      referenceImage: referencePath.replaceAll('\\', '/'),
    };
  } else {
    const absoluteCandidateReport = path.resolve(projectRoot, candidateReportPath);
    const absoluteReferenceReport = path.resolve(projectRoot, referenceReportPath);
    assert.ok(
      fs.existsSync(absoluteCandidateReport),
      `Entry "${entry?.id ?? 'unknown'}" missing candidate report: ${absoluteCandidateReport}`
    );
    assert.ok(
      fs.existsSync(absoluteReferenceReport),
      `Entry "${entry?.id ?? 'unknown'}" missing reference report: ${absoluteReferenceReport}`
    );
    const candidatePayload = readJsonFile(absoluteCandidateReport);
    const referencePayload = readJsonFile(absoluteReferenceReport);
    const candDataUrl = getByPath(candidatePayload, dataUrlPath);
    const refDataUrl = getByPath(referencePayload, dataUrlPath);
    cand = decodePngFromDataUrl(candDataUrl, `Entry "${entry?.id ?? 'unknown'}" candidate ${dataUrlPath}`);
    ref = decodePngFromDataUrl(refDataUrl, `Entry "${entry?.id ?? 'unknown'}" reference ${dataUrlPath}`);
    sourceMeta = {
      mode: 'report-dataurl',
      dataUrlPath,
      candidateReport: candidateReportPath.replaceAll('\\', '/'),
      referenceReport: referenceReportPath.replaceAll('\\', '/'),
    };
  }
  const width = Math.min(Number(cand.width) || 0, Number(ref.width) || 0);
  const height = Math.min(Number(cand.height) || 0, Number(ref.height) || 0);
  assert.ok(
    width > 0 && height > 0,
    `Entry "${entry?.id ?? 'unknown'}" invalid candidate/reference image dimensions.`
  );

  const deltaEs = [];
  const yCand = [];
  const yRef = [];
  const n = width * height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const iCand = (y * cand.width + x) * 4;
      const iRef = (y * ref.width + x) * 4;
      const rc = cand.data[iCand];
      const gc = cand.data[iCand + 1];
      const bc = cand.data[iCand + 2];
      const rr = ref.data[iRef];
      const gr = ref.data[iRef + 1];
      const br = ref.data[iRef + 2];

      const lc = rgb8ToLab(rc, gc, bc);
      const lr = rgb8ToLab(rr, gr, br);
      const dL = lc.l - lr.l;
      const dA = lc.a - lr.a;
      const dB = lc.b - lr.b;
      deltaEs.push(Math.sqrt(dL * dL + dA * dA + dB * dB));

      yCand.push(srgbToLinear01(rc) * 0.2126 + srgbToLinear01(gc) * 0.7152 + srgbToLinear01(bc) * 0.0722);
      yRef.push(srgbToLinear01(rr) * 0.2126 + srgbToLinear01(gr) * 0.7152 + srgbToLinear01(br) * 0.0722);
    }
  }

  const meanDeltaE = mean(deltaEs);
  const p95DeltaE = quantile(deltaEs, 0.95);

  const muX = mean(yCand) ?? 0;
  const muY = mean(yRef) ?? 0;
  let varX = 0;
  let varY = 0;
  let cov = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = yCand[i] - muX;
    const dy = yRef[i] - muY;
    varX += dx * dx;
    varY += dy * dy;
    cov += dx * dy;
  }
  const denom = Math.max(1, n - 1);
  varX /= denom;
  varY /= denom;
  cov /= denom;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  const ssim = ((2 * muX * muY + c1) * (2 * cov + c2)) / ((muX * muX + muY * muY + c1) * (varX + varY + c2));

  return {
    ...sourceMeta,
    comparedWidth: width,
    comparedHeight: height,
    samples: n,
    deltaEMean: toFiniteOrNull(meanDeltaE),
    deltaEP95: toFiniteOrNull(p95DeltaE),
    ssim: toFiniteOrNull(ssim),
  };
}

function computeSuggestedThresholdsFromQuality(qualityComparison) {
  if (!qualityComparison || typeof qualityComparison !== 'object') {
    return null;
  }
  const meanDelta = toFiniteOrNull(qualityComparison.deltaEMean);
  const p95Delta = toFiniteOrNull(qualityComparison.deltaEP95);
  const ssim = toFiniteOrNull(qualityComparison.ssim);
  if (meanDelta == null && p95Delta == null && ssim == null) {
    return null;
  }
  return {
    maxDeltaEMean: meanDelta == null ? null : roundTo(Math.max(1, meanDelta * 1.15), 3),
    maxDeltaEP95: p95Delta == null ? null : roundTo(Math.max(2, p95Delta * 1.15), 3),
    minSsim:
      ssim == null
        ? null
        : roundTo(Math.max(0, Math.min(1, ssim - Math.max(0.02, (1 - ssim) * 0.1))), 4),
  };
}

function buildMiniBar(value, maxValue) {
  const numeric = Number(value);
  const max = Number(maxValue);
  if (!Number.isFinite(numeric) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (numeric / max) * 100));
}

function buildDeltaCell(delta, digits = 3) {
  if (!Number.isFinite(delta)) {
    return 'n/a';
  }
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(digits)}`;
}

function buildTrendHtml({ payload, summary, comparison }) {
  const topRisk = [...summary].sort((left, right) => right.riskScore - left.riskScore).slice(0, 12);
  const maxRisk = Math.max(1, ...topRisk.map((item) => Number(item.riskScore) || 0));
  const maxDelta = Math.max(1, ...topRisk.map((item) => Number(item.abMeanDelta) || 0));
  const generatedAt = escapeHtml(payload.generatedAt);
  const previousGeneratedAt = escapeHtml(comparison?.previousGeneratedAt || 'n/a');
  const rows = topRisk
    .map((item) => {
      const riskBar = buildMiniBar(item.riskScore, maxRisk);
      const deltaBar = buildMiniBar(item.abMeanDelta ?? 0, maxDelta);
      return `<tr>
        <td>${escapeHtml(item.id)}</td>
        <td>${escapeHtml(item.selectedBackend || 'n/a')}</td>
        <td>
          <div class="bar-wrap"><div class="bar risk" style="width:${riskBar.toFixed(1)}%"></div></div>
          <span>${Number(item.riskScore).toFixed(3)}</span>
        </td>
        <td>
          <div class="bar-wrap"><div class="bar delta" style="width:${deltaBar.toFixed(1)}%"></div></div>
          <span>${item.abMeanDelta == null ? 'n/a' : Number(item.abMeanDelta).toFixed(3)}</span>
        </td>
        <td>${item.highlightClipRatio == null ? 'n/a' : Number(item.highlightClipRatio).toFixed(5)}</td>
        <td>${item.shadowClipRatio == null ? 'n/a' : Number(item.shadowClipRatio).toFixed(5)}</td>
        <td>${item.deltaEMean == null ? 'n/a' : Number(item.deltaEMean).toFixed(3)}</td>
        <td>${item.ssim == null ? 'n/a' : Number(item.ssim).toFixed(4)}</td>
      </tr>`;
    })
    .join('\n');

  const trend = payload.trendSummary ?? {};
  const delta = comparison?.trendDelta ?? {};
  const alerts = Array.isArray(comparison?.alerts) ? comparison.alerts : [];
  const metricCard = (label, item, digits) => `
    <div class="card">
      <h3>${escapeHtml(label)}</h3>
      <p>min: ${Number(item?.min ?? 0).toFixed(digits)}</p>
      <p>avg: ${Number(item?.mean ?? 0).toFixed(digits)}</p>
      <p>max: ${Number(item?.max ?? 0).toFixed(digits)}</p>
    </div>`;
  const metricDeltaRow = (label, field, digits) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${buildDeltaCell(Number(delta?.[field]?.meanDelta), digits)}</td>
      <td>${buildDeltaCell(Number(delta?.[field]?.meanDeltaPct), 2)}%</td>
      <td>${escapeHtml(delta?.[field]?.direction ?? 'n/a')}</td>
    </tr>`;
  const alertRows = alerts.length
    ? alerts.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')
    : '<li>Brak regresji względem poprzedniego snapshotu.</li>';

  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mindfullens RAW Trend Report</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0d1020;color:#e8ebf8;margin:0;padding:24px}
    h1{margin:0 0 8px;font-size:22px}
    .muted{color:#a8b0d6;font-size:13px;margin-bottom:16px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:18px}
    .card{background:#151a32;border:1px solid #2a335f;border-radius:10px;padding:10px}
    .card h3{margin:0 0 6px;font-size:13px;color:#cdd4ff}
    .card p{margin:2px 0;font-size:12px;color:#aeb7e5}
    table{width:100%;border-collapse:collapse;background:#151a32;border:1px solid #2a335f;border-radius:10px;overflow:hidden}
    th,td{border-bottom:1px solid #232a50;padding:8px;font-size:12px;text-align:left;vertical-align:middle}
    th{color:#cdd4ff;background:#1a2140}
    tr:last-child td{border-bottom:none}
    .bar-wrap{width:130px;height:8px;background:#20284d;border-radius:999px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:8px}
    .bar{height:100%}
    .bar.risk{background:linear-gradient(90deg,#ff8a8a,#ff5353)}
    .bar.delta{background:linear-gradient(90deg,#f8d57f,#f0b33e)}
  </style>
</head>
<body>
  <h1>RAW Reference Trend</h1>
  <div class="muted">Generated: ${generatedAt} · Entries: ${payload.entryCount}</div>
  <div class="grid">
    ${metricCard('Highlight Clip Ratio', trend.highlightClipRatio, 5)}
    ${metricCard('Shadow Clip Ratio', trend.shadowClipRatio, 5)}
    ${metricCard('A/B Mean Delta', trend.abMeanDelta, 3)}
    ${metricCard('Risk Score', trend.riskScore, 3)}
  </div>
  <h2>Porównanie z poprzednim runem</h2>
  <div class="muted">Previous snapshot: ${previousGeneratedAt}</div>
  <table style="margin-bottom:14px">
    <thead>
      <tr>
        <th>Metryka</th>
        <th>Delta avg</th>
        <th>Delta avg %</th>
        <th>Kierunek</th>
      </tr>
    </thead>
    <tbody>
      ${metricDeltaRow('Highlight Clip Ratio', 'highlightClipRatio', 5)}
      ${metricDeltaRow('Shadow Clip Ratio', 'shadowClipRatio', 5)}
      ${metricDeltaRow('A/B Mean Delta', 'abMeanDelta', 3)}
      ${metricDeltaRow('Risk Score', 'riskScore', 3)}
    </tbody>
  </table>
  <h2>Alerty regresji</h2>
  <ul>${alertRows}</ul>
  <h2>Top risk entries</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Backend</th>
        <th>Risk</th>
        <th>ΔL</th>
        <th>Highlight</th>
        <th>Shadow</th>
        <th>ΔE mean</th>
        <th>SSIM</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

function readPreviousTrendSnapshot(projectRoot, outDir) {
  const absoluteOutDir = path.resolve(projectRoot, outDir);
  const latestJsonPath = path.join(absoluteOutDir, 'latest-summary.json');
  if (!fs.existsSync(latestJsonPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function computeMetricDelta(currentMetric, previousMetric) {
  const currentMean = toFiniteOrNull(currentMetric?.mean);
  const previousMean = toFiniteOrNull(previousMetric?.mean);
  if (currentMean == null || previousMean == null) {
    return {
      meanDelta: null,
      meanDeltaPct: null,
      direction: 'n/a',
      isRegression: false,
    };
  }
  const meanDelta = currentMean - previousMean;
  const meanDeltaPct = previousMean === 0 ? (meanDelta === 0 ? 0 : 100) : (meanDelta / previousMean) * 100;
  return {
    meanDelta,
    meanDeltaPct,
    direction: meanDelta > 0 ? 'worse' : meanDelta < 0 ? 'better' : 'stable',
    isRegression: false,
  };
}

function annotateRegression(metricName, metricDelta, previousMetric) {
  const threshold = TREND_REGRESSION_THRESHOLDS[metricName];
  const previousMean = toFiniteOrNull(previousMetric?.mean) ?? 0;
  const delta = toFiniteOrNull(metricDelta?.meanDelta);
  if (!threshold || delta == null) {
    return metricDelta;
  }
  const dynamic = Math.max(Number(threshold.absolute), Math.abs(previousMean) * Number(threshold.relative));
  return {
    ...metricDelta,
    isRegression: delta > dynamic,
  };
}

function computeTrendComparison(currentTrendSummary, previousSnapshot) {
  if (!previousSnapshot?.trendSummary) {
    return {
      previousGeneratedAt: null,
      trendDelta: {
        highlightClipRatio: computeMetricDelta(currentTrendSummary?.highlightClipRatio, null),
        shadowClipRatio: computeMetricDelta(currentTrendSummary?.shadowClipRatio, null),
        abMeanDelta: computeMetricDelta(currentTrendSummary?.abMeanDelta, null),
        riskScore: computeMetricDelta(currentTrendSummary?.riskScore, null),
      },
      alerts: [],
    };
  }

  const previousTrend = previousSnapshot.trendSummary;
  const trendDelta = {
    highlightClipRatio: annotateRegression(
      'highlightClipRatio',
      computeMetricDelta(currentTrendSummary?.highlightClipRatio, previousTrend?.highlightClipRatio),
      previousTrend?.highlightClipRatio
    ),
    shadowClipRatio: annotateRegression(
      'shadowClipRatio',
      computeMetricDelta(currentTrendSummary?.shadowClipRatio, previousTrend?.shadowClipRatio),
      previousTrend?.shadowClipRatio
    ),
    abMeanDelta: annotateRegression(
      'abMeanDelta',
      computeMetricDelta(currentTrendSummary?.abMeanDelta, previousTrend?.abMeanDelta),
      previousTrend?.abMeanDelta
    ),
    riskScore: annotateRegression(
      'riskScore',
      computeMetricDelta(currentTrendSummary?.riskScore, previousTrend?.riskScore),
      previousTrend?.riskScore
    ),
  };

  const alerts = Object.entries(trendDelta)
    .filter(([, value]) => Boolean(value?.isRegression))
    .map(([metricName, value]) => {
      const delta = Number(value?.meanDelta ?? 0);
      const pct = Number(value?.meanDeltaPct ?? 0);
      const sign = delta >= 0 ? '+' : '';
      return `${metricName}: regression avg ${sign}${delta.toFixed(5)} (${sign}${pct.toFixed(2)}%)`;
    });

  return {
    previousGeneratedAt: previousSnapshot?.generatedAt ?? null,
    trendDelta,
    alerts,
  };
}

function writeTrendArtifacts(projectRoot, outDir, summary, trendSummary, comparison) {
  const absoluteOutDir = path.resolve(projectRoot, outDir);
  fs.mkdirSync(absoluteOutDir, { recursive: true });

  const generatedAt = new Date();
  const timestampSuffix = formatTimestampSuffix(generatedAt);
  const payload = {
    schema: 'mindfullens.raw-reference-trend.v1',
    generatedAt: generatedAt.toISOString(),
    entryCount: summary.length,
    trendSummary,
    comparison,
    topRiskEntries: [...summary]
      .sort((left, right) => right.riskScore - left.riskScore)
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        reportPath: item.reportPath,
        selectedBackend: item.selectedBackend,
        riskScore: item.riskScore,
        highlightClipRatio: item.highlightClipRatio,
        shadowClipRatio: item.shadowClipRatio,
        abMeanDelta: item.abMeanDelta,
        blackGuard: item.blackGuard,
        suspectedBlackFrame: item.suspectedBlackFrame,
        rawRecovery2dEnabled: item.rawRecovery2dEnabled,
        rawRecovery2dPostHighlightClipRatio: item.rawRecovery2dPostHighlightClipRatio,
        rawRecovery2dPostShadowClipRatio: item.rawRecovery2dPostShadowClipRatio,
        deltaEMean: item.deltaEMean,
        deltaEP95: item.deltaEP95,
        ssim: item.ssim,
        suggestedThresholds: item.suggestedThresholds ?? null,
      })),
    qualitySuggestions: summary
      .filter((item) => item?.qualityComparison && item?.suggestedThresholds)
      .map((item) => ({
        id: item.id,
        reportPath: item.reportPath,
        qualityComparison: item.qualityComparison,
        suggestedThresholds: item.suggestedThresholds,
      })),
  };

  const jsonSerialized = `${JSON.stringify(payload, null, 2)}\n`;
  const latestJsonPath = path.join(absoluteOutDir, 'latest-summary.json');
  const stampedJsonPath = path.join(absoluteOutDir, `summary-${timestampSuffix}.json`);
  fs.writeFileSync(latestJsonPath, jsonSerialized, 'utf8');
  fs.writeFileSync(stampedJsonPath, jsonSerialized, 'utf8');

  const csvHeader = [
    'id',
    'reportPath',
    'selectedBackend',
    'riskScore',
    'highlightClipRatio',
    'shadowClipRatio',
    'abMeanDelta',
    'blackGuard',
    'suspectedBlackFrame',
    'rawRecovery2dEnabled',
    'rawRecovery2dPostHighlightClipRatio',
    'rawRecovery2dPostShadowClipRatio',
    'deltaEMean',
    'deltaEP95',
    'ssim',
  ];
  const csvRows = summary.map((item) =>
    [
      item.id,
      item.reportPath,
      item.selectedBackend,
      item.riskScore,
      item.highlightClipRatio,
      item.shadowClipRatio,
      item.abMeanDelta,
      item.blackGuard,
      item.suspectedBlackFrame,
      item.rawRecovery2dEnabled,
      item.rawRecovery2dPostHighlightClipRatio,
      item.rawRecovery2dPostShadowClipRatio,
      item.deltaEMean,
      item.deltaEP95,
      item.ssim,
    ]
      .map(toCsvValue)
      .join(',')
  );
  const csvSerialized = `${csvHeader.join(',')}\n${csvRows.join('\n')}\n`;
  const latestCsvPath = path.join(absoluteOutDir, 'latest-summary.csv');
  const stampedCsvPath = path.join(absoluteOutDir, `summary-${timestampSuffix}.csv`);
  fs.writeFileSync(latestCsvPath, csvSerialized, 'utf8');
  fs.writeFileSync(stampedCsvPath, csvSerialized, 'utf8');

  const htmlSerialized = buildTrendHtml({ payload, summary, comparison });
  const latestHtmlPath = path.join(absoluteOutDir, 'latest-summary.html');
  const stampedHtmlPath = path.join(absoluteOutDir, `summary-${timestampSuffix}.html`);
  fs.writeFileSync(latestHtmlPath, htmlSerialized, 'utf8');
  fs.writeFileSync(stampedHtmlPath, htmlSerialized, 'utf8');

  return {
    latestJsonPath: path.relative(projectRoot, latestJsonPath),
    stampedJsonPath: path.relative(projectRoot, stampedJsonPath),
    latestCsvPath: path.relative(projectRoot, latestCsvPath),
    stampedCsvPath: path.relative(projectRoot, stampedCsvPath),
    latestHtmlPath: path.relative(projectRoot, latestHtmlPath),
    stampedHtmlPath: path.relative(projectRoot, stampedHtmlPath),
  };
}

function evaluateEntry(projectRoot, entry, defaultThresholds) {
  const id = String(entry?.id ?? '').trim();
  assert.ok(id, 'Reference entry must include non-empty "id".');

  const reportPath = String(entry?.report ?? '').trim();
  assert.ok(reportPath, `Entry "${id}" must define "report" path.`);

  const absoluteReportPath = path.resolve(projectRoot, reportPath);
  assert.ok(fs.existsSync(absoluteReportPath), `Missing debug report for "${id}": ${absoluteReportPath}`);

  const report = readJsonFile(absoluteReportPath);
  const renderQa = report?.render?.qualityQa ?? null;
  assert.ok(renderQa, `Report "${reportPath}" is missing "render.qualityQa".`);

  const pipelineKind = report?.pipeline?.info?.pipelineKind;
  assert.equal(
    pipelineKind,
    'raw',
    `Entry "${id}" report is not RAW pipeline ("${pipelineKind ?? 'unknown'}").`
  );

  const thresholds = {
    ...defaultThresholds,
    ...(entry?.thresholds ?? {}),
  };

  const highlightClipRatio = toFiniteOrNull(renderQa?.metrics?.highlightClipRatio);
  const shadowClipRatio = toFiniteOrNull(renderQa?.metrics?.shadowClipRatio);
  const abMeanDelta = toFiniteOrNull(renderQa?.metrics?.abMeanDelta);
  const blackGuard = ensureBoolean(renderQa?.metrics?.blackOutputGuardTriggered, false);
  const suspectedBlackFrame = ensureBoolean(renderQa?.metrics?.suspectedBlackFrame, false);
  const rawRecovery2dEnabled = ensureBoolean(renderQa?.metrics?.rawRecovery2dEnabled, false);
  const rawRecovery2dPostHighlightClipRatio = toFiniteOrNull(
    renderQa?.metrics?.rawRecovery2dPostHighlightClipRatio
  );
  const rawRecovery2dPostShadowClipRatio = toFiniteOrNull(renderQa?.metrics?.rawRecovery2dPostShadowClipRatio);
  const qualityComparison = computeImageQualityComparison(projectRoot, entry);
  const deltaEMean = toFiniteOrNull(qualityComparison?.deltaEMean);
  const deltaEP95 = toFiniteOrNull(qualityComparison?.deltaEP95);
  const ssim = toFiniteOrNull(qualityComparison?.ssim);

  if (highlightClipRatio != null) {
    assert.ok(
      highlightClipRatio <= Number(thresholds.maxHighlightClipRatio),
      `Entry "${id}" highlight clip ${highlightClipRatio} exceeds ${thresholds.maxHighlightClipRatio}`
    );
  }
  if (shadowClipRatio != null) {
    assert.ok(
      shadowClipRatio <= Number(thresholds.maxShadowClipRatio),
      `Entry "${id}" shadow clip ${shadowClipRatio} exceeds ${thresholds.maxShadowClipRatio}`
    );
  }
  if (abMeanDelta != null) {
    assert.ok(
      abMeanDelta <= Number(thresholds.maxAbMeanDelta),
      `Entry "${id}" A/B mean delta ${abMeanDelta} exceeds ${thresholds.maxAbMeanDelta}`
    );
  }

  if (!ensureBoolean(thresholds.allowBlackGuard, false)) {
    assert.equal(blackGuard, false, `Entry "${id}" triggered black guard.`);
  }
  if (!ensureBoolean(thresholds.allowSuspectedBlackFrame, false)) {
    assert.equal(suspectedBlackFrame, false, `Entry "${id}" flagged suspected black frame.`);
  }
  const maxRecoveryPostHighlightClipRatio = toFiniteOrNull(thresholds?.maxRecoveryPostHighlightClipRatio);
  if (maxRecoveryPostHighlightClipRatio != null && rawRecovery2dPostHighlightClipRatio != null) {
    assert.ok(
      rawRecovery2dPostHighlightClipRatio <= maxRecoveryPostHighlightClipRatio,
      `Entry "${id}" recovery highlight residual ${rawRecovery2dPostHighlightClipRatio} exceeds ${maxRecoveryPostHighlightClipRatio}`
    );
  }
  const maxRecoveryPostShadowClipRatio = toFiniteOrNull(thresholds?.maxRecoveryPostShadowClipRatio);
  if (maxRecoveryPostShadowClipRatio != null && rawRecovery2dPostShadowClipRatio != null) {
    assert.ok(
      rawRecovery2dPostShadowClipRatio <= maxRecoveryPostShadowClipRatio,
      `Entry "${id}" recovery shadow residual ${rawRecovery2dPostShadowClipRatio} exceeds ${maxRecoveryPostShadowClipRatio}`
    );
  }
  const maxDeltaEMean = toFiniteOrNull(thresholds?.maxDeltaEMean);
  if (maxDeltaEMean != null && deltaEMean != null) {
    assert.ok(
      deltaEMean <= maxDeltaEMean,
      `Entry "${id}" DeltaE mean ${deltaEMean} exceeds ${maxDeltaEMean}`
    );
  }
  const maxDeltaEP95 = toFiniteOrNull(thresholds?.maxDeltaEP95);
  if (maxDeltaEP95 != null && deltaEP95 != null) {
    assert.ok(
      deltaEP95 <= maxDeltaEP95,
      `Entry "${id}" DeltaE p95 ${deltaEP95} exceeds ${maxDeltaEP95}`
    );
  }
  const minSsim = toFiniteOrNull(thresholds?.minSsim);
  if (minSsim != null && ssim != null) {
    assert.ok(ssim >= minSsim, `Entry "${id}" SSIM ${ssim} is below ${minSsim}`);
  }

  const expectedBackend = String(entry?.expected?.selectedBackend ?? '').trim();
  const selectedBackend = String(report?.pipeline?.rawBackendComparison?.selectedBackend ?? '').trim();
  if (expectedBackend) {
    assert.equal(
      selectedBackend.toLowerCase(),
      expectedBackend.toLowerCase(),
      `Entry "${id}" backend mismatch. expected=${expectedBackend}, got=${selectedBackend || 'n/a'}`
    );
  }

  const caps = report?.pipeline?.info?.capabilities ?? {};
  const rawCm = report?.pipeline?.rawColorimetry ?? null;
  const probe =
    caps?.rawProbeSnapshot && typeof caps.rawProbeSnapshot === 'object'
      ? caps.rawProbeSnapshot
      : null;
  const colorPipelineStage =
    rawCm?.colorPipeline?.stage ?? caps?.colorPipeline?.stage ?? probe?.colorPipeline?.stage ?? null;

  const expectedColorStage = String(entry?.expected?.colorPipelineStage ?? '').trim();
  if (expectedColorStage) {
    assert.equal(
      String(colorPipelineStage ?? '').trim().toLowerCase(),
      expectedColorStage.toLowerCase(),
      `Entry "${id}" colorPipelineStage mismatch: expected "${expectedColorStage}", got "${colorPipelineStage ?? 'n/a'}"`
    );
  }

  const expectedDecodeAdapter = String(entry?.expected?.rawDecodeAdapter ?? '').trim();
  if (expectedDecodeAdapter) {
    const gotAdapter = String(
      rawCm?.decodeAdapterId ?? caps?.rawDecodeAdapter ?? probe?.rawDecodeAdapter ?? ''
    ).trim();
    assert.equal(
      gotAdapter.toLowerCase(),
      expectedDecodeAdapter.toLowerCase(),
      `Entry "${id}" rawDecodeAdapter mismatch: expected "${expectedDecodeAdapter}", got "${gotAdapter || 'n/a'}"`
    );
  }
  const expectedRecovery2dEnabled = entry?.expected?.rawRecovery2dEnabled;
  if (expectedRecovery2dEnabled != null) {
    assert.equal(
      rawRecovery2dEnabled,
      ensureBoolean(expectedRecovery2dEnabled, false),
      `Entry "${id}" rawRecovery2dEnabled mismatch: expected ${Boolean(expectedRecovery2dEnabled)}, got ${rawRecovery2dEnabled}`
    );
  }

  const expectedUseMx = entry?.expected?.librawUseCameraMatrix;
  if (expectedUseMx != null && String(expectedUseMx).trim() !== '') {
    const gotMx = rawCm?.librawDevelopSettings?.useCameraMatrix ?? caps?.librawDevelopSettings?.useCameraMatrix;
    assert.ok(
      Number.isFinite(Number(gotMx)),
      `Entry "${id}" expected librawUseCameraMatrix=${expectedUseMx} but report has no numeric librawDevelopSettings.useCameraMatrix`
    );
    assert.equal(
      Number(gotMx),
      Number(expectedUseMx),
      `Entry "${id}" librawUseCameraMatrix mismatch: expected ${expectedUseMx}, got ${gotMx}`
    );
  }

  const expectedCamProf = entry?.expected?.librawCameraProfile;
  if (expectedCamProf != null && String(expectedCamProf).trim() !== '') {
    const expNorm = String(expectedCamProf).trim().toLowerCase();
    const wantEmbed = expNorm === 'embed' || expNorm === '1' || expNorm === 'true' || expNorm === 'yes';
    const wantNone =
      expNorm === 'none' || expNorm === 'off' || expNorm === '0' || expNorm === 'false' || expNorm === 'no';
    assert.ok(
      wantEmbed || wantNone,
      `Entry "${id}" librawCameraProfile must be embed|none|off (got "${expectedCamProf}")`
    );
    const gotProf = String(
      rawCm?.librawDevelopSettings?.cameraProfile ?? caps?.librawDevelopSettings?.cameraProfile ?? ''
    )
      .trim()
      .toLowerCase();
    const normalizedGot = gotProf === '' || gotProf === 'none' ? 'none' : gotProf;

    if (wantEmbed) {
      assert.equal(
        normalizedGot,
        'embed',
        `Entry "${id}" librawCameraProfile mismatch: expected embed, got "${gotProf || 'empty'}"`
      );
    } else {
      assert.ok(
        normalizedGot === 'none',
        `Entry "${id}" librawCameraProfile mismatch: expected none/off, got "${gotProf || 'empty'}"`
      );
    }
  }

  const expectedLibrawMake = String(entry?.expected?.librawMake ?? '').trim();
  if (expectedLibrawMake) {
    const summary = rawCm?.librawMetadataSummary ?? caps?.librawMetadataSummary ?? null;
    assert.equal(
      String(summary?.make ?? '').trim().toLowerCase(),
      expectedLibrawMake.toLowerCase(),
      `Entry "${id}" librawMake mismatch: expected "${expectedLibrawMake}", got "${summary?.make ?? 'n/a'}"`
    );
  }

  const expectedLibrawModel = String(entry?.expected?.librawModel ?? '').trim();
  if (expectedLibrawModel) {
    const summary = rawCm?.librawMetadataSummary ?? caps?.librawMetadataSummary ?? null;
    assert.equal(
      String(summary?.model ?? '').trim().toLowerCase(),
      expectedLibrawModel.toLowerCase(),
      `Entry "${id}" librawModel mismatch: expected "${expectedLibrawModel}", got "${summary?.model ?? 'n/a'}"`
    );
  }

  const riskScore =
    ratio(highlightClipRatio ?? 0, Number(thresholds.maxHighlightClipRatio), 0) * 0.32 +
    ratio(shadowClipRatio ?? 0, Number(thresholds.maxShadowClipRatio), 0) * 0.32 +
    ratio(abMeanDelta ?? 0, Number(thresholds.maxAbMeanDelta), 0) * 0.36 +
    (blackGuard ? 1.2 : 0) +
    (suspectedBlackFrame ? 1.2 : 0);

  return {
    id,
    reportPath: reportPath.replaceAll('\\', '/'),
    selectedBackend: selectedBackend || null,
    highlightClipRatio,
    shadowClipRatio,
    abMeanDelta,
    blackGuard,
    suspectedBlackFrame,
    rawRecovery2dEnabled,
    rawRecovery2dPostHighlightClipRatio,
    rawRecovery2dPostShadowClipRatio,
    riskScore,
    deltaEMean,
    deltaEP95,
    ssim,
    qualityComparison: qualityComparison ?? null,
    suggestedThresholds: computeSuggestedThresholdsFromQuality(qualityComparison),
  };
}

function main() {
  const { manifest, outDir } = parseArgs(process.argv.slice(2));
  const projectRoot = resolveProjectRoot();
  const manifestPath = path.resolve(projectRoot, manifest);

  assert.ok(
    fs.existsSync(manifestPath),
    `Brak manifestu RAW reference: ${manifestPath}. Przygotuj go na bazie data/raw/reference/reference-manifest.example.json`
  );

  const payload = readJsonFile(manifestPath);
  const references = Array.isArray(payload?.references) ? payload.references : [];
  assert.ok(
    references.length >= MIN_REFERENCE_ITEMS,
    `Manifest musi zawierać min. ${MIN_REFERENCE_ITEMS} pozycji (aktualnie: ${references.length}).`
  );

  const defaultThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(payload?.defaultThresholds ?? {}),
  };

  const summary = references.map((entry) => evaluateEntry(projectRoot, entry, defaultThresholds));
  const meanHighlight =
    summary.reduce((acc, item) => acc + (item.highlightClipRatio ?? 0), 0) / summary.length;
  const meanShadow = summary.reduce((acc, item) => acc + (item.shadowClipRatio ?? 0), 0) / summary.length;
  const meanAbDelta = summary.reduce((acc, item) => acc + (item.abMeanDelta ?? 0), 0) / summary.length;
  const highlightValues = summary.map((item) => item.highlightClipRatio).filter(Number.isFinite);
  const shadowValues = summary.map((item) => item.shadowClipRatio).filter(Number.isFinite);
  const deltaValues = summary.map((item) => item.abMeanDelta).filter(Number.isFinite);
  const riskValues = summary.map((item) => item.riskScore).filter(Number.isFinite);
  const trendSummary = {
    highlightClipRatio: {
      mean: mean(highlightValues),
      min: min(highlightValues),
      max: max(highlightValues),
    },
    shadowClipRatio: {
      mean: mean(shadowValues),
      min: min(shadowValues),
      max: max(shadowValues),
    },
    abMeanDelta: {
      mean: mean(deltaValues),
      min: min(deltaValues),
      max: max(deltaValues),
    },
    riskScore: {
      mean: mean(riskValues),
      min: min(riskValues),
      max: max(riskValues),
    },
  };
  const previousSnapshot = readPreviousTrendSnapshot(projectRoot, outDir);
  const comparison = computeTrendComparison(trendSummary, previousSnapshot);

  formatOk(`Validated RAW reference set entries: ${summary.length}`);
  formatOk(`Mean highlight clip ratio: ${meanHighlight.toFixed(5)}`);
  formatOk(`Mean shadow clip ratio: ${meanShadow.toFixed(5)}`);
  formatOk(`Mean A/B luma delta: ${meanAbDelta.toFixed(3)}`);
  formatOk(
    `Trend highlight ratio min/avg/max: ${(trendSummary.highlightClipRatio.min ?? 0).toFixed(5)} / ${(
      trendSummary.highlightClipRatio.mean ?? 0
    ).toFixed(5)} / ${(trendSummary.highlightClipRatio.max ?? 0).toFixed(5)}`
  );
  formatOk(
    `Trend shadow ratio min/avg/max: ${(trendSummary.shadowClipRatio.min ?? 0).toFixed(5)} / ${(
      trendSummary.shadowClipRatio.mean ?? 0
    ).toFixed(5)} / ${(trendSummary.shadowClipRatio.max ?? 0).toFixed(5)}`
  );
  formatOk(
    `Trend A/B delta min/avg/max: ${(trendSummary.abMeanDelta.min ?? 0).toFixed(3)} / ${(
      trendSummary.abMeanDelta.mean ?? 0
    ).toFixed(3)} / ${(trendSummary.abMeanDelta.max ?? 0).toFixed(3)}`
  );
  if (comparison.previousGeneratedAt) {
    formatInfo(`Compared with previous snapshot: ${comparison.previousGeneratedAt}`);
  } else {
    formatInfo('No previous snapshot found (first run for trend comparison).');
  }
  const deltaHighlights = comparison.trendDelta?.highlightClipRatio;
  const deltaShadows = comparison.trendDelta?.shadowClipRatio;
  const deltaAb = comparison.trendDelta?.abMeanDelta;
  const deltaRisk = comparison.trendDelta?.riskScore;
  formatInfo(
    `Delta avg highlight/shadow: ${buildDeltaCell(Number(deltaHighlights?.meanDelta), 5)} / ${buildDeltaCell(Number(deltaShadows?.meanDelta), 5)}`
  );
  formatInfo(
    `Delta avg A/B/risk: ${buildDeltaCell(Number(deltaAb?.meanDelta), 3)} / ${buildDeltaCell(Number(deltaRisk?.meanDelta), 3)}`
  );
  if (comparison.alerts.length) {
    formatWarn(`Trend regressions: ${comparison.alerts.join(' | ')}`);
  } else {
    formatOk('No trend regressions versus previous snapshot.');
  }

  const topRisk = [...summary].sort((left, right) => right.riskScore - left.riskScore).slice(0, 5);
  if (topRisk.length) {
    formatWarn(
      `Top risk entries: ${topRisk
        .map((item) => `${item.id}(${item.riskScore.toFixed(2)})`)
        .join(', ')}`
    );
  }

  const guarded = summary.filter((item) => item.blackGuard || item.suspectedBlackFrame);
  if (guarded.length) {
    formatWarn(`Entries with guard/suspected flags: ${guarded.map((entry) => entry.id).join(', ')}`);
  }

  const suggestions = summary.filter((item) => item?.qualityComparison && item?.suggestedThresholds);
  if (suggestions.length) {
    formatInfo(`Suggested quality thresholds generated for ${suggestions.length} entries:`);
    suggestions.slice(0, 12).forEach((item) => {
      const s = item.suggestedThresholds;
      formatInfo(
        `  ${item.id} -> maxDeltaEMean=${s?.maxDeltaEMean ?? 'n/a'}, maxDeltaEP95=${s?.maxDeltaEP95 ?? 'n/a'}, minSsim=${s?.minSsim ?? 'n/a'}`
      );
    });
  }

  const artifacts = writeTrendArtifacts(projectRoot, outDir, summary, trendSummary, comparison);
  formatOk(`Trend JSON: ${artifacts.latestJsonPath}`);
  formatOk(`Trend CSV: ${artifacts.latestCsvPath}`);
  formatOk(`Trend HTML: ${artifacts.latestHtmlPath}`);
}

try {
  main();
  console.log('PASS RAW reference gate');
} catch (error) {
  console.error('FAIL RAW reference gate');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
}
