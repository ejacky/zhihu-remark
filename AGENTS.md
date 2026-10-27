# AGENTS.md

> 面向 AI 编码代理的仓库工作指南，人类贡献者同样适用。
> 先读本文件；模块行为细节看源文件头部 `@doc` 指向的文档。

## 1. 项目与硬规则

知乎反驳助手：Chrome / Edge Manifest V3 扩展。在知乎回答下注入「🛡️ 生成反驳」按钮，提取回答内容，调用用户配置的 AI（DeepSeek / Kimi / OpenAI / Claude / 自定义）生成错误分析与反驳草稿，由用户审核后手动发布。

- 纯原生 JavaScript + HTML/CSS；**无 npm、无构建、无自动化测试**，仓库根目录就是可加载的扩展。
- 三个运行上下文：`src/content/`（知乎页面 DOM）、`src/background/`（Service Worker，AI 调用）、`src/popup/` + `src/options/`（配置界面）。
- 数据只进 `chrome.storage.local`，API Key 不出本机。
- 内容红线：只反驳原文核心断言，基于事实与逻辑，禁止人身攻击；面向中立围观者，不评价作者动机或提问态度；语气接近真人评论，不写「综上所述」类套话。

硬规则：

1. 不执行、不编造 `npm install` / `npm test` / `npm run build`；验证方式见 §2。
2. 改代码必须按 §6 同步文档；无需更新时在回复末尾说明理由。
3. **永不自动发布评论**；生成内容必须经用户审核，所有对外动作由用户完成。
4. 未经确认不改 `manifest.json` 权限、不改存储 key、不改消息协议、不引第三方依赖或远程脚本。

## 2. 运行与验证

```text
chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选择仓库根目录
重载：content 改完刷新知乎页面；background 在扩展页点刷新；
popup / options 重开页面；manifest 改完必须重新加载扩展。
日志：页面 Console，前缀 [知乎反驳助手]；SW 日志在扩展页的 “Service Worker”。
```

没有测试命令。每次改动至少手动确认：

- [ ] 问题页 / 推荐页 / 专栏文章页能看到按钮，原生操作栏未被破坏
- [ ] 能生成；面板显示错误类型、摘要、反驳正文
- [ ] 切风格后重新生成，语气确实改变
- [ ] 关闭面板再打开同一回答，状态恢复且不重复请求 AI
- [ ] 「使用此反驳」能填入评论框（失败时复制到剪贴板）
- [ ] 设置页能保存：自定义地址、留空回退、非法地址拦截、权限弹窗

交付时写明实际验证了什么、没验证什么，不要用「应该没问题」代替。

## 3. 代码地图与加载顺序

| 目录 | 职责 | 全局对象 |
|---|---|---|
| `src/shared/` | 常量与默认配置、工具函数、域名权限、OpenCode 网关、Prompt | `CONSTANTS` `Utils` `HostAccess` `OpenCode` `Prompts` |
| `src/background/` | 消息路由、配置与历史存储、AI 请求/重试/解析 | `Storage` `API` |
| `src/content/` | 内容提取、按钮注入、分析面板、评论框填充 | `Extractor` `Injector` `UI` |
| `src/popup/` `src/options/` | 状态展示、设置、历史、Prompt 预览 | — |

**没有模块系统**：模块是 `const Foo = {...}` 全局对象，靠加载顺序共享；浏览器代码不用 `import` / `export` / `require`。

新增或移动共享模块，必须同时登记三处，且依赖排在使用者之前：

1. `manifest.json` → `content_scripts[0].js`
2. `src/background/index.js` → `importScripts(...)`
3. `src/options/index.html` / `src/popup/index.html` → `<script>`

加载顺序：`constants → utils → permissions/opencode → prompts → storage/api → 业务模块`。

## 4. 编码约定

- ES2020；2 空格、单引号、分号；注释、日志、界面文案用中文。
- 模块用大驼峰全局对象；私有成员前缀 `_`；CSS 类前缀 `zhihu-remark-`，修饰符用 `--`。
- DOM 优先 `textContent` / `Utils.createElement()`；拼 HTML 前必须转义。
- 用户可见错误写清「发生了什么 + 怎么办」，不要吞异常；日志不打印 API Key 或完整回答。
- `chrome.*` 用 Promise 形式；消息监听异步响应要 `return true`。
- 入口脚本用 IIFE + `'use strict'`；内容脚本防重复初始化用 `window.__ZHIHU_REMARK_INITIALIZED__`。
- 不做与任务无关的格式化、重命名、文件搬迁，保持 diff 可审。

## 5. 高频陷阱

