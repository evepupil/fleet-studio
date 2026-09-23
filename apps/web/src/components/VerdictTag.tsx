import type { Verdict } from "@fleet/core";
import styles from "./VerdictTag.module.css";

const { root } = styles;

export interface VerdictTagProps {
  verdict: Verdict;
}

const VERDICT_LABEL: Readonly<Record<Verdict, string>> = { pass: "通过", fail: "不通过" };
const VERDICT_COLOR: Readonly<Record<Verdict, string>> = {
  pass: "var(--st-done)",
  fail: "var(--st-failed)",
};

/** 结论标签：自评或评审的通过 / 不通过，颜色和边框同色。 */
export function VerdictTag({ verdict }: VerdictTagProps) {
  const color = VERDICT_COLOR[verdict];
  return (
    <span className={root} data-verdict={verdict} style={{ color, borderColor: color }}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
