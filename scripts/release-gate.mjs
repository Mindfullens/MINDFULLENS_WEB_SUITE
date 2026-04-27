import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const pluginLibRoot = path.resolve(
  projectRoot,
  'MindfulLens_System_Master',
  'lightroom_plugin',
  'MindfulLensFilmEngine.lrplugin',
  'lib'
);

const requiredFiles = ['FilmEngineConfig.lua', 'PublicCatalog.lua'];

async function existsNonEmpty(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

async function main() {
  const missing = [];

  for (const fileName of requiredFiles) {
    const fullPath = path.resolve(pluginLibRoot, fileName);
    const ok = await existsNonEmpty(fullPath);
    if (!ok) {
      missing.push(fullPath);
    }
  }

  if (missing.length > 0) {
    console.error('[release-gate] Missing required profile source files:');
    for (const entry of missing) {
      console.error(`- ${entry}`);
    }
    console.error(
      '[release-gate] Release is blocked until the files above are restored and committed.'
    );
    process.exit(1);
  }

  console.log('[release-gate] Profile source files are present.');
}

main().catch((error) => {
  console.error(`[release-gate] Unexpected error: ${error?.message || error}`);
  process.exit(1);
});
