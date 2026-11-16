# 修复顶部导航栏偶发消失问题规划方案 (`plan_header_disappear_fix.md`)

> 规划与审查模型：**Gemini 4 Carbon (Planner & Reviewer)**
> 编码实现模型：**Gemini 4 Hydrogen (Coder)**
> 目标版本：`v10.13.14`

---

## 一、 问题现象与根因剖析

### 1. 问题现象
- 访问动态首页 `https://t.bilibili.com`（以及其他存在异步/延迟 DOM 重写或 CSR 水合重绘的页面）时，页面最上方的旧版顶部导航栏（`.z-top-container`）**偶发完全消失**，下方主体内容直接顶到浏览器地址栏边缘。

### 2. 核心根因与连带隐患
1. **回调注册顺序倒置与异步竞态（直接根因）**：
   - `src/index.ts` 第 124 行先注册主 `user.addCallback`（内部第 220 行执行 `status.header && new Header()`），随后在第 243 行才执行 `new PageDynamic()`，后者在构造函数内注册第二个 `user.addCallback`（执行 `this.rewrite()` -> `this.updateDom()`）。
   - 当 `GM.getValue('userStatus')` 返回较慢、原网页已解析出 `#biliMainHeader` 或 `.bili-header__bar` 时：
     1. 回调 1（`new Header()`）中的一次性 `poll` 立即同步命中原网页顶栏节点并提前终止轮询，将 `this.oldHeader` 与 `<script src="jquery.min.js">` 挂载到**即将废弃的原网页 `document.body`**，并置位 `this.oldHeadLoaded = true; this.isScriptLoading = true;`。
     2. 同一微任务下一拍，回调 2（`PageDynamic.rewrite()`）执行 `this.updateDom()` -> `this.vdom.replace(document.documentElement)`，将整棵原 `<html>` 连根卸载替换。
     3. 刚挂到原 `body` 的 `this.oldHeader` 与未加载完的外链 `<script>` 随旧文档树脱离丢失；`PageDynamic.rewrite()` 漏掉了 `Header.remount()`；同时 `dynamic.html` 内联 `new BiliHeader(...)` 因早于外链 `bili-header.umd.js` 同步执行必抛 `ReferenceError`，最终顶部只剩 `0px` 高的空 `<div id="bili-header-container">`。
2. **其他整页重写子类的同类漏口**：
   - 基类 `Page.updateDom()` 未在 `vdom.replace(document.documentElement)` 后通知 `Header` 对齐新文档树。例如 `PageRead` 在 `__INITIAL_STATE__` 晚于 `new Header()` 异步写入后再执行 `updateDom()` 时，同样会冲掉之前的 `Header` 状态。
   - 同时需区分两类旧版模板：`space.html` / `dynamic.html` / `online.html` 含现代占位节点（`#biliMainHeader` / `#bili-header-container`），需由 `Header` 接管重挂载；而 `av.html` / `read.html` / `history.html` 等模板自带原生 `<div class="z-top-container">` 与 `jinkela/header/header.js`，`Header` 不得重复插入第二个 `.z-top-container`。
3. **`dynamic.html` 双 `.z-top-container` 选择器冲突**：
   - `dynamic.html` 的占位节点为 `<div class="z-top-container" id="bili-header-container"></div>`，而 `mountOldHeader()` 注入了 `#bili-header-container { display: none !important; }`。必须剥离 `#bili-header-container` 上的 `z-top-container` 类名，防止 `header.js` 误挂到被强制隐藏的占位节点。
4. **`window.UserStatus` 污染与 CSR 水合节点脱离**：
   - 新版顶栏或模板内的 `bili-header.umd.js` / `bili-entry-header.umd.js` 可能在 `jquery.min.js` 加载期间向 `window.UserStatus` 写入缺少 `loadLoginStatus` 的不兼容对象，导致 `jinkela/header/header.js` 静默跳过初始化。
   - `loadScript` 若遇节点脱离无超时释放机制会导致 `isScriptLoading` 永久锁死；且新版 CSR 页面水合时若移除 `document.body` 下的 `this.oldHeader`，缺乏轻量 `MutationObserver` 自动挂回守护。

---

## 二、 架构设计与精确修改清单

### 1. 修改 `src/page/header.ts`

1. **单例防重入保护（`constructor`）**：
   - 在 `constructor()` 开头增加单例守卫：
     ```ts
     if (Header.instance) {
         return Header.instance;
     }
     Header.instance = this;
     ```

2. **`isMiniHead` 显式适配 `t.bilibili.com`**：
   - 在 `protected static isMiniHead(d?: HTMLElement)` 开头将空间页判断扩展为：
     ```ts
     if (location.host === "space.bilibili.com" || location.host === "t.bilibili.com") return true;
     ```

