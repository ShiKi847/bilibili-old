# Bilibili-Old 状态交接档案 (STATE)

> 最后更新：`2026-10-31T13:15:00+09:00` | 当前分支：`master`（与 `dev-update` 同步指向 `81925c97` `v10.13.9`）

---

## 【1. 全局目标与当前总进度（Overview & Progress）】

- **全局目标**：维护并修复 `Bilibili-Old`（恢复旧版 B 站网页端与旧版播放器的油猴脚本 & Chrome 扩展），持续适配 B 站前端架构升级（如视频页 SSR 转 CSR、接口鉴权/风控升级、Chrome MV3 脚本注入时序变化等）。
- **当前进度（已完成并合入 `v10.13.9` / commit `81925c97`）**：
  1. **修复 B 站视频页全面切换 CSR 导致的白屏问题**：
     - B 站视频页 HTML 不再内嵌 `window.__INITIAL_STATE__`，旧版 `video.js` 发起的 `/x/web-interface/view/detail` JSONP 请求原已强依赖鉴权/风控，而原 `apiViewDetail` 并行请求 4 个接口（`view` + `card` + `tag` + `related`）任一失败即整体 `Promise.all` reject，落入对 15 位新 `aid` 必挂的 `biliplus` 兜底，最终让旧版 `jsonp` 卡死 60 秒白屏。
     - 已重构 `apiViewDetail`：主请求 `/x/web-interface/view` 支持带 Cookie 与无凭证双路重试，辅请求（`tags` / `related` / `card`）改为 `Promise.allSettled` 非致命降级，并在 `PageAV` / `PageList` 构造函数中提前并发预请求。
     - 修复 `jsonpHook` 仅拦截 `appendChild` / `insertBefore` 而遗漏 `Element.prototype.append` 的问题；修复无 `embedPlayer` 字符串字段时旧版播放器无法引导启动的问题（回退直调 `window.EmbedPlayer('player', '', 'aid=...&cid=...')`）。
  2. **修复 Chrome MV3 延迟注入（「先闪出新版画面，再切回旧版」）引发的必现白屏**：
     - 查明新版 `video.js` 会把已安装不可配置 `$router`/`$route` 的内部 Vue 暴露到 `window.Vue`，切回旧版加载 `vendor.b1b7706...js` 时触发 `window.Vue.use(VueRouter)` 抛出 `Uncaught TypeError: Cannot redefine property: $router` 直接炸毁旧版入口。
     - 已在 `Page.cleanupModernRuntime()` 中销毁新版残留 Vue 实例、禁用其 `$router.push/replace`、置空新版 `Vue.prototype.$mount` 并删除 `window.Vue` 与不兼容的 `window.UserStatus`。
     - 已在 `getInitialVideoState()` 中支持重写 DOM 前直接从已挂载新版 `#app.__vue__.$store.state` 提取现成 CSR 视频数据（零额外请求）。
     - 已在 `VdomTool` 中追踪外部 `<script src>` 加载状态（`scriptsReady`），解决 `document.readyState === "complete"` 时 `Page.loadedCallback()` 在 0ms 提前派发 `load` 事件导致 `footer.js` 底栏丢失的问题。
     - 已修复 `Player.EmbedPlayer()` 中 `await oldPlayer.disconnect()` 异步完成后误清空已替换旧版 `#bofqi` 容器的竞态。

---

## 【2. 踩坑挑战与死胡同（Challenges & Failed Attempts）】

1. **死胡同 1：试图用 `webpackBlock([/\/bfs\/static\/jinkela\/video\//])` 阻止新版视频页 `video.js` 执行**
   - **原因**：B 站新版 `video.5e058f5dc...js` 已改为**单文件自包含打包**，全文件 `0` 处访问 `window.webpackJsonp`。`webpackBlock` 只能拦截仍使用 `webpackJsonp` 的分包，对新版 `video.js` 完全无效。**切勿再试图靠拦截 `webpackJsonp` 阻止新版视频页脚本运行**，必须在 DOM 重写前主动提取数据并清理新版写到 `window` 的全局污染（尤其是 `window.Vue`、`window.UserStatus`、`window.player`）。
2. **死胡同 2：依赖 `apiBiliplusView`（BiliPlus 接口）作为现代视频页常规兜底**
   - **原因**：B 站当前新投稿 `aid` 已达 15 位（如 `av116053405343378`），BiliPlus 对新视频普遍报错或无缓存；且旧版 `vendor.js` 的 `jsonp` 模块（Module 591）**不监听 `<script>` 的 `error` 事件**，只等 60 秒 `timeout: 6e4` 后跳 `//www.bilibili.com/404`。因此 `view/detail` 的 `jsonpHook.async` 一旦 reject，页面就会白屏僵死 60 秒。必须保证主链路 `apiViewDetail` 足够健壮。
3. **死胡同 3：构建与环境命令卡点**
   - 本项目**没有** `npm run build` 脚本！构建命令为：`npm run tampermonkey`（生成 `tampermonkey/main.user.js`）和 `npm run chrome`（生成 Chrome 扩展产物），类型检查为 `npm run tsc`。
   - 注意：`npm run tsc` 目前在存量文件 `chrome/utils/escape-header.ts`、`chrome/utils/gm.ts`、`src/core/ui/utils/checkbox.ts`、`src/io/grpc/BAPIAppPlayurl/v1/playurl.ts` 上有历史遗留类型报错（`esbuild` 打包不受影响），校验改动时重点确认自己修改的文件无新增 TS 报错即可。
   - Windows PowerShell 5.1 不支持 `&&` 连接符，多条命令串联必须用 `;`。
   - 源码文件换行符主要为 `CRLF`（`\r\n`），编辑时注意保持一致。
