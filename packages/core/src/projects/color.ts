/**
 * 项目在看板调色板里占的位置。同一个项目的颜色固定，靠这里选号，不靠随机。
 * 8 个经过色盲校验、顺序固定的分类色，见 docs/前端设计.md 3.3 节。
 */
export const PROJECT_PALETTE_SIZE = 8;

/**
 * 选一个颜色位：优先给最小的空位；调色板全被占用时，用 seed 的 FNV-1a 32 位哈希
 * 对 paletteSize 取模——同一个 seed 永远落在同一个格子上，不会每次刷新都换颜色。
 */
export function pickColorIndex(
  taken: readonly number[],
  seed: string,
  paletteSize: number = PROJECT_PALETTE_SIZE,
): number {
  for (let index = 0; index < paletteSize; index++) {
    if (!taken.includes(index)) {
      return index;
    }
  }
  return fnv1a32(seed) % paletteSize;
}

/** FNV-1a 32 位哈希，返回无符号 32 位整数。 */
function fnv1a32(text: string): number {
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}
