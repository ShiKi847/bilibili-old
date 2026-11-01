# Bilibili-Old 状态交接档案 (STATE)

> 最后更新：`2026-11-01T16:06:00+09:00` | 当前分支：`dev-update` (已合并推送到 `origin/dev-update` 与 `origin/master`)

---

## 【1. 全局目标与当前总进度（Overview & Progress）】

- **全局目标**：维护并修复 `Bilibili-Old`（恢复旧版 B 站网页端与旧版播放器的油猴脚本 & Chrome 扩展），持续适配 B 站前端架构升级（视频页 CSR 改版、多视频合集模式 ugc_season 升级、个人空间页面适配等）。
- **当前进度**：
  1. **视频页 CSR 与延迟注入白屏修复**（已完成合入 `v10.13.9`）。
  2. **新版合集 `ugc_season` 多视频与多 P 联动适配**（已完成合入 `v10.13.10`）。
  3. **个人主页（`space.bilibili.com`）旧版迷你顶栏修复与发布**（已完成合入 `v10.13.11`，commit `f0041334` & merge `1fef26ce`）：
     - 采用异构多模型协作流水线：**Magpie Gemini 4 Argon（Planner 规划 & Reviewer 深度审查）** + **App Gemini 3.8 Flash（Coder 编码实现）**。
     - 规划与审查文档归档于：
       * 初始规划：`.handoff/v10.13.11/plan_space_header.md`
       * 初始审查：`.handoff/v10.13.11/review_space_header.md`
       * 迷你顶栏重定规：`.handoff/v10.13.11/plan_space_mini_header.md`
       * 迷你顶栏审查报告：`.handoff/v10.13.11/review_space_mini_header.md`（最终审查结论：**通过 Approved**）。
     - 架构落地：
       * 明确个人空间形态为极简旧版迷你顶栏（`miniHeader`：仅顶部 42px 导航条，不含 2233 钓鱼大 Banner 及全站频道菜单，不加 `has-menu`），完美衔接个人空间专属个性装扮 Banner。
       * 在 `Header.isMiniHead` 中对 `space.bilibili.com` 返回 `true`。
       * 条件化调用 `primaryMenu()` 与 `banner()`，在 `isMiniHead` 判定成立时完全跳过全站 Banner 与频道菜单逻辑。
       * 在 `src/page/header.ts` 中实现 `Header.remount()` 与 `resetAndMount()`，支持在 `updateDom` 全量重构 DOM 树后重新将 `.z-top-container` 插入 `body.firstChild`，并增加并发防重入锁。
       * 在 `src/page/space.ts` 的 `PageSpace.rewrite` 中将顶栏重挂载放在 `this.updateDom()` 之后执行，并移除冗余的 `else` 分支。
     - 构建与发布通过：`npm run tampermonkey; npm run chrome` 生成产物，已成功 commit 并推送到 `origin/dev-update` 及 `origin/master`。

---

## 【2. 踩坑挑战与死胡同（Challenges & Failed Attempts）】

1. **死胡同 1：在 `poll` 选择器中直接混入 `#space-app`**
   - **原因**：`poll` 命中的节点会作为 `target` 传入 `loadOldHeader`，原逻辑会将 `target.style.display = 'none'`，如果命中 `#space-app` 会直接把个人空间主体内容隐藏，造成页面主体白屏。必须严禁将主体容器作为被隐藏的 `target`。
2. **死胡同 2：直接在 `mountOldHeader` 中硬编码覆盖 `this.oldHeader.className`**
   - **原因**：这会破坏所有非 space 页面的 `miniHeader()` 设置，导致视频播放页等迷你顶栏页面退化或高度异常。必须使用 `isMiniHead(target)` 精确设置并保留 `z-top-container` 基础类名。
3. **死胡同 3：`updateDom` 后简单复用脱水 DOM 节点跳过脚本加载**
   - **原因**：全量替换 DOM 后 `<head>` 中动态注入的样式和全局事件被销毁，仅复用已有节点会导致样式丢失；而在重挂载时调用 `resetAndMount` 清空状态并重新拉取 `header.js` 可以确保样式表在全新 `<head>` 中完整注入。
4. **死胡同 4：误将个人主页判定为全量 `has-menu` 顶栏**
   - **原因**：空间页若强行加上 `has-menu` 会渲染全站 2233 钓鱼大 Banner 及各频道二级菜单，与空间自带的个性装扮 Banner 发生堆叠冲突。必须明确空间页为经典的极简旧版迷你顶栏形态（`miniHeader`：`isMiniHead(d) === true`）。
5. **死胡同 5：非交互式子进程中直接运行 `agy` 报缺失环境变量**
   - **原因**：Magpie 通过本地代理 `http://127.0.0.1:3425` 工作，依赖 `$env:GEMINI_API_KEY="magpie-agy"` 和 `$env:GOOGLE_GEMINI_BASE_URL="http://127.0.0.1:3425"`。App 自动化子进程不继承外部终端环境变量，直接运行 `agy` 会报缺少 API Key。且自定义代理模型不支持 `--effort` 参数。已提炼为专属技能 `magpie-agy-cli`。

---

## 【3. 跑通的成功经验（Successes & Key Patterns）】

1. **DOM 全量替换后的顶栏恢复范式**：
   - 依赖 `Header.instance` 静态单例 + `Header.remount()` 机制，在 `this.updateDom()` 之后主动重置并重新挂载，避免后台多套轮询定时器互抢。
2. **Magpie CLI / Gateway 自动化协同范式**：
   - 使用 `magpie-agy-cli` 技能，单行命令内注入 `$env:GEMINI_API_KEY="magpie-agy"; $env:GOOGLE_GEMINI_BASE_URL="http://127.0.0.1:3425"`；或在需要绕过 CLI 客户端参数限制时，通过 Python SDK 直连 `http://127.0.0.1:3425` 的 `google-vertex/gemini-4-argon`，稳定发挥强智力模型的规划与审查优势。
3. **异构模型闭环审查机制**：
   - Gemini 4 Argon 规划 -> Gemini 3.8 Flash 编写 -> Gemini 4 Argon 审查（多轮推演拦截缺陷） -> 最终 Approved -> 标准构建流水线。

---

## 【4. 下一棒唯一待办（Next Problem to Solve）】

- 当前任务已全链路收工：`v10.13.11` 已完成研发、自测、审查闭环、构建、提交并合入推送到远程 `master` 与 `dev-update`。工作区完全干净。
- 下一棒 Agent 待命，等待用户提出下一阶段的新问题或新需求。

---

## 【5. 核心重要文件清单（Important Files ONLY）】

- `d:\Desktop\bilibili_old\src\page\header.ts` (L250-L300, L510-L585)
- `d:\Desktop\bilibili_old\src\page\space.ts` (L30-L65)
- `d:\Desktop\bilibili_old\tampermonkey\manifest.json`
- `d:\Desktop\bilibili_old\tampermonkey\main.user.js`
- `d:\Desktop\bilibili_old\.handoff\STATE.md`
- `d:\Desktop\bilibili_old\.handoff\WORKLOG.md`
