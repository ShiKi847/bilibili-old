作为前端架构与逆向工程专家，我针对 Bilibili-Old 插件在个人空间（`space.bilibili.com`）出现“顶栏完全空白”的严重 Bug 进行了全链路逆向推演。以下是具备代码级精度的深度分析与修复规划。

---

### 一、 根本原因剖析（Root Cause Analysis）

个人空间顶栏出现“一片空白（既无新版顶栏，也无旧版顶栏）”是由 **DOM 全量重写生命周期冲突**、**单例锁死机制** 以及 **选择器命中与样式覆写失配** 三个核心因素叠加导致的：

#### 1. 维度 A & B：DOM 替换竞争与 `oldHeadLoaded` 状态锁死（针对开启“重构个人空间 `status.space = true`”或异步重绘场景）
* **执行时序冲突**：
  在 `src/index.ts` 中，`new Header()` 和 `new PageSpace()` 均挂载在 `user.addCallback` 队列中（`Header` 先注册，`PageSpace` 在底部实例化后注册回调）。
  1. 当页面初载（新版 Space 骨架尚存）时，`Header.hookHeadV2()` 的 `poll` 率先捕获到原页面的 `.bili-header__bar` 或 `#biliMainHeader`。
  2. `loadOldHeader()` 立即执行：将 `this.oldHeadLoaded = true` 锁死，向 `<head>` 注入隐藏新版顶栏的 CSS，并将 `<div class="z-top-container">` 插入到**旧 `document.body.firstChild`**，随后异步加载 `header.js`。
  3. 紧接着（或在网络请求回调后），`PageSpace.rewrite()` -> `this.updateDom()` 执行。`vdomtool` 会将整个 `document.documentElement`（含 `<head>` 和 `<body>`）用 `space.html` 模板**全量替换**！
* **毁灭性后果**：
  * 刚才插入到 `body.firstChild` 的 `this.oldHeader` 节点以及注入的 `header.js` 脚本瞬间被从 DOM 树中抹除。
  * `space.html` 模板中自带了一个 `<div id="biliMainHeader" style="height:56px"></div>` 占位容器。如果 `addCss` 被保留或再次生效，该节点被 `display: none` 隐藏；即便未隐藏，由于 `this.oldHeadLoaded` 已经是 `true`，`Header` 实例再也不会向新 `body` 挂载 `this.oldHeader`，也不会重新拉起 `header.js` 渲染逻辑！最终导致顶部留白或仅剩 56px 空白占位。

#### 2. 维度 C：新版个人空间（未开启重构或新版 Vue3/React 空间）选择器与样式逃逸
* 如果用户未开启 `status.space`（或处于新版空间 DOM 结构下），新版 B 站个人空间顶栏使用的是 `.bili-header` / `.bili-header__bar` 结构，且新版空间自带高优先级的流式布局样式（如 `padding-top: 64px` 或 Flex 占位）。
* 在 `hookHeadV2` 中，命中了 `.bili-header__bar` 并将其 `display: none`，导致原顶栏内部内容消失，但外层包裹容器（如 `.bili-header` 或 `#app` 的顶部占位区）仍然占据了 56px~64px 的空白高度！
* 同时，在 `Header.isMiniHead(d)` 判断中：
  ```ts
  return (location.href.includes("blackboard/...") || document.querySelector(".large-header") || document.querySelector(".bili-banner") || (d?.getAttribute("type") == "all")) ? false : true;
  ```
  个人空间页面**没有** `.large-header`、`.bili-banner`，且 `#biliMainHeader` 没有 `type="all"` 属性！因此 `isMiniHead` 必然返回 `true`，触发 `this.miniHeader()`（移除 `has-menu` 类名）。
  * **关键矛盾**：用户期望个人空间显示**图一那样包含下方完整分区导航栏（首页、动画、番剧、国创...）以及完整状态条的导航栏**（即包含 `has-menu` 的完整版顶栏，或至少保证 `z-top-container` 及其内部组件不被隐藏且包含分区菜单）。当 `has-menu` 被移除或 `header.js` 因 jQuery/DOM 丢失未能执行 `new window.BiliHeader` 初始化时，`this.oldHeader` 仅是一个空的 `<div class="z-top-container"></div>`，高度坍塌或一片空白！

