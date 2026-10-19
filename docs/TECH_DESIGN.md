# 知乎反驳助手 - 技术设计文档

> 版本：v1.0.0  
> 更新日期：2026-05-11

---

## 1. 架构概览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      知乎网页 (zhihu.com)                      │
│  ┌─────────────────┐                                        │
│  │   Content Script │ ← 注入按钮、提取内容、操作评论框        │
│  │  (src/content/)  │                                        │
│  └────────┬────────┘                                        │
│           │ Chrome Extension Messaging API                  │
│           ↓                                                  │
│  ┌─────────────────┐                                        │
│  │ Service Worker   │ ← 调用 AI API、管理配置和历史          │
│  │ (src/background/)│                                        │
│  └────────┬────────┘                                        │
│           │ HTTPS                                             │
│           ↓                                                  │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │  DeepSeek API    │     │  Kimi API        │               │
│  │(api.deepseek.com)│     │(api.moonshot.cn) │               │
│  │   OpenAI API     │     │  Claude API      │               │
│  │  (api.openai.com)│     │(api.anthropic.com)│              │
│  └─────────────────┘     └─────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端注入 | Vanilla JS + CSS | 无框架依赖，轻量级 |
| 后台逻辑 | Vanilla JS | Service Worker |
| 配置页面 | HTML + CSS + JS | 原生实现 |
| 存储 | chrome.storage.local | 本地持久化 |
| AI API | REST API | DeepSeek / Kimi / OpenAI / Claude / 自定义 |

---

## 2. 模块设计

### 2.1 模块依赖图

```
manifest.json
├── content_scripts
│   ├── constants.js      (共享常量)
│   ├── utils.js          (工具函数)
│   ├── prompts.js        (Prompt模板)
│   ├── extractor.js      (内容提取)
│   ├── ui.js             (UI组件)
│   ├── injector.js       (按钮注入)
│   ├── index.js          (主入口)
│   └── style.css         (样式)
├── background
│   ├── constants.js      (共享常量)
│   ├── utils.js          (工具函数)
│   ├── permissions.js    (API 域名权限)
│   ├── opencode.js       (Go/Zen 网关适配)
│   ├── prompts.js        (Prompt模板)
│   ├── storage.js        (存储管理)
│   ├── api.js            (API封装)
│   └── index.js          (主入口)
├── popup
│   ├── index.html
│   ├── style.css
│   └── index.js
└── options
    ├── constants.js      (共享常量)
    ├── permissions.js    (API 域名权限)
    ├── prompts.js        (Prompt模板)
    ├── index.html
    ├── style.css
    └── index.js
```

### 2.2 核心模块职责

#### Content Scripts（内容脚本）
运行在知乎页面上下文中，负责：
- **DOM 监听**：通过 MutationObserver 监听新回答加载
- **按钮注入**：在评论操作栏添加"生成反驳"按钮
- **内容提取**：从知乎 DOM 中提取回答内容
- **UI 渲染**：通知提示、分析面板、加载状态
- **评论框操作**：自动展开评论区、填充文本

#### Service Worker（后台脚本）
运行在独立上下文中，负责：
- **消息路由**：接收来自 content script 的消息
- **API 调用**：向 AI 服务发送请求
- **配置管理**：读写用户设置
- **历史记录**：保存和查询生成记录

### 2.3 共享模块（src/shared/）

| 模块 | 职责 | 使用方 |
|------|------|--------|
| `constants.js` | 存储键、默认配置、提供商默认地址与模型建议列表（仅作默认值与输入建议，可被用户配置覆盖）、风格/错误类型/严格程度定义、消息类型 | content / background / popup / options |
| `utils.js` | 防抖节流、DOM 元素构造、JSON 提取、剪贴板、日期格式化 | content / background |
| `permissions.js` | API 域名权限：apiBase 规范化与有效性校验、origin 解析、可申请范围判定、`chrome.permissions` 查询与申请 | background / options |
| `opencode.js` | OpenCode Go / Zen 网关适配：端点识别、`x-opencode-session` 会话标识派生 | background |
| `prompts.js` | System / User Prompt 构建、重新生成提示、动态指令与 Few-shot 示例 | background / options |

---

## 3. 数据流设计