3. **抽离顶栏目标查找方法 `public findHeaderTarget(): HTMLElement | null`**：
   ```ts
   public findHeaderTarget(): HTMLElement | null {
       return document.querySelector<HTMLElement>('#internationalHeader')
           || document.querySelector<HTMLElement>('#biliMainHeader')
           || document.querySelector<HTMLElement>('#bili-header-container')
           || document.querySelector<HTMLElement>('#home_nav')
           || document.querySelector<HTMLElement>('.bili-header__bar')
           || ((location.host === "space.bilibili.com" || location.host === "t.bilibili.com")
               ? document.querySelector<HTMLElement>('.bili-header')
               : null);
   }
   ```
   并在 `hookHeadV2()` 中复用 `poll(() => this.findHeaderTarget(), d => { ... })`。

4. **新增 `window.UserStatus` 兼容清理与带超时的脚本加载辅助方法**：
   - 新增静态辅助方法 `protected static cleanIncompatibleUserStatus()`：
     ```ts
     protected static cleanIncompatibleUserStatus() {
         const win = window as any;
         try {
             if (win.UserStatus && typeof win.loadLoginStatus !== 'function') {
                 Reflect.deleteProperty(window, 'UserStatus');
                 Reflect.deleteProperty(window, 'onLoginInfoLoaded');
             }
         } catch { }
     }
     ```
   - 新增实例方法 `protected loadScriptWithTimeout(src: string, timeoutMs = 10000): Promise<boolean>`：封装 `loadScript(src)`，使用定时器在超时 `timeoutMs` 后 `reject(new Error('timeout'))`，并在 `then/catch` 时 `clearTimeout`，防止旧 DOM 被替换导致 `<script>` Promise 永久挂起。

5. **引入文档代数追踪与整页 DOM 替换协同（`onDomReplaced` / `remount` / `resetAndMount`）**：
   - 在 `Header` 实例上维护以下状态字段：
     - `protected mountedDocElement: Element | null = null;`
     - `protected mountToken = 0;`
     - `protected scriptLoadFailed = false;`
     - `protected retryCount = 0;`
     - `protected bodyObserver: MutationObserver | null = null;`
   - 新增静态方法 `static onDomReplaced()`（供 `Page.prototype.updateDom()` 在 `vdom.replace` 后调用）：
     ```ts
     static onDomReplaced() {
         Header.instance?.reconcileAfterDomReplace();
     }
     ```
   - 新增实例方法 `public reconcileAfterDomReplace()`：
     - 断开旧 `this.bodyObserver?.disconnect(); this.bodyObserver = null;`；
     - 递增 `this.mountToken++`，重置 `this.oldHeadLoaded = false; this.isScriptLoading = false; this.scriptLoadFailed = false; this.mountedDocElement = null; this.retryCount = 0; this.oldHeader.innerHTML = '';`；
     - 检查新文档中的目标节点 `const target = this.findHeaderTarget();`：
       - 若 `target` 存在（如 `dynamic.html` 的 `#bili-header-container`、`space.html` / `online.html` 的 `#biliMainHeader`），立即调用 `this.loadOldHeader(target)`；
       - 若 `target` 不存在，检查新文档是否已自带原生旧顶栏容器（`const hasNativeOldHeader = Array.from(document.querySelectorAll('.z-top-container')).some(el => el !== this.oldHeader && el.id !== 'bili-header-container');`）：若**不存在**原生旧顶栏容器，则调用 `this.hookHeadV2()` 继续轮询等待异步渲染的顶栏占位节点；若**已存在**（如 `av.html`、`read.html`、`history.html` 等原生自带 `jinkela/header` 的模板），则不重复插入 `this.oldHeader`，避免双顶栏。
   - 更新 `static remount()` 为幂等实现：
     ```ts
     static remount() {
         if (Header.instance) {
             const inst = Header.instance;
             if (
                 inst.oldHeadLoaded
                 && !inst.scriptLoadFailed
                 && inst.mountedDocElement === document.documentElement
                 && document.body?.contains(inst.oldHeader)
             ) {
                 return;
             }
             inst.resetAndMount(inst.findHeaderTarget() || undefined);
         } else {
             new Header();
         }
     }
     ```
   - 更新 `public resetAndMount(target?: HTMLElement)`：
     ```ts
     public resetAndMount(target?: HTMLElement) {
         this.mountToken++;
         this.oldHeadLoaded = false;
         this.isScriptLoading = false;
         this.scriptLoadFailed = false;
         this.mountedDocElement = null;
         this.oldHeader.innerHTML = '';
         this.loadOldHeader(target ?? (this.findHeaderTarget() || undefined));
     }
     ```

