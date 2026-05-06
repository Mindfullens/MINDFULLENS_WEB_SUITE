import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizeViteBase } from './scripts/lib/gh-pages-base.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function viteProcessEnvFlag(name) {
  const v = process.env[name];
  if (v == null) {
    return false;
  }
  const normalized = String(v).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * GHP *project page*: `base` = `normalizeViteBase(process.env.VITE_BASE)` (wspólnie z
 * `build:gh-pages` / `preview:gh-pages`, plik `scripts/lib/gh-pages-base.mjs`); w `App.jsx` → `import.meta.env.BASE_URL`.
 * `ML_DEV_OPEN` (np. `/film-lab` z `dev:perf`) — w CI wyłączone, jeśli jest `CI`.
 */
function devPreviewOpenPath() {
  if (process.env.CI) {
    return false;
  }
  const p = String(process.env.ML_DEV_OPEN ?? '').trim();
  return p.length > 0 ? p : false;
}

/** Na niektórych FS (np. zewnętrzny dysk, SMB) natywne zdarzenia `watch` zawodzą — wtedy `1` włącza polling. */
const devWatchPoll = viteProcessEnvFlag('VITE_FILMLAB_DEV_WATCH_POLL');

/** Short git SHA at config load (dev/prod) — w UI tylko w `import.meta.env.DEV` (buildInfo). */
function getFilmLabGitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      cwd: path.resolve(process.cwd()),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const execFileAsync = promisify(execFile);
const RAW_BACKEND_NAME = 'macOS RAW Bridge (QuickLook + sips)';
const RAW_COLOR_PIPELINE = Object.freeze({
  stage: 'srgb-linear-srgb-v1',
  inputEncoding: 'display-srgb',
  workingEncoding: 'scene-linear',
  outputEncoding: 'display-srgb',
  linearStageEnabled: true,
});
const RAW_PROBE_RESPONSE = {
  decoderInstalled: true,
  workerReady: true,
  backend: RAW_BACKEND_NAME,
  supportedFormats: [
    'dng',
    'nef',
    'nrw',
    'cr2',
    'cr3',
    'arw',
    'raf',
    'rw2',
    'orf',
    'pef',
    'iiq',
  ],
  colorPipeline: RAW_COLOR_PIPELINE,
};

function getSafeExtension(filename = '') {
  const extension = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return extension || '.raw';
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseSipsProperty(stdout = '', propertyName = '') {
  const safeProperty = String(propertyName || '').trim();
  if (!safeProperty) {
    return null;
  }

  const escapedProperty = safeProperty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(stdout || '').match(new RegExp(`${escapedProperty}:\\s*(\\d+)`));
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

async function readSourcePixelSize(inputPath) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/sips', [
      '-g',
      'pixelWidth',
      '-g',
      'pixelHeight',
      inputPath,
    ]);
    const width = parseSipsProperty(stdout, 'pixelWidth');
    const height = parseSipsProperty(stdout, 'pixelHeight');

    if (!width || !height) {
      return null;
    }

    return { width, height };
  } catch {
    return null;
  }
}

async function decodeRawBufferViaSips(inputPath, outputPath, _renderIntent = 'preview') {
  // Fidelity first:
  // Always decode full-frame PNG and let the web app downscale for preview.
  // This avoids backend-dependent preview framing differences.
  const decodeArgs = ['-s', 'format', 'png', inputPath, '--out', outputPath];
  await execFileAsync('/usr/bin/sips', decodeArgs);
  const buffer = await fsPromises.readFile(outputPath);
  if (!buffer?.length) {
    throw new Error('sips produced an empty PNG output.');
  }
  const detectedMime = detectImageMimeFromBuffer(buffer);
  return {
    buffer,
    backend: 'macOS ImageIO / sips',
    mimeType: detectedMime || 'image/png',
  };
}

function detectImageMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

async function decodeRawBufferViaQuickLook(inputPath, outputDir, size = 1800) {
  const args = ['-t', '-s', String(Math.max(256, Number(size) || 1800)), '-o', outputDir, inputPath];
  await execFileAsync('/usr/bin/qlmanage', args);
  const entries = await fsPromises.readdir(outputDir, { withFileTypes: true });
  const thumbnailCandidates = entries
    .filter((entry) => entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name))
    .map((entry) => entry.name);

  if (!thumbnailCandidates.length) {
    throw new Error('QuickLook did not produce a thumbnail file.');
  }

  let newestPath = null;
  let newestMtimeMs = -1;
  for (const name of thumbnailCandidates) {
    const candidatePath = path.join(outputDir, name);
    const stats = await fsPromises.stat(candidatePath);
    const mtimeMs = Number(stats?.mtimeMs) || 0;
    if (mtimeMs >= newestMtimeMs) {
      newestMtimeMs = mtimeMs;
      newestPath = candidatePath;
    }
  }

  if (!newestPath) {
    throw new Error('QuickLook generated files but none could be selected.');
  }

  const buffer = await fsPromises.readFile(newestPath);
  if (!buffer?.length) {
    throw new Error('QuickLook produced an empty thumbnail output.');
  }
  const detectedMime = detectImageMimeFromBuffer(buffer);
  return {
    buffer,
    backend: 'macOS QuickLook / qlmanage',
    mimeType: detectedMime || (newestPath.toLowerCase().endsWith('.jpg') || newestPath.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png'),
  };
}

