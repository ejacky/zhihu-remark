# 知乎反驳助手 - 架构评审报告

> 版本：v1.0
> 评审日期：2026-10-10
> 状态：评审完成，修复进行中（已完成 2 / 26：P0-1 ✅、P1-9 ✅）
> 评审范围：全量源码（21 个文件，约 150KB）、`manifest.json`、`docs/` 全部文档、git 提交历史
> 评审方式：静态通读 + 逐行比对（CSS 双真源、重复实现、死代码均已实际比对/检索验证）

---

## 0. 如何使用本文档

### 0.1 ID 规则

| 前缀 | 含义 | 数量 |
|------|------|------|
| `P0-n` | 确定性缺陷（行为与预期/文档不符，或存在数据丢失、内存泄漏、功能不可用） | 11 |
| `P1-n` | 架构与可读性（分层、重复、可扩展性） | 10 |
| `P2-n` | 体验与工程质量（无障碍、基座、UX 细节） | 5 |
| `D-n` | 文档漂移项（见附录 A，与代码项关联） | 8 |

### 0.2 状态图例

| 标记 | 含义 |
|------|------|
| ⬜ | 未开始（默认） |
| 🔧 | 进行中 |
| ✅ | 已完成（须填写修复提交与验证方式） |
| ⏸ | 暂缓（须填写原因与重启条件） |
| ❌ | 不修复（须填写理由） |

### 0.3 跟踪方式

1. 本文件是**唯一**的架构问题清单。修复前先把对应条目的状态改为 🔧，修复后改为 ✅ 并在条目末尾追加一行 `> 修复：<commit> / 验证：<方式>`。
2. §2 总览表的状态列与各条目的状态行**必须同步**更新。
3. 与 `docs/ROADMAP.md` 的关系：ROADMAP 描述**功能演进方向**，本文档描述**代码质量与架构问题**。两者的"技术债务"部分以本文档为准。
4. 按 `AGENTS.md`，任何代码修复都要同步检查文档（附录 A 的 D 项会随修复批次自然消化）。

---

## 1. 结论与总评

**结论**：功能完成度与产品打磨明显好于工程化水平。多策略提取、面板状态缓存、Prompt 工程细节都体现了真实场景打磨；但**分层、测试、构建、lint 完全缺失**，且存在若干"用户以为生效但实际没生效"的开关和一处功能级不可用（自定义 API）。

| 维度 | 评分 | 主要短板 |
|------|------|----------|
| 可读性 | 6/10 | `ui.js` 单函数 500+ 行；业务规则混入视图层；`sendMessage`/`escapeHtml`/`formatDate` 三处重复 |
| 可用性 | 6/10 | 两个开关是死的；自定义 API 实际跑不通；面板恢复无提示；无无障碍与触屏支持 |
| 可扩展性 | 5/10 | 全局命名空间 + 人工维护脚本顺序；新增一个错误类型要改 5 处；provider 抽象过薄 |
| 工程质量 | 3/10 | 无 `package.json`、无测试、无 lint、无 CI、无构建 |

### 1.1 应保留的良好设计（重构时不要回退）

- `src/content/index.js` 的 `window.__ZHIHU_REMARK_INITIALIZED__` 重复注入保护。
- 提取器三级策略 fallback（新版 / 旧版 / 通用）。
- 按钮注入的 500ms 防抖 + `WeakSet` 语义（意图正确，只是实现只写不读）。
- 面板缓存命中时**不重复调用 AI**（省钱且快），"使用此反驳"后主动清缓存。
- Prompt 中"论证不完整的三点门槛""禁止元评论""长度不设下限"等高价值约束——这是本项目的核心竞争力，拆分 Prompt 时必须逐字保留。
- 统一的 `zhihu-remark-` CSS 前缀与 `@doc` 注释约定。
- MV3 监听器全部在顶层注册（Service Worker 可被唤醒）。

### 1.2 统计事实

- 源码 23 个文件（评审时 21 个，后续新增 `src/shared/permissions.js`、`src/shared/opencode.js`）；`src/content/ui.js` 842 行、`src/content/index.js` 621 行、`src/content/injector.js` 597 行。
- 测试文件 0 个；lint/format 配置 0 个；`package.json` 不存在。
- `src/content/style.css`（331 非空行）与 `src/content/index.js` 内联样式（541 非空行）：**310 行完全相同，21 行仅存在于 CSS，128 行仅存在于 JS**——两份真源已漂移。
- 消息类型已有 `CONSTANTS.MESSAGE_TYPES`，但 popup/options 中有 6 处裸字符串。
- git 历史 15 次提交；`1.1.0.zip`（1.9MB）存在于工作区（未被跟踪，`.gitignore` 已覆盖，属本地残留）。

---

## 2. 问题总览

### 2.1 P0 确定性缺陷

| ID | 问题 | 维度 | 建议批次 | 状态 |
|----|------|------|----------|------|
| P0-1 | 自定义 API（custom provider）因缺少 host permission 实际不可用 | 可用性/扩展性 | A | ✅ |
| P0-2 | 面板恢复后 textarea 内容丢失（`value` 走 `setAttribute`） | 正确性 | A | ⬜ |
| P0-3 | 历史记录并发写竞态导致静默丢数据 | 正确性 | B | ⬜ |
| P0-4 | `errorTypes` 开关不生效（取消勾选仍检测全部类型） | 可用性 | B | ⬜ |
| P0-5 | `features.showAnalysis` / `features.autoFill` 是死开关 | 可用性 | B | ⬜ |
| P0-6 | 折叠检测参数恒为空，省略号规则永不生效 | 正确性 | A | ⬜ |
| P0-7 | `activeTab` 权限未被使用 | 工程/安全 | A | ⬜ |
| P0-8 | `_panelCache` 无上限，信息流场景内存泄漏 | 正确性/性能 | B | ⬜ |
| P0-9 | API 请求无超时、无取消 | 可用性/成本 | B | ⬜ |
| P0-10 | 历史条数上限自相矛盾（10 条硬截断 vs 请求 20 条） | 正确性 | A | ⬜ |
| P0-11 | `_findCommentArea` 语义混乱，存在重复注入风险 | 正确性 | A | ⬜ |

### 2.2 P1 架构与可读性

