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

## [2026-11-07 16:49 +09:00] 个人空间 (space.bilibili.com) 恢复账户注册时间显示（方式 B）与全局三角色隔离规则加固 (v10.13.12)
- **归档**：由主代理（Gemini 4 Argon）亲自编写并归档 `.handoff/v10.13.12/plan_space_jointime.md` 与 `.handoff/v10.13.12/review_space_jointime.md`（Round 1 驳回并拦截 3 项实质缺陷，Round 2 复审通过 Approved）。
- **根因**：① 原 `account.bilibili.com/api/member/getCardByMid` 已 404 下线，且所有公开接口对他人 `regtime`/`jointime` 均已服务端脱敏置 0；② `src/page/space.ts` 中 `jointime()` 被写在 `status.space` 的 `else` 分支导致开启旧版个人空间时互斥跳过；③ 原选择器仅适配新版 `.section.user-info`，未适配旧版空间 `.user .info .meta .row`。
- **改动**：
  1. `src/io/urls.ts`：新增 `CARD` 与 `MEMBER_CALENDAR_EVENT` 接口常量。
  2. `src/io/account-getcardbymid.ts`：实现 `getSpaceJointime(mid)`（本人空间调用创作中心日历接口获取精确到秒注册时间，支持 `fetch` 与 `GM.fetch` 容灾及内存缓存）与 `estimateJointimeByMid(mid)`（采用 Gemini 4 Argon 校准的 15 个真实 B 站历史发号里程碑锚点对 `< 7 亿` 老号分段线性插值估算年月，`>= 7 亿` 返回 `null`）。
  3. `src/page/space.ts`：解除 `user.addCallback` 分支互斥；实现 `resolveMid()` 仅在根路径 `/` 回退登录 `uid`；在 `tryMount()` 中结合 `.item.uid` DOM 文本二次实锤校准 `mid`、状态锁防并发竞态、使用 `createElement` + `textContent` 安全组装 `.item.jointime` 并注入 `-209px -84px` 日历图标样式；执行 `npm run tampermonkey` 与 `npm run chrome` 零报错构建完成。
  4. 全局配置 `C:\Users\shiki847\.gemini\config\GEMINI.md`：写入 Planner/Reviewer 与 Coder 的目录写权限物理隔离铁律，严禁 Coder 子代理触碰 `.handoff/` 下任何文档。


## [2026-11-08 00:52 +09:00] 修复下载视频点击链接 0:00 黑屏无视频问题，恢复新标签页在线播放预览 (v10.13.13 / 多模型协同流水线: Gemini 4 Argon 规划与审查 + Gemini 3.8 Flash 编码)
- **归档**：由主代理（Gemini 4 Argon）亲自编写并归档 `.handoff/v10.13.13/plan_download_video_preview.md` 与 `.handoff/v10.13.13/review_download_video_preview.md`（审查通过 Approved）。
- **根因**：① `src/core/download.ts` 中 `getMp4()` -> `flv()` 请求 `playurl` 时未传 `platform=html5`，B 站下发 `platform=pc` 直链；在新标签页打开时，内置 `<video>` 发起 `Range` 请求的 `Referer` 变为 CDN 链接自身（Self Referer），被 `upos-sz-mirrorcosov.bilivideo.com` 拦截返回 `403 Forbidden` 导致 `0:00` 黑屏；② Chrome 扩展版 `GM.modifyRequestheader` 传入含非 ASCII 中文字符的 `Content-Disposition: attachment; filename="..."` 导致整条 `declarativeNetRequest` 规则被 Chrome 报错拒绝，且强加 `attachment` 阻止在线预览；③ `chrome/background.ts` 的 `updateSessionRules` 等 4 个异步消息分支漏写 `return true;` 导致消息通道提前关闭。
- **改动**：
  1. `src/io/api-playurl.ts`：在 `IApiPlayurl` 接口中新增可选字段 `platform?: string;` 与 `high_quality?: number;`。
  2. `src/core/download.ts`：`flv()` 显式传入 `{ avid, cid, platform: 'html5', high_quality: 1 }` 获取免 Referer 签名的 HTML5 MP4 直链；`getMp4()` 增加 `hasHtml5Mp4` 检查与 `BLOD.pgc` 降级回退；`pushDownload()` 移除含非 ASCII 字符的 `Content-Disposition` 响应头并将 `urlFilter` 规范化为 `${targetUrl.origin}${targetUrl.pathname}`。
  3. `chrome/background.ts`：在 `executeScript`、`insertCSS`、`updateRulesetOptions`、`updateSessionRules` 四个异步分支补齐 `return true;`。
  4. 执行 `npm run tampermonkey` 与 `npm run chrome` 双端零报错构建完成。


