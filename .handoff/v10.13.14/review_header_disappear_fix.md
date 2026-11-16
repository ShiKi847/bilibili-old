# 顶部导航栏偶发消失修复深度审查报告 (`review_header_disappear_fix.md`)

> 审查模型：**Gemini 4 Carbon (Reviewer)**
> 编码模型：**Gemini 4 Hydrogen (Coder)**
> 审查结论：**Approved (Round 1 拦截 3 项边界缺陷 -> Round 2 复审通过)**

---

## 一、 审查范围与核验文件
主代理（Gemini 4 Carbon）已亲自使用 `read_file`、`git diff` 与类型/构建命令逐行核验以下源码文件与构建产物：
1. `src/page/header.ts` (L255-L346, L536-L759)
2. `src/page/page.ts` (L1-L62)
3. `src/page/dynamic.ts` (L12-L34)
4. `tampermonkey/manifest.json` (L1-L6)
5. 构建产物：`tampermonkey/main.user.js` 与 `dist/`（Chrome MV3 扩展）

---

## 二、 闭环审查记录（Round 1 -> Round 2）

### Round 1 审查（Changes Requested）
首轮逐行审查确认核心设计已落地，但拦截到 3 项并发边界与 iframe 场景缺陷并退回 Gemini 4 Hydrogen 修复：
1. **[Medium] 早期 `body === null` 异步挂载跨文档串扰**：`mountOldHeader()` 的 `attachToDom` 在 `poll(() => document.body)` 异步回调中未校验 `document.documentElement === currentDoc`，若中途切入自带原生 `.z-top-container` 的旧版模板（如 `read.html`）会误插空节点。
2. **[Low-Medium] `hookHeadV2()` 并行轮询叠加与非空断言风险**：`reconcileAfterDomReplace()` 再次调用 `hookHeadV2()` 时可能叠加多个 `setInterval`；远古顶栏分支 `document.querySelector('.header')!` 存在空指针抛错风险。
3. **[Low] 动态悬浮窗 iframe 守卫缺失**：`t.bilibili.com/pages/nav/index` 下 `remount()`、`resetAndMount()`、`reconcileAfterDomReplace()` 未加 `isDynamicNavPage()` 守卫。

### Round 2 复审（Approved）
主代理再次读取 `src/page/header.ts` 全量变更行核验，确认上述 3 项问题已 100% 闭环修复：
1. **整页替换与回调顺序竞态根治（`src/page/page.ts`、`src/page/dynamic.ts`、`src/page/header.ts`）**：
   - 基类 `Page.updateDom()` 在 `this.vdom.replace(document.documentElement)` 后统一调用 `Header.onDomReplaced()` -> `reconcileAfterDomReplace()`，按新文档是否存在现代占位节点或原生 `.z-top-container` 自动分流重挂载或退让，同时覆盖 `PageDynamic`、`PageSpace`、`PageRead`（异步 `__INITIAL_STATE__`）等全部子类。
   - `PageDynamic.rewrite(status.header)` 已移除冗余的 `Header.primaryMenu()` / `Header.banner()` 并幂等调用 `Header.remount()`；`Header.isMiniHead()` 已对 `t.bilibili.com` 显式返回 `true`。
2. **选择器冲突、`window.UserStatus` 污染与 CSR 水合防护（`src/page/header.ts`）**：
   - 挂载前后主动剥离 `#bili-header-container` 上的 `z-top-container` 类名，彻底杜绝 `header.js` 误挂入被 `display: none !important` 隐藏的占位容器。
   - 在拉取 `jquery.min.js` 前及拉取 `jinkela/header/header.js` 前双阶段调用 `cleanIncompatibleUserStatus()`，防止新版脚本或 `bili-header.umd.js` 污染 `window.UserStatus` 导致 `header.js` 静默跳过渲染。
   - 引入 `mountToken` 代数令牌、`mountedDocElement` 根元素比对、`loadScriptWithTimeout` 10s 超时释放、`2500ms` 空渲染单次自愈重试，以及仅监听 `document.body` 直接子节点（`{ childList: true }`，零子树性能损耗）的 `observeBodyForHeader()` 守护。
   - Round 1 指出的 `attachToDom` 跨文档校验（L676）、`isHeadV2Polling` / `isAncientHeadPolling` 防重锁与 `.header` 安全判空（L583-L607）、以及 `isDynamicNavPage()` 守卫（L259, L281, L292）均已精确就位。
3. **类型安全、构建验证与隔离铁律**：
   - `npx tsc --noEmit -p chrome/tsconfig.json`、`npm run tampermonkey`、`npm run chrome` 均以退出码 `0` 零报错通过。
   - Coder（Gemini 4 Hydrogen）严格遵守物理隔离铁律，未创建或修改 `.handoff/` 下任何文档。

---

## 三、 最终结论
- **状态**：**Approved**