| ID | 问题 | 维度 | 建议批次 | 状态 |
|----|------|------|----------|------|
| P1-1 | 全局命名空间 + 人工维护脚本加载顺序 | 扩展性 | D | ⬜ |
| P1-2 | `createAnalysisPanel` 单体闭包 500+ 行，渲染与状态耦合 | 可读性 | D | ⬜ |
| P1-3 | `_deriveCoreIntent` 业务规则混入视图层 | 分层 | D | ⬜ |
| P1-4 | 样式双真源且已漂移 | 可维护性 | D | ⬜ |
| P1-5 | provider 抽象过薄，约 30 行重复且注释与实现不符 | 扩展性 | D | ⬜ |
| P1-6 | 消息协议常量与工具函数三处重复 | 可读性 | B | ⬜ |
| P1-7 | 配置项在 5 处重复枚举，新增一项需改 5 个文件 | 扩展性 | D | ⬜ |
| P1-8 | Prompt 是 400 行单体模板字符串 | 可读性/维护性 | D | ⬜ |
| P1-9 | 配置无版本号与迁移机制 | 扩展性 | B | ✅ |
| P1-10 | 死代码与冗余兼容分支 | 可读性 | A | ⬜ |

### 2.3 P2 体验与工程质量

| ID | 问题 | 维度 | 建议批次 | 状态 |
|----|------|------|----------|------|
| P2-1 | 无 `package.json` / 测试 / lint / CI / 构建 | 工程质量 | C | ⬜ |
| P2-2 | 无障碍缺失（无 dialog 语义、无 aria-live、无键盘/触屏路径） | 可用性 | D | ⬜ |
| P2-3 | 缓存恢复无提示、生成中不可取消、失败无持久入口 | 可用性 | D | ⬜ |
| P2-4 | 历史记录不能单条删除 / 搜索 / 导出 | 可用性 | D | ⬜ |
| P2-5 | 占位链接与废弃 API（`execCommand`） | 质量 | A | ⬜ |

### 2.4 文档漂移