### 3.1 生成反驳流程

```
用户点击"生成反驳"按钮
    │
    ▼
[injector.js] 调用 _handleGenerateClick()
    │
    ├── 显示加载状态 (UI.createLoading)
    │
    ├── [extractor.js] 提取回答内容
    │   ├── 标题、作者、正文、赞同数、URL
    │   └── 多策略 fallback（新版/旧版/通用）
    │
    ├── 发送消息到 Service Worker
    │   ├── 类型: GENERATE_REBUTTAL
    │   └── 数据: { content }
    │
    ▼
[background/index.js] handleGenerateRebuttal()
    │
    ├── [storage.js] 读取用户配置
    │   ├── API Key、提供商、模型
    │   ├── 风格、错误类型过滤
    │   └── 功能开关
    │
    ├── [api.js] generateRebuttal()
    │   ├── 构建 System Prompt (prompts.js)
    │   │   ├── 基础 System Prompt
    │   │   ├── 动态指令（根据问题类型/回答长度/领域关键词）
    │   │   ├── Few-shot 示例
    │   │   └── 用户自定义 Prompt 后缀
    │   ├── 构建 User Prompt (prompts.js)
    │   │   ├── 注入当前日期（北京时间，供时效判断）
    │   │   ├── 回答信息（标题/作者/赞同数/链接）
    │   │   └── 回答正文（超长时截断）
    │   ├── 截断超长内容
    │   ├── 调用 AI API (fetch)
    │   └── 解析 JSON 响应
    │
    ├── [storage.js] 保存到历史记录
    │
    └── 返回结果 { analysis, errors, rebuttal, confidence, historyId }
    │
    ▼
[injector.js] 接收响应
    │
    ├── 隐藏加载状态
    │
    ├── [ui.js] 显示分析面板
    │   ├── 错误类型标签
    │   ├── 置信度标识
    │   ├── 错误详情卡片（原文 / 纠正）
    │   ├── 分析摘要
    │   ├── 生成的反驳预览（支持复制）
    │   ├── 优化区（可折叠）：自定义要求输入框 + 快捷反馈标签
    │   ├── 核心意图摘要（自动归纳多次自定义要求，可手动修改）
    │   ├── 操作按钮（👍 有用 / 重新生成 / 使用此反驳 / 关闭）
    │   └── 交互：按住标题栏可拖动面板；按 Esc 或点击右上角 ✕ 关闭面板
    │       关闭时面板状态（生成结果、当前风格、自定义要求历史、核心意图）
    │       会按回答 ID 缓存到 Injector._panelCache 中
    │
    ├── 用户再次点击同一回答的"生成反驳"按钮
    │   └── 优先从 _panelCache 恢复面板状态，不重新调用 AI
    │       （若已点击"使用此反驳"，则缓存会被清除）
    │
    ├── 用户在优化区点击快捷反馈标签或 👍 有用
    │   └── 发送 UPDATE_FEEDBACK 消息 → [storage.js] 更新历史记录 feedback
    │
    ├── 用户点击"重新生成"
    │   ├── 记录本次自定义要求到风格级历史
    │   ├── 通过本地规则归纳多次要求，生成核心意图摘要
    │   ├── 优先使用用户手动确认过的核心意图摘要
    │   ├── 将固定 regenerateHint 与核心意图摘要拼接
    │   └── 发送 GENERATE_REBUTTAL 消息 → [background/index.js] 调用 AI
    │       （后台也会读取最近反馈构建 regenerateHint，作为 fallback）
    │
    └── 用户点击"使用此反驳"
        ├── 填充评论框
        │   ├── 展开评论区
        │   ├── 写入富文本编辑器
        │   └── 触发输入事件
        └── 清除该回答的面板状态缓存
```

### 3.2 配置更新流程

```
用户修改设置
    │
    ▼
[options/index.js] 点击保存
    │
    ├── collectFormData() 收集表单
    │
    ├── 验证 API Key
    │
    └── 发送消息 SET_CONFIG
        │
        ▼
    [storage.js] setConfig()
        ├── 合并默认配置
        └── chrome.storage.local.set()
```

---

## 4. API 设计

### 4.1 内部消息协议

