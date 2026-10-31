## [2026-10-31 13:15 +09:00] 修复视频页 CSR 改版与延迟注入（新版切旧版）白屏问题（v10.13.9 / 81925c97）
- **根因**：① B 站视频页转 CSR 后无 `__INITIAL_STATE__` 且 `view/detail` JSONP 失效，原 `apiViewDetail` `Promise.all` 脆弱易触发兜底超时；② Chrome MV3 偶发延迟注入导致新版 `video.js` 先运行并污染 `window.Vue`（含不可配置 `$router`）与 `window.UserStatus`，切旧版时 `old_vendor.js` 自动执行 `window.Vue.use(VueRouter)` 抛 `Cannot redefine property: $router` 崩溃，且 `readyState === "complete"` 导致 `load` 事件 0ms 提前派发丢失底栏、`player.disconnect()` 异步误清空旧版 `#bofqi`。
- **改动**：更新 `src/index.ts`（提取 `#app.__vue__.$store.state`）、`src/page/page.ts`（`cleanupModernRuntime` + 等待 `vdom.scriptsReady` 后派发 `load`）、`src/page/av.ts`、`src/page/list.ts`、`src/io/api-view-detail.ts`、`src/core/player.ts`、`src/utils/vdomtool.ts`、`src/utils/hook/node.ts`，并构建发布 `v10.13.9`（commit `81925c97`）。

## [2026-10-31 15:38 +09:00] 适配新版 B 站视频合集 (ugc_season) 功能并支持多视频与多P分集联动 (v10.13.10)
- **根因**：B 站合集改版后由单一视频多 P 转为多个独立视频聚合，且部分视频自身仍带有多 P。旧版插件原先强制隐藏顶部 `#v_multipage` 且未将右侧默认激活为合集 Tab，造成选集入口丢失；且播放器切集切 P 重建 DOM 时会将「合集」回退为「播单」，切 P 触发路由更新时存在 `asyncData` 报错。
- **改动**：更新 `src/page/av.ts`、`src/page/list.ts`、`src/core/player.ts`、`src/core/bilibili-old.ts`、`src/index.ts`、`tampermonkey/manifest.json`，支持右侧合集面板自动展开、保持「合集」标签与空间跳转、顶部与右侧选集联动、修复切 P 异常，重新构建并发布 `v10.13.10`。
