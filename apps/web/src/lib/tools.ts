import {
  FilePlus,
  FileText,
  Globe,
  type LucideIcon,
  Pencil,
  Search,
  SquareTerminal,
  Wrench,
} from "lucide-react";

/**
 * 工具名 → 图标。键覆盖大小写两种写法，因为 pi 和 opencode 上报的工具名大小写习惯不一样。
 * 找不到的一律给 Wrench，不让界面因为一个陌生工具名报错。
 */
const TOOL_ICONS: Readonly<Record<string, LucideIcon>> = {
  read: FileText,
  Read: FileText,
  bash: SquareTerminal,
  Bash: SquareTerminal,
  edit: Pencil,
  Edit: Pencil,
  write: FilePlus,
  Write: FilePlus,
  grep: Search,
  glob: Search,
  find: Search,
  web_search: Search,
  fetch_content: Globe,
  webfetch: Globe,
};

export function toolIcon(tool: string): LucideIcon {
  return TOOL_ICONS[tool] ?? Wrench;
}
