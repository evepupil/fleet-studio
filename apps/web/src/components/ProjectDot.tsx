import { projectColorVar } from "../lib/projectColor";
import styles from "./ProjectDot.module.css";

const { root } = styles;

export interface ProjectDotProps {
  colorIndex: number;
  size?: 6 | 8 | 10;
}

/** 项目身份色点，纯装饰用，语义交给旁边的项目名文字承担。 */
export function ProjectDot({ colorIndex, size = 8 }: ProjectDotProps) {
  return (
    <span
      className={root}
      aria-hidden
      style={{ backgroundColor: projectColorVar(colorIndex), width: size, height: size }}
    />
  );
}
