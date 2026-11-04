# 技术设计

> 只写仍然成立的东西。历史决策与踩坑记录在 `docs/PROMPT_DESIGN.md` 和 git 历史里。

## 1. 架构概览

### 1.1 三个运行上下文

```
知乎页面 (content script)          Service Worker (background)        设置页 (options)
  Extractor  取正文                  路由消息                          读写配置
  Injector   注入按钮/填评论框   ──►  Storage 配置+历史（chrome.storage.local）
  UI         卡片与通知               API     调模型（fetch，直连服务商）
```

- **content**：拿不到 `chrome.storage` 的便利接口，配置一律经消息向 background 要。
- **background**：可能随时被回收（30s idle），因此不保存会话状态；一次生成用一条消息承载。
- **options**：普通页面，只做配置读写，不参与生成。点扩展图标由 `chrome.action.onClicked` 直接打开它（**无 popup**）。

### 1.2 技术约束

- 纯原生 ES2020，**无 npm、无构建、无模块系统**：模块是全局 `const Foo = {...}`，靠加载顺序共享。
- 唯一自动化测试是 `tests/prompt/`（纯函数，`node tests/prompt/rules.test.mjs`）。
- 不引第三方依赖、不加载远程脚本。

## 2. 模块与加载顺序

### 2.1 加载顺序（三处登记）

新增共享模块必须同时登记三处，且依赖排在使用者之前：

1. `manifest.json` → `content_scripts[0].js`
2. `src/background/index.js` → `importScripts(...)`
3. `src/options/index.html` → `<script>`

内容脚本顺序：`constants → utils → prompts → extractor → ui → injector → index`
后台顺序：`constants → utils → permissions → opencode → prompts → storage → api → index`

漏登记的典型症状是运行时 `X is not defined`；漏一处不会报错到编译期。

### 2.2 模块职责

| 模块 | 职责 | 全局对象 |
|---|---|---|
| `shared/constants.js` | 默认配置、提供商默认地址与模型建议、错误类型、重试与预算常量、配置迁移表 | `CONSTANTS` |
| `shared/utils.js` | DOM 构造、截断、JSON 提取、剪贴板、日期 | `Utils` |
| `shared/permissions.js` | API Base 规范化、origin 解析、域名授权申请与校验 | `HostAccess` |
| `shared/opencode.js` | OpenCode Go / Zen 网关的会话标识派生 | `OpenCode` |
| `shared/prompts.js` | 系统提示词、用户提示词、重写提示 | `Prompts` |
| `background/storage.js` | 配置读写与迁移、历史增删 | `Storage` |
| `background/api.js` | 请求构造、响应解析、失败分类与重试 | `API` |
| `background/index.js` | 消息路由 | — |
| `options/models.js` | 设置页模型列表端点、鉴权头、响应解析与本地缓存 | `ModelCatalog` |
| `content/extractor.js` | 多策略提取正文/标题/作者 | `Extractor` |
| `content/injector.js` | 注入按钮、观察 DOM、填充评论框、卡片缓存 | `Injector` |
| `content/ui.js` | 卡片、通知 | `UI` |

### 2.3 内容提取

三级策略，按页面结构依次尝试：新版 DOM → 旧版 DOM → 通用容器。任一级命中即返回；全失败时提示「未能提取到有效回答内容」。

提取结果参与缓存键：`url | 作者 | 正文前 300 字`，因此同页多条回答互不干扰。

### 2.4 卡片与交互

```js
UI.createPanel({ state, cachedAt, onRegenerate, onUse, onDismiss })
//   state = { rebuttal, loading, error, style }
//   返回 { element, update(state), getState(), remove() }
```

三种状态各自只渲染必要元素：生成中（计时 + 关闭）、成功（正文 + 填入评论框 + 换个说法 + 关闭）、失败（原因 + 重试 + 关闭）。**不要往卡片里加结构化字段**——错误类型、置信度、分析摘要都曾在这里，用户实际从不用。

拖动与 Esc 关闭都注册在 document 上，`closePanel()` 里统一解绑；计时器同样在关闭/重渲染时清除。

### 2.5 后台与消息处理

`background/index.js` 只做路由，所有监听器在顶层注册（Service Worker 可被唤醒）。异步响应必须 `return true`，否则消息通道会提前关闭。

## 3. 数据流

### 3.1 生成一次

```
点击按钮
  → Extractor 取正文（<30 字直接报错）
  → 命中 Injector._panelCache？→ 直接恢复卡片，不发请求
  → 卡片进入 loading（同时开始计时）
  → 消息 GENERATE_REBUTTAL { content, style, regenerateHint }
  → Storage.getConfig()（读时按版本迁移）
  → Prompts 拼 system + user
  → POST {apiBase}/chat/completions
  → 取 content（忽略 reasoning_content）→ _wrapRebuttal 包成
    { analysis:{hasErrors:true,errorTypes:[],summary:''}, errors:[], rebuttal, confidence:'' }
  → 写历史（enableHistory 时）→ 回传 content script
  → 卡片渲染正文
  → 用户点「填入评论框」→ 清缓存；点「关闭」→ 存 { state, cachedAt }
```

