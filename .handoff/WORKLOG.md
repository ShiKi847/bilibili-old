## [2026-10-31 13:15 +09:00] 修复视频页 CSR 改版与延迟注入（新版切旧版）白屏问题（v10.13.9 / 81925c97）
- **根因**：① B 站视频页转 CSR 后无 `__INITIAL_STATE__` 且 `view/detail` JSONP 失效，原 `apiViewDetail` `Promise.all` 脆弱易触发兜底超时；② Chrome MV3 偶发延迟注入导致新版 `video.js` 先运行并污染 `window.Vue`（含不可配置 `$router`）与 `window.UserStatus`，切旧版时 `old_vendor.js` 自动执行 `window.Vue.use(VueRouter)` 抛 `Cannot redefine property: $router` 崩溃，且 `readyState === "complete"` 导致 `load` 事件 0ms 提前派发丢失底栏、`player.disconnect()` 异步误清空旧版 `#bofqi`。
- **改动**：更新 `src/index.ts`（提取 `#app.__vue__.$store.state`）、`src/page/page.ts`（`cleanupModernRuntime` + 等待 `vdom.scriptsReady` 后派发 `load`）、`src/page/av.ts`、`src/page/list.ts`、`src/io/api-view-detail.ts`、`src/core/player.ts`、`src/utils/vdomtool.ts`、`src/utils/hook/node.ts`，并构建发布 `v10.13.9`（commit `81925c97`）。

## [2026-10-31 15:38 +09:00] 适配新版 B 站视频合集 (ugc_season) 功能并支持多视频与多P分集联动 (v10.13.10)
- **根因**：B 站合集改版后由单一视频多 P 转为多个独立视频聚合，且部分视频自身仍带有多 P。旧版插件原先强制隐藏顶部 `#v_multipage` 且未将右侧默认激活为合集 Tab，造成选集入口丢失；且播放器切集切 P 重建 DOM 时会将「合集」回退为「播单」，切 P 触发路由更新时存在 `asyncData` 报错。
- **改动**：更新 `src/page/av.ts`、`src/page/list.ts`、`src/core/player.ts`、`src/core/bilibili-old.ts`、`src/index.ts`、`tampermonkey/manifest.json`，支持右侧合集面板自动展开、保持「合集」标签与空间跳转、顶部与右侧选集联动、修复切 P 异常，重新构建并发布 `v10.13.10`。

## [2026-11-01 15:58 +09:00] 修正个人空间 (space.bilibili.com) 为极简旧版迷你顶栏形态 (v10.13.11 / 多模型协同流水线: Magpie Gemini 4 Argon 规划与审查 + App Gemini 3.8 Flash 编码)
- **归档**：规划与审查文档归档于 `.handoff/v10.13.11/plan_space_mini_header.md` 及 `.handoff/v10.13.11/review_space_mini_header.md`。
- **根因与诉求更正**：用户反馈空间页不需要全站 2233 钓鱼大 Banner 与全站各频道二级菜单（会与空间自带的个性装扮 Banner 发生堆叠），只需要最顶部的经典半透明迷你导航条（`miniHeader`：左侧主站/直播等导航，右侧投稿/头像/动态等）。上一轮因将 `isMiniHead` 判定为 `false`，强行加上了 `has-menu` 并加载了 `banner()` 与 `primaryMenu()`。
- **改动**：
  1. `src/page/header.ts`：在 `Header.isMiniHead` 中对 `space.bilibili.com` 明确返回 `true`；在 `mountOldHeader` 中对 `primaryMenu()` 与 `banner()` 的两处调用增加 `!Header.isMiniHead(target)` 守卫；在 `old-space-header-fix` 样式中补充 `.z-top-container { position: relative; z-index: 1000; }`。
  2. `src/page/space.ts`：在 `PageSpace.rewrite` 中移除 `else` 分支中的 `Header.primaryMenu(); Header.banner();`。
  3. 执行 `npm run tampermonkey; npm run chrome` 构建通过，Reviewer (Gemini 4 Argon) 审查通过 (Approved)。

## [2026-11-01 16:04 +09:00] 发布 v10.13.11 并合并推送至远程仓库
- **提交信息**：`v10.13.11: 修复个人主页(space)旧版迷你顶栏显示与DOM重构挂载`（commit `f0041334`）。
- **合并与推送**：已合并至 `master`（merge commit `1fef26ce`），并全量推送至 `origin/dev-update` 与 `origin/master`。工作区已恢复 Clean 状态。

