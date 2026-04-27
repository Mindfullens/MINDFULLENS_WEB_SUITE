/**
 * Plan siatki kafli 2D pod rendering obrazu większego niż `maxTextureDimension2D`.
 * Czysta geometria (bez WebGL/WebGPU) — baza pod przyszły tile pass na GPU.
 *
 * @param {number} imageW
 * @param {number} imageH
 * @param {number} maxTileEdge — maks. szerokość i wysokość jednego kafla (np. limit 2D tekstury)
 * @param {{ overlap?: number }} [options] — `overlap>0` zarezerwowane (blend między kafelkami)
 * @returns {{
 *   tiles: Array<{ x: number, y: number, w: number, h: number, col: number, row: number }>,
 *   cols: number,
 *   rows: number,
 *   imageW: number,
 *   imageH: number,
 *   maxTileEdge: number,
 *   overlap: number,
 *   tileCount: number
 * }}
 */
export function planImageTileGrid(imageW, imageH, maxTileEdge, options = {}) {
  const w = Math.max(0, Math.floor(Number(imageW) || 0));
  const h = Math.max(0, Math.floor(Number(imageH) || 0));
  const M = Math.max(1, Math.floor(Number(maxTileEdge) || 0));
  const overlap = Math.max(0, Math.floor(options.overlap ?? 0));
  if (overlap > 0) {
    throw new Error('planImageTileGrid: overlap>0 is not supported yet');
  }
  if (w < 1 || h < 1) {
    return {
      tiles: [],
      cols: 0,
      rows: 0,
      imageW: w,
      imageH: h,
      maxTileEdge: M,
      overlap: 0,
      tileCount: 0,
    };
  }
  const tiles = [];
  let row = 0;
  for (let y = 0; y < h; y += M) {
    const th = Math.min(M, h - y);
    let col = 0;
    for (let x = 0; x < w; x += M) {
      const tw = Math.min(M, w - x);
      tiles.push({ x, y, w: tw, h: th, col, row });
      col += 1;
    }
    row += 1;
  }
  return {
    tiles,
    cols: Math.ceil(w / M),
    rows: Math.ceil(h / M),
    imageW: w,
    imageH: h,
    maxTileEdge: M,
    overlap: 0,
    tileCount: tiles.length,
  };
}

/**
 * Suma pikseli (powierzchni) wszystkich kafli — do budżetów pamięci / telemetrii.
 * Przy `overlap=0` równa jest `imageW * imageH`.
 *
 * @param {Array<{ w: number, h: number }>} tiles
 * @returns {number}
 */
export function sumTilePixelAreas(tiles) {
  if (!Array.isArray(tiles) || !tiles.length) {
    return 0;
  }
  let s = 0;
  for (const t of tiles) {
    const tw = Math.max(0, Math.floor(Number(t?.w) || 0));
    const th = Math.max(0, Math.floor(Number(t?.h) || 0));
    s += tw * th;
  }
  return s;
}

/**
 * Liczba kafli potrzebnych do pokrycia `w`×`h` przy maks. krawędzi `maxTileEdge`
 * (jak `planImageTileGrid(…, maxTileEdge).tileCount`).
 * Przy `maxTileEdge < 1` albo nieważnych wymiarach obrazu — `null`.
 *
 * @param {number} w
 * @param {number} h
 * @param {number} maxTileEdge
 * @returns {number | null}
 */
export function countImageTilesForMaxEdge(w, h, maxTileEdge) {
  const M = Math.max(0, Math.floor(Number(maxTileEdge) || 0));
  if (M < 1) {
    return null;
  }
  const iw = Math.max(0, Math.floor(Number(w) || 0));
  const ih = Math.max(0, Math.floor(Number(h) || 0));
  if (iw < 1 || ih < 1) {
    return null;
  }
  return planImageTileGrid(iw, ih, M).tileCount;
}
