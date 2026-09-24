#!/usr/bin/env bash
# 门禁与静态排查（多页版）。复制到项目的 .fleet/ 下使用。
# 用法：bash .fleet/gate.sh [--no-build]，在项目根执行，或设 PROJECT_ROOT 指向项目根。

ROOT="${PROJECT_ROOT:-$(pwd)}"
cd "$ROOT" || exit 1

# ==================== 按项目改这一段 ====================
TEST="pnpm test"                                       # 没有单测就置空
TYPECHECK="pnpm exec tsc --noEmit --incremental false"
BUILD="pnpm run build"
# 每一页的导出文件（多页静态导出 + trailingSlash 时是 out/<路由>/index.html）
ARTIFACTS="out/index.html"
# 放组件的目录（共享组件目录也列上，用于看文件大小）
COMPONENT_DIRS="components/site components/home components/ui"
# 区块导出名核对：「文件路径（不带扩展名）:组件名」，每个区块一项，按站点层 4.2 的区块清单写
EXPORTS="components/site/site-header:SiteHeader components/home/hero:HomeHero"
# 图标白名单（正则，取自站点层第 1 章），置空则跳过该检查
ICON_ALLOW=""
# 交互检查要找的标记（取自每页页面层末尾的交互检查表），置空则跳过
HOOKS='data-results-count id="target"'
# ========================================================

echo "=== 组件文件大小（占位文件只有一两百字节）==="
for d in $COMPONENT_DIRS; do
  for f in "$d"/*.tsx "$d"/*.ts; do [ -f "$f" ] && printf "%-52s %7s\n" "$f" "$(wc -c < "$f")"; done
done

if [ -n "$TEST" ]; then
  echo; echo "=== 单测 ==="
  $TEST 2>&1 | tail -8
fi

echo; echo "=== 类型检查 ==="
$TYPECHECK 2>&1 | head -30; echo "TYPECHECK_EXIT=${PIPESTATUS[0]}"

if [ "$1" != "--no-build" ]; then
  echo; echo "=== 构建 ==="
  $BUILD 2>&1 | tail -22; echo "BUILD_EXIT=${PIPESTATUS[0]}"
  for a in $ARTIFACTS; do ls -la "$a" 2>/dev/null || echo "MISSING $a"; done
fi

echo; echo "=== 禁用项 ==="
echo "-- any / 忽略类型错误 --"
grep -rnE ":[[:space:]]*any\b|as any|@ts-ignore|as unknown as" components app lib 2>/dev/null | head
echo "-- 随机数 / 取当前时间 / 用窗口宽度判断断点（会导致首屏不一致）--"
grep -rnE "Math\.random|Date\.now\(|new Date\(\)|window\.innerWidth" components app 2>/dev/null | head
echo "-- 组件里散落的十六进制色值（应该只用令牌；SVG 渐变 stopColor 例外）--"
grep -rnE "#[0-9A-Fa-f]{6}\b" components 2>/dev/null | grep -v "stopColor" | head
echo "-- 禁用依赖 --"
grep -rnE 'from "(framer-motion|next/link|next/image|recharts|chart\.js|d3|leaflet)' components app 2>/dev/null | head
echo "-- 拼接出来的颜色类名（Tailwind 认不出）--"
grep -rnE '(bg|text|fill|stroke|border)-[a-z]+-\$\{' components 2>/dev/null | head
echo "-- 占位、开发备注与空洞文案 --"
grep -rnE "lorem|占位|标题文字|暂不支持|后续开放|敬请期待|TODO|了解更多|点击这里|赋能|一站式" components 2>/dev/null | head

echo; echo "=== 用了 hook 或事件却没有客户端指令的文件 ==="
for f in $(grep -rlE "useState|useEffect|useMemo|useRef|onClick=|onChange=|onSubmit=|onKeyDown=|onPointerMove=|onMouseEnter=" components 2>/dev/null); do
  head -1 "$f" | grep -q '"use client"' || echo "MISSING use client: $f"
done

if [ -n "$ICON_ALLOW" ]; then
  echo; echo "=== 图标是否都在白名单 ==="
  grep -rhoE 'import \{[^}]+\} from "lucide-react"' components 2>/dev/null \
    | sed -E 's/import \{|\} from "lucide-react"//g' | tr ',' '\n' | sed 's/ //g; s/^type//' \
    | grep -v '^$' | sort -u | grep -vE "^($ICON_ALLOW|LucideIcon)$" | sed 's/^/NOT ALLOWED: /'
fi

echo; echo "=== 导出名核对（具名 + 默认双导出）==="
for pair in $EXPORTS; do
  f="${pair%%:*}.tsx"; n="${pair##*:}"
  if grep -qE "export (default )?function $n\b" "$f" 2>/dev/null && grep -qE "export default (function )?$n\b" "$f" 2>/dev/null; then
    echo "ok  $n"
  else
    echo "BAD $n ($f)"
  fi
done

if [ -n "$HOOKS" ]; then
  echo; echo "=== 交互检查要找的标记是否都在代码里 ==="
  for hook in $HOOKS; do
    grep -rqF "$hook" components 2>/dev/null && echo "ok  $hook" || echo "MISSING $hook"
  done
fi

# ---- 项目专属检查：按站点层第 7 章的自查清单补 ----
# 例：echo "-- 顶栏禁词 --"; grep -nE "对比|数据说明" components/site/site-header.tsx
# 例：grep -q "DEMO_NOTICE" components/site/site-footer.tsx && echo "ok  演示声明" || echo "MISSING 演示声明"
