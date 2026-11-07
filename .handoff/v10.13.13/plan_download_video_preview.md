# 修复下载视频点击链接黑屏无视频（恢复新标签页在线播放预览）规划方案 (`plan_download_video_preview.md`)

> 规划模型：**Gemini 4 Argon (Planner)**
> 编码模型：**Gemini 3.8 Flash (Coder)**
> 版本目标：`v10.13.13` | 状态：已确认采用 **方式一**（恢复新标签页在线播放预览）

---

## 一、 问题现象与根因剖析

### 1. 问题现象
- 用户在视频播放页打开「下载」面板，勾选请求文件类型为 `mp4`、下载方式为 `浏览器`，点击获取到的 `mp4` 链接后，浏览器在新标签页打开了 `https://upos-sz-mirrorcosov.bilivideo.com/upgcxcode/.../...-1-192.mp4?e=...`，页面呈现内置 `<video>` 播放器但停留在 `0:00` 黑屏，没有任何视频画面且无法播放。

### 2. 三大实锤根因
1. **核心根因：`getMp4()` 请求 `playurl` 缺失 `platform=html5` 参数，下发了强制校验 Referer 的 `platform=pc` 直链**
   - 在 `src/core/download.ts` 的 `getMp4()` 中，非 PGC 视频调用了 `this.flv(BLOD.aid, BLOD.cid)` -> `apiPlayurl({ avid, cid }, false, BLOD.pgc)`（未传 `platform: 'html5'` 与 `high_quality: 1`）。
   - B 站服务端默认按 `platform=pc` 签发 `.mp4` 链接（`e=...NbfqXBvEqxTEto...`）。
   - 当用户点击链接在新标签页（`target="_blank"`）打开时：
     - **第一次请求（文档导航 `main_frame`）**：从 `www.bilibili.com` 发起，携带 `Referer: https://www.bilibili.com/`，CDN 返回 `200 OK` (`Content-Type: video/mp4`)，因此 Chrome 成功渲染出内置 `<video>` 预览页（`VideoDocument`）。
     - **第二次请求（`<video>` 媒体流 `Range: bytes=0-...`）**：此时新标签页的文档源已变为 `https://upos-sz-mirrorcosov.bilivideo.com`，`<video>` 标签发起流请求时携带的 `Referer` 变成了该 CDN 链接自身（Self Referer）。
     - **CDN 拦截**：经实测，`upos-sz-mirrorcosov.bilivideo.com` 对 `platform=pc` 签名的直链校验 `Referer`，当 `Referer` 为 CDN 自身 URL 或为空时直接返回 **`HTTP 403 Forbidden`**，导致 `<video>` 卡在 `0:00` 黑屏。
   - **实测验证**：向 `//api.bilibili.com/x/player/playurl` 传入 `platform: 'html5', high_quality: 1` 后，返回的同画质 `192.mp4` 直链带有 `&platform=html5` 免 Referer 签名，在 `upos-sz-mirrorcosov.bilivideo.com` 下无论无 Referer 还是 Self Referer 均返回 `206 Partial Content`。

2. **叠加根因（Chrome 扩展版专属 Bug）：`GM.modifyRequestheader` 因中文 `Content-Disposition` 导致整条规则被 Chrome 拒绝，且强加 `attachment` 破坏在线预览**
   - 在 `src/core/download.ts` L125-L138 中，Chrome 扩展版（`!_UserScript_`）调用 `GM.modifyRequestheader` 时传入了 `responseHeaders: { 'Content-Disposition': 'attachment; filename="中文文件名.mp4"' }`。
   - Chrome 的 `declarativeNetRequest.updateSessionRules` 严禁响应头包含非 ASCII 字符，直接拼接中文 `data.fileName` 会导致 Chrome 报错拒绝整条规则，连带 `requestHeaders` 中的 `referer` 和 `user-agent` 规则也彻底失效。
   - 同时，强行注入 `Content-Disposition: attachment` 还会阻止浏览器在新标签页在线播放预览。
   - 此外，`urlFilter` 直接传入长达数百字符且含复杂查询参数的完整 URL 不如匹配 `${targetUrl.origin}${targetUrl.pathname}` 稳健。

