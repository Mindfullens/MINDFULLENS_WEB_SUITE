export function drawHistogram(mainCanvas, histogramCanvas) {
  if (!mainCanvas || !histogramCanvas) {
    return;
  }

  const mainContext = mainCanvas.getContext('2d', { willReadFrequently: true });
  const histogramContext = histogramCanvas.getContext('2d');

  if (!mainContext || !histogramContext || !mainCanvas.width || !mainCanvas.height) {
    return;
  }

  const imageData = mainContext.getImageData(0, 0, mainCanvas.width, mainCanvas.height).data;
  const binsR = new Uint32Array(256);
  const binsG = new Uint32Array(256);
  const binsB = new Uint32Array(256);
  const binsL = new Uint32Array(256);
  const step = Math.max(4, Math.floor(imageData.length / 150000)) * 4;

  for (let index = 0; index < imageData.length; index += step) {
    binsR[imageData[index]] += 1;
    binsG[imageData[index + 1]] += 1;
    binsB[imageData[index + 2]] += 1;
    binsL[
      Math.round(
        0.299 * imageData[index] + 0.587 * imageData[index + 1] + 0.114 * imageData[index + 2]
      )
    ] += 1;
  }

  const maxValue = Math.max(...binsL) * 0.8 || 1;
  const width = histogramCanvas.width;
  const height = histogramCanvas.height;

  histogramContext.clearRect(0, 0, width, height);

  const drawChannel = (bins, color) => {
    histogramContext.beginPath();
    histogramContext.moveTo(0, height);

    for (let index = 0; index < 256; index += 1) {
      histogramContext.lineTo(
        (index / 255) * width,
        height - Math.min(1, bins[index] / maxValue) * height
      );
    }

    histogramContext.lineTo(width, height);
    histogramContext.fillStyle = color;
    histogramContext.fill();
  };

  drawChannel(binsR, 'rgba(229,93,93,0.2)');
  drawChannel(binsG, 'rgba(93,232,138,0.2)');
  drawChannel(binsB, 'rgba(93,138,232,0.2)');
  drawChannel(binsL, 'rgba(255,255,255,0.35)');
}
