import fs from 'node:fs/promises';
import path from 'node:path';
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
const publicCatalogPath = path.resolve(pluginRoot, 'lib', 'PublicCatalog.lua');
const outputPath = path.resolve(projectRoot, 'src', 'engine', 'filmProfiles.generated.js');
const lutOutputDir = path.resolve(projectRoot, 'public', 'luts');

const MIN_VALID_LUT_BYTES = 1024;
const IDENTITY_CURVE = [
  [0, 0],
  [255, 255],
];

const COLOR_SUFFIXES = [
  ['red', 'Red'],
  ['orange', 'Orange'],
  ['yellow', 'Yellow'],
  ['green', 'Green'],
  ['aqua', 'Aqua'],
  ['blue', 'Blue'],
  ['purple', 'Purple'],
  ['magenta', 'Magenta'],
];

const MICRO_TUNE_MAP = {
  Exposure2012: { path: ['exposure'], min: -5, max: 5, round: false },
  Contrast2012: { path: ['contrast'] },
  Highlights2012: { path: ['highlights'] },
  Shadows2012: { path: ['shadows'] },
  Whites2012: { path: ['whites'] },
  Blacks2012: { path: ['blacks'] },
  Texture: { path: ['texture'] },
  Clarity2012: { path: ['clarity'] },
  Dehaze: { path: ['dehaze'] },
  Vibrance: { path: ['vibrance'] },
  Saturation: { path: ['saturation'] },
  GrainAmount: { path: ['grain'], min: 0, max: 100 },
  GrainSize: { path: ['grainSize'], min: 0, max: 100 },
  GrainFrequency: { path: ['grainFrequency'], min: 0, max: 100 },
  PostCropVignetteAmount: { path: ['vignette'] },
  VignetteAmount: { path: ['vignette'] },
  ColorGradeBalance: { path: ['colorGrade', 'balance'] },
  ColorGradeBlending: { path: ['colorGrade', 'blending'], min: 0, max: 100 },
  ColorGradeShadowsHue: { path: ['colorGrade', 'shadows', 'hue'], min: 0, max: 360 },
  ColorGradeShadowsSat: { path: ['colorGrade', 'shadows', 'saturation'] },
  ColorGradeShadowsLum: { path: ['colorGrade', 'shadows', 'luminance'] },
  ColorGradeMidtoneHue: { path: ['colorGrade', 'midtones', 'hue'], min: 0, max: 360 },
  ColorGradeMidtoneSat: { path: ['colorGrade', 'midtones', 'saturation'] },
  ColorGradeMidtoneLum: { path: ['colorGrade', 'midtones', 'luminance'] },
  ColorGradeHighlightsHue: { path: ['colorGrade', 'highlights', 'hue'], min: 0, max: 360 },
  ColorGradeHighlightsSat: { path: ['colorGrade', 'highlights', 'saturation'] },
  ColorGradeHighlightsLum: { path: ['colorGrade', 'highlights', 'luminance'] },
  ColorGradeGlobalHue: { path: ['colorGrade', 'global', 'hue'], min: 0, max: 360 },
  ColorGradeGlobalSat: { path: ['colorGrade', 'global', 'saturation'] },
  ShadowTint: { path: ['calibration', 'shadowsTint'] },
  RedHue: { path: ['calibration', 'red', 'hue'] },
  RedSaturation: { path: ['calibration', 'red', 'saturation'] },
  GreenHue: { path: ['calibration', 'green', 'hue'] },
  GreenSaturation: { path: ['calibration', 'green', 'saturation'] },
  BlueHue: { path: ['calibration', 'blue', 'hue'] },
  BlueSaturation: { path: ['calibration', 'blue', 'saturation'] },
};

for (const [colorKey, suffix] of COLOR_SUFFIXES) {
  MICRO_TUNE_MAP[`HueAdjustment${suffix}`] = { path: ['hsl', 'hue', colorKey] };
  MICRO_TUNE_MAP[`SaturationAdjustment${suffix}`] = {
    path: ['hsl', 'saturation', colorKey],
  };
  MICRO_TUNE_MAP[`LuminanceAdjustment${suffix}`] = {
    path: ['hsl', 'luminance', colorKey],
  };
}

