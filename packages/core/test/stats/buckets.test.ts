import { describe, expect, it } from "vitest";
import { bucketIndexOf, buildBuckets } from "../../src/stats/index.js";
import { fixedTimeZone, switchingTimeZone } from "./timezones.js";

const TZ_8 = fixedTimeZone(480);

/** 东八区本地 2026-09-25 14:30 = UTC 06:30 */
const NOW = Date.parse("2026-09-25T06:30:00Z");

describe("buildBuckets", () => {
  it("按小时对齐：起点在整点中间时第一段从整点开始", () => {
    const from = Date.parse("2026-09-25T06:20:00Z");
    const buckets = buildBuckets(from, Date.parse("2026-09-25T09:00:00Z"), "hour", TZ_8);
    expect(buckets).toEqual([
      Date.parse("2026-09-25T06:00:00Z"),
      Date.parse("2026-09-25T07:00:00Z"),
      Date.parse("2026-09-25T08:00:00Z"),
    ]);
  });

  it("按小时：正好落在整点上时第一段就是它自己", () => {
    const buckets = buildBuckets(NOW, Date.parse("2026-09-25T07:30:00Z"), "hour", TZ_8);
    expect(buckets).toEqual([
      Date.parse("2026-09-25T06:00:00Z"),
      Date.parse("2026-09-25T07:00:00Z"),
    ]);
  });

  it("按天对齐：第一段是本地零点，末段起点 < toMs", () => {
    const buckets = buildBuckets(
      Date.parse("2026-09-24T20:00:00Z"),
      Date.parse("2026-09-26T02:00:00Z"),
      "day",
      TZ_8,
    );
    // 本地 2026-09-25 04:00 → 本地 2026-09-26 10:00，覆盖 9-25、9-26 两天
    expect(buckets).toEqual([
      Date.parse("2026-09-24T16:00:00Z"),
      Date.parse("2026-09-25T16:00:00Z"),
    ]);
  });

  it("按周对齐：第一段是本地周一零点，一周一段", () => {
    const buckets = buildBuckets(
      Date.parse("2026-09-24T20:00:00Z"),
      Date.parse("2026-10-05T02:00:00Z"),
      "week",
      TZ_8,
    );
    // 本地 9-25（周五）到 10-5（周一），跨三个自然周
    expect(buckets).toEqual([
      Date.parse("2026-09-20T16:00:00Z"),
      Date.parse("2026-09-27T16:00:00Z"),
      Date.parse("2026-10-04T16:00:00Z"),
    ]);
  });

  it("按周：起止都在同一周时只有一段", () => {
    const buckets = buildBuckets(NOW, Date.parse("2026-09-26T00:00:00Z"), "week", TZ_8);
    expect(buckets).toEqual([Date.parse("2026-09-20T16:00:00Z")]);
  });

  it("起点等于终点返回空数组", () => {
    expect(buildBuckets(NOW, NOW, "hour", TZ_8)).toEqual([]);
    expect(buildBuckets(NOW, NOW, "day", TZ_8)).toEqual([]);
    expect(buildBuckets(NOW, NOW, "week", TZ_8)).toEqual([]);
  });

  it("起点晚于终点返回空数组", () => {
    expect(buildBuckets(NOW, NOW - 1, "day", TZ_8)).toEqual([]);
  });

  it("起点恰好在段起点上、终点恰好在段起点上时不含终点那段", () => {
    const buckets = buildBuckets(
      Date.parse("2026-09-24T16:00:00Z"),
      Date.parse("2026-09-25T16:00:00Z"),
      "day",
      TZ_8,
    );
    expect(buckets).toEqual([Date.parse("2026-09-24T16:00:00Z")]);
  });

  it("按天分段跨夏令时：本地日 23 小时，段之间不是 24 小时", () => {
    const tz = switchingTimeZone(Date.parse("2026-09-25T02:00:00Z"), 60, 120);
    const buckets = buildBuckets(
      Date.parse("2026-09-24T10:00:00Z"),
      Date.parse("2026-09-27T10:00:00Z"),
      "day",
      tz,
    );
    expect(buckets).toEqual([
      Date.parse("2026-09-23T23:00:00Z"), // 本地 9-24 00:00（+60）
      Date.parse("2026-09-24T23:00:00Z"), // 本地 9-25 00:00（+60）
      Date.parse("2026-09-25T22:00:00Z"), // 本地 9-26 00:00（+120）
      Date.parse("2026-09-26T22:00:00Z"), // 本地 9-27 00:00（+120）
    ]);
    expect((buckets[2] ?? 0) - (buckets[1] ?? 0)).toBe(23 * 3_600_000);
  });

  it("按小时分段不受偏移变化影响（每个本地整点都是整 UTC 点）", () => {
    const tz = switchingTimeZone(Date.parse("2026-09-25T02:00:00Z"), 60, 120);
    const buckets = buildBuckets(
      Date.parse("2026-09-25T00:00:00Z"),
      Date.parse("2026-09-25T03:00:00Z"),
      "hour",
      tz,
    );
    // 本地整点：02:00Z 之前本地整点是 UTC 整点 − 1h；02:00Z 之后是 UTC 整点 − 2h
    expect(buckets).toEqual([
      Date.parse("2026-09-25T00:00:00Z"),
      Date.parse("2026-09-25T01:00:00Z"),
      Date.parse("2026-09-25T02:00:00Z"),
    ]);
  });
});

describe("bucketIndexOf", () => {
  const buckets = [
    Date.parse("2026-09-25T06:00:00Z"),
    Date.parse("2026-09-25T07:00:00Z"),
    Date.parse("2026-09-25T08:00:00Z"),
  ];

  it("正好等于某个起点时返回该下标", () => {
    expect(bucketIndexOf(Date.parse("2026-09-25T06:00:00Z"), buckets)).toBe(0);
    expect(bucketIndexOf(Date.parse("2026-09-25T07:00:00Z"), buckets)).toBe(1);
    expect(bucketIndexOf(Date.parse("2026-09-25T08:00:00Z"), buckets)).toBe(2);
  });

  it("落在段中间时返回该段下标", () => {
    expect(bucketIndexOf(Date.parse("2026-09-25T07:59:59.999Z"), buckets)).toBe(1);
  });

  it("早于第一个起点返回 −1", () => {
    expect(bucketIndexOf(Date.parse("2026-09-25T05:59:59.999Z"), buckets)).toBe(-1);
  });

  it("晚于最后一段起点时返回最后一段（归到最后一段里）", () => {
    expect(bucketIndexOf(Date.parse("2026-09-25T23:00:00Z"), buckets)).toBe(2);
  });

  it("空数组返回 −1", () => {
    expect(bucketIndexOf(NOW, [])).toBe(-1);
  });

  it("单个分段", () => {
    expect(bucketIndexOf(NOW, [Date.parse("2026-09-25T06:00:00Z")])).toBe(0);
    expect(
      bucketIndexOf(Date.parse("2026-09-25T05:00:00Z"), [Date.parse("2026-09-25T06:00:00Z")]),
    ).toBe(-1);
  });
});
