import { describe, expect, it } from "vitest";
import { isFleetError } from "../../src/domain/errors.js";
import { normalizeProjectPath, projectKeyOf, projectNameOf } from "../../src/projects/path.js";

describe("normalizeProjectPath · win32", () => {
  it("Git Bash 写法转成盘符形式", () => {
    expect(normalizeProjectPath("/c/code/x", "win32")).toBe("C:\\code\\x");
  });

  it("裸 Git Bash 盘符转成盘符根", () => {
    expect(normalizeProjectPath("/c", "win32")).toBe("C:\\");
  });

  it("正斜杠和反斜杠混用统一成反斜杠", () => {
    expect(normalizeProjectPath("C:/code\\x/y", "win32")).toBe("C:\\code\\x\\y");
  });

  it("连续分隔符合并成一个", () => {
    expect(normalizeProjectPath("C://code///x", "win32")).toBe("C:\\code\\x");
  });

  it("处理 . 和 ..，且不会越过盘符根", () => {
    expect(normalizeProjectPath("C:\\code\\.\\a\\..\\b", "win32")).toBe("C:\\code\\b");
    expect(normalizeProjectPath("C:\\..\\..\\code", "win32")).toBe("C:\\code");
  });

  it("盘符转大写", () => {
    expect(normalizeProjectPath("c:\\code\\x", "win32")).toBe("C:\\code\\x");
  });

  it("去掉末尾分隔符，盘符根保留成 C:\\", () => {
    expect(normalizeProjectPath("C:\\code\\x\\", "win32")).toBe("C:\\code\\x");
    expect(normalizeProjectPath("C:\\", "win32")).toBe("C:\\");
    expect(normalizeProjectPath("C:", "win32")).toBe("C:\\");
  });

  it("UNC 路径：反斜杠和正斜杠写法都支持", () => {
    expect(normalizeProjectPath("\\\\server\\share\\proj", "win32")).toBe(
      "\\\\server\\share\\proj",
    );
    expect(normalizeProjectPath("//server/share/proj", "win32")).toBe("\\\\server\\share\\proj");
  });

  it("UNC 根不会被 .. 越过", () => {
    expect(normalizeProjectPath("\\\\server\\share\\..\\proj", "win32")).toBe(
      "\\\\server\\share\\proj",
    );
  });

  it("相对路径抛 FleetError(invalid_request)", () => {
    expect.assertions(2);
    try {
      normalizeProjectPath("code", "win32");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("invalid_request");
      }
    }
  });

  it("首尾空白先去掉", () => {
    expect(normalizeProjectPath("  C:\\code\\x  ", "win32")).toBe("C:\\code\\x");
  });
});

describe("normalizeProjectPath · posix", () => {
  it("合并连续 /，处理 . 和 ..", () => {
    expect(normalizeProjectPath("/a//b/./c/../d", "posix")).toBe("/a/b/d");
  });

  it("去掉末尾 /，根目录保留 /", () => {
    expect(normalizeProjectPath("/a/b/", "posix")).toBe("/a/b");
    expect(normalizeProjectPath("/", "posix")).toBe("/");
  });

  it(".. 不会越过根目录", () => {
    expect(normalizeProjectPath("/../../a", "posix")).toBe("/a");
  });

  it("不以 / 开头抛 FleetError(invalid_request)", () => {
    expect.assertions(2);
    try {
      normalizeProjectPath("a/b", "posix");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("invalid_request");
      }
    }
  });

  it("首尾空白先去掉", () => {
    expect(normalizeProjectPath("  /a/b  ", "posix")).toBe("/a/b");
  });
});

describe("projectKeyOf", () => {
  it("win32 转小写", () => {
    expect(projectKeyOf("C:\\Code\\X", "win32")).toBe("c:\\code\\x");
  });

  it("posix 保留原始大小写", () => {
    expect(projectKeyOf("/Home/Ubuntu", "posix")).toBe("/Home/Ubuntu");
  });
});

describe("projectNameOf", () => {
  it("取最后一段", () => {
    expect(projectNameOf("C:\\code\\x")).toBe("x");
    expect(projectNameOf("/a/b/c")).toBe("c");
  });

  it("盘符根返回 C:", () => {
    expect(projectNameOf("C:\\")).toBe("C:");
  });

  it("posix 根返回 /", () => {
    expect(projectNameOf("/")).toBe("/");
  });
});