function clamp(value, min = -100, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readAttrNumber(xmp, key, fallback = 0) {
  const match = xmp.match(new RegExp(`crs:${key}="([^"]*)"`, 'i'));
  if (!match) {
    return fallback;
  }
  return parseNumber(match[1], fallback);
}

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

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const prev = index > 0 ? text[index - 1] : '';

    if (char === '"' && prev !== '\\') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openIndex, index + 1);
      }
    }
  }

  throw new Error(`Unclosed Lua table for token: ${token}`);
}

function parseLuaObjectArray(tableText) {
  const values = [];
  let depth = 0;
  let inString = false;
  let startIndex = -1;

  for (let index = 1; index < tableText.length - 1; index += 1) {
    const char = tableText[index];
    const prev = index > 0 ? tableText[index - 1] : '';

    if (char === '"' && prev !== '\\') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && startIndex !== -1) {
        values.push(tableText.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }
  }

  return values;
}

function parseLuaStringField(block, key) {
  const match = block.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : null;
}

function parseLuaBooleanField(block, key, fallback = false) {
  const match = block.match(new RegExp(`${key}\\s*=\\s*(true|false)`));
  if (!match) {
    return fallback;
  }
  return match[1] === 'true';
}

function parseLuaNumberTable(block, key) {
  const match = block.match(new RegExp(`${key}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*,?`));
  if (!match) {
    return {};
  }

  const values = {};
  const entryRegex = /([A-Za-z0-9_]+)\s*=\s*([+-]?\d+(?:\.\d+)?)/g;
  let entryMatch = entryRegex.exec(match[1]);

  while (entryMatch) {
    values[entryMatch[1]] = parseNumber(entryMatch[2], 0);
    entryMatch = entryRegex.exec(match[1]);
  }

  return values;
}

function parseCurveFromXmp(xmp, tagName) {
  const curveMatch = xmp.match(
    new RegExp(
      `<crs:${tagName}>[\\s\\S]*?<rdf:Seq>([\\s\\S]*?)<\\/rdf:Seq>[\\s\\S]*?<\\/crs:${tagName}>`,
      'i'
    )
  );

  if (!curveMatch) {
    return IDENTITY_CURVE.map((point) => [...point]);
  }

  const points = [];
  const pointRegex = /<rdf:li>\s*(\d+)\s*,\s*(\d+)\s*<\/rdf:li>/g;
  let pointMatch = pointRegex.exec(curveMatch[1]);

  while (pointMatch) {
    points.push([clamp(parseNumber(pointMatch[1], 0), 0, 255), clamp(parseNumber(pointMatch[2], 0), 0, 255)]);
    pointMatch = pointRegex.exec(curveMatch[1]);
  }

  if (points.length < 2) {
    return IDENTITY_CURVE.map((point) => [...point]);
  }

  points.sort((left, right) => left[0] - right[0]);
  return points;
}

function buildHslFromXmp(xmp) {
  const hsl = {
    hue: {},
    saturation: {},
    luminance: {},
  };

  for (const [colorKey, suffix] of COLOR_SUFFIXES) {
    hsl.hue[colorKey] = Math.round(readAttrNumber(xmp, `HueAdjustment${suffix}`, 0));
    hsl.saturation[colorKey] = Math.round(
      readAttrNumber(xmp, `SaturationAdjustment${suffix}`, 0)
    );
    hsl.luminance[colorKey] = Math.round(readAttrNumber(xmp, `LuminanceAdjustment${suffix}`, 0));
  }

  return hsl;
}

