/**
 * Dynamic codes from `softValidateRecipeDocument` — `filmLab.recipeWarnings.patterns.*`, params `{graphIndex}` etc.
 *
 * @type {readonly { re: RegExp, key: string, params: (m: RegExpMatchArray) => Record<string, string | number> }[]}
 */
const RECIPE_WARNING_DYNAMIC_RULES = [
  {
    re: /^maskGraph_ir_mismatch_(\d+)$/,
    key: 'filmLab.recipeWarnings.patterns.maskGraphIrMismatch',
    params: (m) => ({ graphIndex: m[1] }),
  },
  {
    re: /^maskGraph_node_id_(\d+)_(\d+)$/,
    key: 'filmLab.recipeWarnings.patterns.maskGraphNodeIdInvalid',
    params: (m) => ({ graphIndex: m[1], nodeIndex: m[2] }),
  },
  {
    re: /^maskGraph_node_type_unknown_(\d+)_(\d+)$/,
    key: 'filmLab.recipeWarnings.patterns.maskGraphNodeTypeUnknown',
    params: (m) => ({ graphIndex: m[1], nodeIndex: m[2] }),
  },
  {
    re: /^maskGraph_duplicate_node_id_(\d+)_(\d+)$/,
    key: 'filmLab.recipeWarnings.patterns.maskGraphDuplicateNodeId',
    params: (m) => ({ graphIndex: m[1], nodeIndex: m[2] }),
  },
  {
    re: /^layer_maskGraphNodeId_(\d+)$/,
    key: 'filmLab.recipeWarnings.patterns.layerMaskGraphNodeIdEmpty',
    params: (m) => ({ layerIndex: m[1] }),
  },
  {
    re: /^layer_maskGraphNodeId_unresolved_(\d+)$/,
    key: 'filmLab.recipeWarnings.patterns.layerMaskGraphNodeIdUnresolved',
    params: (m) => ({ layerIndex: m[1] }),
  },
];

/**
 * @param {string} code
 * @param {(key: string, vars?: Record<string, string | number>) => string} t
 */
function translateRecipeWarningCode(code, t) {
  const staticKey = `filmLab.recipeWarnings.codes.${code}`;
  const staticTr = t(staticKey);
  if (staticTr !== staticKey) {
    return staticTr;
  }
  for (const rule of RECIPE_WARNING_DYNAMIC_RULES) {
    const m = code.match(rule.re);
    if (m) {
      const tr = t(rule.key, rule.params(m));
      if (tr !== rule.key) {
        return tr;
      }
    }
  }
  return code;
}

/**
 * Maps recipe soft-validation / import warning tokens to i18n keys `filmLab.recipeWarnings.codes.<code>`
 * and pattern keys under `filmLab.recipeWarnings.patterns.*`.
 *
 * @param {string | null | undefined} line
 * @param {(key: string, vars?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function translateRecipeSoftWarningsLine(line, t) {
  if (typeof line !== 'string' || line.trim() === '') {
    return typeof line === 'string' ? line : '';
  }
  /** Legacy UI line before codes-only soft_validate_partial_envelope */
  const LEGACY_SOFT_VALIDATE_PL = 'soft-validate: koperta częściowo poza schematem';

  const segments = line.split(/\s*—\s*/).map((s) => s.trim()).filter(Boolean);
  const mappedSegments = segments.map((segment) => {
    if (segment === LEGACY_SOFT_VALIDATE_PL) {
      const key = 'filmLab.recipeWarnings.codes.soft_validate_partial_envelope';
      const tr = t(key);
      return tr === key ? segment : tr;
    }
    const codes = segment.split(/\s*·\s*/).map((c) => c.trim()).filter(Boolean);
    if (!codes.length) {
      return segment;
    }
    return codes.map((code) => translateRecipeWarningCode(code, t)).join(' · ');
  });
  return mappedSegments.join(' — ');
}
