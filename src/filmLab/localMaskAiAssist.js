import {
  analyzeLocalMaskAiAssistPresetSync,
  buildLocalMaskAiAssistPreset,
} from './localMaskAiAssistCore.js';
import { trySemanticAiMaskOnnxAnalysis } from './onnx/filmLabOnnxRuntimeAdapter.js';

let aiAssistWorker = null;
let aiAssistWorkerUnavailable = false;
let requestSeq = 0;
const pending = new Map();

function ensureAiAssistWorker() {
  if (aiAssistWorkerUnavailable) {
    return null;
  }
  if (aiAssistWorker) {
    return aiAssistWorker;
  }
  if (typeof Worker === 'undefined') {
    aiAssistWorkerUnavailable = true;
    return null;
  }
  try {
    const worker = new Worker(new URL('./workers/localMaskAiAssist.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const message = event?.data ?? {};
      const requestId = Number(message?.requestId);
      if (!Number.isFinite(requestId)) {
        return;
      }
      const resolver = pending.get(requestId);
      if (!resolver) {
        return;
      }
      pending.delete(requestId);
      if (message.type === 'analyze-local-mask-ai-assist-result') {
        resolver.resolve({
          ...message.result,
          backend: 'worker',
        });
      } else {
        resolver.reject(new Error(String(message?.error ?? 'Worker analyze failed')));
      }
    };
    worker.onerror = () => {
      aiAssistWorkerUnavailable = true;
      aiAssistWorker = null;
      for (const [id, resolver] of pending.entries()) {
        pending.delete(id);
        resolver.reject(new Error('AI assist worker unavailable'));
      }
    };
    aiAssistWorker = worker;
    return aiAssistWorker;
  } catch {
    aiAssistWorkerUnavailable = true;
    return null;
  }
}

export async function analyzeLocalMaskAiAssistPreset({ kind, maskIndex, activeCropRectNorm }) {
  const payload = { kind, maskIndex, activeCropRectNorm };
  const onnxFirst = await trySemanticAiMaskOnnxAnalysis(payload);
  if (onnxFirst != null && onnxFirst.mask && typeof onnxFirst.mask === 'object') {
    return {
      mask: onnxFirst.mask,
      confidence: Number(onnxFirst.confidence ?? 0),
      backend: String(onnxFirst.backend ?? 'onnx'),
    };
  }
  const worker = ensureAiAssistWorker();
  if (!worker) {
    await new Promise((resolve) => setTimeout(resolve, kind === 'sky' ? 170 : 210));
    return {
      ...analyzeLocalMaskAiAssistPresetSync(payload),
      backend: 'fallback',
    };
  }
  return new Promise((resolve, reject) => {
    requestSeq += 1;
    const requestId = requestSeq;
    pending.set(requestId, { resolve, reject });
    worker.postMessage({
      type: 'analyze-local-mask-ai-assist',
      requestId,
      payload,
    });
  });
}

export { buildLocalMaskAiAssistPreset };
