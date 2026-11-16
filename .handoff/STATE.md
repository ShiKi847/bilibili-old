# Bilibili-Old 状态交接档案 (STATE)

> 最后更新：`2026-11-16T23:41:00+09:00` | 当前分支：`dev-update`

---

## 【1. 全局目标与当前总进度（Overview & Progress）】

- **全局目标**：维护并修复 `Bilibili-Old`（恢复旧版 B 站网页端与旧版播放器的油猴脚本 & Chrome 扩展），持续适配 B 站前端架构升级（视频页 CSR 改版、多视频合集模式 `ugc_season` 升级、个人空间页面适配、视频下载与在线预览修复、全站旧版顶部导航栏稳定性加固等）。
- **当前进度**：
  1. **视频页 CSR 与延迟注入白屏修复**（已完成合入 `v10.13.9`）。
  2. **新版合集 `ugc_season` 多视频与多 P 联动适配**（已完成合入 `v10.13.10`）。
  3. **个人主页（`space.bilibili.com`）旧版迷你顶栏修复与发布**（已完成合入 `v10.13.11`）。
  4. **个人空间（`space.bilibili.com`）账户注册时间恢复（方式 B）**（已完成合入 `v10.13.12`）。
  5. **下载视频点击链接 `0:00` 黑屏无视频修复（方式一：恢复新标签页在线播放预览）**（已完成合入 `v10.13.13`）。
  6. **顶部导航栏偶发消失与双顶栏重叠修复（`v10.13.14` -> `v10.13.15`）**（已完成修复与双端构建）：
     - **`v10.13.14`**：在基类 `Page.updateDom()` 增加 `Header.onDomReplaced()` 协同重挂载、`PageDynamic.rewrite()` 对齐 `Header.remount()`、剥离 `#bili-header-container` 的 `z-top-container` 类名、双阶段清理不兼容 `window.UserStatus`。
     - **`v10.13.15`（修复 `v10.13.14` 动态页出现上下两条重复顶栏回归）**：
       * **根因**：`jinkela/header/header.js` 内部通过 Vue 2 `Le.$mount(".z-top-container")` 挂载，会将占位节点 `this.oldHeader`（`.z-top-container`）**整节点替换**为 `<div id="bili-header-m" class="bili-header-m ...">`，导致 `this.oldHeader` 脱离 `document.body` 且 `this.oldHeader.children.length` 恒为 `0`。`v10.13.14` 的 `observeBodyForHeader` 误以为顶栏丢失而将空 `this.oldHeader` 插回首部，2.5s 自检又误判 `children.length === 0` 触发 `resetAndMount` 二次加载 `header.js`，产生双层 `#bili-header-m`。
       * **修复**：新增 `getRenderedOldHeader()`（检测 `#bili-header-m, .bili-header-m` 并自动移除多余重复实例）与 `isOldHeaderPresentInDom()`；`observeBodyForHeader()` 识别 `#bili-header-m` 后记录 `renderedHeaderEl` 不再插回空 `oldHeader`（若 `#bili-header-m` 被 CSR 水合移除则直接挂回 `renderedHeaderEl`）；2.5s 重试条件改为 `!this.getRenderedOldHeader()`。

---

## 【2. 踩坑挑战与死胡同（Challenges & Failed Attempts）】

1. **死胡同 1（高危必读）：误用 `document.body.contains(this.oldHeader)` 或 `this.oldHeader.children.length > 0` 判断 `jinkela/header/header.js` 是否渲染成功**
   - **原因**：`jinkela/header/header.js` 使用 Vue 2 的 `vm.$mount(".z-top-container")`，挂载完成后**在 DOM 树中直接用 `<div id="bili-header-m" class="bili-header-m">` 替换掉 `.z-top-container` 占位节点**！因此渲染成功后 `document.body.contains(this.oldHeader)` 必定为 `false`、`this.oldHeader.children.length` 必定为 `0`。任何存活检测、幂等守卫或重试条件**必须以 `#bili-header-m, .bili-header-m` 是否在文档中为准**！
2. **死胡同 2：`Page.updateDom()` 后无差别强插 `oldHeader` 会导致原生模板双顶栏**
   - `av.html`、`read.html`、`history.html` 等模板自带原生 `.z-top-container` 与 `jinkela/header` 脚本，仅 `dynamic.html`（`#bili-header-container`）、`space.html` / `online.html`（`#biliMainHeader`）等现代占位模板由 `Header` 接管重挂载。
3. **死胡同 3：项目仓库已开启直线历史约束（`merge.ff=only` & `pull.rebase=true`）**
   - 合并 `dev-update` 到 `master` 前必须确保 `dev-update` 基于最新 `master`（先在 `dev-update` 快进同步 `master`），再在 `master` 执行 `git merge --ff-only dev-update`，严禁制造多余 `Merge branch 'dev-update'` 提交。

---

## 【3. 跑通的成功经验（Successes & Key Patterns）】

1. **旧版顶栏三态生命周期守护**：
   - 挂载前（`this.oldHeader` 占位在树） -> Vue `$mount` 后（`#bili-header-m` 替换上树，缓存 `renderedHeaderEl` 并自动去重多余 `.bili-header-m`） -> 整页 `Page.updateDom()` 替换后（`Header.onDomReplaced()` 基于 `mountedDocElement` 与 `mountToken` 重建干净占位节点重挂载）。

---

## 【4. 下一棒唯一待办（Next Problem to Solve）】

- `v10.13.15` 已完成双顶栏回归修复、双端构建与直线分支提交。等待用户提出下一阶段新问题。

---

## 【5. 核心重要文件清单（Important Files ONLY）】

- `d:\Desktop\bilibili_old\src\page\header.ts` (`remount` / `onDomReplaced` / `resetAndMount` / `reconcileAfterDomReplace`: L255-L350; `getRenderedOldHeader` / `isOldHeaderPresentInDom` / `observeBodyForHeader` / `loadOldHeader` / `mountOldHeader`: L625-L805)
- `d:\Desktop\bilibili_old\src\page\page.ts` (`Page.updateDom`: L35-L63)
- `d:\Desktop\bilibili_old\src\page\dynamic.ts` (`PageDynamic.rewrite`: L12-L34)
- `d:\Desktop\bilibili_old\tampermonkey\manifest.json`
- `d:\Desktop\bilibili_old\tampermonkey\main.user.js`
- `d:\Desktop\bilibili_old\.handoff\STATE.md`
- `d:\Desktop\bilibili_old\.handoff\WORKLOG.md`
