/**
 * 项目色：8 个固定顺序的分类色，只画在容量格和项目色点上（文字永远用文字色，见 docs/前端设计.md 3.3）。
 * 数量和 styles/tokens.css 里的 --proj-0 ~ --proj-7 一一对应。
 */
const PALETTE_SIZE = 8;

/** colorIndex 取模落到 0~7；负数和超过 7 的都要能正确取模，取模结果恒为正。 */
export function projectColorVar(colorIndex: number): string {
  const normalized = ((colorIndex % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
  return `var(--proj-${normalized})`;
}
