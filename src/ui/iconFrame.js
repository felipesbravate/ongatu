// Which drawing and viewBox an icon uses at a DS size (10 / 12 / 16 / 20 / 24). The drawings are in the 20px frame's coordinates:
// Size=20 is the whole frame; Figma's 12 and 10px variants are that drawing scaled from its inner 18x18 ("1 1 18 18").
// X, Euro and Dollar carry their own 10 and 12px drawings on their own frame.
// 16 and 24 (added Sept 28: the Euro in phone KPI cards and breakdown rows is 16, the bottom-nav icons 24) draw the whole
// 20px frame scaled, as Figma does for those instances.
// Oct 4: + 32 (Euro Size=32px, 793:1079; icon-size/2xl is 32 on Mobile, 24 on Desktop).
export const ICON_SIZES = [10, 12, 16, 20, 24, 32];
export function iconFrame(icon, size = 20) {
  const px = ICON_SIZES.includes(size) ? size : 20;
  const own = px !== 20 && icon.sizes && icon.sizes[px];
  return { px, drawing: own ? { ...icon, ...own } : icon, viewBox: own ? (own.viewBox || `0 0 ${px} ${px}`) : px >= 16 ? '0 0 20 20' : '1 1 18 18' };
}
