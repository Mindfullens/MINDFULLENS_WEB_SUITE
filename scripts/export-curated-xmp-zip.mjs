import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const pluginRoot = path.resolve(
  projectRoot,
  'MindfulLens_System_Master',
  'lightroom_plugin',
  'MindfulLensFilmEngine.lrplugin'
);
const configPath = path.resolve(pluginRoot, 'lib', 'FilmEngineConfig.lua');
const exportsDir = path.resolve(projectRoot, 'exports');

const XMP_EXPORT_STRUCTURE = [
  {
    folder: '00_ESSENTIAL VIBES',
    entries: [
      ['00_01_Golden Mood – Warm Classic.xmp', 'gold_200'],
      ['00_02_Soft Portrait – Natural Glow.xmp', 'portra_400'],
      ['00_03_Cinematic Film – Soft Story.xmp', 'vision3_250d'],
      ['00_04_Vivid Colors – High Punch.xmp', 'ektar_100'],
      ['00_05_Classic B&W – Timeless Look.xmp', 'bw_hp5'],
      ['00_06_Neon Night – Cinematic Glow.xmp', 'cinestill_800t'],
    ],
  },
  {
    folder: '01_SKIN & PORTRAIT',
    entries: [
      ['01_01_Soft Portrait – Clean Skin.xmp', 'portra_160'],
      ['01_02_Soft Portrait – Natural Glow.xmp', 'portra_400'],
      ['01_03_Soft Portrait – Low Light Glow.xmp', 'portra_800'],
      ['01_04_Editorial Skin – Warm Soft.xmp', 'portra_400'],
      ['01_05_Pastel Portrait – Airy Look.xmp', 'fuji_400h_cc'],
      ['01_06_Studio Skin – Neutral Clean.xmp', 'pro_neg_std'],
      ['01_07_Dream Skin – Soft Fade.xmp', 'dreamneg'],
      ['01_08_Light Skin – Bright Air.xmp', 'senova_light'],
      ['01_09_Nostalgic Skin – Film Fade.xmp', 'fuji_nostalgic_neg'],
    ],
  },
  {
    folder: '02_CINEMATIC STORIES',
    entries: [
      ['02_01_Cinematic Film – Neutral Story.xmp', 'classic_cinema'],
      ['02_02_Cinematic Film – Warm Story.xmp', 'vision3_200t'],
      ['02_03_Daylight Cinema – Clean Film.xmp', 'cinestill_50d'],
      ['02_04_Indoor Cinema – Soft Warm.xmp', 'vision3_200t'],
      ['02_05_Night Cinema – Deep Shadows.xmp', 'vision3_500t'],
      ['02_06_Cinematic Punch – Film Boost.xmp', 'cinestill_x'],
      ['02_07_Pastel Cinema – Soft Vintage.xmp', 'asteroid_city_kodak_vision_t200_v1'],
      ['02_08_Pastel Cinema – Warm Retro.xmp', 'asteroid_city_kodak_vision_t200_v2'],
      ['02_09_Moody Cinema – Blue Shadows.xmp', 'blue_velvet_cinestill_50d'],
      ['02_10_Digital Cinema – Soft Film.xmp', 'sony_eterna'],
    ],
  },
  {
    folder: '03_COLOR ENERGY',
    entries: [
      ['03_01_Vivid Colors – High Punch.xmp', 'ektar_100'],
      ['03_02_Color Pop – Everyday Film.xmp', 'ultramax_400'],
      ['03_03_Balanced Color – Clean Tone.xmp', 'procolor'],
      ['03_04_Soft Color – Washed Film.xmp', 'chroma_fade'],
      ['03_05_Deep Red – Cinematic Tone.xmp', 'crimson'],
      ['03_06_Rose Tone – Soft Pink.xmp', 'rose_spectra'],
      ['03_07_Warm Everyday – Vintage Tone.xmp', 'colorplus_200'],
      ['03_08_Sunny Day – Light Warm.xmp', 'solara_100_cc'],
      ['03_09_Sun Kiss – Yellow Warm.xmp', 'amarelo_30d'],
      ['03_10_Luxury Color – Leica Feel.xmp', 'leicachrome'],
      ['03_11_Neutral Film – Soft Color.xmp', 'zetra_100'],
    ],
  },
  {
    folder: '04_NATURE & LIGHT',
    entries: [
      ['04_01_Landscape Pro – Rich Greens.xmp', 'velvia_pro'],
      ['04_02_Landscape Clean – Neutral Color.xmp', 'fuji_provia_100f'],
      ['04_03_Landscape Boost – Extra Clarity.xmp', 'fuji_provia_rx'],
      ['04_04_Nature Pop – Saturated Light.xmp', 'fuji_fortia_50'],
      ['04_05_Bright Nature – Clean Air.xmp', 'vektro100'],
    ],
  },
  {
    folder: '05_MONO MOOD',
    entries: [
      ['05_01_Classic B&W – Documentary Look.xmp', 'bw_hp5'],
      ['05_02_Street B&W – Hard Contrast.xmp', 'bw_trix_400'],
      ['05_03_Street B&W – High Grain.xmp', 'bw_trix_1600'],
      ['05_04_Fine Art B&W – Clean Sharp.xmp', 'bw_tmax_100'],
      ['05_05_Fine Art B&W – Balanced.xmp', 'bw_tmax_400'],
      ['05_06_Soft B&W – Smooth Tone.xmp', 'bw_delta_100'],
      ['05_07_Raw B&W – High Grain.xmp', 'bw_delta_3200'],
      ['05_08_Vintage B&W – Soft Fade.xmp', 'bw_foma_100'],
      ['05_09_Vintage B&W – Grain Mood.xmp', 'bw_foma_400'],
      ['05_10_Modern B&W – Clean Contrast.xmp', 'bw_xp2'],
      ['05_11_Cinema B&W – Film Look.xmp', 'bw_vision'],
      ['05_12_Retro B&W – Flat Tone.xmp', 'bw_kosmo_pan'],
      ['05_13_Artistic B&W – Experimental.xmp', 'acros_x'],
    ],
  },
  {
    folder: '06_NIGHT VIBES',
    entries: [
      ['06_01_Neon Night – Film Glow.xmp', 'cinestill_800t'],
      ['06_02_Night Street – Soft Grain.xmp', 'fuji_natura_1600'],
      ['06_03_Night Flash – Urban Look.xmp', 'fuji_superia_1600'],
      ['06_04_Street Color – Classic Film.xmp', 'fuji_superia_400'],
      ['06_05_Urban Mood – Clean Shadows.xmp', 'neo_max'],
      ['06_06_Evening Mood – Soft Dark.xmp', 'vespera'],
    ],
  },
  {
    folder: '07_CREATIVE LAB',
    entries: [
      ['07_01_Red Film – Warm Burn.xmp', 'redscale_ultra'],
      ['07_02_Infrared Dream – Red World.xmp', 'midred_infra'],
      ['07_03_Muted Mood – Low Contrast.xmp', 'zero_mute'],
      ['07_04_Experimental Color – Acid Tone.xmp', 'acidnom'],
      ['07_05_Creative Tone – Experimental.xmp', 'phenomena'],
      ['07_06_Stylized Color – Art Look.xmp', 'veniliqum'],
      ['07_07_Warm Mood – Cinematic Spice.xmp', 'magic_spice'],
      ['07_08_Film Grain – Cinematic Noise.xmp', 'estra_500'],
      ['07_09_Clean Standard – Neutral Look.xmp', 'sony_standard_cl'],
      ['07_10_Classic Film – Digital Soft.xmp', 'sony_classic_negative'],
      ['07_11_Pro Look – Clean Boost.xmp', 'evproplus'],
      ['07_12_Analog Fade – Soft Vintage.xmp', 'harman_phoenix'],
    ],
  },
  {
    folder: '08_PRO CONTROL',
    entries: [
      ['08_01_Portra 400 – Base.xmp', 'portra_400'],
      ['08_02_Ektar 100 – Base.xmp', 'ektar_100'],
      ['08_03_Cinestill 800T – Base.xmp', 'cinestill_800t'],
      ['08_04_Vision3 250D – Base.xmp', 'vision3_250d'],
      ['08_05_HP5 – Base.xmp', 'bw_hp5'],
    ],
  },
];