#### 3. 维度 D：`header.js` 与 `jQuery` 的执行时序及全局状态污染
* 旧版 `//s1.hdslb.com/bfs/seed/jinkela/header/header.js` 强依赖全局 `window.$` / `window.jQuery`，且在脚本加载完成时立即查找 DOM 中的 `.z-top-container` 进行组件挂载。
* 在 `space.html` 中，底部的原生脚本会加载 `bili-entry-header.umd.js` 并尝试初始化 `BiliEntryHeader` 到 `#biliMainHeader`。当 `Header` 将 `#biliMainHeader` 隐藏后，`BiliEntryHeader` 被废除，而 `header.js` 若在 `updateDom()` 之前加载完毕，它渲染好的 DOM 已经被销毁；`updateDom()` 之后即使把旧的 `this.oldHeader` 引用重新插回 DOM，里面的事件绑定和异步渲染也可能因为脱离文档流或脚本被清空而残缺。

---

### 二、 架构方案设计（Architecture Design）

为了彻底解决此问题，确保个人空间（无论是否触发 `PageSpace.rewrite()` 全量替换 DOM）都能像视频页一样稳定渲染完整的旧版顶栏（含顶层导航条 + 下方分区菜单栏），我们设计如下三层防御架构：

#### 1. 建立 DOM 存活守护与重挂载机制（DOM Persistence & Re-mounting）
* **打破 `oldHeadLoaded` 的死锁**：将单纯的布尔锁改造为**“状态检查 + 节点在位检测”**。当检测到 `document.body` 被重写（即 `!document.body.contains(this.oldHeader)`）时，允许重新将 `this.oldHeader` 插入新 `document.body.firstChild`，并确保隐藏新版顶栏的样式表（`<style>`）依然存在于新的 `<head>` 中。
* **重构脚本重入能力**：如果 `this.oldHeader` 内部尚未被 `header.js` 填充（即 `this.oldHeader.children.length === 0`），或者在 `Page.updateDom()` 之后脚本环境丢失，则重新触发 `jQuery` 与 `header.js` 的注入与初始化。

#### 2. 解耦 `Page.updateDom` 与 `Header` 的生命周期冲突
* 在 `PageSpace`（以及通用的 `Page.updateDom`）执行 DOM 重写后，**主动通知或触发 `Header` 挂载**，或者在 `space.html` 中移除无用的 `bili-entry-header.umd.js` 竞争初始化逻辑（保留 `#biliMainHeader` 作为钩子触发器或直接适配）。
* 在 `Header.hookHeadV2()` 中，不仅使用单次 `poll`，而且针对个人空间等可能发生 `updateDom` 的页面，监听或轮询确保 `this.oldHeader` 始终位于当前生效的 `document.body` 顶部。

#### 3. 定制个人空间（Space）顶栏渲染模式与样式隔离（对齐图一效果）
* **完整菜单栏（`has-menu`）保留**：
  修改 `Header.isMiniHead(d)` 的判定逻辑。针对个人主页（`space.bilibili.com`）以及视频页，明确返回 `false`（或者不移除 `has-menu`），使得 `this.oldHeader` 保持 `className = "z-top-container has-menu"`，从而让 `header.js` 渲染出下方的完整分区导航栏（首页、动画、番剧...）及 `primaryMenu()`。
* **清理新版 Space 空白占位容器**：
  在隐藏 `.bili-header__bar` / `#biliMainHeader` 的同时，强制清除新版个人空间外层容器（如 `#app .bili-header`、`.bili-header` 占位元素）的固定高度（`min-height` / `height`），并确保 `.z-top-container` 的 `position: relative; z-index: 10000;` 正常撑开文档流顶部，不留任何空白断层，也不遮挡下方个人空间的 Banner。

---

### 三、 详细实施计划（Step-by-Step Implementation Steps）

#### 步骤 1：增强 `src/page/header.ts` 的 DOM 挂载韧性与 `isMiniHead` 逻辑

**修改文件**：`src/page/header.ts`

