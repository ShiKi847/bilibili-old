# Bilibili-Old 状态交接档案 (STATE)

> 最后更新：`2026-11-16T23:20:15+09:00` | 当前分支：`dev-update`（含 `v10.13.14` 已构建待提交改动）

---

## 【1. 全局目标与当前总进度（Overview & Progress）】

- **全局目标**：维护并修复 `Bilibili-Old`（恢复旧版 B 站网页端与旧版播放器的油猴脚本 & Chrome 扩展），持续适配 B 站前端架构升级（视频页 CSR 改版、多视频合集模式 `ugc_season` 升级、个人空间页面适配、视频下载与在线预览修复、全站旧版顶部导航栏稳定性加固等）。
- **当前进度**：
  1. **视频页 CSR 与延迟注入白屏修复**（已完成合入 `v10.13.9`）。
  2. **新版合集 `ugc_season` 多视频与多 P 联动适配**（已完成合入 `v10.13.10`）。
  3. **个人主页（`space.bilibili.com`）旧版迷你顶栏修复与发布**（已完成合入 `v10.13.11`）。
  4. **个人空间（`space.bilibili.com`）账户注册时间恢复（方式 B）**（已完成合入 `v10.13.12`）。
  5. **下载视频点击链接 `0:00` 黑屏无视频修复（方式一：恢复新标签页在线播放预览）**（已完成合入 `v10.13.13`）。
  6. **顶部导航栏偶发消失修复（动态首页 `t.bilibili.com` 竞态重挂 + 全站 `Page.updateDom` 协同 + CSR 水合守护，`v10.13.14`）**（已完成编码、两轮审查闭环与双端构建验证，改动保留在当前工作区待实测确认后提交发布）：
     - 采用多模型物理隔离流水线：**Gemini 4 Carbon（Planner 规划 & Reviewer 深度审查）** + **Gemini 4 Hydrogen（Coder 纯代码实现）**。
     - 规划与审查归档（主代理亲自执笔）：
       * 方案规划：`.handoff/v10.13.14/plan_header_disappear_fix.md`
       * 深度审查：`.handoff/v10.13.14/review_header_disappear_fix.md`（Round 1 拦截 3 项边界问题 -> Round 2 复审 **Approved**）
     - 核心改动落地：
       * **整页替换统一协同重挂载**：`Page.updateDom()` 在 `vdom.replace(document.documentElement)` 后调用 `Header.onDomReplaced()` -> `reconcileAfterDomReplace()`，根治 `new Header()` 先命中原网页顶栏终止 `poll`、随后 `PageDynamic.rewrite()` 替换整棵 `<html>` 把 `oldHeader` 连根冲掉的异步竞态；同时自动识别 `read.html` / `av.html` 等自带原生 `.z-top-container` 的模板并退让，杜绝双顶栏。
       * **冲突剥离、状态净化与自愈守护**：`Header.isMiniHead()` 显式对 `t.bilibili.com` 返回 `true`；剥离 `#bili-header-container` 上的 `z-top-container` 类名消除隐藏容器冲突；加载 `jquery.min.js` 与 `header.js` 前后双阶段清理缺少 `loadLoginStatus` 的新版 `window.UserStatus`；引入 `mountToken` 代数隔离、`mountedDocElement` 比对、`loadScriptWithTimeout(10s)`、`2500ms` 空容器单次重试及 `observeBodyForHeader()`（仅监听 `body` 直接子节点，零子树损耗）。

---

## 【2. 踩坑挑战与死胡同（Challenges & Failed Attempts）】

1. **死胡同 1：`Page.updateDom()` 后无差别强插 `oldHeader` 会导致原生模板双顶栏 + `body===null` 跨文档串扰**
   - **原因**：`av.html`、`read.html`、`history.html` 等旧版模板已内置 `<div class="z-top-container">` 与 `jinkela/header/header.js`；只有 `dynamic.html`（`#bili-header-container`）、`space.html` / `online.html`（`#biliMainHeader`）等现代占位模板需要 `Header` 接管重挂载。重挂载前必须通过 `findHeaderTarget()` 与原生 `.z-top-container` 排他检测分流，且 `attachToDom` 异步回调必须校验 `document.documentElement === currentDoc`、对 `isDynamicNavPage()`（`t.bilibili.com/pages/nav/index` 悬浮窗 iframe）提前 `return`。
