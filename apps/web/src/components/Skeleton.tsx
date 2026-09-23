import styles from "./Skeleton.module.css";

const { root } = styles;

export interface SkeletonProps {
  width?: number | string;
  height: number;
  radius?: "sm" | "md";
}

/** 加载占位块：纯色，不做闪光扫过动画（工具类界面的动效纪律，见 DESIGN.md 第 3 章）。 */
export function Skeleton({ width, height, radius = "sm" }: SkeletonProps) {
  return <span className={root} data-radius={radius} aria-hidden style={{ width, height }} />;
}