Content Script ↔ Service Worker 通信：

| 消息类型 | 方向 | 参数 | 响应 |
|----------|------|------|------|
| GENERATE_REBUTTAL | C→B | `{ content, regenerateHint?, style? }` | `{ success, data: { analysis, errors, rebuttal, confidence, historyId }/error }` |
| GET_CONFIG | C→B / P→B / O→B | - | `{ success, data: config }` |
| SET_CONFIG | P→B / O→B | `config` | `{ success, data: config }` |
| GET_HISTORY | P→B / O→B | `{ limit? }` | `{ success, data: history[] }` |
| CLEAR_HISTORY | O→B | - | `{ success }` |
| UPDATE_FEEDBACK | C→B | `{ historyId, feedback: { type, reason?, customReason? } }` | `{ success, data: historyItem/error }` |
| SHOW_NOTIFICATION | B→C | `{ message, type }` | `{ received }` |

### 4.2 外部 AI API

> **地址与模型由配置决定**：下面各提供商的 URL 与模型名只是内置默认值。
> `config.apiBase` / `config.model` 一旦填写就优先使用（对所有提供商生效），
> `apiBase` 留空时才回退到 `PROVIDER_DEFAULTS[provider].apiBase`。
> 因此官方换域名、模型改名或走代理 / 镜像时，用户在设置页就地修改即可，无需等扩展发版。

#### DeepSeek Chat Completions（OpenAI 兼容）
```
POST https://api.deepseek.com/v1/chat/completions
Headers:
  Authorization: Bearer {apiKey}
  Content-Type: application/json
Body:
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "response_format": { "type": "json_object" }
}
```

#### Kimi Chat Completions（OpenAI 兼容）
```
POST https://api.moonshot.cn/v1/chat/completions
Headers:
  Authorization: Bearer {apiKey}
  Content-Type: application/json
Body:
{
  "model": "moonshot-v1-8k",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "response_format": { "type": "json_object" }
}
```

#### OpenAI Chat Completions
```
POST https://api.openai.com/v1/chat/completions
Headers:
  Authorization: Bearer {apiKey}
  Content-Type: application/json
Body:
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "response_format": { "type": "json_object" }
}
```

#### Claude Messages
```
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: {apiKey}
  anthropic-version: 2023-06-01
  Content-Type: application/json
Body:
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 2048,
  "system": "...",
  "messages": [{ "role": "user", "content": "..." }]
}
```

#### OpenCode Go / Zen（OpenAI 兼容）

Go 与 Zen 要求每个请求携带稳定的 `x-opencode-session`（用于路由亲和与 prompt 缓存），
缺失时网关会在进入模型前直接返回 `400 Request is missing x-opencode-session`。
`shared/opencode.js` 负责端点识别与会话标识派生，`background/api.js` 在发请求前自动附带该头，
用户无需手动配置。

会话标识按「回答」维度派生（`URL + 作者 + 正文前 300 字` → SHA-256 → UUID v4 形状），
因此同一回答的首次生成、重新生成、切换风格复用同一标识，不同回答之间互相隔离；
派生是确定性的，Service Worker 重启后依然稳定，无需持久化状态。

```
POST https://opencode.ai/zen/go/v1/chat/completions
Headers:
  Authorization: Bearer {apiKey}
  Content-Type: application/json
  x-opencode-session: {由当前回答派生，自动附带}
Body:
{
  "model": "kimi-k2.6",
  "messages": [ ... ],
  "temperature": 0.7,
  "max_tokens": 3072
}
```

> 注意：Go 的部分模型（Grok 4.x、GPT Luna、Qwen3.x、MiniMax、Claude Haiku 等）走
> `/v1/responses` 或 `/v1/messages` 端点，本扩展目前只支持 OpenAI 兼容的 `/chat/completions` 类模型。
> 完整模型与端点对照见官方文档的 Endpoints 一节。
>
> 另：Go 文档建议客户端用自己的 User-Agent 标识自身。Chrome 不允许 `fetch` 设置 `User-Agent`
> （属 forbidden request header），若网关后续强制校验该头，需要额外申请 `declarativeNetRequest`
> 权限并通过 `modifyHeaders` 规则改写。

### 4.3 AI 响应格式

