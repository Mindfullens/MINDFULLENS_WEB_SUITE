export function useFilmLabCropOverlayInteractionFlags({
  hasImage,
  activePanel,
  isStraightenToolArmed,
}) {
  const shouldRenderCropOverlay = hasImage && activePanel === 'crop';
  const isCropInteractionEnabled = shouldRenderCropOverlay && !isStraightenToolArmed;
  const isStraightenInteractionEnabled = shouldRenderCropOverlay && isStraightenToolArmed;
  const isOverlayInteractionEnabled = isCropInteractionEnabled || isStraightenInteractionEnabled;

  return {
    shouldRenderCropOverlay,
    isCropInteractionEnabled,
    isStraightenInteractionEnabled,
    isOverlayInteractionEnabled,
  };
}
