import type { Verdict } from "@fleet/core";

function VerdictTag({ verdict }: { verdict: Verdict }) {
  const passed = verdict === "pass";
  return (
    <span
      data-verdict={verdict}
      className={`inline-flex h-[18px] items-center rounded-sm border px-1.5 text-11 font-semibold ${passed ? "border-status-done text-status-done" : "border-status-failed text-status-failed"}`}
    >
      {passed ? "通过" : "不通过"}
    </span>
  );
}

export { VerdictTag };
