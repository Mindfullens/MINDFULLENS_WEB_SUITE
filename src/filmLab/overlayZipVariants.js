export const DUST_ZIP_DEFAULT_STRENGTH = 42;
export const DUST_ZIP_VARIANTS = 15;
export const RAW_LEAK_ZIP_VARIANTS = 46;
export const FILMSTRIP_ZIP_VARIANTS = 15;

export function getNextRandomVariant(currentVariant, variantsCount) {
  if (variantsCount <= 1) {
    return 0;
  }

  let nextVariant = Math.floor(Math.random() * variantsCount);

  if (nextVariant === currentVariant) {
    nextVariant = (nextVariant + 1 + Math.floor(Math.random() * (variantsCount - 1))) % variantsCount;
  }

  return nextVariant;
}
