import { type KeyboardEventHandler, useCallback } from "react";

export function useTaskBoardKeys(): KeyboardEventHandler<HTMLDivElement> {
  return useCallback((event) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight"
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;
    const currentCard = target.closest<HTMLElement>("[data-task-card]");
    if (currentCard === null || !event.currentTarget.contains(currentCard)) return;

    const columns = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-board-column]"),
    );
    const currentColumn = currentCard.closest<HTMLElement>("[data-board-column]");
    if (currentColumn === null) return;

    const columnIndex = columns.indexOf(currentColumn);
    const cards = Array.from(currentColumn.querySelectorAll<HTMLElement>("[data-task-card]"));
    const cardIndex = cards.indexOf(currentCard);
    if (columnIndex < 0 || cardIndex < 0) return;

    let nextCard: HTMLElement | undefined;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const offset = event.key === "ArrowDown" ? 1 : -1;
      nextCard = cards[cardIndex + offset];
    } else {
      const offset = event.key === "ArrowRight" ? 1 : -1;
      let nextColumnIndex = columnIndex + offset;
      while (nextColumnIndex >= 0 && nextColumnIndex < columns.length) {
        const nextColumn = columns[nextColumnIndex];
        if (nextColumn === undefined) break;
        const nextCards = Array.from(nextColumn.querySelectorAll<HTMLElement>("[data-task-card]"));
        if (nextCards.length > 0) {
          nextCard = nextCards[Math.min(cardIndex, nextCards.length - 1)];
          break;
        }
        nextColumnIndex += offset;
      }
    }

    if (nextCard === undefined) return;

    // 只沿实际渲染的列与卡片序号移动；没有目标卡时不拦截方向键。
    event.preventDefault();
    nextCard.focus();
    nextCard.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
}
