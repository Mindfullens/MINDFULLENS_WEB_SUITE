/**
 * Host Web Worker dla depth ONNX — singleton `Worker`, kopiowanie rgba do transferu, odbiór Float32Array.
 */

let workerInstance = null;
let requestSeq = 0;

/** @type {Map<number, { resolve: (v: object) => void, reject: (e: Error) => void }>} */
const pending = new Map();

function flushPending(reason) {
  const err = new Error(reason);
  for (const [, { reject }] of pending) {
    reject(err);
  }
  pending.clear();
}

/**
 * @param {MessageEvent} ev
 */
function onWorkerMessage(ev) {
  const { type, requestId, payload, buffer, error } = ev.data ?? {};
  if (type === 'depth-onnx-result') {
    const entry = pending.get(requestId);
    if (!entry) {
      return;
    }
    pending.delete(requestId);
    if (payload?.ok === false) {
      entry.resolve(payload);
      return;
    }
    if (payload?.ok === true && buffer instanceof ArrayBuffer) {
      entry.resolve({
        ok: true,
        buffer: new Float32Array(buffer),
        digest: payload.digest,
        via: 'onnx_worker',
      });
      return;
    }
    entry.resolve(payload);
    return;
  }
  if (type === 'depth-onnx-error') {
    const entry = pending.get(requestId);
    if (!entry) {
      return;
    }
    pending.delete(requestId);
    entry.reject(new Error(String(error ?? 'worker_error')));
  }
}

function getDepthOnnxWorker() {
  if (workerInstance) {
    return workerInstance;
  }
  workerInstance = new Worker(new URL('../workers/filmLabDepthOnnx.worker.js', import.meta.url), {
    type: 'module',
  });
  workerInstance.onmessage = onWorkerMessage;
  workerInstance.onerror = (e) => {
    flushPending(String(e?.message ?? 'depth_onnx_worker_error'));
    workerInstance = null;
  };
  return workerInstance;
}

/**
 * @param {ImageData | { data: Uint8ClampedArray, width: number, height: number }} imageData
 */
export async function inferDepthProxyBufferFromImageDataViaWorker(imageData) {
  const w = imageData.width;
  const h = imageData.height;
  const copy = new Uint8ClampedArray(imageData.data.length);
  copy.set(imageData.data);
  const requestId = (requestSeq += 1);

  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    try {
      const worker = getDepthOnnxWorker();
      worker.postMessage(
        {
          type: 'depth-onnx-infer',
          requestId,
          width: w,
          height: h,
          data: copy.buffer,
        },
        [copy.buffer]
      );
    } catch (e) {
      pending.delete(requestId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
