import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES } from '../src/engine/filmLabExportManifestReaderExamples.js';
import {
  FILM_LAB_EXPORT_MANIFEST_COMPAT,
  FILM_LAB_EXPORT_MANIFEST_PROFILE,
  FILM_LAB_EXPORT_MANIFEST_SCHEMA,
  FILM_LAB_EXPORT_MANIFEST_SCHEMA_REFS,
} from '../src/engine/filmLabExportManifestConstants.js';
import {
  assertFilmLabExportDepthDiagnosticsCompatibility,
  attachFilmLabExportManifestDigest,
  buildFilmLabExportManifestExportBlock,
  FILM_LAB_EXPORT_MANIFEST_DIGEST_VALIDATOR_HINTS,
  buildFilmLabExportManifestRootBase,
  computeFilmLabDepthProxyVariant,
  computeFilmLabExportManifestCapabilities,
  hasFilmLabDepthProxyArtifacts,
  normalizeLegacyManifestDepthDiagnostics,
  resolveFilmLabExportDepthDiagnostics,
  upgradeLegacyAfterRecipeDepthTrace,
  validateFilmLabExportDepthDiagnosticsCompatibility,
  warnFilmLabExportDepthDiagnosticsCompatibility,
} from '../src/engine/filmLabExportManifestHelpers.js';
import {
  assertFilmLabExportOptionalScenariosSemantics,
  canonicalFilmLabExportManifestArtifactRoleForVariant,
} from '../src/engine/filmLabExportManifestOptionalScenarioSemantics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function sha256HexFromBytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function stableManifestBytes(payload) {
  return new TextEncoder().encode(JSON.stringify(payload, null, 2));
}

function computeManifestDigest(payloadWithoutDigest) {
  return sha256HexFromBytes(stableManifestBytes(payloadWithoutDigest));
}

function cloneWithoutManifestDigest(manifestWithDigest) {
  const clone = JSON.parse(JSON.stringify(manifestWithDigest));
  delete clone.manifestDigest;
  return clone;
}

const examples = FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES;
assert.equal(examples.schemaHint?.schema, 'filmLab.export.manifest.v1');
assert.equal(examples.schemaHint?.profile, 'pro-export-audit-v1');
assert.equal(examples.schemaHint?.examplesVersion, 1);
assert.equal(
  examples.singleModeRootBeforeDigest.schema,
  examples.schemaHint.schema,
  'schemaHint.schema must match single root schema'
);
assert.equal(
  examples.batchModeRootBeforeDigest.schema,
  examples.schemaHint.schema,
  'schemaHint.schema must match batch root schema'
);
assert.equal(
  examples.singleModeRootBeforeDigest.manifestProfile,
  examples.schemaHint.profile,
  'schemaHint.profile must match single root manifestProfile'
);
assert.equal(
  examples.batchModeRootBeforeDigest.manifestProfile,
  examples.schemaHint.profile,
  'schemaHint.profile must match batch root manifestProfile'
);
assert.equal(examples.schemaHint.schema, FILM_LAB_EXPORT_MANIFEST_SCHEMA);
assert.equal(examples.schemaHint.profile, FILM_LAB_EXPORT_MANIFEST_PROFILE);
assert.deepEqual(
  FILM_LAB_EXPORT_MANIFEST_SCHEMA_REFS,
  [
    'urn:mindfullens:filmLab:exportManifest:v1',
    `urn:mindfullens:filmLab:exportManifestProfile:${FILM_LAB_EXPORT_MANIFEST_PROFILE}`,
  ],
  'manifest schemaRefs constants should keep URN contract'
);
assert.deepEqual(
  FILM_LAB_EXPORT_MANIFEST_COMPAT,
  {
    requiredSchema: FILM_LAB_EXPORT_MANIFEST_SCHEMA,
    minReaderVersion: 1,
  },
  'manifest compat constants should keep reader contract'
);
assert.ok(
  Number.isInteger(examples.schemaHint.examplesVersion) && examples.schemaHint.examplesVersion >= 1,
  'schemaHint.examplesVersion must be an integer >= 1'
);

assertFilmLabExportOptionalScenariosSemantics(examples.optionalScenarios);

