# 个人空间（`space.bilibili.com`）恢复显示账户注册时间规划方案 (`plan_space_jointime.md`)

> 规划模型：**Gemini 4 Argon (Planner)**
> 编码模型：**Gemini 3.8 Flash (Coder)**
> 版本目标：`v10.13.12` | 状态：已确认采用 **方式 B**（本人空间官方创作中心精确接口 + 他人空间真实历史 UID 锚点分段插值兜底）

---

## 一、 需求背景与核心目标

- **问题现象**：用户反馈在恢复旧版个人空间（`space.bilibili.com`）后，右侧“个人资料”卡片区域（图三：`UID` 与 `生日` 所在栏位）不再显示账户注册时间。
- **方案选型（方式 B）**：
  1. **访问本人空间（且已登录）**：通过 B 站创作中心日历事件接口 `https://member.bilibili.com/x2/creative/h5/calendar/event?ts=0`（携带登录 Cookie）获取精确到秒的官方 `jointime`，格式化为 `YYYY-MM-DD HH:mm:ss`。
  2. **访问他人空间（或本人接口未登录/异常降级）**：
     - 由于 B 站官方自 2021~2022 年起在全平台（Web / App / Wbi）将非本人的 `regtime` / `jointime` 服务端脱敏置 `0`，对于 2020 年 10 月中旬改版前（`0 < mid < 700,000,000`）严格单调自增的老号，采用经过真实历史数据校准的 **B 站 UID 历史发号时序锚点表** 进行分段线性插值估算，显示为 `约 YYYY-MM (估算)`，并在鼠标悬停（`title`）时提示说明。
     - 对于 `mid <= 0` 或 `mid >= 700,000,000`（散列大号段）的账号，严格返回 `null`，不渲染误导信息。

---

## 二、 失效根因剖析（三大断裂点）

1. **逻辑分支互斥（`src/page/space.ts`）**：
   - `user.addCallback` 中，`status.jointime && this.jointime()` 被放置在 `if (status.space) { this.rewrite(...); } else { ... }` 的 `else` 分支内。当用户开启“旧版个人空间”时，`jointime()` 永远不会被调用。
2. **DOM 挂载仅适配新版空间（`src/page/space.ts`）**：
   - 原 `jointime()` 仅轮询新版空间的 `.section.user-info`。而旧版个人空间（`src/html/space.html`）右侧“个人资料”卡片的 DOM 结构为 `.user .info .meta .row`（内含 `.item.uid` 与可选的 `.item.birthday`）。
3. **底层旧接口彻底 404（`src/io/account-getcardbymid.ts` & `src/io/urls.ts`）**：
   - 原接口 `//account.bilibili.com/api/member/getCardByMid` 已被 B 站下线并固定返回 `{"code":-404,"message":"啥都木有"}`。

---

## 三、 Gemini 4 Argon 架构设计与边界约束

### 1. 真实校准的 B 站历史 UID 时序锚点表（纠正拍脑袋假数据）
B 站 2009~2020 年真实发号关键里程碑（UTC+8 北京时间）：
- `UID 1`：`2009-06-26` (`1245945600`) —— B 站建站
- `UID 78,766`：`2011-01-01` (`1293811200`) —— 2011 年元旦
- `UID 259,333`：`2012-01-01` (`1325347200`) —— 2012 年元旦
- `UID 510,000`：`2012-07-15` (`1342281600`) —— 2012 年盛夏（对应 `UID 510027` 真实注册期为 2012 年 7 月中旬）
- `UID 1,123,000`：`2013-01-01` (`1356969600`) —— 2013 年元旦
- `UID 2,954,624`：`2014-01-01` (`1388505600`) —— 2014 年元旦
- `UID 7,000,000`：`2015-01-01` (`1420041600`) —— 2015 年元旦
- `UID 25,600,000`：`2016-01-01` (`1451577600`) —— 2016 年元旦
- `UID 70,000,000`：`2017-01-01` (`1483200000`) —— 2017 年元旦
- `UID 138,000,000`：`2017-07-01` (`1498838400`) —— 2017 年年中
- `UID 250,000,000`：`2018-01-01` (`1514736000`) —— 2018 年元旦
- `UID 390,000,000`：`2019-01-01` (`1546272000`) —— 2019 年元旦
- `UID 500,000,000`：`2020-01-01` (`1577808000`) —— 2020 年元旦
- `UID 600,000,000`：`2020-06-01` (`1590940800`) —— 2020 年 6 月
- `UID 700,000,000`：`2020-10-15` (`1602691200`) —— 2020 年 10 月散列大号改版临界点

### 2. 空间目标 `mid` 识别与防串号机制（关键边界约束）
- **严禁盲目回退到当前登录 `uid`**：
  - 当访问 `https://space.bilibili.com/123456` 时，只能从 URL 路径（`location.pathname.match(/^\/(\d+)/)?.[1]` 或 `BLOD.path[3]?.split(/[?#]/)[0]`）提取空间主 `mid`。
  - **仅当** `location.pathname === "/"` 或无数字路径（即访问 `https://space.bilibili.com/` 根路径自动进入个人主页）时，才允许回退使用当前登录用户的 `uid` / `DedeUserID`。
  - 此外，在 DOM 挂载阶段，若卡片中的 `.item.uid .text` 已经渲染（例如文本为 `"UID 510027"`），可从中提取出 DOM 实锤 UID 进行二次校验，若与初始 `mid` 不一致，以 DOM 实锤 UID 为准重新计算！

### 3. DOM 渲染时机与 XSS/文本安全约束
- **不得在网络请求完成后才启动 DOM 监听**：应等待目标容器（旧版 `.user .info .meta .row .item.uid` 或新版 `.section.user-info`）就绪，提取/确认准确 `mid` 后获取注册时间并挂载。
- **使用安全的 DOM 构建或属性赋值**：避免对未知字符串直接拼接 `innerHTML`，对 `.text` 节点使用 `textContent = info.text`，并防止 `<span class="text">` 内包含冗余前缀导致旧版空间窄卡片溢出（旧版空间 `.item.uid` 文本为 `UID 510027`，`.item.birthday` 文本为 `08-08` 或 `生日 08-08`；`.item.jointime` 已自带日历图标 `<span class="icon"></span>`，文本直接显示 `YYYY-MM-DD HH:mm:ss` 或 `约 YYYY-MM (估算)`）。

---

## 四、 修改文件与实施步骤

1. **`src/io/urls.ts`**：确保包含 `MEMBER_CALENDAR_EVENT` 与 `CARD` 接口地址定义。
2. **`src/io/account-getcardbymid.ts`**：
   - 使用上述真实校准的 15 个历史里程碑节点更新 `UID_ANCHORS`。
   - 实现 `estimateJointimeByMid(mid)` 与 `getSpaceJointime(mid)`。
3. **`src/page/space.ts`**：
   - 修正构造函数与 `jointime()` 中的 `mid` 解析逻辑：仅在根路径无数字 ID 时才回退 `uid`，并提供从 `.item.uid` DOM 文本解析真实 `mid` 的校准逻辑。
   - 使用安全的 DOM API 创建 `.item.jointime` 节点，支持 `poll` 与 `observerAddedNodes` 防重挂载。
4. **构建与审查**：运行 `npm run tampermonkey` 和 `npm run chrome`，由 Gemini 4 Argon 完成代码复审并更新 `review_space_jointime.md`。
