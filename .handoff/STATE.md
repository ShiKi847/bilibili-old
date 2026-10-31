# Bilibili-Old 状态交接档案 (STATE)

> 最后更新：`2026-10-31T15:38:00+09:00` | 当前分支：`master`（与 `dev-update` 同步，包含 `v10.13.10`）

---

## 【1. 全局目标与当前总进度（Overview & Progress）】

- **全局目标**：维护并修复 `Bilibili-Old`（恢复旧版 B 站网页端与旧版播放器的油猴脚本 & Chrome 扩展），持续适配 B 站前端架构升级（视频页 CSR 改版、多视频合集模式 ugc_season 升级、鉴权风控等）。
- **当前进度（已完成合入 `v10.13.10`）**：
  1. **支持与适配新版 B 站视频合集（`ugc_season` 多视频聚合）功能**：
     - **右侧合集面板默认展开与标题展示**：在合集模式初始化与 `player.addModifyArgument` 中设置 `sessionStorage.setItem("player_last_filter_tab_info", 3)`，载入视频时默认展开右侧合集面板（对应旧版 `TAB_PLAYLIST`）；配置 `toview.name = season.title`、`toview.pid = season.id || 1`，解除 `.bilibili-player-playlist-nav-title` 隐藏并绑定点击直接打开 UP 空间合集列表页（`//space.bilibili.com/${season.mid}/lists/${season.id}?type=season`）。
     - **播放器切 P 重构后 UI 状态保持**：实现 `PageAV.updatePlaylistUI`，在初始挂载、`switchVideo` 与 `callAppointPart` 切集时轮询重绑，防止旧版播放器在 `232004` 指令重建 DOM 后标签名回退为「播单」或丢失合集标题跳转。
     - **顶部分 P 栏（`#v_multipage`）与合集面板双向打通**：移除 `#v_multipage{display:none!important;}`。当合集中的当前视频自身又含有多个分 P 时，播放器上方正常展示分 P 栏，与右侧合集面板内展开的分 P 实时高亮同步；通过 hook Webpack Module 277 将顶部点击切 P 转发为播放器指令 `232004`；hook Module 274 兼容 `beforeRouteUpdate` 的 `{ store, route }` 参数，消除了 `TypeError: i is not a function` 报错。
     - **切集与切 P 联动健壮性**：`window.callAppointPart` 改为持久化 getter/setter 描述符，防止在严格模式下被 `PlayerAgent` 赋值抛错；支持同 `aid` 仅更新分 P 与地址栏 `?p=`，跨 `aid` 自动请求新视频详情完整刷新标题、简介、统计、评论、标签、UP 主卡片与 `vue.pages`。
     - **底层数据类型与参数保持**：`window.aid` / `window.cid` setter 统一将纯数字字符串转为 `Number`，保证播放器内部严格匹配；`player.modifyArgument` 改为 `forEach` 避免首次引导后丢弃回调。

---

## 【2. 踩坑挑战与死胡同（Challenges & Failed Attempts）】

1. **死胡同 1：在合集模式下直接隐藏 `#v_multipage`**
   - **原因**：部分合集视频（如 av117194943892429）第 1 个视频本身即包含 13 个分 P，若直接隐藏 `#v_multipage`，用户在播放器上方完全看不到选集按钮，且右侧播放列表若未自动激活为 Tab 3（`TAB_PLAYLIST`），整个页面将陷入完全无集可点的状态。必须保留 `#v_multipage` 并与右侧面板双向通信联动。
2. **死胡同 2：使用一次性 `propertyHook` 拦截 `callAppointPart`**
   - **原因**：`propertyHook` 首次 get 之后会将其重新定义为 `writable: false`，当旧版播放器脚本 Module 274 `externalInterface()` 在 `"use strict"` 模式下执行 `window.callAppointPart = window.PlayerAgent.callAppointPart` 时，会抛出不可捕获的 `TypeError: Cannot assign to read only property`，破坏后续 `PlayerMediaLoaded` 注册。必须使用持久化的 getter / setter 描述符。
3. **死胡同 3：直接调用 `window.GrayManager.reload(e)` 进行分 P 切换**
   - **原因**：Module 277 默认切 P 会触发 GrayManager 重载，这会导致合集注入的播放器配置参数被冲掉。必须拦截转发为播放器内部指令 `232004`（`cidLoader`）。
4. **死胡同 4：构建脚本卡点与注意项**
   - 项目中没有 `npm run build`，构建命令必须使用 `npm run tampermonkey; npm run chrome`，PowerShell 中用 `;` 连接。
   - `git commit`、`git push` 等 Git 变更动作必须严格获得用户明确授权方可执行。

---

## 【3. 跑通的成功经验（Successes & Key Patterns）】

1. **合集面板与标签联动模式**：
   - 写入 `sessionStorage.setItem("player_last_filter_tab_info", 3)` 可在初始化时直达合集面板。
   - 通过 `poll` 监听 `.bilibili-player-filter-btn-playlist span` 和 `.bilibili-player-playlist-nav-title`，在播放器任何一次内部销毁重建时，均能秒级把文案恢复为「合集」并重新绑定跳转到 UP 空间合集页面。
2. **子代理生命周期与任务闭环**：
   - 主代理在委派任务完成后、给出最终汇报前，必须当场调用 `manage_subagents(Action="kill_all")` 终止子代理，杜绝后台任务挂起。
3. **标准构建流水线**：
   ```powershell
   npm run tampermonkey; npm run chrome
   ```

---

## 【4. 下一棒唯一待办（Next Problem to Solve）】

- 工作区变动已打包进 `v10.13.10` 并合入 `master` / 推送至远程仓库。
- **下一棒待办**：等待用户提出下一个新问题或新的功能/页面适配诉求。

---

## 【5. 核心重要文件清单（Important Files ONLY）】

- `d:\Desktop\bilibili_old\src\page\av.ts`
  - 合集播单模拟、合集 UI 同步与切 P 回调：`ugcSection`、`updatePlaylistUI`、`callAppointPart`
- `d:\Desktop\bilibili_old\src\page\list.ts`
  - 播单与合集切集逻辑：`initList`、`callAppointPart`、`biliUIcomponents`
- `d:\Desktop\bilibili_old\src\core\player.ts`
  - 播放器启动参数修改回调保留：`modifyArgument`
- `d:\Desktop\bilibili_old\src\core\bilibili-old.ts`
  - 全局 `aid` / `cid` 类型规整化：`window.aid`、`window.cid` getter/setter
- `d:\Desktop\bilibili_old\src\index.ts`
  - 首屏状态提取与校验：`getInitialVideoState`