const rootBaseProbe = buildFilmLabExportManifestRootBase({
  moduleName: 'test.exportManifest.rootBaseProbe',
  mode: 'single',
  exportSessionId: '00000000-0000-4000-8000-000000000000',
  artifactEntries: [{ variant: 'after', artifactRole: 'primary' }],
  serviceBuildTag: 'test-build-tag',
  serviceBuildLabel: 'test-build-label',
  viewportBuildMarker: 'test-marker',
});
assert.equal(rootBaseProbe.schema, FILM_LAB_EXPORT_MANIFEST_SCHEMA);
assert.equal(rootBaseProbe.manifestProfile, FILM_LAB_EXPORT_MANIFEST_PROFILE);
assert.deepEqual(rootBaseProbe.schemaRefs, [...FILM_LAB_EXPORT_MANIFEST_SCHEMA_REFS]);
assert.deepEqual(rootBaseProbe.compat, { ...FILM_LAB_EXPORT_MANIFEST_COMPAT });
assert.deepEqual(
  rootBaseProbe.capabilities,
  computeFilmLabExportManifestCapabilities([{ variant: 'after', artifactRole: 'primary' }]),
  'root base helper must delegate capabilities to shared computation'
);
assert.deepEqual(
  rootBaseProbe.capabilities,
  [
    'manifest.integrity.sha256',
    'manifest.variant.roles',
    'manifest.runtime.tier',
    'manifest.export.session',
    'manifest.reader.examples',
    'manifest.reader.examples.optional',
  ],
  'root base helper should keep canonical capability order for after-only manifests'
);
const rootBaseDepthProbe = buildFilmLabExportManifestRootBase({
  moduleName: 'test.exportManifest.rootBaseDepthProbe',
  mode: 'single',
  exportSessionId: '00000000-0000-4000-8000-000000000000',
  artifactEntries: [
    { variant: 'after', artifactRole: 'primary' },
    { variant: 'depth_proxy', artifactRole: 'sidecar' },
  ],
  serviceBuildTag: 'test-build-tag',
  serviceBuildLabel: 'test-build-label',
  viewportBuildMarker: 'test-marker',
});
assert.ok(
  rootBaseDepthProbe.capabilities.includes('export.depth.proxy'),
  'root base helper should include export.depth.proxy capability when depth sidecars are present'
);
assert.equal(
  hasFilmLabDepthProxyArtifacts([{ variant: 'after' }, { variant: 'depth_proxy' }]),
  true,
  'depthProxyPresent helper should detect depth_proxy variant'
);
assert.equal(
  hasFilmLabDepthProxyArtifacts([{ variant: 'after' }, { variant: 'after_recipe' }]),
  false,
  'depthProxyPresent helper should be false without depth variants'
);
assert.equal(
  computeFilmLabDepthProxyVariant([{ variant: 'after' }]),
  'none',
  'depthProxyVariant helper should return none without depth variants'
);
assert.equal(
  computeFilmLabDepthProxyVariant([{ variant: 'after' }, { variant: 'depth_proxy' }]),
  'json',
  'depthProxyVariant helper should return json when only depth_proxy is present'
);
assert.equal(
  computeFilmLabDepthProxyVariant([{ variant: 'after' }, { variant: 'depth_proxy' }, { variant: 'depth_proxy_data' }]),
  'json+f32',
  'depthProxyVariant helper should return json+f32 when both depth variants are present'
);
assert.deepEqual(
  resolveFilmLabExportDepthDiagnostics({}, [{ variant: 'after' }, { variant: 'depth_proxy' }]),
  { depthProxyPresent: true, depthProxyVariant: 'json' },
  'depth diagnostics fallback should derive json variant for legacy manifests without export.depthProxyVariant'
);
assert.equal(
  validateFilmLabExportDepthDiagnosticsCompatibility({
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
    export: { depthProxyVariant: 'none' },
  }),
  "export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts",
  'reader validator should reject depth artifacts when export.depthProxyVariant=none'
);
assert.equal(
  validateFilmLabExportDepthDiagnosticsCompatibility({
    artifacts: [{ variant: 'after' }],
    export: { depthProxyVariant: 'json' },
  }),
  "export.depthProxyVariant='json|json+f32' requires depth_proxy/depth_proxy_data artifacts",
  'reader validator should reject json/json+f32 variant without depth artifacts'
);
assert.equal(
  validateFilmLabExportDepthDiagnosticsCompatibility({
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
    export: { depthProxyVariant: 'json+f32' },
  }),
  "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact",
  'reader validator should reject json+f32 without depth_proxy_data artifact'
);
assert.deepEqual(
  resolveFilmLabExportDepthDiagnostics(
    { depthProxyVariant: 'json+f32' },
    [{ variant: 'after' }, { variant: 'depth_proxy' }]
  ),
  { depthProxyPresent: true, depthProxyVariant: 'json' },
  'depth diagnostics resolver should degrade json+f32 to json when .f32 artifact is missing'
);
assert.equal(
  assertFilmLabExportDepthDiagnosticsCompatibility({
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }, { variant: 'depth_proxy_data' }],
    export: { depthProxyVariant: 'json+f32' },
  }, { label: 'test.strict.ok' }),
  true,
  'strict validator should pass on consistent manifest'
);
assert.throws(
  () =>
    assertFilmLabExportDepthDiagnosticsCompatibility(
      {
        artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
        export: { depthProxyVariant: 'json+f32' },
      },
      { label: 'test.strict.fail' }
    ),
  /\[test\.strict\.fail\].*requires depth_proxy_data artifact/
);
const strictVsWarnFixture = {
  artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  export: { depthProxyVariant: 'json+f32' },
};
const warnReason = warnFilmLabExportDepthDiagnosticsCompatibility(strictVsWarnFixture, 'test.warn.strict', { silent: true });
assert.equal(
  warnReason,
  "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact",
  'warn mode should return reason and allow continuation'
);
assert.throws(
  () => assertFilmLabExportDepthDiagnosticsCompatibility(strictVsWarnFixture, { label: 'test.strict.same-fixture' }),
  /\[test\.strict\.same-fixture\].*requires depth_proxy_data artifact/,
  'strict mode should throw on same fixture where warn mode only reports reason'
);
assert.equal(
  warnFilmLabExportDepthDiagnosticsCompatibility({
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
    export: { depthProxyVariant: 'none' },
  }, 'test.reader', { silent: true }),
  "export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts",
  'warning hook should return incompatibility reason for invalid depth diagnostics'
);
const exportBlockOrderProbe = buildFilmLabExportManifestExportBlock({
  depthProxyVariant: 'json',
  sizeProfile: 'full',
  fileFormat: 'dng',
  pipelineKind: 'webgl2',
  depthProxyPresent: true,
  includeLocalMaskPng: false,
  includeBeforeAfter: false,
  includeRecipeJson: true,
  lossyQuality: undefined,
});
assert.deepEqual(
  Object.keys(exportBlockOrderProbe),
  [
    'depthProxyVariant',
    'sizeProfile',
    'fileFormat',
    'pipelineKind',
    'depthProxyPresent',
    'includeLocalMaskPng',
    'includeBeforeAfter',
    'includeRecipeJson',
  ],
  'manifest.export key order should remain stable for digest shape'
);
const legacyUpgraded = upgradeLegacyAfterRecipeDepthTrace(
  {
    export: {},
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  },
  {
    export: {
      variant: 'after',
      artifactName: 'mindfullens_example_after.dng',
    },
  }
);
assert.equal(legacyUpgraded?.export?.depthMapSource, 'luminance');
assert.equal(legacyUpgraded?.export?.depthProxyDigest, '');
assert.equal(legacyUpgraded?.export?.depthTraceVersion, 1);
const normalizedLegacy = normalizeLegacyManifestDepthDiagnostics(
  {
    export: {},
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  },
  {
    export: { variant: 'after' },
  }
);
assert.equal(normalizedLegacy.manifest?.export?.depthProxyPresent, true);
assert.equal(normalizedLegacy.manifest?.export?.depthProxyVariant, 'json');
assert.equal(normalizedLegacy.afterRecipe?.export?.depthMapSource, 'luminance');
assert.equal(normalizedLegacy.afterRecipe?.export?.depthTraceVersion, 1);
assert.deepEqual(
  Object.keys(rootBaseProbe),
  [
    'schema',
    'manifestVersion',
    'manifestProfile',
    'schemaRefs',
    'compat',
    'generator',
    'capabilities',
    'generatedAt',
    'mode',
    'exportSessionId',
    'build',
    'artifactsCountByVariant',
    'artifactsCountByRole',
    'artifacts',
  ],
  'root base helper should keep stable root key order for digest readability'
);
assert.deepEqual(
  Object.keys(rootBaseProbe.generator || {}),
  ['app', 'module', 'version'],
  'root base helper generator should keep canonical key order'
);
assert.deepEqual(
  Object.keys(rootBaseProbe.build || {}),
  ['serviceBuildTag', 'serviceBuildLabel', 'viewportBuildMarker'],
  'root base helper build should keep canonical key order'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(rootBaseProbe, 'manifestDigest'),
  false,
  'root base helper must not pre-attach manifestDigest'
);
assert.deepEqual(
  rootBaseProbe.artifactsCountByVariant,
  { after: 1 },
  'root base helper should compute artifactsCountByVariant from artifactEntries'
);
assert.deepEqual(
  rootBaseProbe.artifactsCountByRole,
  { primary: 1 },
  'root base helper should compute artifactsCountByRole from artifactEntries'
);
const digestProbePayload = {
  ...rootBaseProbe,
  export: {
    sizeProfile: 'full',
    fileFormat: 'jpeg',
    pipelineKind: 'webgl2',
    includeLocalMaskPng: false,
    includeBeforeAfter: false,
    includeRecipeJson: false,
  },
};
await attachFilmLabExportManifestDigest(digestProbePayload, {
  sha256HexFromBytes: async (bytes) => sha256HexFromBytes(bytes),
});
assert.equal(digestProbePayload.manifestDigest?.algorithm, 'sha256');
assert.equal(digestProbePayload.manifestDigest?.digestScope, 'payload_without_manifestDigest');
assert.ok(
  typeof digestProbePayload.manifestDigest?.digestComputedAt === 'string'
    && digestProbePayload.manifestDigest.digestComputedAt.length > 0,
  'digest helper should stamp digestComputedAt'
);
assert.deepEqual(
  digestProbePayload.manifestDigest?.validatorHints,
  [...FILM_LAB_EXPORT_MANIFEST_DIGEST_VALIDATOR_HINTS],
  'digest helper should use shared validator hints contract'
);
assert.deepEqual(
  digestProbePayload.manifestDigest?.readerExamples,
  FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES,
  'digest helper should embed shared reader examples contract'
);
assert.equal(
  digestProbePayload.manifestDigest?.sha256,
  computeManifestDigest(cloneWithoutManifestDigest(digestProbePayload)),
  'digest helper should hash payload_without_manifestDigest'
);

