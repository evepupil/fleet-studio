import { middleEllipsis } from "../lib/format";
import styles from "./MonoPath.module.css";

const { root } = styles;

export interface MonoPathProps {
  path: string;
  max?: number;
}

/** 等宽字体的路径，超长中间省略，完整路径放 title 供悬停查看。 */
export function MonoPath({ path, max = 48 }: MonoPathProps) {
  return (
    <span className={root} title={path}>
      {middleEllipsis(path, max)}
    </span>
  );
}
