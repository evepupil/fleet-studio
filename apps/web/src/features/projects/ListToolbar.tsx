import type { FilterChipOption } from "../../components/FilterChips";
import { FilterChips } from "../../components/FilterChips";
import type { ListFilter } from "../../state/selectionStore";
import { useSelectionStore } from "../../state/selectionStore";
import { countActive, countAll } from "../../state/selectors";
import { useSnapshotStore } from "../../state/snapshotStore";
import styles from "./ListToolbar.module.css";

const { root } = styles;

/**
 * R4 左栏工具条：在「进行中」「全部」之间切换左栏苦工范围。
 * 计数来自 selectors 的现成函数；快照还没到时不显示计数（规则见页面层 R4.5）。
 */
export function ListToolbar() {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const listFilter = useSelectionStore((state) => state.listFilter);
  const setListFilter = useSelectionStore((state) => state.setListFilter);

  const options: FilterChipOption<ListFilter>[] =
    snapshot === null
      ? [
          { value: "active", label: "进行中" },
          { value: "all", label: "全部" },
        ]
      : [
          { value: "active", label: "进行中", count: countActive(snapshot) },
          { value: "all", label: "全部", count: countAll(snapshot) },
        ];

  return (
    <div className={root} data-list-toolbar>
      <FilterChips
        name="list-filter"
        ariaLabel="苦工范围"
        options={options}
        value={listFilter}
        onChange={setListFilter}
      />
    </div>
  );
}
