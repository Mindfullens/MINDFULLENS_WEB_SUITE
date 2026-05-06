/**
 * Depth sidecar helpers for DNG variant B interchange.
 */

/**
 * @param {{
 *   dngVariant?: 'a'|'b',
 *   depthMapSource?: string,
 *   depthProxyDigest?: string,
 *   width?: number,
 *   height?: number,
 *   pipelineKind?: string|null,
 *   hasBinaryProxy?: boolean
 * }} payload
 * @returns {Uint8Array}
 */
export function buildDepthProxySidecarJsonBytes(payload = {}) {
  const out = {
    schema: 'mindfullens.depth-proxy.sidecar.v1',
    dngVariant: payload.dngVariant === 'b' ? 'b' : 'a',
    depthMapSource: String(payload.depthMapSource ?? 'luminance'),
    depthProxyDigest: String(payload.depthProxyDigest ?? ''),
    width: Number.isFinite(payload.width) ? Math.max(1, Math.floor(payload.width)) : null,
    height: Number.isFinite(payload.height) ? Math.max(1, Math.floor(payload.height)) : null,
    pipelineKind: payload.pipelineKind == null ? null : String(payload.pipelineKind),
    hasBinaryProxy: Boolean(payload.hasBinaryProxy),
  };
  return new TextEncoder().encode(JSON.stringify(out, null, 2));
}

/**
 * Serializes Float32 depth proxy to little-endian bytes.
 *
 * @param {Float32Array | null | undefined} buffer
 * @returns {Uint8Array | null}
 */
export function buildDepthProxyBinaryBytes(buffer) {
  if (!(buffer instanceof Float32Array) || buffer.length === 0) {
    return null;
  }
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}