function extractLuaTable(text, token) {
  const tokenIndex = text.indexOf(token);
  if (tokenIndex === -1) {
    throw new Error(`Token not found: ${token}`);
  }
  const openIndex = text.indexOf('{', tokenIndex);
  if (openIndex === -1) {
    throw new Error(`Table start not found for token: ${token}`);
  }

  let depth = 0;
  let inString = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openIndex, i + 1);
      }
    }
  }
  throw new Error(`Unclosed Lua table for token: ${token}`);
}

function parseLuaObjectArray(tableText) {
  const values = [];
  let depth = 0;
  let inString = false;
  let start = -1;
  for (let i = 1; i < tableText.length - 1; i += 1) {
    const ch = tableText[i];
    const prev = i > 0 ? tableText[i - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === '{') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        values.push(tableText.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return values;
}

function parseLuaStringField(block, key) {
  const match = block.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : null;
}

function parseEmulsionFoundationMap(configText) {
  const table = extractLuaTable(configText, 'M.emulsions =');
  const blocks = parseLuaObjectArray(table);
  const map = new Map();
  for (const block of blocks) {
    const id = parseLuaStringField(block, 'id');
    const foundationPreset = parseLuaStringField(block, 'foundationPreset');
    if (id && foundationPreset) {
      map.set(id, foundationPreset);
    }
  }
  return map;
}

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function deterministicUuid(seed) {
  return createHash('md5').update(seed).digest('hex').toUpperCase();
}

function patchXmpMetadata(xmpText, presetDisplayName, clusterLabel, uuid) {
  let patched = xmpText.replace(/crs:UUID="[^"]*"/i, `crs:UUID="${uuid}"`);

  if (/crs:Name="/i.test(patched)) {
    patched = patched.replace(/crs:Name="[^"]*"/i, `crs:Name="${escapeXmlAttr(presetDisplayName)}"`);
  } else {
    patched = patched.replace(
      /(crs:UUID="[^"]*"\s*)/i,
      `$1\n   crs:Name="${escapeXmlAttr(presetDisplayName)}"\n   `
    );
  }

  if (/crs:Cluster="/i.test(patched)) {
    patched = patched.replace(
      /crs:Cluster="[^"]*"/i,
      `crs:Cluster="${escapeXmlAttr(clusterLabel)}"`
    );
  }

  return patched;
}

function timestampLabel() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

async function main() {
  await fs.mkdir(exportsDir, { recursive: true });
  const configText = await fs.readFile(configPath, 'utf8');
  const foundationMap = parseEmulsionFoundationMap(configText);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfullens-xmp-'));
  const stamp = timestampLabel();
  const packageRootName = `MindfulLens_XMP_Lightroom_Sorted_${stamp}`;
  const packageRoot = path.resolve(tempRoot, packageRootName);
  await fs.mkdir(packageRoot, { recursive: true });

  const manifest = [
    ['folder', 'file_name', 'source_id', 'foundation_file'].join(','),
  ];

  const missingSources = [];
  const missingFoundationFiles = [];
  let exportedCount = 0;

  for (const section of XMP_EXPORT_STRUCTURE) {
    const sectionDir = path.resolve(packageRoot, section.folder);
    await fs.mkdir(sectionDir, { recursive: true });
    await fs.writeFile(
      path.resolve(sectionDir, `00_◦ ${section.folder.replace(/^\d{2}_/, '').replace(/_/g, ' ')} ◦.txt`),
      `Section separator for ${section.folder}\n`,
      'utf8'
    );

    for (const [fileName, sourceId] of section.entries) {
      const foundationRelative = foundationMap.get(sourceId);
      if (!foundationRelative) {
        missingSources.push(sourceId);
        continue;
      }

      const foundationPath = path.resolve(pluginRoot, foundationRelative);
      let xmpContent;
      try {
        xmpContent = await fs.readFile(foundationPath, 'utf8');
      } catch {
        missingFoundationFiles.push(foundationPath);
        continue;
      }

      const displayName = fileName.replace(/\.xmp$/i, '');
      const uuid = deterministicUuid(`${section.folder}/${displayName}/${sourceId}`);
      const patchedXmp = patchXmpMetadata(xmpContent, displayName, section.folder, uuid);
      const outputPath = path.resolve(sectionDir, fileName);
      await fs.writeFile(outputPath, patchedXmp, 'utf8');
      exportedCount += 1;

      const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
      manifest.push(
        [
          esc(section.folder),
          esc(fileName),
          esc(sourceId),
          esc(foundationRelative),
        ].join(',')
      );
    }
  }

  await fs.writeFile(path.resolve(packageRoot, 'manifest.csv'), `${manifest.join('\n')}\n`, 'utf8');
  await fs.writeFile(
    path.resolve(packageRoot, 'README.txt'),
    [
      'MindfulLens XMP export for Lightroom',
      '',
      'Folder names are sorting-safe for Lightroom:',
      '00_, 01_, 02_ ...',
      '',
      'Each XMP has:',
      '- updated crs:Name (display name)',
      '- updated crs:Cluster (folder section)',
      '- deterministic unique crs:UUID',
      '',
      `Exported XMP files: ${exportedCount}`,
    ].join('\n') + '\n',
    'utf8'
  );

  const zipPath = path.resolve(exportsDir, `${packageRootName}.zip`);
  execFileSync('zip', ['-qr', zipPath, packageRootName], { cwd: tempRoot });

  await fs.rm(tempRoot, { recursive: true, force: true });

  if (missingSources.length > 0) {
    console.warn(
      `[profiles:export:xmp] Missing source ids in FilmEngineConfig: ${[
        ...new Set(missingSources),
      ]
        .sort()
        .join(', ')}`
    );
  }
  if (missingFoundationFiles.length > 0) {
    console.warn(
      `[profiles:export:xmp] Missing foundation files: ${[
        ...new Set(missingFoundationFiles),
      ]
        .sort()
        .join(', ')}`
    );
  }

  console.log(`[profiles:export:xmp] Exported XMP files: ${exportedCount}`);
  console.log(`[profiles:export:xmp] ZIP package: ${zipPath}`);
}

main().catch((error) => {
  console.error('[profiles:export:xmp] Failed:', error);
  process.exitCode = 1;
});
