# AGENTS.md

> 面向 AI 编码代理的仓库工作指南，人类贡献者同样适用。
> 先读本文件；模块细节看源文件头部的 `@doc` 指向。

## 1. 项目与硬规则

知乎反驳助手：Chrome / Edge Manifest V3 扩展。在知乎回答下注入「🛡️ 生成反驳」按钮，提取回答正文，调用用户配置的 AI 生成一段**可直接发布的评论**，由用户审核后手动发布。

- 纯原生 JS + HTML/CSS；**无 npm、无构建**，仓库根目录就是可加载的扩展。
- 生成结果是一段**纯文本**（不是 JSON、没有结构化字段）。面板只有三个可点元素：填入评论框 / 换个说法 / 关闭。
- 数据只进 `chrome.storage.local`，API Key 不出本机。
- 内容红线：只反驳原文核心断言，基于事实与逻辑；面向中立围观者，不评价作者动机，不做人身攻击。

硬规则：

1. 不执行、不编造 `npm install` / `npm test` / `npm run build`。
2. **永不自动发布评论**；生成的文字必须经用户审核，所有对外动作由用户完成。
3. 未经确认不改 `manifest.json` 权限、不改存储 key、不改消息协议、不引第三方依赖或远程脚本。
4. 改 Prompt 必须跑 `node tests/prompt/rules.test.mjs`（零依赖、不需要 Key）。

## 2. 运行与验证

```text
chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选仓库根目录
重载：content 改完刷新知乎页；background 改完在扩展页点刷新；
manifest 改完必须重新加载扩展。
日志：页面 Console 前缀 [知乎反驳助手]；SW 日志在扩展页的 "Service Worker"。
```

没有构建命令。自动化测试两套，共 14 项断言，十几毫秒：

```powershell
node tests/prompt/rules.test.mjs     # Prompt 回归网：L0 判据、Prompt 护栏、golden 集
node tests/docs.test.mjs             # 文档完整性：@doc 指向与锚点、docs 目录清单
```

> `node --test tests/` 在某些沙箱下会因 spawn 被拒（EPERM），直接跑单文件即可。
> 它们只覆盖纯函数与文件结构，**不覆盖扩展运行时**。

每次改动仍需手动确认：

- [ ] 问题页 / 推荐页 / 专栏文章页能看到按钮，原生栏未被破坏
- [ ] 点按钮后卡片立即出现并显示「已等待 N 秒」
- [ ] 正文是多段、每段不长；三句话的原文不该出四五段
- [ ] 「填入评论框」成功；失败回退复制到剪贴板
- [ ] 「换个说法」重生成后不再标「上次生成于」
- [ ] 关掉卡片再打开同一回答：恢复结果且**不重复请求 AI**
- [ ] 失败态是可读中文错误 + 重试按钮
- [ ] 设置页保存：地址留空回退、非法地址拦截、权限弹窗

交付时写明实际验证了什么、没验证什么，不要用「应该没问题」代替。

## 3. 代码地图与加载顺序

| 目录 | 职责 | 全局对象 |
|---|---|---|
| `src/shared/` | 常量与默认配置、工具、域名权限、OpenCode 网关、Prompt | `CONSTANTS` `Utils` `HostAccess` `OpenCode` `Prompts` |
| `src/background/` | 消息路由、配置与历史存储、AI 请求/重试 | `Storage` `API` |
| `src/content/` | 正文提取、按钮注入、卡片、评论框填充 | `Extractor` `Injector` `UI` |
| `src/options/` | 设置页（点图标直接打开，无 popup） | — |

**没有模块系统**：模块是 `const Foo = {...}` 全局对象，靠加载顺序共享；浏览器代码不用 `import` / `export` / `require`。

新增或移动共享模块，必须同时登记三处，且依赖排在使用者之前：

1. `manifest.json` → `content_scripts[0].js`
2. `src/background/index.js` → `importScripts(...)`
3. `src/options/index.html` → `<script>`

加载顺序：`constants → utils → permissions/opencode → prompts → storage/api → 业务模块`。

## 4. 编码约定