`analysis` / `errors` / `confidence` 是给旧面板留的空壳，B3 之后可一并删除。

### 3.2 配置读取与迁移

`Storage.getConfig()`：读出 → 按 `CONFIG_SCHEMA_VERSION` 逐级迁移 → 与 `DEFAULT_CONFIG` 深度合并 → 迁移过则回写。回写失败只 warn，不影响本次读取。

## 4. 接口

### 4.1 内部消息协议

| 类型 | 方向 | 载荷 |
|---|---|---|
| `GENERATE_REBUTTAL` | content → bg | `{ content, style, regenerateHint }` |
| `GET_CONFIG` / `SET_CONFIG` | 页面 ↔ bg | 配置对象 |
| `GET_HISTORY` / `CLEAR_HISTORY` | 页面 → bg | `{ limit }` |
| `SHOW_NOTIFICATION` | bg → content | `{ message, type }`（暂无发送方） |

消息类型全部走 `CONSTANTS.MESSAGE_TYPES`，不要写裸字符串。

### 4.2 外部 AI API

OpenAI 兼容通路（OpenAI / DeepSeek / Kimi / 自定义）：

```
POST {apiBase}/chat/completions
{
  "model": "<用户配置>",
  "messages": [{ "role": "system", ... }, { "role": "user", ... }],
  "max_tokens": 16384,
  "reasoning_effort": "high"      // 关闭深度思考时为 "none"
}
```

| 决策 | 原因 |
|---|---|
| 不用 `response_format` | JSON 模式会压平段落与对账式论证：同一篇实测「开 JSON = 1 段、被压成概述」「关 JSON = 6 段、逐条对账」 |
| 不传 `temperature` | 思考模式下官方静默忽略，传了不生效 |
| `max_tokens` 16384 | 思考与正文共用 completion 预算：实测思考 2300~3500 + 正文约 800，给 4096 必然 `finish_reason=length` |
| 只取 `content` | `reasoning_content` 是思考过程，不作为输出 |

Claude 走 `_callAnthropic`（`/v1/messages`，取 `content` 数组里的 `text` 块），仍为旧的结构化路径，尚未迁移。

OpenCode Go 作为 `opencode-go` 提供商走同一条 OpenAI 兼容通路：Base URL 为 `https://opencode.ai/inference/go/openai/v1`，由 §4.3 自动附加会话头；模型列表见 §4.4。

### 4.3 OpenCode 网关会话

`apiBase` 命中 `opencode.ai` 时自动附带 `x-opencode-session`（按「回答」维度派生，确定性、无需持久化）。客户端标识由浏览器自带的 User-Agent 提供，扩展不额外伪造 `x-opencode-client`。

网关对 DeepSeek 专有参数是白名单转发：`thinking` 与 `reasoning_effort` 会被校验（非法值返回 422），超出官方文档的枚举值（如 `adaptive`）不要使用。

### 4.4 模型列表同步

设置页的「同步模型」按提供商请求模型列表，结果按提供商缓存（§5.3）；内置列表只作离线兜底，不再把模型 ID 写死在 UI 里。

| 提供商 | 端点 | 鉴权 |
|---|---|---|
| OpenCode Go | `https://opencode.ai/inference/go/v1/models` | 无（公开接口） |
| OpenCode Console / Zen（自定义地址命中 `opencode.ai`） | `https://opencode.ai/inference/v1/models` | 无 |
| OpenAI / DeepSeek / Kimi | `{apiBase}/models` | `Authorization: Bearer <Key>` |
| Claude | `{apiBase}/models?limit=1000` | `x-api-key` + `anthropic-version` |
| 自定义（非 OpenCode） | `{base}/models` | Bearer，尽力而为；没有该端点时提示手填 |

请求从设置页直接发出，不经过 background；`opencode.ai` 不在 `host_permissions` 里，首次同步 / 保存时用 `chrome.permissions.request()` 申请 `https://opencode.ai/*`（§6.3）。OpenCode 的公开端点不发送 API Key。

响应统一解析成 `[{ id, name }]`：兼容 `{ data: [...] }`、纯数组、`{ models: [...] }`，按 id 去重，最多 500 条。失败按 HTTP 状态翻译成中文提示（401/403 Key 无效、404 无端点、429 太频繁、5xx 暂时不可用），同步失败不清空已有列表。

## 5. 存储

### 5.1 数据模型

```jsonc
// zhihu_remark_config（schema v4：8 个字段，没有别的）
{
  "configVersion": 4,
  "provider": "deepseek",          // 高级项
  "apiKey": "",
  "apiBase": "",                   // 高级项，留空用内置地址
  "model": "deepseek-v4-pro",
  "thinking": true,                // 深度思考开关
  "style": "gentle",               // 高级项：gentle | direct | academic | natural
  "enableHistory": true,
  "customPromptSuffix": ""         // 高级项
}
```

