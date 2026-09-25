interface ColorDotProps {
  colorVar: string;
  size?: 6 | 8 | 10;
}

function ColorDot({ colorVar, size = 8 }: ColorDotProps) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: colorVar }}
    />
  );
}

export { ColorDot };
