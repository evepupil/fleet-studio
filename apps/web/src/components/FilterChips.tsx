import type { KeyboardEvent } from "react";
import { useRef } from "react";
import styles from "./FilterChips.module.css";

const { root, chip, count: countClass } = styles;

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface FilterChipsProps<T extends string> {
  options: readonly FilterChipOption<T>[];
  value: T;
  onChange(value: T): void;
  ariaLabel: string;
  name: string;
}

/**
 * 一组互斥的筛选小片：role="radiogroup"，左右方向键在未禁用的选项间移动并直接切换选中。
 * 每个选项要放标签文字 + 等宽计数两块内容，原生 <input type="radio"> 放不下，
 * 所以按 WAI-ARIA Radio Group 的自定义控件写法用 <button role="radio">。
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  name,
}: FilterChipsProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectAt(index: number): void {
    const option = options[index];
    if (option === undefined || option.disabled === true) {
      return;
    }
    onChange(option.value);
    buttonRefs.current[index]?.focus();
  }

  function moveFocus(fromIndex: number, direction: 1 | -1): void {
    const count = options.length;
    for (let step = 0, index = fromIndex; step < count; step += 1) {
      index = (index + direction + count) % count;
      const option = options[index];
      if (option !== undefined && option.disabled !== true) {
        selectAt(index);
        return;
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(index, 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(index, -1);
    }
  }

  return (
    <div className={root} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: 选项要放文字标签 + 计数两块内容，<input type="radio"> 装不下
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={option.disabled}
            tabIndex={checked ? 0 : -1}
            data-filter={option.value}
            data-checked={checked ? "true" : "false"}
            name={name}
            className={chip}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
            {option.count !== undefined && <span className={countClass}>{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