见 [附录 A](#附录-a文档漂移清单)（D-1 ~ D-8）。

---

## 3. P0 详细条目

### P0-1 自定义 API（custom provider）实际不可用

- **现象**：用户在设置里选择"自定义 API"并填入自建/第三方中转地址后，生成请求必定失败（跨域被拦），且错误信息只会是笼统的 fetch 失败。
- **证据**：
  - `manifest.json:10-16`：`host_permissions` 只声明 `www.zhihu.com`、`api.openai.com`、`api.anthropic.com`、`api.deepseek.com`、`api.moonshot.cn` 五个固定域。
  - `manifest.json` 中没有 `optional_host_permissions`。
  - `src/background/api.js:167-172`：`_callCustom` 允许任意 `apiBase`；`src/background/api.js:79` 在 Service Worker 中直接 `fetch` 该地址。
  - 全仓检索 `permissions.request`：0 处。
- **影响**：文档与 UI 宣称支持"自定义 API"（`manifest.json` 提供商列表、`docs/PRD.md:103`、`docs/USER_GUIDE.md`），实际该能力不可用；这是功能级缺口，不是体验瑕疵。
- **修复建议**：
  1. `manifest.json` 增加 `"optional_host_permissions": ["https://*/*"]`。
  2. `src/options/index.js` 在保存 `provider === 'custom'`（或用户手填非默认 `apiBase`）时，用 `chrome.permissions.request({ origins: [origin + '/*'] })` 申请权限，失败则明确提示"需要授权访问该 API 域名"。
  3. `api.js` 在 fetch 前用 `chrome.permissions.contains` 做一次前置校验，返回可读错误信息。
- **验收标准**：填入非白名单域名（如 `https://my-proxy.example.com/v1`）→ 保存时弹出授权 → 授权后能成功生成；拒绝授权时提示明确且不再尝试请求。
- **状态**：✅ 已完成
> 修复：`manifest.json` 新增 `optional_host_permissions`（`https://*/*`、`http://localhost/*`、`http://127.0.0.1/*`）；新增 `src/shared/permissions.js`（`HostAccess`：规范化 apiBase / 解析 origin / `contains` + `request`）；`src/options/index.js` 保存自定义 API 时在用户手势内申请授权，拒绝则不保存并给出可操作提示；`src/background/api.js` 请求前二次校验并统一规范化地址；`src/background/index.js` 与 `src/options/index.html` 引入新模块。
> 后续（v1.3）：内置提供商也允许手动改写 API Base URL，保存时的授权改为按「实际生效地址」统一申请（内置域名已授权，`request()` 静默通过，不重复弹窗）。
> 验证：`HostAccess` 的 URL 规范化与 origin 解析已用 Node 断言覆盖 10 组用例（含无协议、本地地址、非法输入），全部通过；Chrome 内的授权弹窗与拒绝路径**尚未手动回归**（待执行附录 B 用例 7）。

### P0-2 面板恢复后 textarea 内容丢失

- **现象**：在"优化这次生成"里写了自定义要求 → 关闭面板 → 重新点击同一回答的"生成反驳"（命中缓存恢复面板）→ 输入框是空的；但内部 `styleCustomHints` 仍保留旧值，UI 与状态不一致。
- **证据**：
  - `src/content/ui.js:403-408`：构造 textarea 时传入 `value: currentHint`。
  - `src/content/ui.js:499-502`：核心意图编辑器同样传入 `value: intentText`。
  - `src/shared/utils.js:164-178`：`createElement` 对 `className`/`innerHTML`/`textContent`/`on*` 之外的键统一执行 `el.setAttribute(key, value)`（第 176 行）。
  - 按 HTML 规范，`<textarea>` 没有 `value` 内容属性（其初值来自子文本节点），`setAttribute('value', ...)` 不会改变 `.value`。
- **影响**：面板缓存恢复能力（`_panelCache`）对自定义要求部分实际失效；用户以为要求还在，重新生成时用的却是内部残留值，行为不可预期。
- **修复建议**：在 `Utils.createElement` 中把 `value`/`checked`/`disabled`/`selected` 作为**属性赋值**处理（`el[key] = value`），而不是 `setAttribute`。
- **验收标准**：优化区填写文本 → 关闭面板 → 重开面板，输入框内容完整保留；核心意图编辑器同样保留。
- **状态**：⬜ 未开始

### P0-3 历史记录并发写竞态导致静默丢数据

- **现象**：快速连续切换两个风格 Tab（或同时触发"重新生成"）时，历史记录会丢失其中一条。
- **证据**：
  - `src/background/storage.js:46-63`：`addHistoryItem` 是"读 → 改 → 写"（`await this.getHistory(100)` 与 `chrome.storage.local.set` 之间存在挂起点）。
  - `src/background/storage.js:70-84`：`updateHistoryFeedback` 同样模式。
  - `src/content/injector.js:254-294`：`generateForStyle` 未做串行化，`src/content/injector.js:300-308` 的 `onStyleChange` 可并发触发多次。
  - `src/background/index.js:30-80`：消息处理器并发执行，无队列。
- **影响**：用户的历史记录静默丢失；反馈可能写到已被覆盖的版本上。
- **修复建议**：在 `Storage` 内维护一个写队列（`this._writeQueue = this._writeQueue.then(...)`），所有读改写操作串行化；或改为"每条历史一个键 + 索引键"的分片模型。
- **验收标准**：脚本模拟 5 次并发 `addHistoryItem`，历史条数增加 5 且内容无覆盖（配合 Batch C 的单测）。
- **状态**：⬜ 未开始

### P0-4 `errorTypes` 开关不生效

- **现象**：用户取消勾选"事实错误"后，AI 仍会检测并报告事实错误。
- **证据**：
  - `src/shared/prompts.js:50-56`：系统提示无条件列出全部 6 类并要求"你必须识别以下类型的错误"。
  - `src/shared/prompts.js:193-200`：用户配置的 `errorTypes` 只被渲染成一句"用户特别关注的错误类型"。
  - `src/background/api.js:47-49`：`activeErrorTypes` 仅传给 userPrompt，未影响 systemPrompt。
- **影响**：`docs/PRD.md:112-114`（FR-008"用户可选择启用/禁用特定错误类型的检测"）未实现；设置页出现"假开关"。
- **修复建议**：把启用类型注入 systemPrompt，未启用类型明确标注"不要报告"（或从提示列表中移除），并对"论证不完整"保留三点门槛约束。
- **验收标准**：仅勾选"数据造假"时，生成的 `analysis.errorTypes` 不包含其他类型；Prompt 预览 Tab（`docs/USER_GUIDE.md` 描述的功能）能反映该变化。
- **状态**：⬜ 未开始

### P0-5 `features.showAnalysis` / `features.autoFill` 是死开关

- **现象**：关闭"显示错误分析面板"或"自动填充评论框"后，功能照旧执行。
- **证据**：
  - 定义：`src/shared/constants.js:36-42`。
  - 读写：`src/options/index.js:68-72`、`src/options/index.js:162-166`；`src/options/index.html:192,200`。
  - 消费方：全仓检索仅上述位置——`showAnalysis`、`autoFill` 没有任何读取处。相比之下 `enableHistory`（`src/background/index.js:119`）、`showSource`（`src/shared/prompts.js:15,336`）、`enableCompletenessCheck`（`src/shared/prompts.js:23,301`）确实生效。
- **影响**：`docs/PRD.md:116-120`（FR-009）描述了不存在的行为；用户产生"设置无效"的不信任感。
- **修复建议**：二选一——(a) 接上消费方：`autoFill=false` 时跳过 `_fillCommentBox`（直接复制到剪贴板），`showAnalysis=false` 时只展示 rebuttal 不展示错误分析区；(b) 从设置 UI 与 PRD 中移除。建议选 (a)，成本低且符合用户预期。
- **验收标准**：关闭任一开关后行为可观测地改变；`docs/PRD.md` FR-009 与实际一致。
- **状态**：⬜ 未开始

### P0-6 折叠检测参数恒为空

- **现象**：`_isContentTruncated` 的第 4 条规则（文本以 `...`/`…` 结尾视为折叠）永远不会触发。
- **证据**：
  - `src/content/injector.js:38`：调用处传 `this._isContentTruncated(answerElement, '')`。
  - `src/content/injector.js:127-130`：规则依赖 `text` 参数。
- **影响**：部分折叠形态（无"阅读全文"按钮但正文被截断）会提取到不完整内容并送入 AI，浪费 token 且分析结论失真。
- **修复建议**：在调用处先做一次轻量文本提取传入（或删除该规则并注释说明原因）。注意不要在注入热路径引入昂贵的 DOM 遍历。
- **验收标准**：构造一个正文以 `…` 结尾且无展开按钮的回答元素，按钮不注入或给出提示。
- **状态**：⬜ 未开始

### P0-7 `activeTab` 权限未被使用

- **现象**：`manifest.json:6-9` 声明了 `activeTab`，但全仓没有任何依赖它的 API 调用（`chrome.tabs.create` 不需要该权限）。
- **证据**：`manifest.json:6-9`；唯一 `chrome.tabs` 用法是 `src/popup/index.js:72` 与 `src/popup/index.js:97` 的 `chrome.tabs.create`。
- **影响**：安装时向用户展示多余权限，降低信任度；也与"最小权限"原则不符。
- **修复建议**：删除 `activeTab`（保留 `storage`）。
- **验收标准**：重新加载扩展后功能回归通过；商店权限列表只剩 `storage` 与 host 权限。
- **状态**：⬜ 未开始

### P0-8 `_panelCache` 无上限，信息流场景内存泄漏

- **现象**：内容脚本常驻页面，缓存条目只增不减（仅"使用此反驳"时删一条）。
- **证据**：
  - `src/content/injector.js:11`：`_panelCache: new Map()`。
  - `src/content/injector.js:137-142`：键为 `url|author|正文前 300 字`。
  - `src/content/injector.js:240-245`：写入完整 `styleResults`（含所有风格的 rebuttal 全文）与面板状态。
  - `src/content/injector.js:319`：仅在 `onUse` 时删除当前条目。
- **影响**：知乎首页/推荐页无限滚动浏览数十条回答并各生成一次后，缓存持有大量长文本；长时间挂页内存持续增长。
- **修复建议**：改为 LRU（上限 5~10 条）或 TTL（如 10 分钟），并为总文本量设上限。
- **验收标准**：滚动 50 条并各生成一次后，缓存条目数不超过上限（可在控制台打点验证）。
- **状态**：⬜ 未开始

### P0-9 API 请求无超时、无取消

- **现象**：请求一旦发出就无法中止，也没有超时；关闭面板、切换风格、重复点击"重新生成"都会让旧请求继续跑完。
- **证据**：
  - `src/background/api.js:79-86`、`src/background/api.js:132-147`：`fetch` 未带 `signal`。
  - 全仓检索 `AbortController|signal`：0 处（仅 `src/shared/utils.js:34-54` 的 `waitForElement` 有 timeout，且该方法本身未被调用）。
  - `src/content/injector.js:194-225`：加载态无取消入口。
- **影响**：浪费 token（用户付费）、界面状态可能被过期响应覆盖、Service Worker 被无谓占用。
- **修复建议**：`api.js` 统一加 `AbortController` + 超时（如 60s）；消息协议增加 `ABORT_GENERATE`（或在 `GENERATE_REBUTTAL` 中带 `requestId`，新请求到达时中止同 `requestId` 的旧请求）。
- **验收标准**：切风格后旧请求被中止（网络面板可见 canceled）；超时场景返回明确错误文案。
- **状态**：⬜ 未开始

### P0-10 历史条数上限自相矛盾

- **现象**：`options` 历史页请求 `limit: 20`，但存储层硬上限是 10，永远拿不到 20 条。
- **证据**：
  - `src/shared/constants.js:169-174`：`UI.MAX_HISTORY_ITEMS = 10`。
  - `src/background/storage.js:56`、`src/background/storage.js:80`：写入时 `slice(0, 10)`。
  - `src/options/index.js:209`：请求 `{ limit: 20 }`。
  - 文档不一致：`docs/TECH_DESIGN.md:379` 说"历史记录限制 10 条"，`docs/PRD.md:125` 说"保存最近 10 条"。
- **影响**：设置页"只能显示 10 条"看起来像 bug；`updateHistoryFeedback` 回写时还会把用户看不到的条目一并截断。
- **修复建议**：统一为单一常量（建议提到 20~30 条），options 的 limit 从常量派生；或在 UI 上明确标注"最多保留 N 条"。
- **验收标准**：生成 15 条后，options 历史页显示 15 条（上限内）；文档数字与常量一致。
- **状态**：⬜ 未开始

### P0-11 `_findCommentArea` 语义混乱，存在重复注入风险

- **现象**："查找评论区"的函数同时承担了"是否已注入"的判断，且判断为"已存在按钮"时不返回 `null`，而是继续降级到其他容器。
- **证据**：
  - `src/content/injector.js:48-80`：策略 1 命中 `actionsBar` 但其中已有 `.zhihu-remark-btn` 时，不返回 `null`，继续走策略 2/3/4。
  - `src/content/injector.js:32-35`：`_injectToAnswer` 只检查最终返回容器内是否已有按钮。
- **影响**：当策略 2/3/4 命中一个不含按钮的容器时，同一个回答会出现两个"生成反驳"按钮。
- **修复建议**：把"是否已注入"的判断唯一收敛到 `_injectToAnswer`（例如用 `answerElement.querySelector('.zhihu-remark-btn')` 统一前置判断），`_findCommentArea` 只负责定位、找不到即返回 `null`。
- **验收标准**：对同一回答重复调用 `injectAll()` 10 次，按钮数量恒为 1；在问题页与推荐页各验证一次。
- **状态**：⬜ 未开始

---

## 4. P1 详细条目

### P1-1 全局命名空间 + 人工维护脚本加载顺序

- **问题**：`CONSTANTS`、`Utils`、`Prompts`、`Extractor`、`UI`、`Injector` 全部是所在文件的全局 `const`，依赖顺序同时写在两处清单里。
- **证据**：`manifest.json:26-33`（内容脚本注入顺序）；`src/background/index.js:7-13`（`importScripts` 顺序）。任何新增模块都要改这两处，顺序错误只会在运行时以 `X is not defined` 暴露。
- **影响**：无模块边界、无类型提示、无法按文件单测；重命名/搬移文件风险高。
- **修复建议**（渐进式，二选一）：
  - 轻量：每个文件改为 `(function (global) { ... global.ZR = Object.assign(global.ZR || {}, { UI }); })(globalThis)`，显式声明依赖并在入口做断言。
  - 彻底：引入 esbuild 打包 ESM（同时解决 P1-4 的 CSS 双真源与 P2-1 的构建缺失）。
- **验收标准**：新增一个模块只需改一处；`pnpm build`/加载后无 `not defined` 类错误。
- **状态**：⬜ 未开始

### P1-2 `createAnalysisPanel` 单体闭包 500+ 行

- **问题**：容器、拖动、Esc、状态、缓存、7 个渲染区块、事件回调全部在一个函数里。
- **证据**：`src/content/ui.js:87-631`（函数体）；`src/content/ui.js:200-606`（`renderContent` 按 4 个分支内联构建标签/置信度/错误卡片/反驳预览/优化区/意图区/操作区）。
- **影响**：改一处 UI 需通读 500 行；无法单测渲染逻辑；`ui.js` 842 行已是全仓最大文件。
- **修复建议**：拆为 `panel/container.js`（挂载 + 拖动 + Esc + 生命周期）、`panel/errorList.js`、`panel/rebuttal.js`、`panel/optimize.js`、`panel/intent.js`、`panel/actions.js`，每个导出 `render(state) → Element` 纯函数，容器只负责 `replaceChildren` 组合。
- **验收标准**：`ui.js` 拆分后单文件 < 250 行；面板视觉与交互回归通过（附录 B 用例 1–4）。
- **状态**：⬜ 未开始

### P1-3 `_deriveCoreIntent` 业务规则混入视图层

- **问题**：关键词规则、冲突消解（concise vs detailed）、自然语言摘要生成属于业务逻辑，却写在 `UI` 对象里。
- **证据**：`src/content/ui.js:719-826`；规则表 `src/content/ui.js:724-780`。
- **影响**：无法被 options/后台复用；改动意图归纳逻辑要动 800 行的 UI 文件；无测试覆盖。
- **修复建议**：抽到 `src/shared/intent.js`（纯函数、零 DOM 依赖），`UI` 只负责展示。
- **验收标准**：`intent.js` 可被 Node 直接 `require` 并单测；`ui.js` 中不再出现关键词数组。
- **状态**：⬜ 未开始

### P1-4 样式双真源且已漂移

- **问题**：同一套样式同时存在于 manifest 注入的 CSS 与 `index.js` 内联字符串中，且两者已不一致。
- **证据**：`src/content/style.css` 与 `src/content/index.js:65-611` 的 `injectStyles`。实测：CSS 331 非空行 vs 内联 541 非空行；**310 行完全相同、21 行仅存在于 CSS、128 行仅存在于 JS**。
- **影响**：修改样式极易只改一份；`injectStyles` 的幂等检查（`src/content/index.js:60-61`）会掩盖冲突；文件体积与认知负担翻倍。
- **修复建议**：只保留 `style.css`（manifest 已声明注入），删除 `injectStyles` 与内联字符串；若必须运行时注入，则改为单真源生成。
- **验收标准**：全仓仅一份样式定义；面板/通知/按钮视觉回归通过。
- **状态**：⬜ 未开始

### P1-5 provider 抽象过薄

- **问题**：OpenAI 兼容与 Anthropic 两条路径重复约 30 行（取 `activeErrorTypes`、截断、组装 prompt、拼 `regenerateHint`、解析响应），provider 差异散落在 `switch` 与条件里。
- **证据**：`src/background/api.js:34-101` 与 `src/background/api.js:106-162` 高度重复；`src/background/api.js:37` 的 `providerNames` 与 `src/popup/index.js:45-48` 重复一份；`src/background/api.js:74-77` 注释称"DeepSeek 和 Kimi 支持 json_object"，实现却是 `provider !== 'custom'`（含 OpenAI），注释与代码不符。
- **影响**：新增一个 provider 要复制 30 行；`response_format` 这类能力差异无声明处，易引入运行时错误。
- **修复建议**：改为适配器表 `PROVIDERS = { defaultBase, models, supportJsonMode, buildRequest(config, prompts), parseResponse(json) }`；`generateRebuttal` 只做"归一化配置 → 取适配器 → 请求 → 校验 → 归一化响应"；provider 显示名统一从 `CONSTANTS.PROVIDER_DEFAULTS` 派生。
- **验收标准**：新增 provider 只需新增一个适配器条目；`api.js` 总行数下降；注释与实现一致。
- **状态**：⬜ 未开始

### P1-6 消息协议常量与工具函数三处重复

- **问题**：`CONSTANTS.MESSAGE_TYPES` 已存在，但 popup/options 使用裸字符串；`sendMessage`/`escapeHtml`/`formatDate` 各写两份。
- **证据**：
  - 裸字符串：`src/popup/index.js:19,53`；`src/options/index.js:29,183,209,246`（共 6 处）。
  - 重复实现：`src/popup/index.js:101-122` 与 `src/options/index.js:305-326`。
  - `src/shared/utils.js:106-109` 已有 `formatDate`，但该页面未加载 `utils.js`（`src/popup/index.html:50-51`、`src/options/index.html:292-294` 只加载了 `constants.js`/`prompts.js`）。
- **影响**：改消息类型名或日期格式需同步多个文件；两个页面的日期格式已经不同（`M/D HH:mm` vs `YYYY-MM-DD HH:mm`）。
- **修复建议**：抽 `src/shared/messaging.js`（消息类型 + Promise 化 `sendMessage`）与 `src/shared/dom.js`（`escapeHtml`/`formatDate`/`createElement`），三个入口页按需加载。
- **验收标准**：全仓不再出现裸消息类型字符串；`formatDate` 只有一份实现。
- **状态**：⬜ 未开始

### P1-7 配置项在 5 处重复枚举

- **问题**：新增一个错误类型或功能开关需要同时修改 5 个位置。
- **证据**：
  1. `src/shared/constants.js:96-133`（`ERROR_TYPES`）、`src/shared/constants.js:36-42`（`features`）。
  2. `src/options/index.html:129-169`（6 个 `err-*` checkbox）、`src/options/index.html:192-224`（5 个 `feat-*` toggle）。
  3. `src/options/index.js:61-80`（读）与 `src/options/index.js:153-169`（写）——共 16 处 `getElementById('err-*'|'feat-*')`。
  4. `src/content/ui.js` 的标签样式类 `zhihu-remark-tag--<type>`（对应 `src/content/index.js` 内联样式）。
  5. `src/options/index.js:226`：历史记录标签的中文名与颜色另行硬编码一份（且**缺少 `argumentIncomplete`**）。
  另外 `src/options/index.js:47-49` 硬编码 `0.7` / `3072`，`src/options/index.js:132` 硬编码 `'gentle'`，`src/options/index.js:142` 硬编码 `'standard'`——与 `CONSTANTS.DEFAULT_CONFIG` 形成第二真源。
- **影响**：新增类型极易漏改（历史标签已经漏了 `argumentIncomplete`），配置面越扩越难维护。
- **修复建议**：options 页按 `CONSTANTS` 动态渲染表单（`ERROR_TYPES`/`REBUTTAL_STYLES`/`STRICTNESS_LEVELS`/`FEATURE_FLAGS` 全部数据驱动），默认值一律读 `DEFAULT_CONFIG`。
- **验收标准**：新增一个错误类型只需改 `constants.js`；options 页与历史标签自动出现。
- **状态**：⬜ 未开始

### P1-8 Prompt 是 400 行单体模板字符串

- **问题**：角色、场景、语气、错误类型指南、动态指令、Few-shot、反驳原则、写作要求、输出格式全在一个模板字面量里，含嵌套三元与内联条件拼接。
- **证据**：`src/shared/prompts.js:32-165`（单条 `return` 表达式）；动态片段拼接见 `src/shared/prompts.js:62`。
- **影响**：调整任一段落需要在 400 行字符串中定位；段落顺序无法独立测试；同一条约束在 prompt 文本与 `REBUTTAL_STYLES.toneHint`（`src/shared/constants.js:72-93`）之间形成两套真源。
- **修复建议**：拆为 `prompts/sections/*.js` 导出的段落常量数组 + `composePrompt(sections)`；把"禁用词表""来源措辞规则""长度上限"等参数化。**注意 `docs/PROMPT_DESIGN.md` 是这些文案的规范文档，重构时必须逐字比对，不得改变语义。**
- **验收标准**：拆分前后对同一 `(style, config, content)` 生成的 prompt 文本**逐字节一致**（用快照测试保证）。
- **状态**：⬜ 未开始

### P1-9 配置无版本号与迁移机制

- **问题**：配置结构演进时没有 `configVersion`，只有一层浅合并兜底；字段在文档里存在但不在默认值里。
- **证据**：`src/background/storage.js:106-119`（`_mergeConfig`）；`src/shared/constants.js:14-45`（`DEFAULT_CONFIG` 无 `customPromptSuffix`，但 `docs/TECH_DESIGN.md:352` 与 `src/options/index.js:80,168` 都在用它）。
- **影响**：未来字段改名/迁移只能靠 `?.` 与 `!== false` 兼容，易出现"默认值静默覆盖用户配置"或反之。
- **修复建议**：`DEFAULT_CONFIG` 补齐缺失字段；新增 `configVersion` 与 `migrations[]`，在 `getConfig` 中按版本执行迁移，并写单测。
- **验收标准**：注入一个旧版本配置样本，`getConfig()` 输出符合当前 schema。
- **状态**：✅ 已完成
> 修复：`src/shared/constants.js` 新增 `CONFIG_SCHEMA_VERSION`（=2）与 `CONFIG_MIGRATIONS`（v1→v2 补 `customPromptSuffix`），`DEFAULT_CONFIG` 补齐 `customPromptSuffix`、`configVersion` 由 `CONFIG_SCHEMA_VERSION` 赋值（单一真源）；`src/background/storage.js` 新增 `_migrateConfig()`，`getConfig()` 迁移后立即回写、`setConfig()` 一律盖章当前版本，无版本号旧数据视为 v1、未来版本号归一为当前版本。
> 验证：一次性 Node harness 桩 `chrome.storage.local` 驱动真实 `constants.js`/`storage.js`，7 组场景全通过（全新安装不产生多余回写、v1 数据保留用户值并补齐新字段、已迁移数据不重复回写、未来版本号归一、`setConfig` 未带版本号也落盘为当前版本、迁移函数缺失不报错、`DEFAULT_CONFIG` 自带版本号）；`node --check` 覆盖 14 个源文件无语法错误。Chrome 内实际加载回归**尚未执行**（待随重构基线版本一起验证）。

### P1-10 死代码与冗余兼容分支

- **问题**：多处代码无调用方或只写不读。
- **证据**：
  - `src/content/injector.js:501-520`：`_simulatePaste` 无任何调用。
  - `src/content/injector.js:8,33,42`：`_injectedElements` 只 `add`，从不读取。
  - `src/shared/utils.js:20-29`：`throttle` 无调用；`src/shared/utils.js:34-54`：`waitForElement` 无调用。
  - `src/shared/constants.js:158-166` 的 `SHOW_NOTIFICATION`：无任何发送方，仅 `src/content/index.js:47-53` 监听；`docs/TECH_DESIGN.md:222` 却把它写成正式 B→C 协议。
  - `src/shared/utils.js:100`：`generateId` 使用已废弃的 `String.prototype.substr`。
  - 各文件的 `if (typeof module !== 'undefined' && module.exports)` 兼容分支（`src/shared/constants.js:178-180`、`src/shared/utils.js:191-193`、`src/background/storage.js:123-125`、`src/background/api.js:203-205`、`src/content/extractor.js:290-292`、`src/shared/prompts.js:386-388`、`src/content/ui.js:840-842`、`src/content/injector.js:595-597`）在纯浏览器扩展中永不执行。
- **影响**：误导后续维护者（"这个模块支持 CommonJS"）；死代码让"哪些是真入口"变得不清晰。
- **修复建议**：删除无调用代码与 `module.exports` 分支（若 Batch C 引入 vitest，则改为规范的 ESM/CJS 测试导出方式）；`SHOW_NOTIFICATION` 要么接入（如后台失败时主动通知页面），要么删除并同步 `docs/TECH_DESIGN.md`。
- **验收标准**：全仓检索上述符号为 0（或均有真实调用方）；功能回归通过。
- **状态**：⬜ 未开始

---

## 5. P2 详细条目

### P2-1 无 `package.json` / 测试 / lint / CI / 构建

- **问题**：仓库根目录只有 `manifest.json`、`src/`、`docs/`、`assets/`；没有任何工程基座。
- **证据**：`package.json` 不存在；无 eslint/prettier 配置；无 `.github/workflows`；无测试文件；版本号仅存在于 `manifest.json:4`。
- **影响**：任何重构（P1-1/P1-2/P1-8）都没有回归网；代码风格靠人工；打包需手工压缩 zip（工作区残留 `1.1.0.zip`）。
- **修复建议**：新增 `package.json` + esbuild（`build`/`watch`）+ eslint + prettier + vitest + `zip` 脚本；CI 至少跑 lint + test。优先补测试：`Utils.extractJSON`（分支最多）、`Prompts.*`（快照）、`Storage._mergeConfig`、`intent` 归纳、`_deriveCoreIntent` 冲突消解。
- **验收标准**：`pnpm test` / `pnpm lint` 可在本地与 CI 通过；`pnpm build` 产出可加载的 dist 与 zip。
- **状态**：⬜ 未开始

### P2-2 无障碍缺失

- **问题**：面板与通知缺少语义与键盘支持。
- **证据**：`src/content/ui.js:88-90`（面板无 `role="dialog"`/`aria-modal`/`aria-labelledby`，无焦点管理）；`src/content/ui.js:15-37`（通知无 `aria-live`）；`src/content/ui.js:192-197`（仅 Esc）；`src/content/ui.js:119-144`（拖动仅 `mousedown`/`mousemove`，无 Pointer Events → 触屏设备无法拖动）。
- **影响**：键盘/读屏/触屏用户可用性差；若上架商店，无障碍是可被投诉项。
- **修复建议**：补 `role="dialog"` + 打开时聚焦 + `aria-live="polite"` 通知容器；把拖动改为 Pointer Events 并加键盘移动（方向键）。
- **验收标准**：键盘可完成"打开面板 → 切换风格 → 使用此反驳 → 关闭"；触屏设备可拖动面板。
- **状态**：⬜ 未开始

### P2-3 缓存恢复无提示、生成中不可取消、失败无持久入口

- **问题**：三个体验断点。
- **证据**：`src/content/injector.js:160-164`（命中缓存直接恢复，无"这是上次结果"提示，用户可能误以为重新生成过）；`src/content/injector.js:194-225`（加载态无取消）；`src/content/constants`→`src/shared/constants.js:169-174`（`NOTIFICATION_DURATION = 3000`，失败信息 3 秒即消失）、`src/content/injector.js:153-155`（提取失败仅 toast，无"重新提取/刷新页面"持久入口）。
- **影响**：结果可信度与失败恢复体验受损。
- **修复建议**：恢复缓存时在面板顶部标注"⏱ 上次生成结果（记录于 HH:mm）"；加载态加"取消"；失败态在面板内提供"重试/刷新页面"按钮而非只发 toast。
- **验收标准**：三条路径均有可观测的 UI 反馈；附录 B 用例 3/5 通过。
- **状态**：⬜ 未开始

### P2-4 历史记录不能单条删除 / 搜索 / 导出

- **问题**：历史页只能整体清空。
- **证据**：`src/options/index.js:243-252`（仅"清空历史"）；`src/options/index.js:206-240`（列表无删除/搜索/导出）。
- **影响**：用户无法清理单条敏感记录，也无法留存有价值的结果；`docs/ROADMAP.md:137` 的"支持批量导出历史记录"即指此。
- **修复建议**：列表项加单条删除 + 顶部搜索框 + 导出 JSON/Markdown（纯前端实现，无需新权限）。
- **验收标准**：可删除单条、按标题搜索、导出文件内容与存储一致。
- **状态**：⬜ 未开始

### P2-5 占位链接与废弃 API

- **问题**：面向用户的链接是占位地址；剪贴板回退使用已废弃 API。
- **证据**：`src/popup/index.js:97`（`https://github.com/your-repo/zhihu-remark`）；`src/shared/utils.js:70-86`（`document.execCommand('copy')`）。
- **影响**：用户点击帮助得到 404；`execCommand` 未来版本可能移除（目前仅作 fallback，风险可控）。
- **修复建议**：替换为真实仓库/文档地址；剪贴板回退改用 `navigator.clipboard` 失败后的显式提示（或保留 `execCommand` 但加注释说明其为最后兜底）。
- **验收标准**：帮助链接可达；复制失败路径有明确提示。
- **状态**：⬜ 未开始

---

## 6. 目标目录结构

```
package.json                  # build / lint / test / zip 脚本
src/
  shared/                     # 无 DOM 依赖，可被 Node 直接单测
    constants.js
    config.js                 # 默认值 + configVersion + 迁移
    intent.js                 # 核心意图归纳（自 ui.js 迁出）
    messaging.js              # MESSAGE_TYPES + Promise 化 sendMessage
    dom.js                    # createElement / escapeHtml / formatDate
    utils.js
    providers/                # 适配器表：index.js / openai-compat.js / anthropic.js
    prompts/
      index.js
      sections/*.js           # 段落化 Prompt
  background/
    index.js                  # 仅消息路由
    handlers/                 # generate.js / config.js / history.js
    storage.js
  content/
    index.js                  # bootstrap（样式、观察者、路由钩子）
    runtime/                  # observer.js / route-hook.js / panel-cache.js(LRU)
    extract/strategies/       # modern.js / legacy.js / generic.js
    panel/                    # container.js / errorList.js / rebuttal.js / optimize.js / actions.js
    comment/filler.js         # 评论框填充（自 injector.js 迁出）
  popup/  options/
```

---

## 7. 落地批次建议

| 批次 | 主题 | 包含条目 | 前置依赖 | 退出标准 |
|------|------|----------|----------|----------|
| A | 低风险速修 | P0-2, P0-6, P0-7, P0-10, P0-11, P2-5, P1-10 | 无 | 附录 B 用例 1–4、8、9 通过；单次提交，改动集中在 4 个文件内 |
| B | 状态与开关语义 | P0-1, P0-3, P0-4, P0-5, P0-8, P0-9, P1-6, P1-9 | A（避免在旧结构上叠加） | 附录 B 用例 5–7 通过；开关行为与 PRD 一致 |
| C | 工程基座 | P2-1 | 建议紧跟 A（越早越好） | `lint`/`test` 可跑；`extractJSON`、`_mergeConfig`、`intent`、Prompt 快照有覆盖 |
| D | 分层重构 | P1-1 ~ P1-5, P1-7, P1-8, P2-2, P2-4 | C 完成（必须有测试网） | 单文件行数达标；Prompt 快照逐字节一致；视觉回归通过 |
| E | 文档同步 | D-1 ~ D-8 | 随 A~D 逐步消化 | `docs/` 描述与代码一致，无遗留漂移项 |

**批次执行提示**：
- 批次 D 中 **P1-8（Prompt 拆分）必须配快照测试**，否则极易在搬运中改变语义。
- 批次 A/B 每次提交后按 `AGENTS.md` 同步检查 `docs/TECH_DESIGN.md`、`docs/USER_GUIDE.md`。
- 建议一并在 CI 中加一条"`@doc` 注释存在性 + 引用的文档锚点可达"的检查。

---

## 附录 A：文档漂移清单

| ID | 文档位置 | 现状 | 代码事实 | 关联项 | 状态 |
|----|----------|------|----------|--------|------|
| D-1 | `docs/TECH_DESIGN.md:3` | 版本 `v1.0.0` | `manifest.json:4` 为 `1.1.0` | — | ✅ 2026-10-19 已对齐（TECH_DESIGN 头部版本随 manifest 更新为 v1.1.1） |
| D-2 | `docs/TECH_DESIGN.md:378` | "所有数据本地存储，与 Chrome 用户账户同步" | 使用 `chrome.storage.local`，**不随账户同步** | P0-7 | ✅ 2026-10-27 已修（§5.2 改为"仅存本机、不随账户同步"，并补迁移策略） |
| D-3 | `docs/TECH_DESIGN.md:334`、4.2 节各示例 | `maxTokens: 2048` | `src/shared/constants.js:23` 默认 `3072`；`src/options/index.html:86` 默认 3072 | P1-7 | ✅ 2026-10-19 已修（§4.2 各示例与 §5.1 统一为实际默认值 4096；默认值本身同时提升为 4096、设置页上限 8192） |
| D-4 | `docs/TECH_DESIGN.md:449-453` | 承诺"内容缓存 / 请求去重 / 历史分页加载 / 代码分割" | 均未实现（无缓存层、无去重、`getHistory` 一次性返回、共享模块全量注入） | P0-8, P0-9, P2-4 | ⬜ |
| D-5 | `docs/TECH_DESIGN.md:222` | `SHOW_NOTIFICATION` 为 B→C 协议 | 无任何发送方 | P1-10 | ⬜ |
| D-6 | `docs/TECH_DESIGN.md:379` vs `docs/PRD.md:125` | 历史限制 10 条 | 存储层 10 条，但 options 请求 20 条 | P0-10 | ⬜ |
| D-7 | `docs/PRD.md:107-110` | 风格仅列 3 种（温和/直接/学术） | `src/shared/constants.js:88-92` 已有第 4 种"自然真实"（`docs/USER_GUIDE.md:143` 已同步，PRD 未同步） | P1-7 | ⬜ |
| D-8 | `docs/PRD.md:112-120`、`docs/ROADMAP.md:192-193`、`docs/MARKETING_PLAYBOOK.md:67-68` | FR-008 称错误类型可禁用；FR-009 称面板/自动填充可开关；行销文案称"五种错误检测""三种风格" | 错误类型开关不生效（P0-4）；两个功能开关是死的（P0-5）；实际 6 种错误类型、4 种风格（`src/shared/constants.js:96-133,72-93`） | P0-4, P0-5 | ⬜ |

> 说明：本清单仅记录**已核实**的漂移，不含推测。批次 A/B/D 修复代码时须同步消掉对应 D 项。

---

## 附录 B：回归验证清单

手动回归用例（每个批次完成后至少跑一遍；批次 C 后尽量转为自动化）：

| # | 用例 | 关注条目 |
|---|------|----------|
| 1 | 问题详情页默认风格生成 → 面板正常展示标签/置信度/错误卡片/反驳 | P1-2 |
| 2 | 快速连点两个风格 Tab → 两份结果都生成、历史记录条数正确 | P0-3 |
| 3 | 优化区填要求 → 重新生成 → 关面板 → 重开（命中缓存，不重复调 API，输入框内容保留） | P0-2, P2-3 |
| 4 | "使用此反驳" → 评论框填充成功；构造失败场景 → 回退剪贴板并提示 | P0-11, P2-5 |
| 5 | 关闭"显示错误分析面板"/"自动填充评论框" → 行为确实改变 | P0-5 |
| 6 | 仅勾选"数据造假" → 结果中不出现其他错误类型 | P0-4 |
| 7 | 自定义 API 填非白名单域名 → 保存时申请授权 → 生成成功；拒绝授权 → 明确报错 | P0-1 |
| 8 | 推荐页滚动加载 20+ 条回答 → 每条按钮恰好 1 个；重复 `injectAll()` 不产生重复按钮 | P0-11 |
| 9 | 折叠回答（有"阅读全文"）→ 不注入按钮；展开后自动注入 | P0-6 |
| 10 | 生成 15 条历史 → options 历史页条数与上限一致 | P0-10 |
| 11 | 生成过程中关闭面板 / 切换风格 → 旧请求被取消 | P0-9 |
| 12 | 长时间滚动并多次生成（50+ 次）→ 内存不持续增长 | P0-8 |

---

## 变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-10-10 | 首版：全量源码评审，输出 11 项 P0、10 项 P1、5 项 P2、8 项文档漂移 |
| v1.1 | 2026-10-10 | P0-1 修复完成（自定义 API 域名动态授权：新增 `shared/permissions.js`、`optional_host_permissions`、保存时授权 + 请求前校验）；同步 `docs/PRD.md` FR-006、`docs/TECH_DESIGN.md` §2.1/§5.1/§7.3/§8、`docs/USER_GUIDE.md` §4.1 |
| v1.2 | 2026-10-10 | 新增能力（非评审条目）：OpenCode Go / Zen 网关适配 —— 新增 `shared/opencode.js`，`background/api.js` 自动附带 `x-opencode-session`（按回答派生稳定会话标识）；同步 PRD FR-006、TECH_DESIGN §2.1/§2.3/§4.2、USER_GUIDE §4.1 |
| v1.3 | 2026-10-15 | 新增能力（非评审条目）：API Base URL 与模型名称对所有提供商开放手动填写（内置提供商也可指向代理 / 镜像 / 新域名，模型名可自由输入，候选列表改为 datalist 建议）；保存时按实际生效地址统一申请域名授权；同步 PRD FR-006/FR-012、TECH_DESIGN §2.3/§4.2/§5.1/§7.3/§8、USER_GUIDE §2.2/§4.1。经两轮独立代理验证后追加修复：切换提供商往返不再丢失已保存的 `apiBase`/`model`；`request()` 返回 false 时用 `contains()` 复核兜底；地址有效性校验加固（只有协议 / 协议后多余斜杠 / 非 http(s) 协议 / 主机名畸形的地址不再被规范化成垃圾值落库）；`patternOf()` 生成匹配模式时剔除端口；误填完整端点与不可授权的明文 http 域名在保存前拦截 |
| v1.4 | 2026-10-19 | 修复「生成失败：API 返回内容为空」高频问题（非评审条目）：`background/api.js` 新增重试与降级层（`CONSTANTS.API_RETRY`：3 次尝试、800/2000ms 退避、`max_tokens` 上限 8192），把失败按 `network`/`http`/`param`/`gateway`/`empty`/`format`/`length`/`filter` 分类（其余确定性失败保持无 kind 直出），仅对抖动类重试，重试时关闭 `response_format` 并追加「只输出 JSON」提醒、截断时放宽 `max_tokens`；识别网关 200 + `error` 体、`refusal`/`content_filter`，Claude 改为取 `content` 数组中的 `text` 块（不再写死 `content[0]`）；`maxTokens` 默认值 3072 → 4096、设置页上限 4096 → 8192。用一次性 Node harness（桩 fetch 驱动真实 `api.js`，15 个场景）验证：空返回重试成功、连续失败文案可操作、安全拦截不重试、401/普通 400 不重试、thinking 块不再误判为空。同步 manifest 1.1.1、TECH_DESIGN §4.2/§5.1/§6.4/§8 与版本号、USER_GUIDE §2.3/§4.1/§5 Q6、ROADMAP |
| v1.5 | 2026-10-27 | P1-9 修复完成（配置版本号与迁移链）；D-2 修正；发布治理补齐：manifest 升 1.1.2、打 `v1.1.1`/`v1.1.2` tag、归档可加载产物 |
