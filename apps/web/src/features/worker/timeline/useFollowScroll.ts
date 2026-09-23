import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** 时间线滚动容器的元素 id，由页面骨架（App.tsx）提供，详情和时间线共用同一个滚动容器。 */
const SCROLL_CONTAINER_ID = "detail-scroll";
/** 距底部小于这个像素数就算「停在底部」。 */
const BOTTOM_THRESHOLD_PX = 48;

export interface UseFollowScrollOptions {
  /** 当前打开的苦工编号；变化即切换了苦工，需要重置跟随状态 */
  workerId: string | null;
  /** 苦工此刻是否在工作中，决定首批事件到达后要不要自动滚到底 */
  running: boolean;
  /** 当前实际渲染的行数，用来判断是否有新行到达 */
  rowCount: number;
}

export interface UseFollowScrollResult {
  /** 是否停在底部，给时间线的 aria-live 用 */
  atBottom: boolean;
  /** 停在底部之外累计的未读行数，决定「回到最新」按钮是否出现 */
  unreadCount: number;
  /** 点击「回到最新」：滚到底并清零未读数 */
  jumpToLatest(): void;
}

/**
 * 时间线的跟随滚动：停在底部时新行来了自动滚下去；不在底部时只累计未读数，
 * 交给「回到最新」按钮手动跳转。切换苦工时，首批事件按苦工当时是否在工作中决定要不要滚到底。
 */
export function useFollowScroll({
  workerId,
  running,
  rowCount,
}: UseFollowScrollOptions): UseFollowScrollResult {
  const [atBottom, setAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const atBottomRef = useRef(atBottom);
  atBottomRef.current = atBottom;
  const prevRowCountRef = useRef(0);
  const initializedForRef = useRef<string | null>(null);
  // 渲染期检测到切苦工时置真；提交后的布局副作用消费一次就置回 false
  const pendingScrollResetRef = useRef(false);

  // 切换苦工：未读数、「停在底部」和「首批事件」标记都要重置，不能沿用上一个苦工的状态。
  // 用渲染期比较上一次的 workerId 而不是 useEffect 去重置，避免多渲染一轮才清零。
  const [trackedWorkerId, setTrackedWorkerId] = useState(workerId);
  if (workerId !== trackedWorkerId) {
    setTrackedWorkerId(workerId);
    prevRowCountRef.current = 0;
    initializedForRef.current = null;
    setUnreadCount(0);
    setAtBottom(false);
    pendingScrollResetRef.current = true;
  }

  // 滚动条本身是 DOM，渲染期不能碰；在提交后、绘制前（布局阶段）把它归零，
  // 避免残留上一个苦工的滚动位置在新内容上闪一下。没有依赖数组，靠 ref 标记只消费一次。
  useLayoutEffect(() => {
    if (!pendingScrollResetRef.current) {
      return;
    }
    pendingScrollResetRef.current = false;
    const el = document.getElementById(SCROLL_CONTAINER_ID);
    if (el !== null) {
      el.scrollTop = 0;
    }
  });

  // 不依赖任何会变化的值，用 useCallback 固定引用，好放进下面 effect 的依赖数组里
  const scrollToBottom = useCallback((): void => {
    const el = document.getElementById(SCROLL_CONTAINER_ID);
    if (el === null) {
      return;
    }
    // 新行渲染后 DOM 已更新，下一帧再读 scrollHeight 才是滚动后的准确值
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  // 监听滚动容器：挂载时绑定一次，卸载时移除；容器节点由页面骨架常驻，不随苦工切换重建
  useEffect(() => {
    const el = document.getElementById(SCROLL_CONTAINER_ID);
    if (el === null) {
      return undefined;
    }
    function handleScroll(): void {
      // TS 不会跨函数边界保留外层 const 的空值收窄，这里重复判一次
      if (el === null) {
        return;
      }
      const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
      setAtBottom(bottom);
      if (bottom) {
        setUnreadCount(0);
      }
    }
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // 行数变化：首批到达按运行状态决定是否滚底；此后按当前是否停在底部决定滚动或计未读
  useEffect(() => {
    const delta = rowCount - prevRowCountRef.current;
    prevRowCountRef.current = rowCount;
    if (delta <= 0) {
      return;
    }
    if (workerId !== null && initializedForRef.current !== workerId) {
      initializedForRef.current = workerId;
      if (running) {
        setAtBottom(true);
        scrollToBottom();
      }
      return;
    }
    if (atBottomRef.current) {
      scrollToBottom();
    } else {
      setUnreadCount((count) => count + delta);
    }
  }, [rowCount, workerId, running, scrollToBottom]);

  function jumpToLatest(): void {
    setAtBottom(true);
    setUnreadCount(0);
    scrollToBottom();
  }

  return { atBottom, unreadCount, jumpToLatest };
}
