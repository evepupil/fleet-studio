/**
 * 前 N 名合并「其他」。按权重从大到小排序（权重相同时保持原顺序），
 * 超过 n 项时返回前 n 项，再把其余项交给 merge 合成一项追加在末尾。
 */
export function mergeTopN<T>(
  items: readonly T[],
  n: number,
  weight: (item: T) => number,
  merge: (rest: readonly T[]) => T,
): T[] {
  // Array.prototype.sort 从 ES2019 起保证稳定，权重相同时自然保持原顺序。
  const sorted = [...items].sort((a, b) => weight(b) - weight(a));
  if (sorted.length <= n) {
    return sorted;
  }
  const top = sorted.slice(0, n);
  top.push(merge(sorted.slice(n)));
  return top;
}
