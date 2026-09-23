import { create } from "zustand";

export type ListFilter = "active" | "all";

const EXPANDED_STORAGE_KEY = "fleet.expanded";
const HASH_WORKER_PREFIX = "#/w/";

function idFromHash(hash: string): string | null {
  if (!hash.startsWith(HASH_WORKER_PREFIX)) {
    return null;
  }
  const id = hash.slice(HASH_WORKER_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** 读本地存储的展开记录；没有记录、格式不对、存储不可用都当作「没有任何记录」处理。 */
function loadExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (raw === null) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveExpanded(expanded: Record<string, boolean>): void {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expanded));
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用，静默忽略，不影响当次会话的展开状态
  }
}

interface SelectionState {
  selectedId: string | null;
  expanded: Record<string, boolean>;
  listFilter: ListFilter;
  select(id: string | null): void;
  toggleProject(key: string): void;
  setListFilter(filter: ListFilter): void;
}

/** 选中苦工、项目展开状态、左栏筛选。选中编号和地址栏 #/w/<编号> 双向同步。 */
export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedId: idFromHash(location.hash),
  expanded: loadExpanded(),
  listFilter: "active",

  select: (id) => {
    set({ selectedId: id });
    const path = location.pathname + location.search;
    history.replaceState(null, "", id === null ? path : `${path}${HASH_WORKER_PREFIX}${id}`);
  },

  toggleProject: (key) => {
    const current = get().expanded[key] ?? false;
    const next = { ...get().expanded, [key]: !current };
    set({ expanded: next });
    saveExpanded(next);
  },

  setListFilter: (filter) => set({ listFilter: filter }),
}));

window.addEventListener("hashchange", () => {
  const id = idFromHash(location.hash);
  if (useSelectionStore.getState().selectedId !== id) {
    useSelectionStore.setState({ selectedId: id });
  }
});
