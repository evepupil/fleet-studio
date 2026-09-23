import styles from "./AppBar.module.css";

const { root, mark, name } = styles;

/** 顶栏：一个像未占满的容量条的标志 + 产品名，没有任何交互，没有数据来源。 */
export function AppBar() {
  return (
    <header className={root} data-appbar>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className={mark}>
        <rect x="0" y="0" width="6" height="6" rx="1.5" fill="var(--text-1)" />
        <rect x="8" y="0" width="6" height="6" rx="1.5" fill="var(--text-1)" />
        <rect x="0" y="8" width="6" height="6" rx="1.5" fill="var(--text-1)" />
        <rect
          x="8"
          y="8"
          width="6"
          height="6"
          rx="1.5"
          fill="none"
          stroke="var(--text-3)"
          strokeWidth="1"
        />
      </svg>
      <span className={name}>fleet studio</span>
    </header>
  );
}