const singlePayload = {
  ...examples.singleModeRootBeforeDigest,
  artifacts: [{ ...examples.artifactRowPrimary }],
};
const singleDigest = computeManifestDigest(singlePayload);
const singleManifest = {
  ...singlePayload,
  manifestDigest: {
    algorithm: 'sha256',
    digestScope: 'payload_without_manifestDigest',
    digestComputedAt: '2026-04-29T00:00:00.000Z',
    sha256: singleDigest,
  },
};

const singleRecomputed = computeManifestDigest(cloneWithoutManifestDigest(singleManifest));
assert.equal(singleManifest.manifestDigest.sha256, singleRecomputed);

const tamperedSingle = JSON.parse(JSON.stringify(singleManifest));
tamperedSingle.artifacts[0].fileName = 'mindfullens_example_after_tampered.jpg';
const tamperedDigest = computeManifestDigest(cloneWithoutManifestDigest(tamperedSingle));
assert.notEqual(singleManifest.manifestDigest.sha256, tamperedDigest);

const batchPayload = {
  ...examples.batchModeRootBeforeDigest,
  artifacts: [{ ...examples.artifactRowPrimary, fileName: 'mindfullens_frame_001_after.jpg' }],
};
const batchDigest = computeManifestDigest(batchPayload);
const batchManifest = {
  ...batchPayload,
  manifestDigest: {
    algorithm: 'sha256',
    digestScope: 'payload_without_manifestDigest',
    digestComputedAt: '2026-04-29T00:00:00.000Z',
    sha256: batchDigest,
  },
};

