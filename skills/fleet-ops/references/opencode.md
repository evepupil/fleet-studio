# opencode 运行时

fleet 的备选苦工运行时，派活时加 `--runtime opencode`，池配置里要写了 opencode 的模型。调研原文在 `C:\code\fleet-studio\docs\调研\opencode-运行时.md`。

## 什么时候用

默认用 pi。同一个任务、同样 10 路实测：

| | pi | opencode |
|---|---|---|
| 峰值内存 | 1.16 GB | 5.17 GB |
| 累计 CPU | 17.5 秒 | 163.8 秒 |
| 总耗时 | 15 秒 | 41 秒 |
| 结果 | 10/10 | 10/10 |

opencode 每路多起一个子进程，单个进程也重（约 580 MB 对 116 MB），答案质量抽查持平。只在用户点名、pi 装不上、或者要用 opencode 独有能力（内置 LSP、MCP、多模型分层）时用它。

## 装配与自检

```bash
opencode --version
opencode models
```

- 密钥写死在 `~/.config/opencode/opencode.json` 里，**不读环境变量**。模型列不出来，先看这个文件里的密钥和网关地址，再用 `curl` 打网关的模型列表接口。
- 角色是 opencode 的 agent，定义在 `~/.config/opencode/agents/<角色>.md`。fleet 的实现、侦察、评审三个角色对应同名 agent，这三个文件由 `node scripts/install-roles.mjs` 用仓库 `roles/` 下的提示词生成，**不要直接改**，改仓库再重新生成。没有同名 agent 的角色，fleet 把仓库里的提示词拼在任务正文前面。
- **agent 名写错会静默退回默认 agent**，不报错。新加 agent 后派一条小任务，看输出开头显示的 agent 和模型对不对。

## 模型怎么指定

四层，后面的盖过前面的（已实测）：

1. 全局默认：`~/.config/opencode/opencode.json` 的默认模型字段
2. agent 自带：`~/.config/opencode/agents/<角色>.md` 开头的 model 字段
3. 单次命令：`-m <通道>/<模型>`（fleet 按池配置传这一层）
4. 推理档位：`--variant high`（fleet 按池配置里的 `variant` 传）

模型名带空格能正常解析。**换模型前确认它支持工具调用**：有些模型正常回话但从不调用工具。

## 已知的坑

- **思考模型干到一半掉线**：十来次工具调用后报「思考内容必须在思考模式下回传」。原因是 opencode 拼历史消息时丢了模型吐出的思考过程，报错是概率性的，并发多路时会大面积中招。修法是在模型配置里开启回传，每个会吐思考内容的模型都要加：

  ```json
  "模型名": {
    "reasoning": true,
    "interleaved": { "field": "reasoning_content" }
  }
  ```

  `interleaved` 只接受 `true` 或对象，写成字符串会被配置校验拒掉。实测加上后 5 路并发、每路 14 次工具调用全部跑通。退路是在模型的 `options` 里写 `{"thinking": {"type": "disabled"}}` 关掉思考。`enable_thinking`、`reasoning_effort`、`chat_template_kwargs` 这几个参数服务端照收，但实际不生效。
- **通道地址必须带 `/v1`**，否则整条通道静默变成「找不到」，配置校验也查不出来。
- **网关返回的模型归属字段可能是乱的**，别拿它判断路由。
- **402** 是模型要付费；**503** 是网关没有这个模型的凭证。
- **`-f` 附件参数是数组**，后面要紧跟一个开关参数，否则会把任务正文也吞成附件。fleet 已经按这个顺序拼参数。
- **`--auto` 会自动放行所有权限**，fleet 派 opencode 时一律带着它，只对你授权过的目录派活。

截至 2026-09 试过不能用的：Grok 系已无额度；`opencode/big-pickle` 用不了；chaosyn 通道已撤除；qoder 系代号别名全部无响应；GPT 系不发工具调用。
