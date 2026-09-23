import styles from "./RoleChip.module.css";

const { root } = styles;

export interface RoleChipProps {
  label: string;
}

/** 角色名小片，纯展示，不可交互。 */
export function RoleChip({ label }: RoleChipProps) {
  return <span className={root}>{label}</span>;
}
