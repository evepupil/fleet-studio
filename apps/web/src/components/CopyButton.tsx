import { Check, Copy } from "lucide-react";
import { useState } from "react";
import styles from "./CopyButton.module.css";

const { root, done, icon } = styles;

export interface CopyButtonProps {
  text: string;
  label: string;
}

const CONFIRM_MS = 1500;

/** 24px 方形幽灵按钮：点击写剪贴板，短暂换成勾表示复制成功。 */
export function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  function handleClick(): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), CONFIRM_MS);
      })
      .catch(() => undefined);
  }

  return (
    <button type="button" className={root} aria-label={label} onClick={handleClick}>
      {copied ? (
        <Check aria-hidden size={14} className={done} />
      ) : (
        <Copy aria-hidden size={14} className={icon} />
      )}
    </button>
  );
}