6. **加固 `loadOldHeader`、`mountOldHeader` 与 `observeBodyForHeader`**：
   - 在 `loadOldHeader(target?: HTMLElement)` 中：
     - 当 `target` 存在时：
       - `if ((target.className === 'bili-header__bar' || target.classList.contains('bili-header__bar')) && location.host !== "space.bilibili.com" && location.host !== "t.bilibili.com")` 注入隐藏大横幅样式；
       - 执行 `document.body?.classList.remove('header-v3');`；
       - **关键冲突消除**：`target.classList.remove('z-top-container');`（剥离 `dynamic.html` 中 `#bili-header-container` 上的 `z-top-container` 类名）；
       - `target.style.display = 'none'; target.hidden = true;`。
   - 在 `mountOldHeader(target?: HTMLElement)` 中：
     - 同样执行 `document.getElementById('bili-header-container')?.classList.remove('z-top-container');`；
     - 注入基础隐藏样式 `#internationalHeader,#biliMainHeader,#bili-header-container{display: none !important;}`；
     - 对 `location.host === "space.bilibili.com" || location.host === "t.bilibili.com"` 统一注入 `.bili-header { display: none !important; } .z-top-container { position: relative; z-index: 1000; }`（`old-space-header-fix`）；
     - `attachToDom` 将 `this.oldHeader` 插入 `document.body.firstChild` 后，调用 `this.observeBodyForHeader()` 启动 `document.body` 直接子节点（`{ childList: true }`，不开启 `subtree` 以免性能开销）守护：一旦 `document.documentElement` 未变、`this.oldHeadLoaded` 为真且 `!document.body.contains(this.oldHeader)`，在确认无其他原生 `.z-top-container` 时立即将其挂回 `document.body.firstChild`；
     - 防重复加载判断改为：`if (this.isScriptLoading || (this.oldHeadLoaded && !this.scriptLoadFailed && this.mountedDocElement === currentDoc && document.body?.contains(this.oldHeader)))`，避免 `header.js` 刚加载完尚未异步渲染子元素时被残余 `poll` 误判重复拉取脚本；
     - 脚本加载链使用 `const token = ++this.mountToken; this.mountedDocElement = currentDoc;`：
       - 在加载 `jquery.min.js` 前及加载 `header.js` 前**各调用一次** `Header.cleanIncompatibleUserStatus()`；
       - 加载 `header.js` 前再次确认 `#bili-header-container` 已移除 `z-top-container` 且 `this.oldHeader` 已挂在 `document.body`；
       - `header.js` 加载成功后 `2500ms` 做一次自愈检查：若 `token === this.mountToken && document.documentElement === currentDoc && document.body?.contains(this.oldHeader) && this.oldHeader.children.length === 0 && !this.isScriptLoading && this.retryCount < 1`，则 `this.retryCount++` 并调用 `this.resetAndMount(target)` 自动重试一次；
       - `catch` 分支置位 `this.isScriptLoading = false; this.scriptLoadFailed = true;`，若 `this.retryCount < 1` 则延迟 `500ms` 自动调用 `this.resetAndMount(target)` 重试一次。

---

### 2. 修改 `src/page/page.ts`
- 在文件顶部导入 `import { Header } from "./header";`。
- 在 `updateDom()` 方法中执行完 `this.vdom.replace(document.documentElement);` 及 `keepNextHeadMarker && this.restoreNextHeadMarker();` 后，调用：
  ```ts
  Header.onDomReplaced();
  ```
  确保任何继承自 `Page` 的页面重写子类在替换整棵 `<html>` 后，已实例化的 `Header` 都能立即感知并在需要时重挂载到新 DOM。

---

### 3. 修改 `src/page/dynamic.ts`
- 与 `src/page/space.ts` 的 `v10.13.11` 规范保持一致：
  - `user.addCallback` 中将 `this.rewrite();` 改为 `this.rewrite(status.header);`。
  - `protected rewrite(hasHeader?: boolean)` 中移除动态页迷你顶栏不需要的 `Header.primaryMenu();` 与 `Header.banner();`，在 `this.updateDom();` 之后保留显式兜底：
    ```ts
    protected rewrite(hasHeader?: boolean) {
        this.installImageRecovery();
        urlCleaner.updateLocation(location.href);
        this.updateDom();
        if (hasHeader) {
            Header.remount();
        }
    }
    ```

---

### 4. 版本号更新与构建验证
1. 将 `tampermonkey/manifest.json` 中的 `"version"` 从 `"10.13.13"` 更新为 `"10.13.14"`。
2. 依次运行以下命令并确保零报错通过：
   - `npm run tsc`
   - `npx tsc --noEmit -p chrome/tsconfig.json`（若存在 `chrome/tsconfig.json`）
   - `npm run tampermonkey`
   - `npm run chrome`
