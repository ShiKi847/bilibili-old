# Bilibili-Old 状态交接档案 (STATE)

> 最后更新：`2026-11-01T15:25:00+09:00` | 当前分支：`dev-update`

---

## 【1. 全局目标与当前总进度（Overview & Progress）】

- **全局目标**：维护并修复 `Bilibili-Old`（恢复旧版 B 站网页端与旧版播放器的油猴脚本 & Chrome 扩展），持续适配 B 站前端架构升级（视频页 CSR 改版、多视频合集模式 ugc_season 升级、个人空间页面适配等）。
- **当前进度**：
  1. **视频页 CSR 与延迟注入白屏修复**（已完成合入 `v10.13.9`）。
  2. **新版合集 `ugc_season` 多视频与多 P 联动适配**（已完成合入 `v10.13.10`）。
  3. **个人主页（`space.bilibili.com`）旧版顶栏空白与迷你顶栏修复**（本轮完成，归类于版本 `v10.13.11`）：
     - 采用异构多模型协作流水线：**Magpie Gemini 4 Argon（Planner 规划 & Reviewer 深度审查）** + **App Gemini 3.8 Flash（Coder 编码实现）**。
     - 规划与审查文档归档于：
       * 初始规划：`.handoff/v10.13.11/plan_space_header.md`
       * 初始审查：`.handoff/v10.13.11/review_space_header.md`
       * 迷你顶栏重定规：`.handoff/v10.13.11/plan_space_mini_header.md`
       * 迷你顶栏审查报告：`.handoff/v10.13.11/review_space_mini_header.md`（最终审查结论：**通过 Approved**）。
     - 架构落地：
       * 明确个人空间需求为经典的极简旧版迷你顶栏（`miniHeader`：仅含顶部 42px 导航条，不含全站 2233 钓鱼大 Banner 及全站频道菜单，不加 `has-menu`），完美衔接个人空间专属个性装扮 Banner。
       * 在 `Header.isMiniHead` 中对 `space.bilibili.com` 返回 `true`。
       * 条件化调用 `primaryMenu()` 与 `banner()`，在 `isMiniHead` 判定成立时完全跳过全站 Banner 与频道菜单逻辑。
       * 在 `src/page/header.ts` 中实现 `Header.remount()` 与 `resetAndMount()`，支持在 `updateDom` 全量重构 DOM 树后重新将 `.z-top-container` 插入 `body.firstChild`，并增加并发防重入锁。
       * 在 `src/page/space.ts` 的 `PageSpace.rewrite` 中将顶栏重挂载放在 `this.updateDom()` 之后执行，并移除冗余的 `else` 分支。
     - 构建通过：`npm run tampermonkey; npm run chrome` 顺利生成产物。

---

## 【2. 踩坑挑战与死胡同（Challenges & Failed Attempts）】

1. **死胡同 1：在 `poll` 选择器中直接混入 `#space-app`**
   - **原因**：`poll` 命中的节点会作为 `target` 传入 `loadOldHeader`，原逻辑会将 `target.style.display = 'none'`，如果命中 `#space-app` 会直接把个人空间主体内容隐藏，造成页面主体白屏。必须严禁将主体容器作为被隐藏的 `target`。
2. **死胡同 2：直接在 `mountOldHeader` 中硬编码覆盖 `this.oldHeader.className`**
   - **原因**：这会破坏所有非 space 页面的 `miniHeader()` 设置，导致视频播放页等迷你顶栏页面退化或高度异常。必须使用 `isMiniHead(target)` 精确设置并保留 `z-top-container` 基础类名。
3. **死胡同 3：`updateDom` 后简单复用脱水 DOM 节点跳过脚本加载**
   - **原因**：全量替换 DOM 后 `<head>` 中动态注入的样式和全局事件被销毁，仅复用已有节点会导致样式丢失；而在重挂载时调用 `resetAndMount` 清空状态并重新拉取 `header.js` 可以确保样式表在全新 `<head>` 中完整注入。

---

## 【3. 跑通的成功经验（Successes & Key Patterns）】

1. **DOM 全量替换后的顶栏恢复范式**：
   - 依赖 `Header.instance` 静态单例 + `Header.remount()` 机制，在 `this.updateDom()` 之后主动重置并重新挂载，避免后台多套轮询定时器互抢。
2. **异构模型闭环审查机制**：
   - Gemini 4 Argon 规划 -> Gemini 3.8 Flash 编写 -> Gemini 4 Argon 审查（多轮推演，成功拦截回归 Bug） -> 最终 Approved -> 标准构建流水线。

---

## 【4. 下一棒待办（Next Steps）】

- 向用户汇报三角色协同成果与代码变更。
- 待用户在浏览器加载测试脚本 `tampermonkey/main.user.js` 并确认个人主页顶栏展示符合预期。
- 待用户授权后执行 Git 提交与版本发布。

---

## 【5. 核心重要文件清单（Important Files ONLY）】

- `d:\Desktop\bilibili_old\src\page\header.ts`
- `d:\Desktop\bilibili_old\src\page\space.ts`
- `d:\Desktop\bilibili_old\src\page\av.ts`
- `d:\Desktop\bilibili_old\src\page\list.ts`
- `d:\Desktop\bilibili_old\src\core\player.ts`
- `d:\Desktop\bilibili_old\src\core\bilibili-old.ts`
- `d:\Desktop\bilibili_old\src\index.ts`
