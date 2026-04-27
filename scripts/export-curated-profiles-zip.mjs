import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { generatedFilmStocks } from '../src/engine/filmProfiles.generated.js';
import {
  CURATED_PROFILE_ENTRIES,
  PROFILE_GROUP_TABS,
} from '../src/engine/profileCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const exportsDir = path.resolve(projectRoot, 'exports');
const pluginLutDir = path.resolve(
  projectRoot,
  'MindfulLens_System_Master',
  'lightroom_plugin',
  'MindfulLensFilmEngine.lrplugin',
  'profiles',
  'luts'
);
const publicLutDir = path.resolve(projectRoot, 'public', 'luts');

function sanitizeFileName(input) {
  return String(input)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function padNumber(value) {
  return String(value).padStart(2, '0');
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveLutPath(lutFileName) {
  if (!lutFileName) {
    return null;
  }

  const publicCandidate = path.resolve(publicLutDir, lutFileName);
  if (await fileExists(publicCandidate)) {
    return publicCandidate;
  }

  const pluginCandidate = path.resolve(pluginLutDir, lutFileName);
  if (await fileExists(pluginCandidate)) {
    return pluginCandidate;
  }

  return null;
}

async function main() {
  await fs.mkdir(exportsDir, { recursive: true });

  const sourceById = new Map();
  generatedFilmStocks.forEach((profile) => {
    sourceById.set(profile.sourceId, profile);
  });

  const grouped = new Map();
  CURATED_PROFILE_ENTRIES.forEach((entry) => {
    if (!grouped.has(entry.group)) {
      grouped.set(entry.group, []);
    }
    grouped.get(entry.group).push(entry);
  });

  PROFILE_GROUP_TABS.forEach((tab) => {
    if (!grouped.has(tab.id)) {
      grouped.set(tab.id, []);
    }
  });

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfullens-profiles-'));
  const stamp = timestampLabel();
  const packageRootName = `MindfulLens_Profile_System_Renamed_${stamp}`;
  const packageRoot = path.resolve(tempRoot, packageRootName);
  await fs.mkdir(packageRoot, { recursive: true });

  const manifestRows = [
    [
      'group',
      'group_label',
      'order',
      'display_name',
      'source_id',
      'description',
      'profile_json',
      'lut_cube',
    ].join(','),
  ];

  const missingSources = [];
  const missingLuts = [];
  let exportedProfiles = 0;
  let exportedLuts = 0;

  for (const tab of PROFILE_GROUP_TABS) {
    const tabEntries = [...(grouped.get(tab.id) ?? [])].sort((a, b) => a.order - b.order);
    const groupFolderName = sanitizeFileName(tab.label);
    const groupDir = path.resolve(packageRoot, groupFolderName);
    await fs.mkdir(groupDir, { recursive: true });
    const separatorLabel = tab.label.replace(/^\d{2}_/, '').replace(/_/g, ' ');
    const separatorFile = path.resolve(groupDir, `00_◦ ${separatorLabel} ◦.txt`);
    await fs.writeFile(
      separatorFile,
      `MindfulLens section separator: ${tab.label}\n`,
      'utf8'
    );

    for (const entry of tabEntries) {
      const source = sourceById.get(entry.sourceId);
      if (!source) {
        missingSources.push(entry.sourceId);
        continue;
      }

      const order = padNumber(entry.order);
      const prettyName = `${order}_${entry.title}`;
      const fileBase = sanitizeFileName(`${prettyName} (${entry.sourceId})`);
      const jsonFileName = `${fileBase}.json`;
      const jsonPath = path.resolve(groupDir, jsonFileName);

      const profilePayload = {
        groupId: entry.group,
        groupLabel: tab.label,
        order: entry.order,
        displayName: prettyName,
        description: entry.description,
        sourceId: entry.sourceId,
        profile: source,
      };

      await fs.writeFile(jsonPath, `${JSON.stringify(profilePayload, null, 2)}\n`, 'utf8');
      exportedProfiles += 1;

      let exportedLutName = '';
      const sourceLut = await resolveLutPath(source.previewLutFile);
      if (source.previewLutFile && sourceLut) {
        const lutFileName = `${fileBase}.cube`;
        const lutOutputPath = path.resolve(groupDir, lutFileName);
        await fs.copyFile(sourceLut, lutOutputPath);
        exportedLutName = lutFileName;
        exportedLuts += 1;
      } else if (source.previewLutFile) {
        missingLuts.push(source.previewLutFile);
      }

      const escaped = (value) =>
        `"${String(value ?? '')
          .replace(/"/g, '""')
          .replace(/\n/g, ' ')}"`;
      manifestRows.push(
        [
          escaped(entry.group),
          escaped(tab.label),
          escaped(entry.order),
          escaped(prettyName),
          escaped(entry.sourceId),
          escaped(entry.description),
          escaped(path.posix.join(groupFolderName, jsonFileName)),
          escaped(
            exportedLutName ? path.posix.join(groupFolderName, exportedLutName) : ''
          ),
        ].join(',')
      );
    }
  }

  const manifestPath = path.resolve(packageRoot, 'manifest.csv');
  await fs.writeFile(manifestPath, `${manifestRows.join('\n')}\n`, 'utf8');

  const readmePath = path.resolve(packageRoot, 'README.txt');
  const readme = [
    'MindfulLens Profile System - Curated Export',
    '',
    'This package contains renamed profile definitions grouped by catalog sections.',
    'File format per profile: JSON with source profile payload and mapping metadata.',
    'Optional LUTs are included as .cube files when available.',
    '',
    `Exported profiles: ${exportedProfiles}`,
    `Exported LUT files: ${exportedLuts}`,
    '',
    'Naming format:',
    '[NUMER] | [NAZWA EMOCJI] – [EFEKT]',
  ].join('\n');
  await fs.writeFile(readmePath, `${readme}\n`, 'utf8');

  const zipPath = path.resolve(exportsDir, `${packageRootName}.zip`);
  execFileSync('zip', ['-qr', zipPath, packageRootName], { cwd: tempRoot });

  await fs.rm(tempRoot, { recursive: true, force: true });

  const warnings = [];
  if (missingSources.length > 0) {
    warnings.push(
      `Missing source profiles: ${[...new Set(missingSources)].sort().join(', ')}`
    );
  }
  if (missingLuts.length > 0) {
    warnings.push(`Missing LUT files: ${[...new Set(missingLuts)].sort().join(', ')}`);
  }

  if (warnings.length > 0) {
    warnings.forEach((line) => console.warn(`[profiles:export:zip] ${line}`));
  }

  console.log(`[profiles:export:zip] Exported profiles: ${exportedProfiles}`);
  console.log(`[profiles:export:zip] Exported LUT files: ${exportedLuts}`);
  console.log(`[profiles:export:zip] ZIP package: ${zipPath}`);
}

main().catch((error) => {
  console.error('[profiles:export:zip] Failed:', error);
  process.exitCode = 1;
});
