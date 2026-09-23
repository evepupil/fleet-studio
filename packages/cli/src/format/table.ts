import { displayWidth, padDisplay, truncateDisplay } from "./width.js";

export interface TableColumn {
  readonly header: string;
  /** 超过就截断加省略号（标题列用）；不设置就不限制。 */
  readonly maxWidth?: number;
}

/**
 * 按显示宽度对齐渲染表格，返回逐行文本（含表头）。列之间用两个空格分隔，
 * 最后一列不补尾部空格，避免每行都拖着看不见的空白。
 */
export function renderTable(
  columns: readonly TableColumn[],
  rows: readonly (readonly string[])[],
): string[] {
  const cells = rows.map((row) =>
    row.map((value, index) => {
      const maxWidth = columns[index]?.maxWidth;
      return maxWidth !== undefined ? truncateDisplay(value, maxWidth) : value;
    }),
  );

  const widths = columns.map((column, index) => {
    const cellWidths = cells.map((row) => displayWidth(row[index] ?? ""));
    return Math.max(displayWidth(column.header), ...cellWidths, 0);
  });

  const renderRow = (values: readonly string[]): string =>
    values
      .map((value, index) =>
        index === values.length - 1 ? value : padDisplay(value, widths[index] ?? 0),
      )
      .join("  ");

  const headerLine = renderRow(columns.map((column) => column.header));
  return [headerLine, ...cells.map((row) => renderRow(row))];
}
