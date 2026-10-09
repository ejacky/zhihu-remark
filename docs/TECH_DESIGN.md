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
│   ├── prompts.js        (Prompt模板)
│   ├── storage.js        (存储管理)
│   ├── api.js            (API封装)
│   └── index.js          (主入口)
├── popup
│   ├── index.html
│   ├── style.css
│   └── index.js
└── options
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
  "maxTokens": 2048,
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

---

## 8. 错误处理

| 场景 | 处理方式 |
|------|----------|
| API Key 未配置 | 提示用户进入设置页面 |
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