```typescript
interface AIResponse {
  analysis: {
    hasErrors: boolean;      // 是否发现错误
    errorTypes: string[];    // 错误类型列表
    summary: string;         // 分析摘要
  };
  errors: Array<{
    type: string;            // 错误类型
    location: string;        // 错误位置
    originalClaim: string;   // 原文陈述
    correction: string;      // 正确信息
    explanation: string;     // 解释说明
  }>;
  rebuttal: string;          // 反驳评论正文
  confidence: 'high' | 'medium' | 'low';
}
```

---

## 5. 存储设计

### 5.1 数据模型

#### 配置 (zhihu_remark_config)
```json
{
  "provider": "deepseek",
  "apiKey": "sk-...",
  "apiBase": "",
  "model": "deepseek-v4-pro",
  "temperature": 0.7,
  "maxTokens": 3072,
  "style": "gentle",
  "errorTypes": {
    "factError": true,
    "logicFallacy": true,
    "historicalNihilism": true,
    "dataFraud": true,
    "scienceError": true,
    "argumentIncomplete": true
  },
  "features": {
    "showAnalysis": true,
    "autoFill": true,
    "showSource": true,
    "enableHistory": true,
    "enableCompletenessCheck": true
  },
  "strictness": "standard",
  "customPromptSuffix": ""
}
```

> `apiBase` 对**所有**提供商都可填写（含内置提供商），用于覆盖官方地址（代理 / 镜像 / 本地网关 / 换域名）；
> 留空表示沿用 `PROVIDER_DEFAULTS[provider].apiBase`。保存时会规范化为「含协议、无末尾斜杠」的形式（见 7.3）。
> `model` 为自由文本，`PROVIDER_DEFAULTS[provider].models` 仅作为设置页的输入建议（datalist）。

#### 历史记录项 (zhihu_remark_history)
```json
{
  "id": "abc123",
  "timestamp": 1715500000000,
  "questionTitle": "为什么有人认为地球是平的？",
  "author": "示例用户",
  "url": "https://www.zhihu.com/question/...",
  "hasErrors": true,
  "errorTypes": ["factError", "logicFallacy"],
  "rebuttal": "关于地球形状的问题...",
  "confidence": "high",
  "feedback": {
    "type": "missedPoint",
    "reason": "",
    "timestamp": 1715500100000
  }
}
```

### 5.2 存储策略

- **chrome.storage.local**：所有数据本地存储，与 Chrome 用户账户同步
- **容量限制**：约 5-10MB，历史记录限制 10 条防止超限
- **隐私**：不上传到任何远程服务器

---

## 6. Prompt 工程规范

### 6.1 System Prompt 结构

```
角色定义 + 任务说明 + 语气要求 + 错误类型指南 + 动态检查指令 + Few-shot 示例 + 反驳原则 + 评论写作要求 + 输出格式约束 + 用户自定义后缀
```

### 6.2 User Prompt 结构

```
回答信息（标题/作者/赞同数/URL）+ 错误类型过滤 + 回答正文
```

### 6.3 输出格式

强制 JSON 输出，包含：
- `analysis`: 整体分析（hasErrors, errorTypes, summary）
- `errors`: 错误详情数组
- `rebuttal`: 反驳评论正文
- `confidence`: 置信度

### 6.4 长度控制

- 正文截断：> 6000 字符使用简化 Prompt
- 反驳长度：上限 500 字，**不设下限**（一句话能说清就一句话，禁止为凑长度注水）
- Max Tokens：默认 3072

---

## 7. 安全设计

### 7.1 API Key 安全
- 仅存储在 chrome.storage.local
- 输入框使用 password 类型
- 不上传到任何服务器

### 7.2 内容安全
- AI 生成内容必须经过用户审核
- 不自动发布任何评论
- Prompt 禁止生成人身攻击内容

### 7.3 网络安全
- 仅向用户配置的 API 端点发送请求
- 使用 HTTPS
- 不在请求中附带用户身份信息

