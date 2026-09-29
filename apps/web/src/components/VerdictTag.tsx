import type { Verdict } from "@fleet/core";

function VerdictTag({ verdict }: { verdict: Verdict }) {
  const passed = verdict === "pass";
  return (
    <span
      data-verdict={verdict}
      className={`inline-flex h-5 items-center rounded-sm border border-line bg-card px-1.5 text-12 font-medium ${passed ? "text-status-done" : "text-status-failed"}`}
    >
      {passed ? "通过" : "不通过"}
    </span>
  );
}

export { VerdictTag };
