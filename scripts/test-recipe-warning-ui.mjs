import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateRecipeSoftWarningsLine } from '../src/filmLab/recipe/filmLabRecipeWarningUi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readLocaleJson(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `../src/i18n/locales/${name}.json`), 'utf8'));
}

function getByPath(obj, pathStr) {
  const keys = pathStr.split('.');
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function applyVars(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}

/** Minimal subset of I18nProvider — reads dotted keys from locale JSON. */
function makeCatalogT(messages) {
  return function t(key, vars) {
    const raw = getByPath(messages, key);
    if (typeof raw !== 'string') return key;
    return applyVars(raw, vars);
  };
}

const localePl = readLocaleJson('pl');
const localeEn = readLocaleJson('en');
const catalogTPl = makeCatalogT(localePl);
const catalogTEn = makeCatalogT(localeEn);

function mockT(key, vars) {
  if (key === 'filmLab.recipeWarnings.patterns.maskGraphIrMismatch' && vars?.graphIndex === '2') {
    return 'IR2';
  }
  if (key === 'filmLab.recipeWarnings.patterns.layerMaskGraphNodeIdUnresolved' && vars?.layerIndex === '4') {
    return 'LAY4';
  }
  const map = {
    'filmLab.recipeWarnings.codes.generative_stub_intent_without_node': 'GEN_INTENT',
    'filmLab.recipeWarnings.codes.fingerprint_mismatch': 'FP',
    'filmLab.recipeWarnings.codes.soft_validate_partial_envelope': 'SOFT',
    'filmLab.recipeWarnings.codes.unknown_dynamic_0': 'DYN',
  };
  return map[key] ?? key;
}

assert.equal(translateRecipeSoftWarningsLine(null, mockT), '');
assert.equal(translateRecipeSoftWarningsLine(undefined, mockT), '');
assert.equal(translateRecipeSoftWarningsLine('  ', mockT), '  ');

assert.equal(
  translateRecipeSoftWarningsLine('generative_stub_intent_without_node · fingerprint_mismatch', mockT),
  'GEN_INTENT · FP',
);

assert.equal(
  translateRecipeSoftWarningsLine(
    'generative_stub_intent_without_node — soft_validate_partial_envelope',
    mockT,
  ),
  'GEN_INTENT — SOFT',
);

assert.equal(
  translateRecipeSoftWarningsLine('soft-validate: koperta częściowo poza schematem', mockT),
  'SOFT',
);

assert.equal(
  translateRecipeSoftWarningsLine('unknown_dynamic_0 — maskGraph_ir_mismatch_1', mockT),
  'DYN — maskGraph_ir_mismatch_1',
);

assert.equal(translateRecipeSoftWarningsLine('maskGraph_ir_mismatch_2', mockT), 'IR2');
assert.equal(
  translateRecipeSoftWarningsLine('layer_maskGraphNodeId_unresolved_4', mockT),
  'LAY4',
);

assert.equal(
  translateRecipeSoftWarningsLine('recipe_import_file_read_failed — ENOENT', catalogTPl),
  `${catalogTPl('filmLab.recipeWarnings.codes.recipe_import_file_read_failed')} — ENOENT`,
);

assert.equal(
  translateRecipeSoftWarningsLine('recipe_clipboard_read_text_unavailable', catalogTEn),
  catalogTEn('filmLab.recipeWarnings.codes.recipe_clipboard_read_text_unavailable'),
);

assert.equal(
  translateRecipeSoftWarningsLine('maskGraph_ir_mismatch_0', catalogTPl),
  catalogTPl('filmLab.recipeWarnings.patterns.maskGraphIrMismatch', { graphIndex: '0' }),
);

console.log('OK Recipe warning UI line translation');
