import { isFilmLabRecipeDocumentV1 } from './filmLabRecipeCodec.js';
import { fingerprintRecipeDocumentStable } from './filmLabRecipeFingerprint.js';
import { migrateRecipeDocumentMaskGraphsToIrV1 } from './filmLabMaskGraphIR.js';
import { softValidateRecipeDocument } from './filmLabRecipeValidate.js';

/**
 * Parsuje JSON sidecar / schowka; zwraca dokument tylko dla koperty v1.
 *
 * @param {unknown} text
 * @returns {{ ok: boolean, document: object | null, warnings: string[], error?: string }}
 */
export function parseRecipeDocumentJson(text) {
  if (typeof text !== 'string') {
    return { ok: false, document: null, warnings: ['not_string'] };
  }
  try {
    const data = JSON.parse(text);
    const migrated =
      isFilmLabRecipeDocumentV1(data) ? migrateRecipeDocumentMaskGraphsToIrV1(data) : data;
    const v = softValidateRecipeDocument(migrated);
    const doc = isFilmLabRecipeDocumentV1(migrated) ? migrated : null;
    const warnings = Array.isArray(v.warnings) ? [...v.warnings] : [];
    let fingerprint = null;
    if (doc) {
      const declared =
        typeof doc.meta?.fingerprintStable === 'string' ? doc.meta.fingerprintStable.trim() : '';
      const computed = fingerprintRecipeDocumentStable(doc);
      fingerprint = {
        declared: declared || null,
        computed,
        match: declared ? declared === computed : null,
      };
      if (declared && declared !== computed) {
        warnings.push('fingerprint_mismatch');
      }
    }
    return {
      ok: Boolean(doc),
      document: doc,
      warnings,
      validEnvelope: Boolean(doc) && warnings.length === 0 && v.ok,
      fingerprint,
    };
  } catch (e) {
    return {
      ok: false,
      document: null,
      warnings: ['json_parse_error'],
      error: String(e?.message ?? e),
    };
  }
}
