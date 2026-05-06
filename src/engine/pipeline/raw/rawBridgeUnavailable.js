/**
 * Komunikat z `rawDecode.worker.js` przy HTTP/fetch failure mostka RAW.
 * Ingest (`ingestSource`) przekazuje go w `pipelineInfo.message`.
 */
export const RAW_BRIDGE_UNAVAILABLE_MESSAGE = 'Mostek RAW jest chwilowo niedostępny.';

export function isRawBridgeUnavailablePipelineInfo(pipelineInfo) {
  if (!pipelineInfo || typeof pipelineInfo !== 'object') {
    return false;
  }
  const code = String(pipelineInfo.rawErrorCode ?? pipelineInfo.errorCode ?? '');
  if (code === 'RAW_BRIDGE_UNAVAILABLE') {
    return true;
  }
  const m = String(pipelineInfo.message ?? '');
  return m === RAW_BRIDGE_UNAVAILABLE_MESSAGE || m.includes('Mostek RAW');
}

export function isRawBridgeUnavailableIngestError(error) {
  if (!error) {
    return false;
  }
  const m = error instanceof Error ? error.message : String(error);
  return m.includes('Mostek RAW') || m === RAW_BRIDGE_UNAVAILABLE_MESSAGE;
}
