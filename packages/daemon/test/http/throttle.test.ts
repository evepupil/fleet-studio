import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrailingThrottle } from "../../src/http/sse.js";

/**
 * 纯函数级别的节流单测：不用真的等待 300ms，用假定时器让时间线可控、断言精确。
 * 创建节流器那一刻当作“刚发送过一次”（配合调用方在真正发送初始数据之后立刻创建节流器的用法）。
 */
describe("createTrailingThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("刚创建就触发：还没到一个窗口，不会立刻发送，要等够时间才尾随发送", () => {
    const send = vi.fn();
    createTrailingThrottle(300, send).trigger();

    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("距上次发送已经超过一个窗口时，触发立刻发送", () => {
    const send = vi.fn();
    const throttle = createTrailingThrottle(300, send);

    vi.advanceTimersByTime(500);
    throttle.trigger();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("窗口内连续触发 10 次变化，300 毫秒内最多发一次，且最后一次一定会被送出", () => {
    const send = vi.fn();
    const throttle = createTrailingThrottle(300, send);

    vi.advanceTimersByTime(500);
    throttle.trigger();
    expect(send).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(20);
      throttle.trigger();
    }
    // 目前只过了 200ms，还没到 300ms 的窗口，这期间不应该有新的发送。
    expect(send).toHaveBeenCalledTimes(1);

    // 补齐到 300ms，尾随发送应该触发，且只发一次。
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("尾随发送读到的是触发时刻之后的最新数据，不是最早一次触发时的旧数据", () => {
    let latest = "old";
    const send = vi.fn(() => latest);
    const throttle = createTrailingThrottle(300, send);

    vi.advanceTimersByTime(500);
    throttle.trigger();
    expect(send).toHaveBeenCalledTimes(1);

    latest = "new-1";
    throttle.trigger(); // 安排尾随发送，此时还没到 300ms。
    latest = "new-2"; // 尾随定时器真正触发之前，数据又变了一次。

    vi.advanceTimersByTime(300);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.results[1]?.value).toBe("new-2");
  });

  it("dispose 之后尚未触发的尾随发送不再执行", () => {
    const send = vi.fn();
    const throttle = createTrailingThrottle(300, send);

    vi.advanceTimersByTime(500);
    throttle.trigger();
    throttle.trigger();

    throttle.dispose();
    vi.advanceTimersByTime(1000);

    expect(send).toHaveBeenCalledTimes(1);
  });
});
