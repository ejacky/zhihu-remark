# 计划：支持最新模型版本 + 重新生成功能 + 文档完善

## 背景

用户要求实现两个功能并完善相关文档：
1. 支持各个 AI 提供商的最新模型版本
2. 支持重新生成反驳内容（用户对生成结果不满意时可重新生成）

## 现状分析

### 模型版本问题
- `src/shared/constants.js` 中的 `PROVIDER_DEFAULTS` 模型列表与 `src/options/index.html` 中的静态 `<option>` 不同步
- HTML 中已有一些较新模型（如 GPT-5.5、GPT-5.4 Pro），但 constants.js 中没有
- 切换提供商时，JS 逻辑只同步第一个默认模型，但下拉框里始终显示所有静态选项（包括其他提供商的模型）
- 理想做法：用 JS 动态生成模型下拉框选项，按提供商分组

### 重新生成问题
- 当前分析面板只有"使用此反驳"和"关闭"两个操作
- 用户若对生成结果不满意，只能关闭面板重新点击"生成反驳"按钮
- 需要：在面板中添加"重新生成"按钮，点击后调用相同 API 但附带"请换一个角度重新生成"的提示

## 实施方案

### 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/shared/constants.js` | 修改 | 更新 `PROVIDER_DEFAULTS` 中各提供商的最新模型列表 |
| `src/options/index.html` | 修改 | 将模型 `<select>` 改为空容器，由 JS 动态填充 |
| `src/options/index.js` | 修改 | 添加 `renderModelSelect()` 函数，根据当前提供商动态生成模型选项；保存时正确读取模型值 |
| `src/content/ui.js` | 修改 | `createAnalysisPanel` 新增 `onRegenerate` 回调参数和"🔄 重新生成"按钮 |
| `src/content/injector.js` | 修改 | `_handleGenerateClick` 重构为支持首次生成和重新生成；重新生成时在 userPrompt 中加入换角度提示 |
| `src/content/style.css` | 修改 | 添加重新生成按钮样式（与"使用此反驳"并排，次要按钮样式） |
| `src/background/api.js` | 修改 | `_callOpenAICompatible` / `_callAnthropic` 支持接收可选的 `regenerateHint` 参数，附加到 userPrompt |
| `src/background/index.js` | 修改 | `handleGenerateRebuttal` 透传 `regenerateHint` 参数 |
| `docs/PRD.md` | 修改 | 新增 FR-012（最新模型支持）、FR-013（重新生成） |
| `docs/TECH_DESIGN.md` | 修改 | 更新 API 设计章节（模型配置动态化、重新生成消息协议） |
| `docs/ROADMAP.md` | 修改 | Phase 4 中两项标记为已完成 |
| `docs/USER_GUIDE.md` | 修改 | 添加重新生成使用说明、更新模型推荐列表 |

### 详细设计

#### 1. 模型下拉框动态化

**constants.js** 更新后的 `PROVIDER_DEFAULTS`：
```js
PROVIDER_DEFAULTS: {
  openai: {
    apiBase: 'https://api.openai.com/v1',
    models: ['gpt-5.5', 'gpt-5.4-pro', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  anthropic: {
    apiBase: 'https://api.anthropic.com/v1',
    models: ['claude-4-opus-20250514', 'claude-4-sonnet-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']
  },
  deepseek: {
    apiBase: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner']
  },
  kimi: {
    apiBase: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.6', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k']
  },
  custom: {
    apiBase: '',
    models: []
  }
}
```

**options/index.html**：`<select id="model">` 改为 `<select id="model"></select>`（移除静态 `<option>` 和 `<optgroup>`）

**options/index.js**：
- 新增 `renderModelSelect(provider, currentModel)` 函数，根据 `CONSTANTS.PROVIDER_DEFAULTS[provider].models` 生成 `<option>`
- 自定义 API 时显示为文本输入框（因为模型名不确定），其他提供商显示下拉框
- 提供商切换时调用 `renderModelSelect`
- `populateForm` 和提供商 change 事件中使用新函数

#### 2. 重新生成反驳

**数据流**：
```
用户点击"重新生成"
  → UI 面板进入 loading 状态（按钮 disabled + spinner）
  → injector._sendGenerateMessage(content, { regenerate: true, previousResult: result })
  → background: handleGenerateRebuttal 在 userPrompt 中附加 "请换一个角度/换一种表达方式重新生成"
  → AI 返回新结果
  → 更新面板内容（保持面板打开，替换分析摘要和按钮区域）
```

**具体改动**：

- `background/index.js`：`handleGenerateRebuttal` 读取 `data.regenerateHint`，透传给 `API.generateRebuttal`
- `background/api.js`：`generateRebuttal` 和各 `_callXxx` 方法支持 `regenerateHint` 参数，在构建 userPrompt 时附加提示
- `content/ui.js`：`createAnalysisPanel(analysisData, onUse, onDismiss, onRegenerate)`：
  - 添加 "🔄 重新生成" 按钮（次要样式，位于"使用此反驳"左侧）
  - 按钮点击时调用 `onRegenerate()`
  - 面板保持打开，由 injector 负责更新内容
- `content/injector.js`：
  - `_handleGenerateClick` 提取核心生成逻辑到 `_doGenerate(content, options)`
  - 首次生成：正常流程
  - 重新生成：调用 `_doGenerate(content, { regenerate: true })`
  - 重新生成时，面板显示 loading 状态（通过 `updateText` 或创建新 loading）
  - 收到新结果后：移除旧面板，创建新面板

**重新生成提示词**（附加在 userPrompt 末尾）：
```
（这是重新生成请求。请换一个角度、换一种表达方式重新生成反驳内容，避免与之前的版本雷同。）
```

#### 3. 样式

添加 `.zhihu-remark-btn--secondary` 样式：
- 背景白色、边框蓝色、文字蓝色
- hover 时背景浅蓝
- 与主按钮并排，间距 8px

### 验收标准

- [ ] Options 页面切换提供商时，模型下拉框只显示该提供商的模型
- [ ] 自定义 API 时模型输入变为文本框
- [ ] 保存配置后再次打开，模型选择正确恢复
- [ ] 分析面板显示"重新生成"按钮
- [ ] 点击"重新生成"后保持面板打开，展示新的分析结果
- [ ] 重新生成的内容与首次生成不同（通过 prompt 引导 AI）
- [ ] 重新生成失败时显示错误通知
- [ ] 四份文档均已更新相应章节
