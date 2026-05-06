import { analyzeLocalMaskAiAssistPresetSync } from '../localMaskAiAssistCore.js';

self.onmessage = (event) => {
  const data = event?.data ?? {};
  if (data?.type !== 'analyze-local-mask-ai-assist') {
    return;
  }
  const requestId = data.requestId;
  try {
    const result = analyzeLocalMaskAiAssistPresetSync(data.payload ?? {});
    self.postMessage({
      type: 'analyze-local-mask-ai-assist-result',
      requestId,
      result,
    });
  } catch (error) {
    self.postMessage({
      type: 'analyze-local-mask-ai-assist-error',
      requestId,
      error: String(error?.message ?? error ?? 'Unknown worker error'),
    });
  }
};
