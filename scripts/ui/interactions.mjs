// 交互检查走浏览器的鼠标输入，避免 element.click() 跳过可见性和遮挡问题。
export async function clickElement(browser, expression) {
  await browser.waitFor(
    `(() => {
    const element = (${expression});
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
      element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  })()`,
    1000,
  );
  const point = await browser.evaluate(`(() => {
    const element = (${expression});
    if (!element) throw new Error("找不到要点击的元素");
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 ||
        x >= innerWidth || y >= innerHeight) {
      throw new Error("元素不在可点击区域：" + JSON.stringify(rect.toJSON()));
    }
    if (!element.contains(document.elementFromPoint(x, y))) {
      throw new Error("元素被遮挡：" + element.textContent.trim() + "，命中：" +
        document.elementFromPoint(x, y)?.outerHTML.slice(0, 300));
    }
    return { x, y };
  })()`);
  await browser.rpc("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await browser.rpc("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await browser.rpc("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...point,
  });
}

export async function chooseSelectOption(browser, selector, label) {
  await clickElement(browser, `document.querySelector(${JSON.stringify(selector)})`);
  if (!(await browser.waitFor("!!document.querySelector('[role=\"listbox\"]')"))) {
    throw new Error(`下拉菜单未打开：${selector}`);
  }
  const option = `[...document.querySelectorAll('[role="option"]')]
    .find((element) => element.textContent.trim() === ${JSON.stringify(label)})`;
  // 已选项靠近顶部时菜单会内部滚动；先确认菜单在屏内，再滚到要选的项。
  const visible = await browser.waitFor(`(() => {
    const rect = document.querySelector('[role="listbox"]')?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
  })()`);
  if (!visible) throw new Error(`下拉菜单位于屏幕外：${selector}`);
  await browser.evaluate(`(${option})?.scrollIntoView({ block: "nearest" })`);
  await clickElement(browser, option);
  if (!(await browser.waitFor("!document.querySelector('[role=\"listbox\"]')"))) {
    throw new Error(`选择后下拉菜单未关闭：${label}`);
  }
}
