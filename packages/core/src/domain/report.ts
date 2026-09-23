/** 回报结论：自评或评审给出的通过 / 不通过。 */
export type Verdict = "pass" | "fail";

/** 回报里的一段，例如 key = SUMMARY。 */
export interface ReportSection {
  key: string;
  text: string;
}

export interface ParsedReport {
  sections: ReportSection[];
  /** 取自 SELF_REPORT 或 VERDICT 段；没有这两段时为 null */
  verdict: Verdict | null;
}
