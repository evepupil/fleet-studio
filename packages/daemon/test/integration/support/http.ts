/**
 * 解析响应体用于断言。这个项目没有引入 DOM 类型库，fetch() 的 res.json() 会被 @types/node
 * 推断成 Promise<unknown>，逐层取字段（例如 body.worker.status）会被类型检查拦下来；
 * 借 JSON.parse 本身的隐式返回类型拿到可以随便取字段的值，断言错了照样会在运行时被
 * vitest 的 expect 抓到，不影响测试的有效性。写法和 test/http/testServer.ts 的
 * readJsonBody 一致（那份测试的目录不在本任务能写的范围内，这里独立放一份）。
 */
export async function readJsonBody(res: Response) {
  return JSON.parse(await res.text());
}