2. **死胡同 2：`npm run tsc` 的历史存量类型告警与 `agy` CLI Windows 参数坑点**
   - `npm run tsc`（`./src/tsconfig.json`）在仓库 5 个既有未改动文件（`chrome/utils/escape-header.ts`、`chrome/utils/gm.ts`、`src/core/ui/utils/checkbox.ts`、`src/io/api-view-detail.ts`、`src/io/grpc/BAPIAppPlayurl/v1/playurl.ts`）中存在历史严格类型告警，切勿在单点任务中浪费 Token 去修无关存量文件；构建与扩展类型校验使用 `npx tsc --noEmit -p chrome/tsconfig.json`、`npm run tampermonkey`、`npm run chrome`（均退出码 `0`）。
   - Windows 下通过 `agy` CLI 调度 `gemini-4-hydrogen-medium` 时使用 `agy -p $prompt --model gemini-4-hydrogen-medium --dangerously-skip-permissions`，无需传 `--mode auto`（Windows 无终端沙箱会输出 warning）。
3. **死胡同 3：历史关键防线（保留）**
   - 浏览器预览 MP4 直链必须传 `platform: 'html5', high_quality: 1` 规避 Self-Referer `403`；Chrome MV3 `updateSessionRules` 响应头严禁未转义非 ASCII 字符且 `chrome/background.ts` 异步消息分支必须保留 `return true;`；个人空间保持 `isMiniHead === true` 且严禁隐藏 `#space-app`。

---

## 【3. 跑通的成功经验（Successes & Key Patterns）】

1. **全站旧版顶栏生命周期闭环范式**：
   - `Page.updateDom()` 统一回调 `Header.onDomReplaced()` + `mountedDocElement` & `mountToken` 幂等隔离 + `isHeadV2Polling` 防重锁 + 双阶段 `cleanIncompatibleUserStatus()` + 剥离 `#bili-header-container.z-top-container` + `document.body` 直接子节点 `MutationObserver` 存活守护。
2. **多模型物理隔离协作流水线**：
   - 主代理（Gemini 4 Carbon）亲自落盘 `plan_*.md` -> `agy --model gemini-4-hydrogen-medium` 仅修改业务源码 -> 主代理亲自 `read_file` 逐行审查（Round 1 拦截边界缺陷 -> Coder 修复 -> Round 2 复审 `Approved`）并亲自更新 `.handoff/` 全部档案。

---

## 【4. 下一棒唯一待办（Next Problem to Solve）】

- 当前工作区包含已完成审查与双端构建的 `v10.13.14` 改动（`src/page/header.ts`、`src/page/page.ts`、`src/page/dynamic.ts`、`tampermonkey/manifest.json`、`tampermonkey/main.user.js` 及 `dist/`）。
- 下一棒唯一待办：待用户实测确认 `v10.13.14` 顶栏修复效果后，执行 `git commit` 并合入推送至 `dev-update` / `master`，或接收用户指定的下一个独立问题。

---

## 【5. 核心重要文件清单（Important Files ONLY）】

- `d:\Desktop\bilibili_old\src\page\header.ts` (`remount` / `onDomReplaced` / `resetAndMount` / `reconcileAfterDomReplace` / `isMiniHead` / `constructor`: L255-L346; `findHeaderTarget` / `cleanIncompatibleUserStatus` / `loadScriptWithTimeout` / `hookHeadV2` / `observeBodyForHeader` / `loadOldHeader` / `mountOldHeader`: L536-L759)
- `d:\Desktop\bilibili_old\src\page\page.ts` (`Page.updateDom` & `cleanupModernRuntime`: L35-L106)
- `d:\Desktop\bilibili_old\src\page\dynamic.ts` (`PageDynamic.constructor` & `rewrite`: L12-L34)
- `d:\Desktop\bilibili_old\src\index.ts` (`user.addCallback` & 路由初始化顺序: L124-L245)
- `d:\Desktop\bilibili_old\tampermonkey\manifest.json` (L1-L23)
- `d:\Desktop\bilibili_old\tampermonkey\main.user.js`
- `d:\Desktop\bilibili_old\.handoff\v10.13.14\plan_header_disappear_fix.md`
- `d:\Desktop\bilibili_old\.handoff\v10.13.14\review_header_disappear_fix.md`
- `d:\Desktop\bilibili_old\.handoff\STATE.md`
- `d:\Desktop\bilibili_old\.handoff\WORKLOG.md`