function buildColorGradeFromXmp(xmp) {
  return {
    shadows: {
      hue: Math.round(readAttrNumber(xmp, 'ColorGradeShadowsHue', 0)),
      saturation: Math.round(readAttrNumber(xmp, 'ColorGradeShadowsSat', 0)),
      luminance: Math.round(readAttrNumber(xmp, 'ColorGradeShadowLum', 0)),
    },
    midtones: {
      hue: Math.round(readAttrNumber(xmp, 'ColorGradeMidtoneHue', 0)),
      saturation: Math.round(readAttrNumber(xmp, 'ColorGradeMidtoneSat', 0)),
      luminance: Math.round(readAttrNumber(xmp, 'ColorGradeMidtoneLum', 0)),
    },
    highlights: {
      hue: Math.round(readAttrNumber(xmp, 'ColorGradeHighlightsHue', 0)),
      saturation: Math.round(readAttrNumber(xmp, 'ColorGradeHighlightsSat', 0)),
      luminance: Math.round(readAttrNumber(xmp, 'ColorGradeHighlightLum', 0)),
    },
    global: {
      hue: Math.round(readAttrNumber(xmp, 'ColorGradeGlobalHue', 0)),
      saturation: Math.round(readAttrNumber(xmp, 'ColorGradeGlobalSat', 0)),
    },
    blending: Math.round(readAttrNumber(xmp, 'ColorGradeBlending', 50)),
    balance: Math.round(readAttrNumber(xmp, 'ColorGradeBalance', 0)),
  };
}

function buildCalibrationFromXmp(xmp) {
  return {
    shadowsTint: Math.round(readAttrNumber(xmp, 'ShadowTint', 0)),
    red: {
      hue: Math.round(readAttrNumber(xmp, 'RedHue', 0)),
      saturation: Math.round(readAttrNumber(xmp, 'RedSaturation', 0)),
    },
    green: {
      hue: Math.round(readAttrNumber(xmp, 'GreenHue', 0)),
      saturation: Math.round(readAttrNumber(xmp, 'GreenSaturation', 0)),
    },
    blue: {
      hue: Math.round(readAttrNumber(xmp, 'BlueHue', 0)),
      saturation: Math.round(readAttrNumber(xmp, 'BlueSaturation', 0)),
    },
  };
}

function getByPath(object, pathSegments) {
  let current = object;
  for (const segment of pathSegments) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function setByPath(object, pathSegments, value) {
  let current = object;
  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index];
    if (current[segment] == null || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[pathSegments[pathSegments.length - 1]] = value;
}

function applyMicroTune(profile, microTune) {
  if (!microTune || typeof microTune !== 'object') {
    return;
  }

  for (const [key, deltaRaw] of Object.entries(microTune)) {
    const rule = MICRO_TUNE_MAP[key];
    const delta = parseNumber(deltaRaw, 0);
    if (!rule || !Number.isFinite(delta) || delta === 0) {
      continue;
    }

    const currentValue = parseNumber(getByPath(profile, rule.path), 0);
    const nextValueRaw = currentValue + delta;
    const min = Number.isFinite(rule.min) ? rule.min : -100;
    const max = Number.isFinite(rule.max) ? rule.max : 100;
    const clamped = clamp(nextValueRaw, min, max);
    const nextValue = rule.round === false ? Number(clamped.toFixed(3)) : Math.round(clamped);
    setByPath(profile, rule.path, nextValue);
  }
}

function parsePublicCatalogMaps(catalogText) {
  const tagsById = new Map();
  const categoryById = new Map();

  try {
    const tagsBlock = extractLuaTable(catalogText, 'local EMULSION_TAGS_BY_ID =');
    const tagEntryRegex = /([a-z0-9_]+)\s*=\s*\{([^}]*)\}/g;
    let tagEntryMatch = tagEntryRegex.exec(tagsBlock);

    while (tagEntryMatch) {
      const id = tagEntryMatch[1];
      const tags = [...tagEntryMatch[2].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
      tagsById.set(id, tags);
      tagEntryMatch = tagEntryRegex.exec(tagsBlock);
    }
  } catch (_error) {
    // optional metadata; keep empty maps
  }

  const categoryMergeRegex =
    /mergeInto\(EMULSION_CATEGORY_BY_ID,\s*listToMap\(\{([\s\S]*?)\},\s*"([^"]+)"\)\)/g;
  let categoryMatch = categoryMergeRegex.exec(catalogText);

  while (categoryMatch) {
    const ids = [...categoryMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    const categoryId = categoryMatch[2];
    ids.forEach((id) => {
      categoryById.set(id, categoryId);
    });
    categoryMatch = categoryMergeRegex.exec(catalogText);
  }

  return {
    tagsById,
    categoryById,
  };
}

function inferUiCategory(emulsion, tagsById, categoryById) {
  const id = emulsion.id ?? '';
  const tags = tagsById.get(id) ?? [];
  const category = categoryById.get(id) ?? null;

  if (emulsion.bw || id.startsWith('bw_') || tags.includes('bw')) {
    return 'bw';
  }

  if (tags.includes('slide')) {
    return 'slide';
  }

  if (
    category === 'cinema_storytelling' ||
    category === 'night_city' ||
    tags.includes('cinema') ||
    tags.includes('noc') ||
    tags.includes('night') ||
    tags.includes('tungsten') ||
    id.includes('vision3') ||
    id.includes('cinestill') ||
    id.includes('eterna')
  ) {
    return 'cine';
  }

  return 'neg';
}

async function clearExistingLuts(directory) {
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          (entry.name.toLowerCase().endsWith('.cube') || entry.name.startsWith('._'))
      )
      .map((entry) =>
        fs.unlink(path.resolve(directory, entry.name)).catch((error) => {
          if (error?.code !== 'ENOENT') {
            throw error;
          }
        })
      )
  );
}

