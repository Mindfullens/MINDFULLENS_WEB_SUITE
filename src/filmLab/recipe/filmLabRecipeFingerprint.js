/**
 * Prosty fingerprint dokumentu recipe (invalidacja cache / porównanie batch).
 * Deterministyczny po usunięciu meta.encodedAtMs — patrz stripVolatileMetaForFingerprint.
 */

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const VOLATILE_KEYS = new Set([
  'encodedAtMs',
  'generatedAt',
  'fingerprintStable',
  'fingerprintAlgorithm',
]);

function stripVolatileDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripVolatileDeep(item));
  }
  if (value && typeof value === 'object') {
    const next = {};
    for (const key of Object.keys(value)) {
      if (VOLATILE_KEYS.has(key)) {
        continue;
      }
      next[key] = stripVolatileDeep(value[key]);
    }
    return next;
  }
  return value;
}

/**
 * Usuwa volatile pola przed fingerprintem (`meta.encodedAtMs`, `generatedAt` w grafach, …).
 */
export function stripVolatileMetaForFingerprint(doc) {
  if (!doc || typeof doc !== 'object') {
    return doc;
  }
  const copy = JSON.parse(JSON.stringify(doc));
  return stripVolatileDeep(copy);
}

/**
 * @param {object} recipeDocument
 */
export function fingerprintRecipeDocumentStable(recipeDocument) {
  const stable = stripVolatileMetaForFingerprint(recipeDocument);
  const json = JSON.stringify(stable);
  return djb2(json);
}
