# 下载视频点击链接黑屏无视频修复深度审查报告 (`review_download_video_preview.md`)

> 审查模型：**Gemini 4 Argon (Reviewer)**
> 编码模型：**Gemini 3.8 Flash (Coder)**
> 审查结论：**Approved (通过)**

---

## 一、 审查范围与核验文件
主代理（Gemini 4 Argon）已亲自使用 `read_file` 与 `git diff` 逐行核验以下源码文件与构建产物：
1. `src/io/api-playurl.ts` (L248-L260, L353-L360)
2. `src/core/download.ts` (L124-L141, L174-L191, L222-L227)
3. `chrome/background.ts` (L38-L77)
4. 构建产物：`tampermonkey/main.user.js` 与 `dist/`

---

## 二、 维度审查结果

### 1. 逻辑完备性与边界条件
- **HTML5 MP4 免 Referer 签名获取（`src/core/download.ts` & `src/io/api-playurl.ts`）**：
  - `flv()` 已显式携带 `platform: 'html5', high_quality: 1`，使 B 站 `x/player/playurl` 返回 `&platform=html5` 免 Referer 签名的 720P/1080P `.mp4` 直链，彻底解决新标签页内置 `<video>` 发起 `Range` 请求时因 `Referer` 变为 CDN 自身 URL（Self Referer）而触发 `403 Forbidden` 黑屏的问题。
  - `getMp4()` 守卫条件已改为检查 `hasHtml5Mp4`（`this.data.mp4?.some(d => d.url?.[0]?.includes('platform=html5'))`），防止未开启 `TVresource` 时 `getPlayInfo()` 提前写入的 `platform=pc` 链接阻断 `getMp4()` 请求，并在获取到有效 `durl` 后清空旧项再解码。
  - 番剧（`BLOD.pgc`）分支对已下线的 `playurlproj` 增加了 `.then(...).catch(...)` 降级回退至 `this.flv(BLOD.aid, BLOD.cid)`。
- **Chrome 扩展版请求头拦截与在线预览恢复（`src/core/download.ts` & `chrome/background.ts`）**：
  - 移除了 `GM.modifyRequestheader` 中包含非 ASCII 中文字符的 `Content-Disposition: attachment; filename="..."` 响应头，消除了 Chrome `declarativeNetRequest.updateSessionRules` 的非 ASCII 报错拒绝问题，同时恢复了新标签页在线播放预览行为。
  - `urlFilter` 改为 `${targetUrl.origin}${targetUrl.pathname}`，避免了超长查询字符串匹配失效问题。
  - `chrome/background.ts` 中 `executeScript`、`insertCSS`、`updateRulesetOptions`、`updateSessionRules` 四个异步分支已全部补齐 `return true;`，消除了 MV3 消息通道提前关闭的竞态。

### 2. 安全性、异常防御与类型检查
- 定时器清理回调已改为可选链 `(<any>data).$id?.()`，防止多次点击同一链接时重复清理报错。
- `IApiPlayurl` 接口类型补充完整，`npx tsc --noEmit -p chrome/tsconfig.json`、`npm run tampermonkey`、`npm run chrome` 均零报错通过。
- Coder 子代理严格遵守目录物理隔离铁律，未触碰 `.handoff/` 下任何文件。

---

## 三、 最终结论
- **状态**：**Approved**
