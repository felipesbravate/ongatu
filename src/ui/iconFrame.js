// Each Figma size has its own drawing within the exported family sprite.
export const ICON_SIZES = [10, 12, 16, 20, 24, 32];
export function iconFrame(icon, size = 20) {
  const px = ICON_SIZES.includes(size) ? size : 20;
  // Families without a requested size use their largest exported drawing.
  const sourceSize = icon.sizes[px] ? px : Math.max(...Object.keys(icon.sizes).map(Number));
  return { px, drawing: icon, viewBox: icon.sizes[sourceSize].viewBox };
}