async function decodeRawBuffer(body, filename, renderIntent = 'preview', backendPreference = 'auto') {
  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'mindfullens-raw-'));
  const inputPath = path.join(tempDir, `input${getSafeExtension(filename)}`);
  const outputPath = path.join(tempDir, 'preview.png');

  try {
    await fsPromises.writeFile(inputPath, body);
    const sourceSize = await readSourcePixelSize(inputPath);
    const safePreference = String(backendPreference || '')
      .trim()
      .toLowerCase();
    const quickLookSize = renderIntent === 'full' ? 3000 : 2400;
    const tryQuickLook = () => decodeRawBufferViaQuickLook(inputPath, tempDir, quickLookSize);
    const trySips = () => decodeRawBufferViaSips(inputPath, outputPath, renderIntent);
    const attempts =
      safePreference === 'sips'
        ? [trySips, tryQuickLook]
        : safePreference === 'quicklook'
          ? [tryQuickLook, trySips]
          : [trySips, tryQuickLook];

    const failures = [];
    for (const attempt of attempts) {
      try {
        const decoded = await attempt();
        return {
          ...decoded,
          sourceWidth: Number(sourceSize?.width) || null,
          sourceHeight: Number(sourceSize?.height) || null,
        };
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(
      `No RAW backend produced a usable preview (${failures.join(' | ') || 'unknown reason'}).`
    );
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
}

function stripBasePrefix(url) {
  if (!url) return url;
  const match = url.match(/^(\/[^/]+)(\/__raw\/.*)$/);
  return match ? match[2] : url;
}

function rawDecodeMiddleware() {
  return async (req, res, next) => {
    const normalizedUrl = stripBasePrefix(req.url);

    if (!normalizedUrl?.startsWith('/__raw/')) {
      next();
      return;
    }

    console.log(`[raw-bridge] ${req.method} ${req.url} -> ${normalizedUrl}`);

    if (req.method === 'GET' && normalizedUrl === '/__raw/probe') {
      sendJson(res, 200, RAW_PROBE_RESPONSE);
      return;
    }

    if (req.method === 'POST' && normalizedUrl === '/__raw/decode') {
      try {
        const body = await collectRequestBody(req);
        const filename = String(req.headers['x-file-name'] || `upload-${randomUUID()}.raw`);
        const renderIntent = String(req.headers['x-render-intent'] || 'preview');

        if (!body.length) {
          sendJson(res, 400, {
            error: {
              code: 'RAW_EMPTY_UPLOAD',
              message: 'Nie otrzymano danych pliku RAW/DNG do dekodowania.',
            },
            capabilities: RAW_PROBE_RESPONSE,
          });
          return;
        }

        const backendPreference = String(req.headers['x-raw-backend-preference'] || 'auto');
        const decodeResult = await decodeRawBuffer(body, filename, renderIntent, backendPreference);
        const detectedMime = detectImageMimeFromBuffer(decodeResult.buffer);
        const outputMime = detectedMime || decodeResult.mimeType || 'image/png';
        res.statusCode = 200;
        res.setHeader('Content-Type', outputMime);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Raw-Backend', decodeResult.backend || RAW_BACKEND_NAME);
        res.setHeader('X-Raw-Color-Stage', RAW_COLOR_PIPELINE.stage);
        res.setHeader('X-Raw-Input-Encoding', RAW_COLOR_PIPELINE.inputEncoding);
        res.setHeader('X-Raw-Output-Encoding', RAW_COLOR_PIPELINE.outputEncoding);
        if (Number.isFinite(Number(decodeResult.sourceWidth)) && Number(decodeResult.sourceWidth) > 0) {
          res.setHeader('X-Raw-Source-Width', String(Math.round(Number(decodeResult.sourceWidth))));
        }
        if (Number.isFinite(Number(decodeResult.sourceHeight)) && Number(decodeResult.sourceHeight) > 0) {
          res.setHeader('X-Raw-Source-Height', String(Math.round(Number(decodeResult.sourceHeight))));
        }
        res.setHeader(
          'X-Raw-Linear-Stage-Enabled',
          RAW_COLOR_PIPELINE.linearStageEnabled ? '1' : '0'
        );
        res.end(decodeResult.buffer);
        return;
      } catch (error) {
        sendJson(res, 422, {
          error: {
            code: 'RAW_DECODE_FAILED',
            message:
              error instanceof Error
                ? `Dekoder RAW macOS nie zdołał otworzyć tego pliku: ${error.message}`
                : 'Dekoder RAW macOS nie zdołał otworzyć tego pliku.',
          },
          capabilities: RAW_PROBE_RESPONSE,
        });
        return;
      }
    }

    sendJson(res, 404, {
      error: {
        code: 'RAW_ROUTE_NOT_FOUND',
        message: 'Nie znaleziono żądanego endpointu RAW.',
      },
      capabilities: RAW_PROBE_RESPONSE,
    });
  };
}

function mindfullensRawBridge() {
  const middleware = rawDecodeMiddleware();

  return {
    name: 'mindfullens-raw-bridge',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/**
 * Vite przenosi <script type="module"> do head i w buildzie usuwa atrybuty z oryginalnego index.html
 * (m.in. fetchpriority) — wstawiamy `fetchpriority="high"` na wejściowy bundel SPA, żeby ograniczyć
 * rywalizację o pasmo i ustawić jawnie priorytet sieci.
 */
function entryModuleScriptFetchPriority() {
  return {
    name: 'mindfullens-entry-module-fetchpriority',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/<script\b[^>]*\btype="module"[^>]*>/i, (tag) => {
          if (/\bfetchpriority\s*=/i.test(tag)) {
            return tag;
          }
          return tag.replace(/>$/, ' fetchpriority="high">');
        });
      },
    },
  };
}

/** GitHub Pages and similar hosts: serve SPA for unknown paths (e.g. /film-lab) via 404.html. */
function copyDistIndexTo404Plugin() {
  return {
    name: 'mindfullens-copy-dist-index-to-404',
    closeBundle() {
      const root = path.resolve(process.cwd(), 'dist');
      const indexPath = path.join(root, 'index.html');
      const notFoundPath = path.join(root, '404.html');
      try {
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath);
        }
      } catch {
        // ignore
      }
    },
  };
}

