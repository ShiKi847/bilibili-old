# Bilibili-Old 状态交接档案 (STATE)

> 最后更新：`2026-11-08T00:52:45+09:00` | 当前分支：`dev-update`

---

## 【1. 全局目标与当前总进度（Overview & Progress）】

- **全局目标**：维护并修复 `Bilibili-Old`（恢复旧版 B 站网页端与旧版播放器的油猴脚本 & Chrome 扩展），持续适配 B 站前端架构升级（视频页 CSR 改版、多视频合集模式 ugc_season 升级、个人空间页面适配、视频下载与在线预览修复等）。
- **当前进度**：
  1. **视频页 CSR 与延迟注入白屏修复**（已完成合入 `v10.13.9`）。
  2. **新版合集 `ugc_season` 多视频与多 P 联动适配**（已完成合入 `v10.13.10`）。
  3. **个人主页（`space.bilibili.com`）旧版迷你顶栏修复与发布**（已完成合入 `v10.13.11`）。
  4. **个人空间（`space.bilibili.com`）账户注册时间恢复（方式 B）**（已完成合入 `v10.13.12`）。
  5. **下载视频点击链接 `0:00` 黑屏无视频修复（方式一：恢复新标签页在线播放预览）**（已完成合入 `v10.13.13`）：
     - 采用异构多模型协作流水线：**Gemini 4 Argon（Planner 规划 & Reviewer 深度审查）** + **Gemini 3.8 Flash（Coder 纯代码实现）**。
     - 规划与审查归档（由 Gemini 4 Argon 亲自执笔）：
       * 方案规划：`.handoff/v10.13.13/plan_download_video_preview.md`
       * 深度审查：`.handoff/v10.13.13/review_download_video_preview.md`（**通过 Approved**）
     - 核心落地：
       * **HTML5 免 Referer 签名 MP4 直链（`src/core/download.ts` & `src/io/api-playurl.ts`）**：`flv()` 请求 `playurl` 时显式携带 `platform: 'html5', high_quality: 1`，使 B 站返回 `&platform=html5` 免 Referer 签名的 720P/1080P `.mp4` 直链，解决新标签页内置 `<video>` 发起 `Range` 请求时因 `Referer` 变为 CDN 自身 URL（Self Referer）而触发 `upos-sz-mirrorcosov.bilivideo.com` `403 Forbidden` 黑屏的问题；`getMp4()` 增加 `hasHtml5Mp4` 检查与 `BLOD.pgc` 降级回退。
       * **Chrome 扩展版 `declarativeNetRequest` 修复（`src/core/download.ts` & `chrome/background.ts`）**：移除 `GM.modifyRequestheader` 中含非 ASCII 中文字符的 `Content-Disposition: attachment` 响应头（避免 Chrome 报错拒绝整条规则并恢复在线预览），将 `urlFilter` 规范化为 `${targetUrl.origin}${targetUrl.pathname}`，并在 `chrome/background.ts` 的 `updateSessionRules` 等 4 个异步消息分支补齐 `return true;`。

---

## 【2. 踩坑挑战与死胡同（Challenges & Failed Attempts）】

1. **死胡同 1：`playurl` 请求 MP4 未传 `platform=html5` 导致新标签页 `<video>` 触发 Self-Referer 403**
   - **原因**：不传 `platform=html5` 时 B 站签发 `platform=pc` 直链。新标签页打开 `.mp4` 时，初次文档请求带 `Referer: https://www.bilibili.com/` 返回 `200 OK` 渲染出 `<video>` 外壳，但随后 `<video>` 发起 `Range: bytes=0-...` 请求时 `Referer` 变为 CDN 链接自身（Self Referer），被 `upos-sz-mirrorcosov.bilivideo.com` 拦截返回 `403 Forbidden`。传入 `platform: 'html5', high_quality: 1` 后可获取免 Referer 签名的直链。
2. **死胡同 2：Chrome 扩展 `declarativeNetRequest` 响应头传入未转义中文导致整条规则失效**
   - **原因**：`Content-Disposition: attachment; filename="中文..."` 含非 ASCII 字符会导致 `chrome.declarativeNetRequest.updateSessionRules` 拒绝整条规则（连带 `Referer` 请求头修改一并失效），且 `chrome/background.ts` 漏写 `return true;` 会导致异步通道提前关闭。
3. **死胡同 3：个人空间旧接口 `getCardByMid` 404 与迷你顶栏历史经验（保留）**
   - 空间注册时间采用创作中心日历接口（本人精确）+ 15 个真实历史 UID 锚点分段插值（他人老号估算）；空间页保持 `isMiniHead === true` 且严禁隐藏 `#space-app`。

---

## 【3. 跑通的成功经验（Successes & Key Patterns）】

1. **新标签页 MP4 在线播放预览双保险模式**：
   - 接口层通过 `platform: 'html5', high_quality: 1` 获取免 Referer 签名直链（油猴与扩展双端通用）+ 扩展层通过无中文响应头的 `declarativeNetRequest`（精确匹配 `${origin}${pathname}` + `background.ts` 异步 `return true`）注入 `Referer` 与 `User-Agent`。
2. **三角色物理隔离协作范式**：
   - 主代理（Gemini 4 Argon）亲自写 `plan_*.md` -> 调派 `Model: "flash"` 仅改业务代码 -> 主代理亲自 `read_file` 逐行审查并亲自写 `review_*.md`、`STATE.md`、`WORKLOG.md`。

---

## 【4. 下一棒唯一待办（Next Problem to Solve）】

- 当前任务已全链路收工：`v10.13.13`（修复下载视频 `mp4` 点击链接 `0:00` 黑屏无视频问题，恢复新标签页在线播放预览）已完成研发、审查闭环、双端构建、提交并合入推送到远程 `dev-update` 与 `master`。工作区完全干净。
- 下一棒 Agent 待命，等待用户提出下一阶段的新问题或新需求。

---

## 【5. 核心重要文件清单（Important Files ONLY）】

- `d:\Desktop\bilibili_old\src\core\download.ts` (L124-L141, L174-L191, L222-L227)
- `d:\Desktop\bilibili_old\src\io\api-playurl.ts` (L248-L260, L353-L360)
- `d:\Desktop\bilibili_old\chrome\background.ts` (L38-L77)
- `d:\Desktop\bilibili_old\tampermonkey\manifest.json`
- `d:\Desktop\bilibili_old\tampermonkey\main.user.js`
- `d:\Desktop\bilibili_old\.handoff\v10.13.13\plan_download_video_preview.md`
- `d:\Desktop\bilibili_old\.handoff\v10.13.13\review_download_video_preview.md`
- `d:\Desktop\bilibili_old\.handoff\STATE.md`
- `d:\Desktop\bilibili_old\.handoff\WORKLOG.md`