1. **权限申请必须在用户手势内**：`chrome.permissions.request()` 要在点击「保存」的同一调用帧发起，不要先 `await` 一堆再申请。
2. **`apiBase` 留空是特性**：留空 = 用提供商默认地址；设置页不要预填，后台不要持久化默认值。
3. **知乎是 SPA 且 DOM 会变**：注入要覆盖首次加载、站内跳转、滚动加载、展开全文；选择器保留多策略 fallback，不要只修一种页面。
4. **JSON 模式会偶发空返回**：空返回、截断、429/5xx 由 `background/api.js` 的 `_withRetry()` 分类重试；鉴权、未授权、安全拦截不重试。不要在下层 catch 成「生成失败」。
5. **样式与转义有副本**：`content/style.css` 与 `content/index.js` 的内联样式重复；`escapeHtml` 在 popup / options / injector 各一份。改一处要同步其余副本。
6. **Service Worker 随时被回收**：不要把会话状态放后台内存；跨请求状态放 `chrome.storage.local` 或内容脚本。
7. **面板缓存按回答维度**：`Injector._panelCache` 关闭面板可恢复，点「使用此反驳」后清除；改 key 逻辑要同步清理。
8. **内容脚本只匹配** `www.zhihu.com/*` 和 `zhuanlan.zhihu.com/p/*`；扩页面必须改 manifest 并实测。

## 6. 文档同步（硬性）

修改任何代码后，**必须**同步检查并更新相关文档，无需用户提醒。

| 代码变更 | 需检查的文档 |
|---|---|
| `src/background/**` | `docs/TECH_DESIGN.md`（架构 / 数据流 / API / 存储 / 错误处理） |
| `src/content/**` | `docs/TECH_DESIGN.md`（内容脚本）、`docs/USER_GUIDE.md`（功能使用） |
| `src/popup/**` | `docs/USER_GUIDE.md`（操作界面） |
| `src/options/**` | `docs/USER_GUIDE.md`（设置页）、`docs/TECH_DESIGN.md`（权限 / 校验） |
| `src/shared/**` | `docs/TECH_DESIGN.md`（共享模块）；涉及 Prompt 时加 `docs/PROMPT_DESIGN.md` |
| `manifest.json` | `docs/PRD.md`（产品定义）、`docs/TECH_DESIGN.md`（权限 / 架构）、`docs/USER_GUIDE.md`（安装提示） |
| 新增功能 / 模块 | `docs/PRD.md`、`docs/TECH_DESIGN.md`、`docs/USER_GUIDE.md` 三份全检；涉及 Prompt 加 `docs/PROMPT_DESIGN.md` |
| 新增提供商 / 错误类型 / 风格 | `docs/PRD.md`、`docs/TECH_DESIGN.md`、`docs/USER_GUIDE.md` + `docs/PROMPT_DESIGN.md` |
| 版本号 / 发布 | `docs/ROADMAP.md` 变更日志；相关文档头部版本号 |
| `docs/**` | 无需额外检查 |

执行要求：

1. **新增功能**：三份文档按需补充章节，不只加一句说明。
2. **修改逻辑**：检查描述是否过时，行为、参数、默认值、错误文案都算描述。
3. **删除功能**：同步删除或标记对应说明，别留下文档漂移。
4. **确实无需更新**：在回复末尾用一行说明，如 `> 文档无需更新：本次为纯内部重构，对外无变化。`

`@doc` 约定：关键文件头部保留 `@doc docs/…#章节`；新建用户可见文件必须加；章节移动或改名后顺手更新指向。

## 7. Git 与版本

- Conventional Commits，subject 用中文：`feat(panel): …`、`fix(api): …`、`docs(roadmap): …`。
- 一次提交一件事；不提交 zip/crx、密钥、`.kimi/active/`；未经要求不 push、不改写历史。
- 版本以 `manifest.json` 为准；发版时 bump 版本、在 `docs/ROADMAP.md` 变更日志加带日期的条目、同步相关文档头部。
- 打包只含 `manifest.json`、`src/`、`assets/`；排除 `.git/`、`.kimi/`、`docs/`、`assets/source/`；产物不提交。

## 8. 文档索引

| 需要了解 | 读 |
|---|---|
| 架构、数据流、消息协议、存储、AI 调用、权限、错误处理 | `docs/TECH_DESIGN.md` |
| 产品需求与验收标准 | `docs/PRD.md` |
| 安装、使用、设置页 | `docs/USER_GUIDE.md` |
| Prompt 结构与调优 | `docs/PROMPT_DESIGN.md` |
| 技术债与架构评审 | `docs/ARCHITECTURE_REVIEW.md` |
| 阶段规划与变更日志 | `docs/ROADMAP.md` |
| 历史 plan（只读，不要修改） | `.kimi/plans/` |
