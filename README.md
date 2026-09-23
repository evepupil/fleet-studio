# fleet-studio

本机的苦工闸门服务和工作区看板。各项目的 AI 主会话通过 `fleet` 命令派出 pi / opencode 苦工；服务按模型池的全局容量排队放行，容量满时让占用最少的项目先补上空位；看板实时显示每个池被哪些项目占了多少、每个苦工在干什么、最后交回了什么。

- 需求与设计：[需求设计](docs/需求设计.md) · [技术设计](docs/技术设计.md) · [架构设计](docs/架构设计.md) · [前端设计](docs/前端设计.md) · [roadmap](docs/roadmap.md)
- 模块设计：[docs/模块设计/](docs/模块设计/)
- 进度流水：[docs/进度/](docs/进度/)

## 安装

需要 Node.js 24 和 pnpm 10。

```powershell
pnpm install
pnpm build
node scripts/install-shims.mjs      # 把 fleet 命令装进 npm 全局目录（已在 PATH 中）
```

卸载命令外壳：`node scripts/install-shims.mjs --uninstall`。

## 主会话怎么用

```bash
# 派一个苦工：第一行输出苦工编号。长任务一律用文件或标准输入传入
fleet run --role worker --title "类目配置校验" --prompt-file task.md
fleet run --role reviewer --title "评审 M0 改动" - <<'EOF'
……任务正文……
EOF

fleet wait w7k2mq wa2d4f            # 等全部结束，打印状态和回报；--any 任一结束就返回
fleet ps                            # 当前项目的苦工；--all 看全部项目
fleet show w7k2mq                   # 详情与回报
fleet log w7k2mq --tail 50          # 时间线
fleet send w7k2mq "第 2 点理解错了，实际约定是……"   # 续接：同一个会话再跑一次
fleet cancel w7k2mq
fleet pools                         # 各池占用、排队、最近健康
fleet pool set dsf --capacity 15    # 调整容量，立即生效
fleet open                          # 在浏览器里打开看板
```

- 苦工归属的项目默认取当前目录所在的 git 仓库根；在临时目录里干活时用 `--project <主项目目录>` 或环境变量 `FLEET_PROJECT` 指定。
- 退出码：0 成功；1 有苦工失败或被取消；2 等待超时（还有苦工没结束）；3 用法错误或连不上服务。
- 服务没启动时，任何命令都会自动把它拉起来。

## 配置与数据

默认数据目录 `%USERPROFILE%\.fleet-studio\`（环境变量 `FLEET_HOME` 可改）：

| 文件 | 内容 |
|---|---|
| `config.json` | 模型池（容量、单项目上限、模型）、角色、默认值、端口；改完自动生效 |
| `daemon.json` | 服务的进程号、端口和本机令牌，命令行靠它找到服务 |
| `fleet.db` | 项目、苦工、运行记录 |
| `runs/<运行编号>/` | 苦工的原始输出和解析出的时间线 |
| `daemon.log` | 服务日志 |

看板地址默认 `http://127.0.0.1:4870`，只监听本机。

## 开发

```powershell
pnpm check                  # 格式、类型、测试、构建、前端写死色值检查，全部通过才能提交
node scripts/ui/probe.mjs   # 看板交互检查（需先构建）
node scripts/ui/shoot.mjs   # 看板截图，写到 .fleet/shots/
```

看板可以不接服务、直接用演示数据打开构建产物：`apps/web/dist/index.html?demo=busy`（另有 `empty`、`failure`、`offline`）。