- ES2020；2 空格、单引号、分号；注释、日志、界面文案用中文。
- 模块用大驼峰全局对象；私有成员前缀 `_`；CSS 类前缀 `zhihu-remark-`。
- DOM 用 `textContent` / `Utils.createElement()`；拼 HTML 前必须转义。
- 用户可见错误写清「发生了什么 + 怎么办」；日志不打印 API Key 或完整回答。
- `chrome.*` 用 Promise 形式；消息监听异步响应要 `return true`。
- 入口脚本用 IIFE + `'use strict'`；内容脚本防重复初始化用 `window.__ZHIHU_REMARK_INITIALIZED__`。
- 不做与任务无关的格式化、重命名、文件搬迁，保持 diff 可审。

## 5. 高频陷阱

1. **思考与正文共用 `max_tokens`**：实测思考 2300~3500 tokens、正文约 800；给 4096 必然 `finish_reason=length`。预算固定为 `CONSTANTS.GENERATE_MAX_TOKENS`（16384），不暴露给用户。
2. **`reasoning_effort` 是这个通路的唯一思考开关**：`none` 关闭（1~3 秒）、`high` 开启（30~50 秒）。`temperature` 在思考模式下被官方静默忽略，传了没用。
3. **截断不重试**：这是预算问题，确定性失败，重试只会再烧一遍思考 token。
4. **知乎是 SPA 且 DOM 会变**：注入要覆盖首次加载、站内跳转、滚动加载、展开全文；选择器保留多策略 fallback。
5. **样式只有一份**：`src/content/style.css`，由 manifest 注入。不要在 JS 里再写内联样式（v2.0 之前有两份，已经漂移过）。
6. **Service Worker 随时被回收**：会话状态不要放后台内存，放 `chrome.storage.local` 或内容脚本。
7. **卡片缓存按回答维度**：`Injector._panelCache` 存 `{ state, cachedAt }`，关闭可恢复；点「填入评论框」后清除。改 key 逻辑要同步清理。
8. **内容脚本只匹配** `www.zhihu.com/*` 和 `zhuanlan.zhihu.com/p/*`；扩页面必须改 manifest 并实测。

## 6. 文档

只有两份文档需要跟着代码改，其余不用管：

| 改了什么 | 更新哪里 |
|---|---|
| `src/**` 任何逻辑 | `docs/TECH_DESIGN.md` 对应章节 |
| `src/shared/prompts.js` | `docs/PROMPT_DESIGN.md` + 跑 §2 的测试 |
| 版本号 / 发版 | `docs/ROADMAP.md` 变更日志 |

确实无需更新时，在回复末尾用一行说明，如 `> 文档无需更新：纯内部重构，对外无变化。`

| 需要了解 | 读 |
|---|---|
| 架构、数据流、消息协议、存储、AI 调用、错误处理 | `docs/TECH_DESIGN.md` |
| Prompt 怎么写、怎么调、golden 集 | `docs/PROMPT_DESIGN.md` |
| 安装、使用、设置、常见问题 | `docs/USER_GUIDE.md` |
| 阶段规划与变更日志 | `docs/ROADMAP.md` |
| 历史 plan（只读，不要修改） | `.kimi/plans/` |

## 7. Git 与版本

- Conventional Commits，subject 用中文：`feat(panel): …`、`fix(api): …`、`test(prompt): …`。
- 一次提交一件事；不提交 zip/crx、密钥、`.env`、`.kimi/active/`；未经要求不 push、不改写历史。
- 版本以 `manifest.json` 为准；发版时 bump 版本并在 `docs/ROADMAP.md` 加带日期的条目。
- 打包只含 `manifest.json`、`src/`、`assets/`（排除 `docs/`、`tests/`、`assets/source/`）；产物不提交。

## 8. 当前状态（2026-10-28）

v2.0 重构在 `refactor/v2` 分支上，`main` 停在 `v1.1.2`：

- ✅ B1 生成链路：纯文本 + `reasoning_effort` + 16384 预算，Prompt 从 388 行降到约 730 字符
- ✅ B2 面板：19 个可点元素 → 3 个（填入评论框 / 换个说法 / 关闭）
- ✅ Prompt 回归网：`tests/prompt/`
- ✅ B3 设置页：主界面 4 项（API Key / 模型 / 深度思考 / 历史），其余进「高级设置」；配置 schema v4；popup 与反馈链路已删
- ✅ B4 样式单真源（865 → 323 行）、内容脚本入口 621 → 53 行、`manifest` 升 2.0.0
- ⏳ 真机回归：B3 + B4 合并后尚未在 Chrome 里跑过