## [2026-11-16 23:16 +09:00] 修复最上方顶部导航栏偶发消失问题 (v10.13.14 / 多模型协同流水线: Gemini 4 Carbon 规划与审查 + Gemini 4 Hydrogen 编码)
- **归档**：由主代理（Gemini 4 Carbon）亲自编写并归档 `.handoff/v10.13.14/plan_header_disappear_fix.md` 与 `.handoff/v10.13.14/review_header_disappear_fix.md`（Round 1 拦截 3 项并发轮询与动态弹窗 iframe 边界缺陷，Round 2 复审通过 Approved）。
- **根因**：① `src/index.ts` 中 `new Header()` 所在的 `user.addCallback` 先于 `new PageDynamic()` 注册；当 `GM.getValue` 返回稍慢、原网页已解析出 `#biliMainHeader` 或 `.bili-header__bar` 时，`hookHeadV2` 的一次性 `poll` 立即同步命中原网页并终止，将 `this.oldHeader` 与 `<script src="jquery.min.js">` 插进即将废弃的原网页 `body`，随后 0ms 后 `PageDynamic.rewrite()` 调用 `this.updateDom()` 替换整棵 `document.documentElement` 将其连根冲掉且未调用 `Header.remount()`；② `dynamic.html` 中 `#bili-header-container` 同时带有 `z-top-container` 类名但被 CSS `display: none !important` 隐藏，存在双容器冲突；③ 新版脚本或模板内 `bili-header.umd.js` 可能在 `jquery.min.js` 加载期间写入缺少 `loadLoginStatus` 的 `window.UserStatus` 导致 `header.js` 跳过初始化，且 CSR 页面水合缺乏 `body` 子节点脱离守护。
- **改动**：
  1. `src/page/header.ts`：增加 `Header` 单例防重入守卫与 `isDynamicNavPage()` 守卫；`isMiniHead()` 显式适配 `t.bilibili.com`；抽离 `findHeaderTarget()` 并为 `hookHeadV2()` 增加防重轮询锁；新增 `onDomReplaced()` / `reconcileAfterDomReplace()`（自动区分现代占位模板与原生 `.z-top-container` 模板避免双顶栏）、幂等 `remount()`、`mountToken` 代数隔离、`loadScriptWithTimeout()`、双阶段 `cleanIncompatibleUserStatus()`、剥离 `#bili-header-container` 的 `z-top-container` 类名、空渲染单次自愈重试及 `observeBodyForHeader()` 存活守护。
  2. `src/page/page.ts`：在 `updateDom()` 完成 `this.vdom.replace(document.documentElement)` 后统一调用 `Header.onDomReplaced()`。
  3. `src/page/dynamic.ts`：对齐 `space.ts` 规范，移除冗余的 `Header.primaryMenu()` / `Header.banner()`，在 `rewrite(status.header)` 中幂等调用 `Header.remount()`。
  4. `tampermonkey/manifest.json`：版本号升级至 `10.13.14`，并执行 `npx tsc --noEmit -p chrome/tsconfig.json`、`npm run tampermonkey`、`npm run chrome` 双端零报错构建完成。


## [2026-11-16 23:41 +09:00] 修复动态页出现上下双层重复顶栏问题并对齐 Git 直线历史 (v10.13.15)
- **根因**：经拆解 `jinkela/header/header.js` 源码确认，其内部调用 Vue 2 `Le.$mount(".z-top-container")` 会将 `this.oldHeader` 占位节点直接替换为 `<div id="bili-header-m" class="bili-header-m">`，导致挂载成功后 `document.body.contains(this.oldHeader)` 变为 `false` 且 `this.oldHeader.children.length` 恒为 `0`。`v10.13.14` 的 `observeBodyForHeader` 因此误将空 `this.oldHeader` 重新插回 `body` 顶部，并在 `2500ms` 自检时误触发 `resetAndMount` 二次加载 `header.js` 渲染出第二条 `#bili-header-m`。
- **改动**：
  1. `src/page/header.ts`：新增 `getRenderedOldHeader()`（识别 `#bili-header-m, .bili-header-m` 并自动剔除重复节点）与 `isOldHeaderPresentInDom()`；更新 `observeBodyForHeader()` 缓存 `renderedHeaderEl`，在 `#bili-header-m` 在位时不再插回 `oldHeader`；将 `2500ms` 重试条件修正为 `!this.getRenderedOldHeader()`；`resetAndMount()` 重建干净 `oldHeader` 并清理残留 `.bili-header-m`。
  2. `tampermonkey/manifest.json`：升级至 `10.13.15`，完成 `npm run tampermonkey` 与 `npm run chrome` 双端零报错构建，并按 `merge.ff=only` 直线历史提交同步 `dev-update` 与 `master`。