const batchRecomputed = computeManifestDigest(cloneWithoutManifestDigest(batchManifest));
assert.equal(batchManifest.manifestDigest.sha256, batchRecomputed);

function assertScenarioArtifacts(name, expectations) {
  const scenario = examples.optionalScenarios?.[name];
  assert.ok(scenario, `Missing optional scenario: ${name}`);
  assert.equal(scenario.mode, expectations.mode, `${name}: mode mismatch`);
  assert.equal(scenario.export.fileFormat, expectations.fileFormat, `${name}: fileFormat mismatch`);
  assert.equal(
    Boolean(scenario.export.includeRecipeJson),
    expectations.includeRecipeJson,
    `${name}: includeRecipeJson mismatch`
  );
  const variants = scenario.artifacts.map((a) => a.variant);
  assert.deepEqual(variants, expectations.variants, `${name}: artifact variants mismatch`);
}

function assertDepthProxyCrossCheckOnScenario(name) {
  const scenario = examples.optionalScenarios?.[name];
  assert.ok(scenario, `Missing optional scenario for depth cross-check: ${name}`);
  const variants = scenario.artifacts.map((a) => String(a.variant ?? ''));
  const hasDepthProxy = variants.includes('depth_proxy') || variants.includes('depth_proxy_data');
  const hasAfterRecipe = variants.includes('after_recipe');
  if (hasDepthProxy && hasAfterRecipe) {
    assert.equal(
      Boolean(scenario.export.includeRecipeJson),
      true,
      `${name}: depth_proxy/depth_proxy_data requires includeRecipeJson=true when after_recipe is present`
    );
  }
}