1. **修正 `Header.isMiniHead(d)`**：
   让个人空间（`space.bilibili.com`）与视频页一样使用带分区菜单的完整顶栏（`has-menu`），避免退化或渲染异常：
   ```typescript
   static isMiniHead(d: HTMLElement) {
       if (/space\.bilibili\.com/.test(location.href)) return false; // 个人空间强制使用完整版导航栏（含分区菜单）
       if (/\/v\/(douga|music|dance|game|knowledge|tech|life|kichiku|fashion|ent|cinephile|ulis|information)/.test(location.href)) return true;
       if (/\/mooc\//.test(location.href)) return true;
       return (location.href.includes("blackboard/topic_list") || location.href.includes("blackboard/activity_list") || document.querySelector(".large-header") || document.querySelector(".bili-banner") || (d?.getAttribute("type") == "all")) ? false : true;
   }
   ```

2. **重构 `hookHeadV2()` 与 `loadOldHeader(target)`**：
   解决 `PageSpace.updateDom()` 冲掉 `body` 和 `head` 后导致顶栏消失、CSS 失效的问题，并彻底隐藏新版空间的残余空白容器：
   ```typescript
   hookHeadV2() {
       poll(() => document.querySelector<HTMLElement>("#internationalHeader")
           || document.querySelector<HTMLElement>("#biliMainHeader")
           || document.querySelector<HTMLElement>("#bili-header-container")
           || document.querySelector<HTMLElement>("#home_nav")
           || document.querySelector<HTMLElement>(".bili-header__bar"), d => {
               Header.isMiniHead(d) && this.miniHeader();
               this.loadOldHeader(d);
           });
       // 略：原有的 .z_top_container poll 保持不变
   }

   loadOldHeader(target: HTMLElement) {
       target.style.display = 'none';
       target.hidden = true;
       // 若 target 是新版空间的内部 bar，将其父级 .bili-header 容器一并隐藏以消除 64px 空白区
       const parentHeader = target.closest<HTMLElement>('.bili-header');
       if (parentHeader && !parentHeader.contains(this.oldHeader)) {
           parentHeader.style.display = 'none';
       }

       // 无论是否加载过，只要当前 document.body 中丢失了 oldHeader（例如被 Page.updateDom 重写了 DOM），就必须重新挂载
       if (this.oldHeadLoaded) {
           if (!document.body.contains(this.oldHeader)) {
               this.mountHeaderDom();
           }
           return;
       }
       this.oldHeadLoaded = true;
       this.mountHeaderDom();
   }

   /** 抽离独立的 DOM 与脚本挂载方法，支持 DOM 重建后恢复 */
   private mountHeaderDom() {
       addCss(`
           #internationalHeader, #biliMainHeader, #bili-header-container, .bili-header { display: none !important; }
           .z-top-container.has-menu { position: relative; z-index: 10000; background: #fff; }
       `, "old-header-hide-css");
       
       if (document.body) {
           document.body.insertBefore(this.oldHeader, document.body.firstChild);
       }

       // 如果 oldHeader 内部为空（未渲染或重建丢失），加载依赖脚本并初始化
       if (this.oldHeader.children.length === 0) {
           loadScript("//s1.hdslb.com/bfs/seed/jinkela/header/header.js", () => {
               Header.primaryMenu();
               Header.banner();
           });
       } else {
           Header.primaryMenu();
           Header.banner();
       }
   }
   ```
   *(注：在 `loadOldHeader` 中保留原有的 `window.jQuery` 检测与 `jquery.min.js` 前置加载逻辑，确保在 `loadScript(".../header.js")` 前 `window.jQuery` 一定存在；若 `updateDom` 导致 `header.js` 未能渲染出子节点，则通过重新调用 `loadScript` 或 `new (window as any).BiliHeader` 触发渲染)*。

3. **增加 DOM 重建守护（Mutation / 周期自检）**：
   在 `mountHeaderDom` 或 `constructor` 中，针对 `space.bilibili.com` 这类异步 `updateDom()` 页面，增加一个轻量级守护（或在 `Page.updateDom` 中联动）：
   当 `Page.updateDom()` 完成替换后，若发现 `!document.body.contains(this.oldHeader)`，自动调用 `this.mountHeaderDom()`。

---

#### 步骤 2：优化 `src/page/space.ts` 与 `src/html/space.html` 的重写衔接

**修改文件**：`src/page/space.ts`、`src/html/space.html`

1. **在 `src/page/space.ts` 的 `rewrite()` 中对齐 Header 生命周期**：
   查看现有代码：
   ```typescript
   rewrite() {
       urlCleaner.updateLocation("https://space.bilibili.com/" + this.mid);
       Header.primaryMenu();
       Header.banner();
       this.updateDom();
   }
   ```
   * **问题点**：原代码先调用了 `Header.primaryMenu()` 和 `Header.banner()`，**然后**才调用 `this.updateDom()`！这会导致 `updateDom()` 把前面做的一切 DOM 修改全部抹除，且 `updateDom()` 异步/同步替换完 DOM 后，如果 `user.status.header` 为开启状态，原有的 `Header` 实例已经被孤立在旧 DOM 内存中。
   * **修复代码**：
     调整 `rewrite()` 顺序，并在 `updateDom()` 之后重新实例化或重新挂载 `Header`：
     ```typescript
     rewrite() {
         urlCleaner.updateLocation("https://space.bilibili.com/" + this.mid);
         this.updateDom();
         if (user.userStatus!.header) {
             new Header();
         } else {
             Header.primaryMenu();
             Header.banner();
         }
     }
     ```

2. **清理或兼容 `src/html/space.html` 中的顶栏占位**：
   * `space.html` 中存在 `<div id="biliMainHeader" token-support="true" disable-sticky style="height:56px"></div>`。
   * 当 `user.userStatus.header` 开启时，`new Header()` 会捕获这个 `#biliMainHeader` 并将其隐藏，随后插入 `.z-top-container.has-menu` 并加载 `header.js`。
   * 同时，在 `space.html` 内联脚本初始化 `BiliEntryHeader` 时，增加保护判断（或者保持 `#biliMainHeader` 供 `Header.hookHeadV2` 识别），避免报错阻断后续 `space.js` 执行。

---

### 四、 潜在副作用与兼容性防御（Compatibility & Edge Cases）

1. **防御普通视频页 / 番剧页 / 首页被误伤**：
   * `Header.isMiniHead()` 的改动仅显式豁免了 `/space\.bilibili\.com/`，对 `/video/`、`/bangumi/`、`/v/*` 分区页及首页原有的判断逻辑**零侵入**。
   * `.bili-header { display: none !important; }` 需注意：在首页（`www.bilibili.com`）或部分保留原版 Banner 的页面，如果旧版顶栏复用了 `.bili-banner` 且嵌套在 `.bili-header` 内，直接全局隐藏 `.bili-header` 可能会隐藏新版首页 Banner。
   * **防御措施**：将 `.bili-header` 的隐藏限定在未包含 `.z-top-container` 或特定于个人空间（如 `.bili-header__bar` 及其在 Space 页的占位层），或者在 `loadOldHeader` 中通过 JS 精确设置 `target.style.display = 'none'` 及清理 Space 页 `#app` 顶部 padding/margin，而非无差别全局隐藏 `.bili-header`。

2. **防御用户关闭“旧版顶栏（`status.header = false`）”但开启“旧版空间（`status.space = true`）”**：
   * 当 `status.header = false` 时，不执行 `new Header()`，`space.html` 原有的 `#biliMainHeader` 不会被隐藏，`bili-entry-header.umd.js` 正常渲染出 mini 顶栏，完美兼容。

3. **防御用户开启“旧版顶栏（`status.header = true`）”但关闭“旧版空间（`status.space = false`）”**：
   * 此时运行在新版个人空间 DOM 上，`new Header()` 捕获到 `.bili-header__bar`，将其隐藏，并由于 `isMiniHead` 在 `space.bilibili.com` 返回 `false`，成功在页面最顶部渲染出带完整分区导航的 `.z-top-container.has-menu`。

4. **`jQuery` 与 `header.js` 重复加载防御**：
   * 在 `rewrite()` 重新触发 `new Header()` 时，`window.jQuery` 仍在全局 `window` 对象上（`vdomtool` 只替换 DOM 节点，不销毁 `window` 属性），但 `header.js` 绑定的 DOM 已被销毁。因此只需重新插入 `this.oldHeader` 并重新执行一次 `loadScript("//s1.hdslb.com/bfs/seed/jinkela/header/header.js")` 即可让 `header.js` 重新向新 DOM 的 `.z-top-container` 注入完整的顶栏与分区菜单结构。