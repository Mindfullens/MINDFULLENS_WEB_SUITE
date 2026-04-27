import { u8RgbaToHalfFloatRgbaForTexImage } from './webglU8RgbaToHalfFloat.js';

/**
 * Sonda: 3D `TEXTURE_3D` w `RGBA16F` + `HALF_FLOAT` + LINEAR (proxy worker §5.1.1.1, analog WebGPU `rgba16float`).
 * @param {WebGL2RenderingContext} gl
 * @returns {boolean}
 */
export function probeWebgl2Rgba16f3dLutUsable(gl) {
  if (typeof gl.RGBA16F === 'undefined' || typeof gl.HALF_FLOAT === 'undefined') {
    return false;
  }
  if (typeof gl.getExtension === 'function') {
    gl.getExtension('EXT_color_buffer_float');
  }
  const u8 = new Uint8Array(8 * 4);
  for (let i = 0; i < 8; i += 1) {
    u8[i * 4] = 128;
    u8[i * 4 + 1] = 64;
    u8[i * 4 + 2] = 32;
    u8[i * 4 + 3] = 255;
  }
  const h = u8RgbaToHalfFloatRgbaForTexImage(u8);
  if (!h) {
    return false;
  }
  const tex = gl.createTexture();
  let ok = false;
  try {
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 2, 2, 2, 0, gl.RGBA, gl.HALF_FLOAT, h);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    ok = gl.getError() === gl.NO_ERROR;
  } catch (_e) {
    ok = false;
  } finally {
    gl.bindTexture(gl.TEXTURE_3D, null);
    if (tex) {
      gl.deleteTexture(tex);
    }
  }
  return ok;
}
