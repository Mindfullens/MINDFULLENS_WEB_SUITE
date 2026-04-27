/**
 * Output Sharpening Module — Unsharp Mask (3×3 Convolution)
 *
 * Professional-grade sharpening applied as the very last step before JPEG
 * encoding.  The algorithm computes a blurred version of each pixel via a
 * 3×3 Gaussian-like kernel, subtracts it from the original, and adds the
 * high-frequency residual back scaled by `amount`.
 *
 * Parameters
 * ----------
 * amount : 0 – 1  (recommended 0.35 – 0.55 for "Sharpen for Screen")
 *          Values above 0.6 start to look aggressive / oversharpened.
 *
 * The kernel weights used here match a σ ≈ 0.65 Gaussian which maps well
 * to the "Web / Screen" preset found in Adobe Lightroom Classic's export
 * dialog.
 */

/**
 * Apply an Unsharp-Mask sharpening pass directly on a Canvas 2D context.
 *
 * @param {CanvasRenderingContext2D} context  – The 2D context to sharpen.
 * @param {number} width   – Canvas width in pixels.
 * @param {number} height  – Canvas height in pixels.
 * @param {number} amount  – Sharpening strength (0 = none, 1 = maximum).
 */
export function applyOutputSharpening(context, width, height, amount = 0.42) {
  if (amount <= 0 || width < 3 || height < 3) {
    return;
  }

  const imageData = context.getImageData(0, 0, width, height);
  const src = imageData.data;                         // Uint8ClampedArray (RGBA)
  const dst = new Uint8ClampedArray(src.length);      // writable copy

  // 3×3 Gaussian-ish kernel (σ ≈ 0.65)
  //   1  2  1
  //   2  4  2   /  16
  //   1  2  1
  const stride = width * 4;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * stride + x * 4;

      for (let c = 0; c < 3; c++) {
        // Compute the 3×3 weighted average (blur)
        const blur =
          (src[idx - stride - 4 + c]      +     // top-left
           src[idx - stride     + c] * 2  +     // top
           src[idx - stride + 4 + c]      +     // top-right
           src[idx          - 4 + c] * 2  +     // left
           src[idx              + c] * 4  +     // center
           src[idx          + 4 + c] * 2  +     // right
           src[idx + stride - 4 + c]      +     // bottom-left
           src[idx + stride     + c] * 2  +     // bottom
           src[idx + stride + 4 + c]) / 16;     // bottom-right

        // High-pass residual
        const original = src[idx + c];
        const detail = original - blur;

        // Add detail back, scaled by amount
        const sharpened = original + detail * amount;

        // Clamp to [0, 255]
        dst[idx + c] = sharpened < 0 ? 0 : sharpened > 255 ? 255 : (sharpened + 0.5) | 0;
      }

      // Alpha passes through untouched
      dst[idx + 3] = src[idx + 3];
    }
  }

  // Copy the 1 px border rows/columns straight from "src" (they cannot
  // be sharpened without padding).
  for (let x = 0; x < width; x++) {
    const topIdx = x * 4;
    const botIdx = (height - 1) * stride + x * 4;
    dst[topIdx]     = src[topIdx];
    dst[topIdx + 1] = src[topIdx + 1];
    dst[topIdx + 2] = src[topIdx + 2];
    dst[topIdx + 3] = src[topIdx + 3];
    dst[botIdx]     = src[botIdx];
    dst[botIdx + 1] = src[botIdx + 1];
    dst[botIdx + 2] = src[botIdx + 2];
    dst[botIdx + 3] = src[botIdx + 3];
  }

  for (let y = 1; y < height - 1; y++) {
    const leftIdx  = y * stride;
    const rightIdx = y * stride + (width - 1) * 4;
    dst[leftIdx]      = src[leftIdx];
    dst[leftIdx + 1]  = src[leftIdx + 1];
    dst[leftIdx + 2]  = src[leftIdx + 2];
    dst[leftIdx + 3]  = src[leftIdx + 3];
    dst[rightIdx]     = src[rightIdx];
    dst[rightIdx + 1] = src[rightIdx + 1];
    dst[rightIdx + 2] = src[rightIdx + 2];
    dst[rightIdx + 3] = src[rightIdx + 3];
  }

  // Write sharpened pixels back to the context
  imageData.data.set(dst);
  context.putImageData(imageData, 0, 0);
}
