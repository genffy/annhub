# 浏览器验证说明

自动化 E2E 使用 Playwright 自带的 Chromium；扩展由 global-setup 按需构建：

```bash
pnpm exec playwright test
```

主链路的规格：`selection-clip`（菜单、一次点击、撤销、快速编辑、空白选区、URL 令牌清理）、`block-clip`（区块识别、层级、胶囊避让、X 永久链接、键盘模式、按站停用）、`screenshot-capture`（区域/元素入库、复制、取消、伪造事件）、`page-annotation`（批注层、墨迹、截进编辑器）、`recording-annotation`（录制中的批注与光标高亮）、`options-entry`（选项入口跳到设置页并带着录制的标签页编号，麦克风授权后的回程）、`screenshot-stitch`（滚动长图）、`library-export`（搜索、抽屉、编辑、删除、唯一导出）、`page-download`（胶囊/`D` 键/弹窗的页面下载、响应式图片候选回退、超长正文与评论串、折叠内容与公式脚注、多图表格与列表语义、忙碌、取消）、`library-download`（抽屉与阅读下载、多选与下载对话框、设置卡）、`platform-x`（语义帖子、引用、作者元数据与媒体产物）、`source-page-download`（[来源页面结构](source-pages/README.md)中的百科公式与脚注、文档代码、issue 评论和 X 长文）。

`settings-metrics.spec.ts` 在浏览器的本地日历里固定播种上周日与本周一，分别验证两周的数据；不要假设前天与昨天属于同一周，也不要混用 Node 与浏览器各自的日期。

`e2e/global-setup.ts` 在没有构建、`BUILD_FORCE=1` 或构建输入比 `.output/chrome-mv3/manifest.json` 新时自动重建（判断在 `scripts/build-freshness.ts`，触发文件打印在日志里）。fixture 服务器由 Playwright 配置启动，不需要为自动化测试另开服务。

检查原生下载目录与“下载前询问”时，使用独立临时 Chrome profile，连接 CDP 必须传 `noDefaults: true`。默认连接会接管下载、改用临时目录和 UUID 文件名，不能证明浏览器自己的重名处理或保存窗口行为。磁盘预置同名图片后再下载，逐一解码 Markdown 的相对 URL 并检查文件存在；不要只比较未编码的文本。

## 真实 Chrome 场景

自动化够不着的验收——真实站点（X、Medium、文档站）、只有操作系统才能产生的输入（全局快捷键、读屏）、要人判断的通读——写成了逐条可执行的场景：[real-chrome-scenarios.md](real-chrome-scenarios.md)。每个场景写明需要的能力、步骤、页面内的测量代码和通过标准，不限定执行工具。

## chrome-devtools-mcp 手工实测

以下是本机自动化 Chrome 上的环境限制，版本或 MCP 配置改变后先验证现状。仓库不带共享 MCP 配置：手工实测用所在 agent 自己配置的 chrome-devtools-mcp，没有配置时提醒用户安装，不要往仓库里加回共享配置。它使用独立 profile `~/.cache/chrome-devtools-mcp/chrome-profile`（`.zcode/` 只放本机私有状态，已被忽略）。官网实测前启动 `cd website && pnpm run dev`，默认端口 3001。

1. Chrome 137+ 忽略启动参数 `--load-extension`。MCP 服务首次启动可通过 CDP `Extensions.loadUnpacked` 兜底；自动化 Chrome 重启后可能需要重新安装扩展，先用 `list_extensions` 核实。
2. `install_extension` 在客户端未协商 roots 时只允许 `os.tmpdir()` 下的路径。macOS 的真实临时目录通常是 `$TMPDIR`，不能假定字面 `/tmp` 可用；传给工具的必须是已经展开的绝对路径。
3. 重建 `.output` 不会刷新已加载的 unpacked 扩展。每次重建后复制一份新构建并重新安装，避免 Service Worker 与 content script 来自不同构建。

示例：

```bash
pnpm run build
ANNHUB_TEST_DIR="$(mktemp -d "$TMPDIR/annhub-ext.XXXXXX")"
cp -R .output/chrome-mv3 "$ANNHUB_TEST_DIR/chrome-mv3"
printf '%s\n' "$ANNHUB_TEST_DIR/chrome-mv3"
```

把最后输出的真实路径传给 `install_extension`。实测 content script 注入时，在页面上选中一段文字应出现「剪藏 / 截图」两钮菜单（`[data-ann-ui="selection-menu"]`）。只操作该 MCP 的独立 profile，终止进程时须精确匹配其 `--user-data-dir`，不要影响日常 Chrome。

`download-performance.spec.ts` 用本地夹具服务器测量 20 次下载，每次 10 张约 1.97 MB 的 PNG，断言 95 分位低于 5 秒并附上 JSON 测量结果；它验证本地转换、取回与落盘开销，真实图床网络表现仍按 download.md §9 验收。`download-benchmark.png` 是 1024×640 的确定性 RGB 噪声图（随机种子 417，PNG 无损压缩级别 0），不含用户内容。
