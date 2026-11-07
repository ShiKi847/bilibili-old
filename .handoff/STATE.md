# Bilibili-Old 状态交接档案 (STATE)

> 最后更新：`2026-11-07T16:49:30+09:00` | 当前分支：`dev-update`

---

## 【1. 全局目标与当前总进度（Overview & Progress）】

- **全局目标**：维护并修复 `Bilibili-Old`（恢复旧版 B 站网页端与旧版播放器的油猴脚本 & Chrome 扩展），持续适配 B 站前端架构升级（视频页 CSR 改版、多视频合集模式 ugc_season 升级、个人空间页面适配等）。
- **当前进度**：
  1. **视频页 CSR 与延迟注入白屏修复**（已完成合入 `v10.13.9`）。
  2. **新版合集 `ugc_season` 多视频与多 P 联动适配**（已完成合入 `v10.13.10`）。
  3. **个人主页（`space.bilibili.com`）旧版迷你顶栏修复与发布**（已完成合入 `v10.13.11`，commit `f0041334` & merge `1fef26ce`）。
  4. **个人空间（`space.bilibili.com`）账户注册时间恢复（方式 B）**（`v10.13.12` 研发、两轮审查与构建已完成，待用户浏览器验收或提交发布）：
     - 采用异构多模型协作流水线：**Gemini 4 Argon（Planner 规划 & Reviewer 深度审查）** + **Gemini 3.8 Flash（Coder 纯代码实现）**。
     - 规划与审查归档（由 Gemini 4 Argon 亲自执笔）：
       * 方案规划：`.handoff/v10.13.12/plan_space_jointime.md`
       * 深度审查：`.handoff/v10.13.12/review_space_jointime.md`（Round 1 拦截 3 项实质缺陷，Round 2 复审 **通过 Approved**）
     - 核心落地：
       * **方式 B 数据层（`src/io/account-getcardbymid.ts` & `src/io/urls.ts`）**：本人空间（已登录）请求 `https://member.bilibili.com/x2/creative/h5/calendar/event?ts=0`（支持 `fetch` 与 `GM.fetch` 双重容灾）获取精确到秒的 `jointime`；他人空间或接口异常时，对 2020 年 10 月中旬改版前（`0 < mid < 700,000,000`）的单调自增老号，使用经 Gemini 4 Argon 校准的 15 个真实 B 站历史发号时序里程碑锚点进行分段线性插值，按 UTC+8 输出 `约 YYYY-MM (估算)` 并附带 hover `title` 说明；`mid <= 0` 或 `mid >= 700,000,000` 严格返回 `null`。
       * **视图层与防串号机制（`src/page/space.ts`）**：将 `status.jointime && this.jointime()` 移出 `else` 分支解除与旧版空间的互斥；`resolveMid()` 严格限制仅在根路径 `/` 时回退登录 `uid`；在 `tryMount()` 中从旧版卡片 `.user .info .meta .row .item.uid` 实时提取 `domMid` 二次实锤校准并配合 `dataset` 状态锁防重防竞态；使用 `createElement` + `textContent` 安全组装 `.item.jointime` 并注入 `-209px -84px` 日历雪碧图样式；通过 `poll` 与 `observerAddedNodes` 支持 SPA Tab 切换自动恢复。
       * **全局规则加固**：已更新 `C:\Users\shiki847\.gemini\config\GEMINI.md`，确立 Planner/Reviewer 与 Coder 的目录写权限物理隔离铁律（严禁 Coder 子代理触碰 `.handoff/` 下任何文档）。

---

## 【2. 踩坑挑战与死胡同（Challenges & Failed Attempts）】

1. **死胡同 1：旧接口 `account.bilibili.com/api/member/getCardByMid` 与公开接口 `regtime` 均已失效**
   - **原因**：原接口硬编码返回 `-404 啥都木有`；且 Web/App/Wbi 所有公开空间接口均已将非本人的 `jointime`/`regtime` 在服务端置 `0`。必须采用创作中心日历接口（本人精确）+ 历史 UID 锚点表插值（他人老号估算）的双轨方案。
2. **死胡同 2：让 Flash 子代理自行编造 UID 历史锚点或代写 `plan`/`review` 文档**
   - **原因**：Flash 在第一版中拍脑袋虚构早期 UID 锚点（把 `UID 500,000` 写成 `2010-12`，比真实的 `2012-07` 偏早 1.5 年）且自行生成 `review` 报告自评通过。已由 Gemini 4 Argon 实审拦截并修正为真实历史里程碑（`78766 -> 2011-01`、`259333 -> 2012-01`、`510000 -> 2012-07`、`1123000 -> 2013-01`、`2954624 -> 2014-01`），并在全局配置 `GEMINI.md` 中封禁 Coder 触碰 `.handoff/` 的权限。
3. **死胡同 3：URL 解析失败时无条件 fallback 到当前登录 `uid`**
   - **原因**：`this.mid = pathMid || uid` 在非根路径下若未命中数字，会将他人空间误判为本人空间导致串号。必须严格限定仅在 `location.pathname === '/' || location.pathname === ''` 时才回退 `uid`，并结合 DOM 中已渲染的 `.item.uid` 文本进行二次实锤。
4. **死胡同 4：个人空间迷你顶栏与 DOM 重构历史教训（保留）**
   - 严禁将 `#space-app` 混入 `poll` 隐藏列表；个人空间必须保持 `isMiniHead === true` 极简迷你顶栏，并在 `updateDom()` 后通过 `Header.remount()` 恢复。

---

## 【3. 跑通的成功经验（Successes & Key Patterns）】

1. **双轨注册时间获取与 DOM 实锤防串号模式**：
   - 本人登录态走 `MEMBER_CALENDAR_EVENT`（`fetch` -> `GM.fetch` 降级）+ 他人老号走 15 节点真实历史时序插值 + `jointimeCache` 内存缓存 + `.item.uid` DOM 文本二次校准，兼顾精确度、性能与零串号。
2. **三角色物理隔离协作范式**：
   - 主代理（Gemini 4 Argon）亲自写 `plan_*.md` -> 调派 `Model: "flash"` 仅改业务代码 -> 主代理亲自 `read_file` 逐行挑刺审查并亲自写 `review_*.md`、`STATE.md`、`WORKLOG.md`。

---

## 【4. 下一棒唯一待办（Next Problem to Solve）】

- 当前任务已全链路收工：`v10.13.12`（恢复个人空间显示账户注册时间 - 方式 B）已完成研发、两轮审查闭环、构建、提交并合入推送到远程 `dev-update` 与 `master`。工作区完全干净。
- 下一棒 Agent 待命，等待用户提出下一阶段的新问题或新需求。

---

## 【5. 核心重要文件清单（Important Files ONLY）】

- `d:\Desktop\bilibili_old\src\page\space.ts` (L34-L63, L131-L315)
- `d:\Desktop\bilibili_old\src\io\account-getcardbymid.ts` (L1-L130)
- `d:\Desktop\bilibili_old\src\io\urls.ts` (L54-L57)
- `d:\Desktop\bilibili_old\tampermonkey\manifest.json`
- `d:\Desktop\bilibili_old\tampermonkey\main.user.js`
- `d:\Desktop\bilibili_old\.handoff\v10.13.12\plan_space_jointime.md`
- `d:\Desktop\bilibili_old\.handoff\v10.13.12\review_space_jointime.md`
- `d:\Desktop\bilibili_old\.handoff\STATE.md`
- `d:\Desktop\bilibili_old\.handoff\WORKLOG.md`