#### 域名访问权限（host permission）
- **内置提供商**（OpenAI / Claude / DeepSeek / Kimi）的官方域名写入 `manifest.json` 的 `host_permissions`，安装即生效
- **自定义 API，以及内置提供商被手动改写为其它域名时**（代理 / 镜像 / 本地网关 / 官方换域名），新域名无法预先声明，改为运行时按需授权：
  - `manifest.json` 声明 `optional_host_permissions`：`https://*/*`、`http://localhost/*`、`http://127.0.0.1/*`（匹配模式忽略端口，因此本地任意端口均可覆盖）
  - `HostAccess.patternOf()` 生成模式时会**剔除 origin 里的端口**（`http://localhost:11434` → `http://localhost/*`）：Chrome 匹配模式以主机为粒度，而 `URL.origin` 带端口，直接拼接会产出 `http://localhost:11434/*` 这种 Chrome 可能拒收的形式
  - 用户在设置页点击"保存"时，`options/index.js` 先算出**实际生效的地址**（用户填写值，留空则取提供商内置地址），再在**用户手势的同一调用帧**内调用 `chrome.permissions.request()`；对已授权域名（含内置域名）静默通过，不重复弹窗。被拒绝时再用 `chrome.permissions.contains()` 复核一次（复核放在 `request()` 之后，不影响手势要求），仅当确实无权限才判定失败、不保存配置并给出可操作提示
  - 切换提供商时，若切回的是**当前已保存配置的提供商**，设置页会恢复其已保存的 `apiBase` / `model`；只有切到别的提供商才清空地址覆盖，避免"切出去看一眼再切回来"导致已保存的覆盖地址被静默清空
  - `background/api.js` 在每次请求前用 `chrome.permissions.contains()` 二次校验，未授权时直接抛出可读错误，避免出现难以理解的跨域报错
- API Base URL 统一由 `shared/permissions.js` 规范化：补全协议（含 `https:/x` 少写一个斜杠的手误）、去掉末尾斜杠；`localhost` / `127.0.0.1` 等本地地址默认按 `http` 处理（如 Ollama、LM Studio）
- 保存前的地址校验（`options/index.js`，全部为同步检查，不破坏权限申请的用户手势要求）：
  - 畸形地址（只有协议 `https://`、协议后多余斜杠或空查询 `https:///x`、非 http(s) 协议 `ftp://…`、主机名缺失或等于协议名的 `https://https`）由 `normalizeApiBase()` / `originOf()` 判为无效，设置页直接报错，不会把垃圾值存进配置（否则该提供商此后所有请求都会失败，且错误信息指向 `https://https` 这类无意义域名）
  - 误把完整端点填进 Base URL（以 `/chat/completions` 或 `/messages` 结尾）会被拦下并提示只填到 `/v1`
  - 明文 `http` 只有 `localhost` / `127.0.0.1` 在 `optional_host_permissions` 范围内，其它 `http` 域名（含内网 IP）由 `HostAccess.isRequestable()` 提前拦截，并提示改用 `https` 或本地地址，避免用户陷入「提示点允许 → 弹窗不出现 → 再次失败」的死循环
- `apiBase` 的语义是「留空即回退内置地址」，因此设置页**不会**把内置地址写进配置（保存的 `apiBase` 为空字符串时运行时才取默认值），用户也就能随时清空输入框回到官方地址

---

## 8. 错误处理

| 场景 | 处理方式 |
|------|----------|
| API Key 未配置 | 提示用户进入设置页面 |
| 自定义 API 域名（或内置提供商改写后的新域名）未授权 | 保存时提示重新授权（拒绝则不保存）；请求前二次校验，返回可操作提示 |
| API 调用失败 | 显示具体错误信息（HTTP 状态码 + 错误消息） |
| 内容提取失败 | 提示刷新页面，多策略 fallback |
| JSON 解析失败 | 提示"AI 返回格式错误"，记录原始内容 |
| 评论框填充失败 | 自动复制到剪贴板，提示手动粘贴 |
| 内容超长 | 自动截断，使用简化 Prompt |
| 知乎 DOM 更新 | 定期维护，多策略提取 |

---

## 9. 性能优化

- **防抖注入**：DOM 变化监听使用 500ms 防抖
- **内容缓存**：避免重复提取相同回答
- **请求去重**：同一回答短时间内不重复请求
- **懒加载**：历史记录分页加载
- **代码分割**：共享模块按需加载
