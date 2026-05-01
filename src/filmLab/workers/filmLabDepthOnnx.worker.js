/**
 * Web Worker: inferencja mapy głębi ONNX (WASM w osobnym wątku).
 * Host: `filmLabDepthOnnxWorkerClient.js` · rdzeń: `runDepthOnnxInferenceFromImageData`.
 */

import { runDepthOnnxInferenceFromImageData } from '../depth/filmLabDepthOnnxInference.js';

self.onmessage = async (event) => {
  const msg = event?.data ?? {};
  if (msg.type !== 'depth-onnx-infer') {
    return;
  }
  const { requestId, width, height, data } = msg;
  try {
    const dataArr = new Uint8ClampedArray(data);
    const imageData = { width, height, data: dataArr };
    const out = await runDepthOnnxInferenceFromImageData(imageData);
    if (out.ok && out.buffer instanceof Float32Array) {
      self.postMessage(
        {
          type: 'depth-onnx-result',
          requestId,
          payload: { ok: true, digest: out.digest },
          buffer: out.buffer.buffer,
        },
        [out.buffer.buffer]
      );
      return;
    }
    self.postMessage({ type: 'depth-onnx-result', requestId, payload: out });
  } catch (error) {
    self.postMessage({
      type: 'depth-onnx-error',
      requestId,
      error: String(error?.message ?? error ?? 'unknown'),
    });
  }
};