export default defineConfig({
  /** SPA — `/film-lab` i inne ścieżki klienckie muszą padać na `index.html` (dev + preview). */
  appType: 'spa',
  base: normalizeViteBase(process.env.VITE_BASE ?? ''),
  /** `react-window` (CJS/exports) — jawny preload dla spójnego rozwiązania eksportów w dev i buildzie. */
  optimizeDeps: {
    include: ['react-window'],
  },
  /**
   * Wymuszenie `dist/index.esm.js` — Rollup w CI potrafił wskazywać inny plik w `dist/`
   * (log: „not exported” z `react-window.js`), choć pakiet deklaruje `module` → `index.esm.js`.
   */
  resolve: {
    alias: {
      'react-window': path.resolve(__dirname, 'node_modules/react-window/dist/index.esm.js'),
    },
  },
  define: {
    'import.meta.env.VITE_FILM_LAB_GIT_SHA': JSON.stringify(getFilmLabGitShortSha()),
  },
  /**
   * Worker jako ES modules — pozwala na wiele chunków (dynamic import `libraw-wasm` w RAW workerze).
   * Opcja jest na poziomie głównym konfiguracji (`config.worker`), nie w `build`.
   */
  worker: {
    format: 'es',
  },
  plugins: [react(), mindfullensRawBridge(), entryModuleScriptFetchPriority(), copyDistIndexTo404Plugin()],
  server: {
    host: true,
    port: 4174,
    strictPort: true,
    open: devPreviewOpenPath(),
    /** Zezwól na dowolny `Host` (IP LAN, `.local`, itd.) — inaczej Vite może zwracać 403. */
    allowedHosts: true,
    ...(devWatchPoll
      ? {
          watch: {
            usePolling: true,
            interval: 1000,
          },
        }
      : {}),
  },
  preview: {
    host: true,
    port: 4174,
    strictPort: true,
    open: devPreviewOpenPath(),
    allowedHosts: true,
  },
  build: {
    sourcemap: false,
  },
  esbuild: {
    // Gdy `VITE_FILMLAB_BATCH_PERF=1` przy `vite build`, zostawiamy `console` (logi [FilmLab][BatchPerf] w preview:perf).
    drop: viteProcessEnvFlag('VITE_FILMLAB_BATCH_PERF') ? [] : ['console', 'debugger'],
    legalComments: 'none',
  },
});
