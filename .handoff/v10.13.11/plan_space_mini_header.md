作为前端架构师，我已明确用户的真实诉求与设计预期。上一轮修复过度还原了全站大顶栏（含 2233 Banner 与全站分区菜单），而旧版 B 站个人空间页（`space.bilibili.com`）的标准形态应当是：**顶部仅保留细长的旧版迷你导航条（`miniHeader`，仅含 `nav-menu`），下方直接衔接用户个人空间的专属头图（`.h-inner`）**。

以下是针对该需求的架构分析与精确修改计划：

---

### 一、 核心架构决策解答

1. **空间页是 `miniHeader` 还是 `has-menu`？**
   - **必须是 `miniHeader`**（即 `.z-top-container` **不带** `has-menu` 类名）。
   - 在旧版 B 站的样式体系中，`.z-top-container` 默认只展示高 `42px` 的 `.nav-menu`（最顶部的细长导航条），只有加上 `.has-menu` 时才会展开下方的 `.head-banner`（2233 大图）和 `.primary-menu`（全站分区菜单）。

2. **`Header.isMiniHead` 对 `space.bilibili.com` 应该如何判定？**
   - 应当直接返回 **`true`**！
   - 将 `if (location.host === "space.bilibili.com") return false;` 修改为 `if (location.host === "space.bilibili.com") return true;`，强制空间页始终以 `miniHeader` 形态渲染。

3. **在 `space.bilibili.com` 下，是否需要执行 `Header.primaryMenu()` 和 `Header.banner()`？**
   - **绝对不需要，且必须移除！**
   - `Header.primaryMenu()` 和 `Header.banner()` 内部会主动调用 `this.oldHeader.classList.add('has-menu')` 并注入全站 Banner 和分区 DOM。
   - 在 `src/page/space.ts` 中，仅需调用 `Header.remount()`（或依赖 `Header` 自身的加载机制挂载迷你顶栏），彻底删除 `else` 分支中的 `Header.primaryMenu()` 和 `Header.banner()`。

4. **样式上，`miniHeader` 如何与空间自带 Banner 优雅衔接？**
   - 旧版 `.z-top-container`（`miniHeader` 状态）本身具有 `height: 42px`、半透明毛玻璃背景和顶部定位/文档流占位。
   - 新版空间页原本的 `.bili-header`（新版顶栏）占用了高度或浮动层，我们保留 `addCss('.bili-header { display: none !important; }', 'old-space-header-fix');` 隐藏新版顶栏即可，这样旧版的 `oldHeader`（`.z-top-container`）替换上去后，刚好位于页面最上方 `42px` 处，下方紧接着空间的 `#app` / `.h`（个人空间个性装扮 Banner），不会出现双层 Banner 挤压。

---

### 二、 给 Coder 的精确修改清单

请严格按照以下指示修改 `src/page/header.ts` 和 `src/page/space.ts`：

#### 任务 1：修改 `src/page/header.ts` 中的 `isMiniHead` 判定逻辑

- **定位**：在 `src/page/header.ts` 中找到 `static isMiniHead(d?: HTMLElement)` 方法。
- **修改前**：
```typescript
    static isMiniHead(d?: HTMLElement) {
        if (location.host === "space.bilibili.com") return false;
        return Boolean(d && (d.classList.contains("mini-header") || d.querySelector(".mini-header") || d.querySelector(".bili-header.fixed-header")));
    }
```
- **修改后**：
```typescript
    static isMiniHead(d?: HTMLElement) {
        if (location.host === "space.bilibili.com") return true;
        return Boolean(d && (d.classList.contains("mini-header") || d.querySelector(".mini-header") || d.querySelector(".bili-header.fixed-header")));
    }
```
- **说明**：将 `space.bilibili.com` 下的返回值改为 `true`，确保 `mountOldHeader` 调用 `this.miniHeader()` 移除 `has-menu`，并且阻止后续 `loadOldHeader` 自动加载 `banner()` 和 `primaryMenu()`。

---

#### 任务 2：修改 `src/page/space.ts` 中的 `rewrite` 方法

- **定位**：在 `src/page/space.ts` 中找到 `protected rewrite(hasHeader?: boolean)` 方法。
- **修改前**：
```typescript
    protected rewrite(hasHeader?: boolean) {
        this.updateDom();
        if (hasHeader) {
            Header.remount();
        } else {
            Header.primaryMenu();
            Header.banner();
        }
    }
```
- **修改后**：
```typescript
    protected rewrite(hasHeader?: boolean) {
        this.updateDom();
        if (hasHeader) {
            Header.remount();
        }
    }
```
- **说明**：移除 `else` 分支里的 `Header.primaryMenu()` 和 `Header.banner()`。因为这两个方法内部会强行执行 `this.oldHeader.classList.add('has-menu')` 并把 2233 钓鱼 Banner 和全站分区菜单挂载上去，直接违背用户“只保留最上面 navigate（迷你顶栏）”的需求。

---

#### 任务 3：检查并确认 `src/page/header.ts` 中的空间页顶栏挂载与样式（保持兼容）

- **定位**：在 `src/page/header.ts` 的 `loadOldHeader` 方法中。
- **检查项**：
  1. 确保在 `space.bilibili.com` 下，当 `Header.isMiniHead(target)` 返回 `true` 时，不会进入 `if (!Header.isMiniHead(target))` 分支（从而不会触发 `this.banner()` 和 `this.primaryMenu()`）。
  2. 确保针对空间页隐藏新版 `.bili-header` 的样式保留，同时补充防止 `.z-top-container` 被空间页自身元素遮挡的层级样式（如已有 `old-space-header-fix`）：
```typescript
if (location.host === "space.bilibili.com") {
    addCss('.bili-header { display: none !important; } .z-top-container { position: relative; z-index: 1000; }', 'old-space-header-fix');
}
```
  3. 确保 `mountOldHeader` 中：
```typescript
if (Header.isMiniHead(target)) {
    this.miniHeader();
} else {
    this.oldHeader.classList.add('has-menu');
}
```
逻辑完好无损。

---

### 三、 验收标准（供 Coder 自检）
1. 进入 `space.bilibili.com` 任意用户主页，顶部只渲染 42px 高的旧版迷你导航条（含主站、番剧、游戏中心...以及右侧头像、动态、收藏、投稿按钮）。
2. **不再出现** 2233 钓鱼大 Banner，**不再出现**“首页、动画、番剧、国创、音乐...”全站分区菜单。
3. 迷你导航条正下方直接无缝展示个人空间自带的个性头图（Banner），无新版顶栏残留。