4. **安全红线约束**：
   - 严禁在未经用户明确同意的情况下擅自执行 `git commit`、`git merge`、`git rebase`、`git push`、`git reset`、`git revert`。
   - 所有 `curl` 命令必须携带 `--connect-timeout 5 -m 15`。

---

## 【3. 跑通的成功经验（Successes & Key Patterns）】

1. **新旧 Vue 同页切换隔离模式**：
   - 旧版 `vendor.js` 自带内部局部 `Vue`（Module 68），本身不依赖 `window.Vue`，但其中的 `Vuex`、`vue-meta`、`vue-router` 均含有 `window.Vue && window.Vue.use(...)` 自动安装嗅探。只要新版脚本先跑过并暴露了 `window.Vue`，重写前**必须**先置空 `win.Vue.prototype.$mount`（防止在途异步 `Promise.all` 完成后抢挂载 `#video-page-app`）再 `Reflect.deleteProperty(window, 'Vue')`。
2. **CSR 延迟注入时的零成本数据复用**：
   - 当油猴注入较晚、新版页面已渲染时，`#app.__vue__.$store.state` 中已有完整的 `{ aid, bvid, cid, videoData, upData, tags, related }`，结构与旧版 `buildDetailFromState(state)` 完全兼容。在 `updateDom()` 销毁原 `#app` 前通过 `getInitialVideoState()` 把它摘出来缓存，可直接秒开旧版页并规避二次请求 412 风控。
3. **旧版 `VueRouter` 路由强约束**：
   - 旧版 `video.b1b7706...js` 的路由表**只匹配 `/video/av:id` 和 `/v/video/av:id`**，完全不认识 `/video/BV...`。一旦地址栏被新版残留路由改回 `BV` 号，旧版 `c.getMatchedComponents()` 返回 `[]`，既不发 `asyncData` 也不渲染组件。因此销毁新版 `$router` 后必须立即调用 `urlCleaner.location()` 确保路径回到 `/video/av<aid>`。
4. **重写模板的 `load` 事件派发时序**：
   - `VdomTool.createElement` 为所有 `<script>` 设置了 `async = false` 保证按序执行，并通过 `vdom.scriptsReady` 等待全部外部 `<script src>` `load`/`error`（含 10s 超时兜底）后再派发 `window.dispatchEvent(new ProgressEvent("load"))`，可彻底解决晚注入（`readyState === "complete"`）时依赖 `window.onload` 的旧版脚本（如 `footer.js`）不执行的问题。
5. **标准打包验证流水线**：
   ```powershell
   npm run tampermonkey; npm run chrome
   ```

---

## 【4. 下一棒唯一待办（Next Problem to Solve）】

- 当前 `v10.13.9`（`81925c97`）视频页 CSR 白屏与延迟注入白屏均已修复并发布，工作区干净（`git status` 无未提交改动）。
- **下一棒待办**：等待用户反馈新的单个具体页面/接口异常（如后续 B 站其他页面 CSR 化、评论/弹幕/播放列表/顶栏接口变动，或 `v10.13.9` 实测中的边缘场景问题），按「单窗口单问题」接入处理。

---

## 【5. 核心重要文件清单（Important Files ONLY）】

- `d:\Desktop\bilibili_old\src\index.ts`
  - 首屏状态拦截与新版已挂载 Vuex 状态提取：`getInitialVideoState`、`getInitialPlayInfo`、`lockInitialState`（L48-L120）
  - 各页面路由分发入口：`user.addCallback`（L123-L227）
- `d:\Desktop\bilibili_old\src\page\page.ts`
  - 页面重写主流程：`Page.updateDom`（L35-L60）
  - 新版全局运行时残留清理（`window.Vue` / `$router` / `UserStatus`）：`Page.cleanupModernRuntime`（L61-L103）
  - 原页面脚本节点剥离与模板 `load` 事件延后派发：`Page.neutralizeOriginalScripts`（L105-L118）、`Page.loadedCallback`（L172-L179）
- `d:\Desktop\bilibili_old\src\page\av.ts`
  - 旧版 AV 页主控制器：`PageAV.constructor`（L67-L110）
  - 播放器无 `__INITIAL_STATE__` 引导补丁：`PageAV.embedPlayer`（L171-L173）
  - 视频详情构造与 `view/detail` JSONP 拦截：`PageAV.buildDetailFromState`（L189-L222）、`PageAV.aidLostCheck`（L255-L293）
- `d:\Desktop\bilibili_old\src\page\list.ts`
  - 稍后再看以外的 `/list/` 播单重写页（与 `PageAV` 共享同一套 `old_video.js` 717 模块 hook）：`PageList.constructor`（L111-L173）、`PageList.embedPlayer`（L698-L701）、`PageList.aidLostCheck`（L783-L821）
- `d:\Desktop\bilibili_old\src\io\api-view-detail.ts`
  - 视频详情容错聚合请求（主接口双路重试 + 辅接口 `Promise.allSettled`）：`apiViewDetail`（L22-L97）
- `d:\Desktop\bilibili_old\src\core\player.ts`
  - 旧版播放器引导与新版 `nano` 播放器安全断开清理：`Player.EmbedPlayer`（L160-L206）
- `d:\Desktop\bilibili_old\src\utils\vdomtool.ts`
  - 虚拟 DOM 转真 DOM 及外部 `<script src>` 就绪追踪：`VdomTool.scriptsReady`、`VdomTool.createElement`（L4-L60）
- `d:\Desktop\bilibili_old\src\utils\hook\node.ts`
  - DOM 脚本注入与 JSONP 拦截（含 `appendChild` / `insertBefore` / `append`）：`checkJsonp`、`jsonpHook`、`jsonpHook.async`（L7-L99）
