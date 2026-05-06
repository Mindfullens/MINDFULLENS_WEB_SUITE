/** Semantic version string for placeholder mask graphs (until HME nodes ship). */
export const FILMLAB_MASK_GRAPH_SCHEMA_STUB = 'mindfullens.mask-graph.stub-v0';

/**
 * Empty mask graph skeleton — nodes will hold AI_SUBJECT, LUMA_RANGE, BOOLEAN, …
 *
 * @param {{ id?: string, name?: string }} [opts]
 */
export function createEmptyMaskGraph({ id = 'mask_graph_01', name = 'Mask graph' } = {}) {
  return {
    schema: FILMLAB_MASK_GRAPH_SCHEMA_STUB,
    id,
    name,
    nodes: [],
    meta: { placeholder: true },
  };
}
