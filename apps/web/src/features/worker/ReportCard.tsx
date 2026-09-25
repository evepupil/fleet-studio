import type { RunView, Verdict } from "@fleet/core";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { VerdictTag } from "@/components/VerdictTag";

export interface ReportCardProps {
  run: RunView;
  runCount: number;
}

const DASH_TEXT = "无";
const VERDICT_SECTION_KEYS: ReadonlySet<string> = new Set(["SELF_REPORT", "VERDICT"]);

/** 折叠行数只有两种取值，写成完整类名映射，不做拼接。 */
const CLAMP_CLASS: Readonly<Record<10 | 12, string>> = {
  10: "line-clamp-10",
  12: "line-clamp-12",
};

/** 段文字首词是 pass / fail 时拆出结论，供 SELF_REPORT / VERDICT 段单独画 VerdictTag，后面接着画剩余文字。 */
function splitLeadingVerdict(sectionText: string): { verdict: Verdict; rest: string } | null {
  const match = /^[A-Za-z]+/.exec(sectionText);
  const word = match?.[0];
  if (word === undefined) {
    return null;
  }
  const lower = word.toLowerCase();
  if (lower !== "pass" && lower !== "fail") {
    return null;
  }
  return { verdict: lower, rest: sectionText.slice(word.length) };
}

interface ClampedTextProps {
  content: string;
  maxLines: 10 | 12;
  textClassName: string;
}

/** 超过 maxLines 行才出现「展开全部」；溢出判断用 scrollHeight > clientHeight，内容变化后重新测量。 */
function ClampedText({ content, maxLines, textClassName }: ClampedTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: content 要留作依赖触发文字变化后的重新测量，回调体里不用直接读它
  useLayoutEffect(() => {
    // 展开后不用再量：这里只负责判断"折叠状态下是否被裁掉"，一旦展开过就保留已知结论。
    if (expanded) {
      return;
    }
    const el = ref.current;
    setOverflowing(el !== null && el.scrollHeight > el.clientHeight);
  }, [content, expanded]);

  return (
    <div className="min-w-0 flex-1">
      <div ref={ref} className={`${textClassName} ${expanded ? "" : CLAMP_CLASS[maxLines]}`}>
        {content}
      </div>
      {overflowing && (
        <button
          type="button"
          className="mt-1 text-12 text-brand hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
}

/** 回报卡：最新一次运行的回报解析成功就按段落画 dl，失败就整段展示原文；两种情况都按行数折叠。 */
export function ReportCard({ run, runCount }: ReportCardProps) {
  const report = run.report;
  const headerVerdict = report?.verdict ?? null;

  return (
    <section data-report className="mt-4 rounded-lg border border-line bg-raised px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-14 font-semibold text-fg-1">回报</span>
        {headerVerdict !== null && <VerdictTag verdict={headerVerdict} />}
        {runCount > 1 && <span className="ml-auto text-11 text-fg-3">第 {run.seq} 次运行</span>}
      </div>
      {report !== null && (
        <dl className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-2.5">
          {report.sections.map((section) => {
            const verdictSplit = VERDICT_SECTION_KEYS.has(section.key)
              ? splitLeadingVerdict(section.text)
              : null;
            const isDash = section.text.trim() === DASH_TEXT;
            return (
              <Fragment key={section.key}>
                <dt className="m-0 font-mono text-11 font-semibold tracking-[0.4px] text-fg-3">
                  {section.key}
                </dt>
                <dd className="m-0 min-w-0">
                  {verdictSplit !== null ? (
                    <div className="flex items-start gap-2">
                      <VerdictTag verdict={verdictSplit.verdict} />
                      <ClampedText
                        content={verdictSplit.rest}
                        maxLines={10}
                        textClassName={TEXT_CLASS}
                      />
                    </div>
                  ) : (
                    <ClampedText
                      content={section.text}
                      maxLines={10}
                      textClassName={isDash ? TEXT_MUTED_CLASS : TEXT_CLASS}
                    />
                  )}
                </dd>
              </Fragment>
            );
          })}
        </dl>
      )}
      {report === null && run.finalText !== null && (
        <div className="mt-3">
          <ClampedText content={run.finalText} maxLines={12} textClassName={TEXT_CLASS} />
        </div>
      )}
    </section>
  );
}

const TEXT_CLASS = "text-13 wrap-anywhere whitespace-pre-wrap text-fg-1";
const TEXT_MUTED_CLASS = "text-13 wrap-anywhere whitespace-pre-wrap text-fg-3";
