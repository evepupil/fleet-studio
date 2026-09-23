import type { RunView, Verdict } from "@fleet/core";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { VerdictTag } from "../../components/VerdictTag";
import styles from "./ReportCard.module.css";

const {
  root,
  header,
  headerTitle,
  runLabel,
  dl,
  dt,
  ddCell,
  verdictLine,
  clampWrapper,
  text,
  textMuted,
  rawBlock,
  toggle,
} = styles;

export interface ReportCardProps {
  run: RunView;
  runCount: number;
}

const DASH_TEXT = "无";
const VERDICT_SECTION_KEYS: ReadonlySet<string> = new Set(["SELF_REPORT", "VERDICT"]);

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
  maxLines: number;
  // CSS Modules 的类名在 noUncheckedIndexedAccess 下是 string | undefined（索引签名的通用限制），
  // 这里直接转发给 className，和其余组件的写法一致，不用额外兜底。
  textClassName: string | undefined;
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
    <div className={clampWrapper}>
      <div
        ref={ref}
        className={textClassName}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: maxLines,
                overflow: "hidden",
              }
        }
      >
        {content}
      </div>
      {overflowing && (
        <button type="button" className={toggle} onClick={() => setExpanded((value) => !value)}>
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
    <section className={root} data-report>
      <div className={header}>
        <span className={headerTitle}>回报</span>
        {headerVerdict !== null && <VerdictTag verdict={headerVerdict} />}
        {runCount > 1 && <span className={runLabel}>第 {run.seq} 次运行</span>}
      </div>
      {report !== null && (
        <dl className={dl}>
          {report.sections.map((section) => {
            const verdictSplit = VERDICT_SECTION_KEYS.has(section.key)
              ? splitLeadingVerdict(section.text)
              : null;
            const isDash = section.text.trim() === DASH_TEXT;
            return (
              <Fragment key={section.key}>
                <dt className={dt}>{section.key}</dt>
                <dd className={ddCell}>
                  {verdictSplit !== null ? (
                    <div className={verdictLine}>
                      <VerdictTag verdict={verdictSplit.verdict} />
                      <ClampedText content={verdictSplit.rest} maxLines={10} textClassName={text} />
                    </div>
                  ) : (
                    <ClampedText
                      content={section.text}
                      maxLines={10}
                      textClassName={isDash ? textMuted : text}
                    />
                  )}
                </dd>
              </Fragment>
            );
          })}
        </dl>
      )}
      {report === null && run.finalText !== null && (
        <div className={rawBlock}>
          <ClampedText content={run.finalText} maxLines={12} textClassName={text} />
        </div>
      )}
    </section>
  );
}
