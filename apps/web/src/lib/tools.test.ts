import { FilePlus, FileText, Globe, Pencil, Search, SquareTerminal, Wrench } from "lucide-react";
import { describe, expect, it } from "vitest";
import { toolIcon } from "./tools";

describe("toolIcon", () => {
  it("按工具名分组映射图标，大小写都认", () => {
    expect(toolIcon("read")).toBe(FileText);
    expect(toolIcon("Read")).toBe(FileText);
    expect(toolIcon("bash")).toBe(SquareTerminal);
    expect(toolIcon("Bash")).toBe(SquareTerminal);
    expect(toolIcon("edit")).toBe(Pencil);
    expect(toolIcon("Edit")).toBe(Pencil);
    expect(toolIcon("write")).toBe(FilePlus);
    expect(toolIcon("Write")).toBe(FilePlus);
  });

  it("检索类工具共用 Search", () => {
    expect(toolIcon("grep")).toBe(Search);
    expect(toolIcon("glob")).toBe(Search);
    expect(toolIcon("find")).toBe(Search);
    expect(toolIcon("web_search")).toBe(Search);
  });

  it("抓取网页类工具共用 Globe", () => {
    expect(toolIcon("fetch_content")).toBe(Globe);
    expect(toolIcon("webfetch")).toBe(Globe);
  });

  it("认不出的工具名落到 Wrench", () => {
    expect(toolIcon("unknown_tool")).toBe(Wrench);
    expect(toolIcon("")).toBe(Wrench);
  });
});
