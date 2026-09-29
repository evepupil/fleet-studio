import { create } from "zustand";

export type CardProp = "id" | "pool" | "project" | "role" | "meta";

export const CARD_PROP_OPTIONS: { key: CardProp; label: string }[] = [
  { key: "id", label: "编号" },
  { key: "pool", label: "池" },
  { key: "project", label: "项目" },
  { key: "role", label: "角色" },
  { key: "meta", label: "进度" },
];

interface DisplayState {
  cardProps: Record<CardProp, boolean>;
  setCardProp(key: CardProp, on: boolean): void;
}

const DEFAULT_CARD_PROPS: Record<CardProp, boolean> = {
  id: true,
  pool: true,
  project: true,
  role: true,
  meta: true,
};

function readSavedValue(value: object, key: CardProp): boolean {
  const saved = Reflect.get(value, key);
  return typeof saved === "boolean" ? saved : DEFAULT_CARD_PROPS[key];
}

function readCardProps(): Record<CardProp, boolean> {
  if (typeof localStorage === "undefined") return { ...DEFAULT_CARD_PROPS };
  const stored = localStorage.getItem("fleet.board.props");
  if (stored === null) return { ...DEFAULT_CARD_PROPS };
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ...DEFAULT_CARD_PROPS };
    }
    return {
      id: readSavedValue(value, "id"),
      pool: readSavedValue(value, "pool"),
      project: readSavedValue(value, "project"),
      role: readSavedValue(value, "role"),
      meta: readSavedValue(value, "meta"),
    };
  } catch {
    return { ...DEFAULT_CARD_PROPS };
  }
}

function persistCardProps(cardProps: Record<CardProp, boolean>): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("fleet.board.props", JSON.stringify(cardProps));
  }
}

export const useDisplayStore = create<DisplayState>((set, get) => ({
  cardProps: readCardProps(),
  setCardProp: (key, on) => {
    const cardProps = { ...get().cardProps, [key]: on };
    persistCardProps(cardProps);
    set({ cardProps });
  },
}));