v4 删掉了 `errorTypes` / `features` / `strictness` / `temperature` / `maxTokens`——面板与 Prompt 都不再需要它们；`features.enableHistory` 提到顶层。

同步到的模型列表不写进配置对象，单独存 `zhihu_remark_model_catalog`（§5.3），因此本次改动不升 `CONFIG_SCHEMA_VERSION`。

```jsonc
// zhihu_remark_history —— 数组，最多 10 条，倒序
{ "id": "...", "timestamp": 1715500000000, "questionTitle": "...", "author": "...",
  "url": "...", "rebuttal": "..." }
```

### 5.2 存储策略

- 只用 `chrome.storage.local`（约 5~10MB），**不随 Chrome 账户同步**，卸载即丢。
- 历史固定 10 条，写入时截断；不存在分页。
- **配置迁移**：结构变更时 `CONSTANTS.CONFIG_SCHEMA_VERSION` +1，并在 `CONFIG_MIGRATIONS` 补一条 `源版本 → 下一版本` 的函数。无版本号的旧数据视为 v1；版本比当前新（用户回退过扩展）按当前版本归一。迁移函数必须幂等、只做补齐/改名/换结构。

### 5.3 模型目录缓存

```jsonc
// zhihu_remark_model_catalog —— 按 provider 分组的同步结果
{
  "version": 1,
  "providers": {
    "opencode-go": {
      "models": [{ "id": "deepseek-v4.1-flash", "name": "DeepSeek V4.1 Flash" }],
      "fetchedAt": 1730600000000
    }
  }
}
```

- 只存模型 ID / 显示名 / 同步时间，**不存 API Key**、不存请求头。
- 每个 provider 最多 500 条（`ModelCatalog.MAX_MODELS`）；读取失败或结构不合法时回退到 `PROVIDER_DEFAULTS[provider].models`（目前只有 OpenCode Go 有公开快照）。
- 缓存不是配置的一部分，清空配置或迁移配置都不动它；用户重新点「同步模型」即刷新。

## 6. 安全

### 6.1 API Key

只存 `chrome.storage.local`，只在 background 的请求头里出现；日志与错误文案不得打印 Key。设置页读取后按 `sk-****` 掩码展示。

### 6.2 内容安全

- 生成的是**草稿**，永不自动发布。
- 正文一律 `textContent` 渲染；`innerHTML` 只用于不含用户数据的静态模板。
- 模型返回的内容不做 HTML 解释。

### 6.3 权限与域名授权

| 权限 | 用途 |
|---|---|
| `storage` | 配置、历史与模型目录缓存 |
| `host_permissions`：`www.zhihu.com`、4 个内置 API 域（OpenAI / Anthropic / DeepSeek / Kimi） | 注入与直连 |
| `optional_host_permissions`：`https://*/*`、`http://localhost/*`、`http://127.0.0.1/*` | 用户自定义地址、以及 OpenCode Go 的 `https://opencode.ai/*`，按域名申请 |

OpenCode Go 不写进 `host_permissions`，以免安装提示多一条权限；保存配置或点「同步模型」时在用户手势的同步帧内申请 `https://opencode.ai/*`。该域名的 `/models` 是公开接口，同步时不发送 Key。

自定义域名必须在用户点击「保存」的同一调用帧内 `chrome.permissions.request()`，先 `await` 再申请会被浏览器拒绝；「同步模型」同理。

## 7. 错误处理

### 7.1 失败分类

| kind | 触发 | 重试 |
|---|---|---|
| `network` | fetch 抛错 / 超时 | ✅ |
| `http` | 4xx/5xx（鉴权、额度除外） | 视状态码 |
| `param` | 400/422 且报文提到参数问题 | ✅ 一次 |
| `gateway` | 200 但响应体带 `error` / 无 `choices` | ✅ |
| `empty` | 200 且正文为空 | ❌ |
| `format` | 有正文但解析失败 | ❌ |
| `length` | `finish_reason=length`（含"只输出了思考"） | ❌ 确定性失败 |
| `filter` | 内容被安全策略拦截 | ❌ |

### 7.2 重试策略

`_withRetry()` 只重试 `retryable` 的失败；OpenAI 通路上限 **2 次**（思考模式单次 30~50 秒，次数必须收紧）。退避 800ms / 2000ms，带 ±20% 抖动。

### 7.3 用户可见提示

错误文案要写清「发生了什么 + 怎么办」，例：`API 错误 (401)：Key 无效，请到设置页重新填写`。不要透出英文内部错误（如 `The message port closed...`）。

## 8. 已知限制

- Service Worker 被回收时进行中的请求会断，用户看到的是失败 + 重试，不是静默卡住。
- 思考模式偶发不触发（`reasoning_tokens=0` 时 8 秒出稿），质量会明显下降；目前只在测试脚本里识别，产品侧未处理。
- Claude / 自定义通路仍是旧的 JSON 结构路径，与主链路不一致。