async function removeAppleDoubleSidecars(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.startsWith('._'))
      .map((entry) =>
        fs.unlink(path.resolve(directory, entry.name)).catch((error) => {
          if (error?.code !== 'ENOENT') {
            throw error;
          }
        })
      )
  );
}

async function isValidCubeLut(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < MIN_VALID_LUT_BYTES) {
    return false;
  }

  const previewBytes = await fs.readFile(filePath, 'utf8');
  return /LUT_3D_SIZE\s+\d+/i.test(previewBytes) && !/PLACEHOLDER/i.test(previewBytes);
}

function parseEmulsions(configText) {
  const table = extractLuaTable(configText, 'M.emulsions =');
  const blocks = parseLuaObjectArray(table);

  return blocks
    .map((block) => ({
      id: parseLuaStringField(block, 'id'),
      label: parseLuaStringField(block, 'label'),
      foundationPreset: parseLuaStringField(block, 'foundationPreset'),
      lutFile: parseLuaStringField(block, 'lutFile'),
      bw: parseLuaBooleanField(block, 'bw', false),
      microTune: parseLuaNumberTable(block, 'microTune'),
    }))
    .filter((emulsion) => emulsion.id && emulsion.label && emulsion.foundationPreset);
}

function buildProfileFromFoundation(emulsion, xmpText, tagsById, categoryById) {
  const profile = {
    name: emulsion.label,
    sub: 'Master',
    variant: 'Master',
    cat: inferUiCategory(emulsion, tagsById, categoryById),
    free: true,
    bw: Boolean(emulsion.bw),
    sourceId: emulsion.id,
    curves: {
      rgb: parseCurveFromXmp(xmpText, 'ToneCurvePV2012'),
      r: parseCurveFromXmp(xmpText, 'ToneCurvePV2012Red'),
      g: parseCurveFromXmp(xmpText, 'ToneCurvePV2012Green'),
      b: parseCurveFromXmp(xmpText, 'ToneCurvePV2012Blue'),
    },
    exposure: Number(readAttrNumber(xmpText, 'Exposure2012', 0).toFixed(3)),
    temperature: Math.round(readAttrNumber(xmpText, 'Temperature', 0)),
    tint: Math.round(readAttrNumber(xmpText, 'Tint', 0)),
    contrast: Math.round(readAttrNumber(xmpText, 'Contrast2012', 0)),
    highlights: Math.round(readAttrNumber(xmpText, 'Highlights2012', 0)),
    shadows: Math.round(readAttrNumber(xmpText, 'Shadows2012', 0)),
    whites: Math.round(readAttrNumber(xmpText, 'Whites2012', 0)),
    blacks: Math.round(readAttrNumber(xmpText, 'Blacks2012', 0)),
    texture: Math.round(readAttrNumber(xmpText, 'Texture', 0)),
    clarity: Math.round(readAttrNumber(xmpText, 'Clarity2012', 0)),
    dehaze: Math.round(readAttrNumber(xmpText, 'Dehaze', 0)),
    vibrance: Math.round(readAttrNumber(xmpText, 'Vibrance', 0)),
    saturation: Math.round(readAttrNumber(xmpText, 'Saturation', 0)),
    grain: Math.round(readAttrNumber(xmpText, 'GrainAmount', 0)),
    grainSize: Math.round(readAttrNumber(xmpText, 'GrainSize', 30)),
    grainFrequency: Math.round(readAttrNumber(xmpText, 'GrainFrequency', 50)),
    vignette: Math.round(
      readAttrNumber(
        xmpText,
        'PostCropVignetteAmount',
        readAttrNumber(xmpText, 'VignetteAmount', 0)
      )
    ),
    hsl: buildHslFromXmp(xmpText),
    colorGrade: buildColorGradeFromXmp(xmpText),
    calibration: buildCalibrationFromXmp(xmpText),
    grayMixer: null,
    previewLutFile: null,
  };

  applyMicroTune(profile, emulsion.microTune);
  return profile;
}

