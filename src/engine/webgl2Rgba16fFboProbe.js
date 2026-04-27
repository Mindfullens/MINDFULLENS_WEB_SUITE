/**
 * Sonda: czy można użyć `RGBA16F` + `HALF_FLOAT` jako załącznik koloru w FBO (WebGL2, zwykle `EXT_color_buffer_float`).
 * Wspólna dla szybkiego podglądu głównego wątku i `proxyGpuRenderer` w workerze (plan §5.1.1.1 / §5.1.1.3).
 * @param {WebGL2RenderingContext} gl
 * @returns {boolean}
 */
export function probeWebgl2Rgba16fFboUsable(gl) {
  if (typeof gl.RGBA16F === 'undefined' || typeof gl.HALF_FLOAT === 'undefined') {
    return false;
  }
  if (typeof gl.getExtension === 'function') {
    gl.getExtension('EXT_color_buffer_float');
  }
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let ok = false;
  try {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } catch (_err) {
    ok = false;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (fbo) {
      gl.deleteFramebuffer(fbo);
    }
    if (tex) {
      gl.deleteTexture(tex);
    }
  }
  return ok;
}
