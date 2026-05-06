function identityFromFile(file) {
  if (!(file instanceof File)) {
    return '';
  }
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function identityFromAsset(asset) {
  if (!asset || typeof asset !== 'object') {
    return '';
  }
  return `${asset.sourceName}:${asset.sourceSize}:${asset.sourceLastModified}`;
}

function nextAssetOrdinal(assets) {
  let max = 0;
  for (const a of assets) {
    const m = /^asset_(\d+)$/.exec(String(a?.id ?? ''));
    if (m) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}

/**
 * @param {object} doc
 * @param {File[]} files
 * @returns {{ doc: object, added: Array<{ id: string, file: File }> }}
 */
export function appendCatalogImportFiles(doc, files) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.assets)) {
    return { doc, added: [] };
  }
  if (!Array.isArray(files) || files.length === 0) {
    return { doc, added: [] };
  }

  const existing = new Set(doc.assets.map((a) => identityFromAsset(a)).filter(Boolean));
  const nowIso = new Date().toISOString();
  const assets = doc.assets.slice();
  const added = [];

  for (const file of files) {
    if (!(file instanceof File)) {
      continue;
    }
    const idk = identityFromFile(file);
    if (!idk || existing.has(idk)) {
      continue;
    }
    existing.add(idk);
    const id = `asset_${nextAssetOrdinal(assets)}`;
    assets.push({
      id,
      sourceName: file.name,
      sourceType: file.type,
      sourceSize: file.size,
      sourceLastModified: file.lastModified,
      hasDecodedFrame: false,
      rating: 0,
      pick: 'unreviewed',
      labels: [],
      semanticIndex: { version: 1, tags: [], objects: [] },
      exif: null,
      preview: { embedded: null, standard: null },
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    added.push({ id, file });
  }

  if (added.length === 0) {
    return { doc, added: [] };
  }

  const collections = Array.isArray(doc.collections)
    ? doc.collections.map((c) => ({
        ...c,
        assetIds: Array.isArray(c?.assetIds) ? [...c.assetIds] : [],
      }))
    : [];
  let inboxIdx = collections.findIndex((c) => c?.id === 'inbox');
  if (inboxIdx < 0) {
    collections.push({
      id: 'inbox',
      name: 'Inbox',
      kind: 'system',
      assetIds: assets.map((a) => String(a?.id ?? '')).filter(Boolean),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    inboxIdx = collections.length - 1;
  }
  if (inboxIdx >= 0) {
    const seen = new Set(collections[inboxIdx].assetIds.map(String));
    for (const { id } of added) {
      if (!seen.has(id)) {
        collections[inboxIdx].assetIds.push(id);
        seen.add(id);
      }
    }
    collections[inboxIdx].updatedAt = nowIso;
  }

  return {
    doc: {
      ...doc,
      assets,
      collections,
      generatedAt: nowIso,
    },
    added,
  };
}