function deriveCapabilitiesFromScenario(scenario) {
  const caps = [
    'manifest.integrity.sha256',
    'manifest.variant.roles',
    'manifest.runtime.tier',
    'manifest.export.session',
    'manifest.reader.examples',
    'manifest.reader.examples.optional',
  ];
  const variants = scenario.artifacts.map((a) => a.variant);
  if (variants.includes('before')) {
    caps.push('export.before');
  }
  if (variants.includes('mask')) {
    caps.push('export.mask.alpha');
  }
  if (variants.includes('depth_proxy') || variants.includes('depth_proxy_data')) {
    caps.push('export.depth.proxy');
  }
  if (variants.some((v) => String(v).includes('recipe'))) {
    caps.push('manifest.recipe.sidecar');
  }
  return caps;
}

function assertCapabilitiesSequenceAndUniqueness(name, caps) {
  const unique = new Set(caps);
  assert.equal(caps.length, unique.size, `${name}: capabilities must not contain duplicates`);

  const basePrefix = [
    'manifest.integrity.sha256',
    'manifest.variant.roles',
    'manifest.runtime.tier',
    'manifest.export.session',
    'manifest.reader.examples',
    'manifest.reader.examples.optional',
  ];
  assert.deepEqual(
    caps.slice(0, basePrefix.length),
    basePrefix,
    `${name}: capabilities must keep canonical base prefix order`
  );
}