3. **通道异步时序 Bug（`chrome/background.ts`）**：
   - `chrome/background.ts` 中 `case "updateSessionRules":`（以及 `executeScript`、`insertCSS`、`updateRulesetOptions`）使用了异步 `.then(data => sendResponse({ data }))`，但漏写了 `return true;`，导致 MV3 Service Worker 消息通道在 `updateSessionRules` 完成前就同步关闭，`this.anchor(data)` 在规则生效前就提前触发了跳转。

---

## 二、 架构设计与修改方案（方式一：恢复新标签页在线播放预览）

### 1. `src/io/api-playurl.ts`
- 在 `IApiPlayurl` 接口中补充可选字段：
  ```ts
  interface IApiPlayurl {
      qn?: number;
      otype?: string;
      avid: number;
      cid: number;
      platform?: string;
      high_quality?: number;
  }
  ```

### 2. `src/core/download.ts`
- **修正 `flv()` / `getMp4()` 获取免 Referer 的 HTML5 MP4 直链**：
  - 将 `private flv(avid: number, cid: number)` 修改为传入 `platform: 'html5', high_quality: 1`：
    ```ts
    private flv(avid: number, cid: number) {
        return <Promise<IPlayurlDurl>>apiPlayurl({ avid, cid, platform: 'html5', high_quality: 1 }, false, BLOD.pgc);
    }
    ```
  - 在 `getMp4()` 中：
    - 避免被 `getPlayInfo()` 提前写入的 `platform=pc` MP4 链接阻断：检查 `const hasHtml5Mp4 = this.data.mp4?.some(d => d.url?.[0]?.includes('platform=html5')); if (hasHtml5Mp4 || this.gets.includes('mp4')) return;`。
    - 对于 `BLOD.pgc`，若 `this.mp4(BLOD.cid)` 失败或未返回有效 `durl`，回退调用 `this.flv(BLOD.aid, BLOD.cid)`。
    - 当 `getMp4()` 成功拿到返回含 `durl` 的数据后，先清空 `this.data.mp4 = []`（移除可能由 `getPlayInfo()` 混入的 `platform=pc` 403 链接），再调用 `this.decodePlayinfo(d)`。
- **修正 `pushDownload()` 默认分支（浏览器打开/预览）**：
  - 在 `if (!_UserScript_)` 中：
    - 移除会导致非 ASCII 报错及阻止在线预览的 `Content-Disposition` 响应头参数（传 `undefined`）。
    - 将 `urlFilter` 规范化为 `${targetUrl.origin}${targetUrl.pathname}`（通过 `new URL(data.url[0], location.href)` 解析），确保新标签页 `<video>` 发起 `Range` 请求时也能精准命中 `Referer` 与 `User-Agent` 规则。
    - 定时器清理时使用可选链 `(<any>data).$id?.()` 防止异常。

### 3. `chrome/background.ts`
- 在 `case "updateSessionRules":`（以及 `executeScript`、`insertCSS`、`updateRulesetOptions`）分支末尾补齐 `return true;`，确保 `chrome.runtime.onMessage` 保持异步通道直至 `declarativeNetRequest.updateSessionRules` 执行完毕后再通知前端触发 `this.anchor(data)`。

---

## 三、 验证与构建标准
1. 运行 `npm run tsc`、`npm run tampermonkey`、`npm run chrome`，确保 TypeScript 类型检查与双端构建零报错通过。
2. 由主代理（Gemini 4 Argon）亲自读取修改后的全部源码文件进行逐行审查，并落盘 `.handoff/v10.13.13/review_download_video_preview.md`。