async function main() {
  const configExists = await fs
    .access(configPath)
    .then(() => true)
    .catch(() => false);

  if (!configExists) {
    console.warn(
      `[profiles:generate] Source configuration missing at ${configPath}. Skipping regeneration. existing 'filmProfiles.generated.js' will be used.`
    );
    return;
  }

  const [configText, publicCatalogText] = await Promise.all([
    fs.readFile(configPath, 'utf8'),
    fs.readFile(publicCatalogPath, 'utf8').catch(() => ''),
  ]);

  const emulsions = parseEmulsions(configText);
  const { tagsById, categoryById } = parsePublicCatalogMaps(publicCatalogText);

  await clearExistingLuts(lutOutputDir);

  const filmProfiles = [];
  let lutCopiedCount = 0;
  let lutEnabledCount = 0;

  for (const emulsion of emulsions) {
    const foundationPath = path.resolve(pluginRoot, emulsion.foundationPreset);
    const xmpExists = await fs
      .access(foundationPath)
      .then(() => true)
      .catch(() => false);

    if (!xmpExists) {
      console.warn(`[profiles:generate] Missing foundation preset: ${foundationPath}`);
      continue;
    }

    const foundationXmp = await fs.readFile(foundationPath, 'utf8');
    const profile = buildProfileFromFoundation(emulsion, foundationXmp, tagsById, categoryById);

    if (emulsion.lutFile) {
      const sourceLutPath = path.resolve(pluginRoot, emulsion.lutFile);
      const lutExists = await fs
        .access(sourceLutPath)
        .then(() => true)
        .catch(() => false);

      if (lutExists) {
        const lutFileName = path.basename(emulsion.lutFile);
        const targetLutPath = path.resolve(lutOutputDir, lutFileName);
        const lutBuffer = await fs.readFile(sourceLutPath);
        await fs.writeFile(targetLutPath, lutBuffer);
        lutCopiedCount += 1;

        if (await isValidCubeLut(targetLutPath)) {
          profile.previewLutFile = lutFileName;
          lutEnabledCount += 1;
        }
      } else {
        console.warn(`[profiles:generate] Missing LUT file: ${sourceLutPath}`);
      }
    }

    filmProfiles.push(profile);
  }

  await removeAppleDoubleSidecars(lutOutputDir);

  const generated = `// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
// Source: MindfulLens_System_Master/lightroom_plugin/MindfulLensFilmEngine.lrplugin
export const generatedFilmStocks = ${JSON.stringify(filmProfiles, null, 2)};
`;

  await fs.writeFile(outputPath, generated, 'utf8');

  console.log(
    `[profiles:generate] Generated ${filmProfiles.length} profiles (${lutEnabledCount} with valid preview LUTs, ${lutCopiedCount} LUT files copied).`
  );
}

main().catch((error) => {
  console.error('[profiles:generate] Failed:', error);
  process.exitCode = 1;
});