function deriveCountByVariant(artifacts) {
  return artifacts.reduce((acc, artifact) => {
    const key = String(artifact?.variant ?? 'unknown');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function deriveCountByRole(artifacts) {
  return artifacts.reduce((acc, artifact) => {
    const key = String(artifact?.artifactRole ?? 'unknown');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function assertScenarioCounts(name) {
  const scenario = examples.optionalScenarios?.[name];
  assert.ok(scenario, `Missing optional scenario for count checks: ${name}`);
  const expectedByVariant = deriveCountByVariant(scenario.artifacts);
  const expectedByRole = deriveCountByRole(scenario.artifacts);
  const fromRootHelper = buildFilmLabExportManifestRootBase({
    moduleName: `test.optionalScenario.${name}`,
    mode: scenario.mode,
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    artifactEntries: scenario.artifacts,
    serviceBuildTag: 'test-build-tag',
    serviceBuildLabel: 'test-build-label',
    viewportBuildMarker: 'test-marker',
  });
  assert.deepEqual(
    fromRootHelper.artifactsCountByVariant,
    expectedByVariant,
    `${name}: root helper artifactsCountByVariant mismatch`
  );
  assert.deepEqual(
    fromRootHelper.artifactsCountByRole,
    expectedByRole,
    `${name}: root helper artifactsCountByRole mismatch`
  );
}

function assertScenarioCapabilities(name, expectations) {
  const scenario = examples.optionalScenarios?.[name];
  assert.ok(scenario, `Missing optional scenario for capabilities: ${name}`);
  const caps = deriveCapabilitiesFromScenario(scenario);
  assertCapabilitiesSequenceAndUniqueness(name, caps);
  for (const required of expectations.mustInclude ?? []) {
    assert.ok(caps.includes(required), `${name}: expected capability missing: ${required}`);
  }
  for (const forbidden of expectations.mustNotInclude ?? []) {
    assert.ok(!caps.includes(forbidden), `${name}: forbidden capability present: ${forbidden}`);
  }
}

function extensionFromFileName(fileName) {
  const name = String(fileName || '').toLowerCase();
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1) : '';
}

function assertMimeAndExtensionConsistency(name) {
  const scenario = examples.optionalScenarios?.[name];
  assert.ok(scenario, `Missing optional scenario for mime/extension checks: ${name}`);
  for (const artifact of scenario.artifacts) {
    const ext = extensionFromFileName(artifact.fileName);
    const mime = String(artifact.mimeType || '').toLowerCase();
    if (mime === 'image/jpeg') {
      assert.ok(ext === 'jpg' || ext === 'jpeg', `${name}: jpeg mime must use .jpg/.jpeg (${artifact.fileName})`);
    } else if (mime === 'image/png') {
      assert.equal(ext, 'png', `${name}: png mime must use .png (${artifact.fileName})`);
    } else if (mime === 'image/tiff') {
      assert.ok(ext === 'tif' || ext === 'tiff', `${name}: tiff mime must use .tif/.tiff (${artifact.fileName})`);
    } else if (mime === 'image/avif') {
      assert.equal(ext, 'avif', `${name}: avif mime must use .avif (${artifact.fileName})`);
    } else if (mime === 'image/webp') {
      assert.equal(ext, 'webp', `${name}: webp mime must use .webp (${artifact.fileName})`);
    } else if (mime === 'application/json') {
      assert.equal(ext, 'json', `${name}: json mime must use .json (${artifact.fileName})`);
    } else if (mime === 'application/octet-stream') {
      assert.equal(ext, 'f32', `${name}: octet-stream depth payload must use .f32 (${artifact.fileName})`);
    } else if (mime === 'application/vnd.adobe.photoshop') {
      assert.equal(ext, 'psd', `${name}: psd mime must use .psd (${artifact.fileName})`);
    } else if (mime === 'image/x-adobe-dng') {
      assert.equal(ext, 'dng', `${name}: dng mime must use .dng (${artifact.fileName})`);
    } else {
      assert.fail(`${name}: unsupported mime in optional scenario: ${mime}`);
    }
  }
}

function assertArtifactRequiredFields(name) {
  const scenario = examples.optionalScenarios?.[name];
  assert.ok(scenario, `Missing optional scenario for required-field checks: ${name}`);
  for (const artifact of scenario.artifacts) {
    assert.ok(typeof artifact.variant === 'string' && artifact.variant.length > 0, `${name}: missing variant`);
    assert.ok(
      typeof artifact.artifactRole === 'string' && artifact.artifactRole.length > 0,
      `${name}: missing artifactRole`
    );
    assert.ok(typeof artifact.fileName === 'string' && artifact.fileName.length > 0, `${name}: missing fileName`);
    assert.ok(typeof artifact.mimeType === 'string' && artifact.mimeType.length > 0, `${name}: missing mimeType`);
  }
}

function assertUniqueArtifactFileNames(name) {
  const scenario = examples.optionalScenarios?.[name];
  assert.ok(scenario, `Missing optional scenario for unique filename checks: ${name}`);
  const seen = new Set();
  for (const artifact of scenario.artifacts) {
    const key = String(artifact.fileName || '');
    assert.ok(!seen.has(key), `${name}: duplicate artifact fileName detected: ${key}`);
    seen.add(key);
  }
}

function assertArtifactIdentityPlaceholders() {
  const rows = [
    examples.artifactRowPrimary,
    examples.artifactRowSidecarRecipe,
    examples.artifactRowAuxMask,
  ];
  const exportSessionIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i;
  const allowedPipelineKinds = new Set(['webgl2', 'webgpu', 'cpu']);
  for (const row of rows) {
    assert.ok(row && typeof row === 'object', 'artifactRow example must be an object');
    assert.ok(
      typeof row.exportSessionId === 'string' && exportSessionIdRegex.test(row.exportSessionId),
      `artifactRow ${row?.variant ?? 'unknown'} must include valid placeholder exportSessionId`
    );
    assert.ok(
      typeof row.pipelineKind === 'string' && allowedPipelineKinds.has(row.pipelineKind),
      `artifactRow ${row?.variant ?? 'unknown'} must include valid placeholder pipelineKind`
    );
  }
}

function assertArtifactRowBlueprintConsistency() {
  const rows = [
    examples.artifactRowPrimary,
    examples.artifactRowSidecarRecipe,
    examples.artifactRowAuxMask,
  ];
  const seenVariants = new Set();
  for (const row of rows) {
    const variant = String(row?.variant || '');
    assert.ok(
      variant === 'after' || variant === 'before' || variant === 'mask' || variant.endsWith('_recipe'),
      `artifactRow: unsupported variant in blueprint: ${variant}`
    );
    assert.ok(!seenVariants.has(variant), `artifactRow: duplicate variant in blueprint: ${variant}`);
    seenVariants.add(variant);
    const expectedRole = canonicalFilmLabExportManifestArtifactRoleForVariant(variant);
    assert.ok(expectedRole, `artifactRow: unknown variant for role mapping: ${variant}`);
    assert.equal(
      row.artifactRole,
      expectedRole,
      `artifactRow: variant ${variant} must map to artifactRole ${expectedRole}`
    );
  }
}

function assertArtifactRowFullRuntimeFields() {
  const rows = [
    examples.artifactRowPrimary,
    examples.artifactRowSidecarRecipe,
    examples.artifactRowAuxMask,
  ];
  const CANONICAL_ARTIFACT_ROW_KEY_ORDER = [
    'variant',
    'artifactRole',
    'fileName',
    'mimeType',
    'byteLength',
    'sha256',
    'exportSessionId',
    'pipelineKind',
  ];
  const sha256Hex = /^[0-9a-f]{64}$/i;
  for (const row of rows) {
    const variant = String(row?.variant ?? 'unknown');
    assert.ok(
      Number.isInteger(row.byteLength) && row.byteLength >= 0,
      `artifactRow ${variant}: byteLength must be a non-negative integer`
    );
    assert.ok(
      typeof row.sha256 === 'string' && sha256Hex.test(row.sha256),
      `artifactRow ${variant}: sha256 must be a 64-char hex string`
    );
    assert.deepEqual(
      Object.keys(row),
      CANONICAL_ARTIFACT_ROW_KEY_ORDER,
      `artifactRow ${variant}: canonical runtime row keys must follow ${CANONICAL_ARTIFACT_ROW_KEY_ORDER.join(', ')}`
    );
  }
}

function assertAllowedVariantNames(name) {
  const scenario = examples.optionalScenarios?.[name];
  assert.ok(scenario, `Missing optional scenario for variant whitelist checks: ${name}`);
  for (const artifact of scenario.artifacts) {
    const variant = String(artifact.variant || '');
    const isAllowed =
      variant === 'after'
      || variant === 'before'
      || variant === 'mask'
      || variant === 'depth_proxy'
      || variant === 'depth_proxy_data'
      || variant.endsWith('_recipe');
    assert.ok(isAllowed, `${name}: unsupported variant name in optional scenario: ${variant}`);
  }
}

const OPTIONAL_SCENARIO_NAMES = Object.keys(examples.optionalScenarios ?? {});
for (const scenarioName of OPTIONAL_SCENARIO_NAMES) {
  const scenario = examples.optionalScenarios?.[scenarioName];
  const variants = scenario.artifacts.map((a) => a.variant);
  assertScenarioArtifacts(scenarioName, {
    mode: scenario.mode,
    fileFormat: scenario.export.fileFormat,
    includeRecipeJson: Boolean(scenario.export.includeRecipeJson),
    variants,
  });
  const mustInclude = ['manifest.reader.examples', 'manifest.reader.examples.optional'];
  if (variants.includes('before')) {
    mustInclude.push('export.before');
  }
  if (variants.includes('mask')) {
    mustInclude.push('export.mask.alpha');
  }
  if (variants.includes('depth_proxy') || variants.includes('depth_proxy_data')) {
    mustInclude.push('export.depth.proxy');
  }
  if (variants.some((v) => String(v).includes('recipe'))) {
    mustInclude.push('manifest.recipe.sidecar');
  }

  const mustNotInclude = [];
  if (!variants.includes('before')) {
    mustNotInclude.push('export.before');
  }
  if (!variants.includes('mask')) {
    mustNotInclude.push('export.mask.alpha');
  }
  if (!variants.includes('depth_proxy') && !variants.includes('depth_proxy_data')) {
    mustNotInclude.push('export.depth.proxy');
  }
  if (!variants.some((v) => String(v).includes('recipe'))) {
    mustNotInclude.push('manifest.recipe.sidecar');
  }
  assertScenarioCapabilities(scenarioName, { mustInclude, mustNotInclude });
  assertScenarioCounts(scenarioName);
  assertMimeAndExtensionConsistency(scenarioName);
  assertArtifactRequiredFields(scenarioName);
  assertUniqueArtifactFileNames(scenarioName);
  assertDepthProxyCrossCheckOnScenario(scenarioName);
}

assertArtifactIdentityPlaceholders();
assertArtifactRowBlueprintConsistency();
assertArtifactRowFullRuntimeFields();
for (const scenarioName of OPTIONAL_SCENARIO_NAMES) {
  assertAllowedVariantNames(scenarioName);
}

async function readRepoUtf8(rel) {
  return fs.readFile(path.join(repoRoot, rel), 'utf8');
}

function assertBeforeImageManifestRoleIsSidecar({ source, label }) {
  const patterns =
    label === 'batchProcessor.processBatch'
      ? [/manifestEntries\.push\([\s\S]*?variant:\s*'before',[\s\S]*?\)\);/g]
      : [/manifestArtifacts\.push\([\s\S]*?variant:\s*'before',[\s\S]*?\)\);/g];

  let found = false;
  for (const re of patterns) {
    for (const match of source.matchAll(re)) {
      const block = match[0] ?? '';
      if (block.includes("variant: 'before_recipe'") || block.includes('before_recipe')) {
        continue;
      }
      found = true;
      assert.match(
        block,
        /variant:\s*'before',[\s\S]*?artifactRole:\s*'sidecar'/m,
        `${label}: before image manifest entry must use artifactRole sidecar`
      );
      assert.equal(
        /variant:\s*'before',[\s\S]*?artifactRole:\s*'primary'/m.test(block),
        false,
        `${label}: before image manifest entry must not use artifactRole primary`
      );
    }
  }
  assert.ok(found, `${label}: expected at least one manifest push containing variant before`);
}

function assertDepthProxyManifestRoleIsSidecar({ source, label }) {
  const patterns =
    label === 'batchProcessor.processBatch'
      ? [/manifestEntries\.push\([\s\S]*?variant:\s*'depth_proxy',[\s\S]*?\)\);/g]
      : [/manifestArtifacts\.push\([\s\S]*?variant:\s*'depth_proxy',[\s\S]*?\)\);/g];

  let found = false;
  for (const re of patterns) {
    for (const match of source.matchAll(re)) {
      const block = match[0] ?? '';
      found = true;
      assert.match(
        block,
        /variant:\s*'depth_proxy',[\s\S]*?artifactRole:\s*'sidecar'/m,
        `${label}: depth_proxy manifest entry must use artifactRole sidecar`
      );
    }
  }
  assert.ok(found, `${label}: expected manifest entry containing variant depth_proxy`);
}

function assertAfterRecipeDepthTraceFields({ source, label }) {
  assert.match(
    source,
    /if \(variant === 'after'\) \{[\s\S]*?exportBlock\.depthMapSource[\s\S]*?exportBlock\.depthProxyDigest[\s\S]*?\}/m,
    `${label}: export recipe snapshot should expose depthMapSource + depthProxyDigest for after variant`
  );
  assert.match(
    source,
    /const depthMapSourceForAfterRecipe = String\(adjustments\?\.depthMapSource \?\? 'luminance'\);[\s\S]*?depthProxyDigestForAfterRecipe[\s\S]*?depthMapSource:\s*depthMapSourceForAfterRecipe[\s\S]*?depthProxyDigest:\s*depthProxyDigestForAfterRecipe/m,
    `${label}: after_recipe payload should pass depthMapSource/depthProxyDigest into buildExportRecipeSnapshot`
  );
  assert.match(
    source,
    /buildRecipeObject:[\s\S]*?buildExportRecipeSnapshot\({[\s\S]*?depthMapSource:\s*String\(adjustments\?\.depthMapSource \?\? 'luminance'\),[\s\S]*?depthProxyDigest:[\s\S]*?depthOnnxExternalRef\.current\?\.digest/m,
    `${label}: batch recipe builder should forward depthMapSource/depthProxyDigest for after recipe trace/debug`
  );
}

const engineSource = await readRepoUtf8('src/engine/useFilmLabEngine.js');
const batchSource = await readRepoUtf8('src/engine/batchProcessor.js');
assertBeforeImageManifestRoleIsSidecar({ source: engineSource, label: 'useFilmLabEngine.exportImage' });
assertBeforeImageManifestRoleIsSidecar({ source: batchSource, label: 'batchProcessor.processBatch' });
assertDepthProxyManifestRoleIsSidecar({ source: engineSource, label: 'useFilmLabEngine.exportImage' });
assertDepthProxyManifestRoleIsSidecar({ source: batchSource, label: 'batchProcessor.processBatch' });
assertAfterRecipeDepthTraceFields({ source: engineSource, label: 'useFilmLabEngine.exportImage' });

console.log('PASS export manifest digest reader example');
