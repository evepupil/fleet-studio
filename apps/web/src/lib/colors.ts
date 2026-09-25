const PALETTE_SIZE = 8;

function paletteIndex(colorIndex: number): number {
  return ((colorIndex % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
}

export function projectColorVar(colorIndex: number): string {
  return `var(--proj-${paletteIndex(colorIndex)})`;
}

export function seriesColorVar(colorIndex: number | null): string {
  return colorIndex === null ? "var(--series-other)" : `var(--series-${paletteIndex(colorIndex)})`;
}
