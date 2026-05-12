# 推荐页折叠回答检测与友好提示

## 问题分析

在知乎推荐页面（首页/热榜/关注 Feed 流），回答默认被折叠，只显示前几百字，末尾有"阅读全文"按钮。用户未点击"阅读全文"就点击"生成反驳"时：

1. Extractor 提取到的是**不完整的回答正文**（包含截断标记如"..."或"阅读全文"字样）
2. AI 基于不完整内容分析，可能遗漏后半部分的关键错误
3. 上下文断裂导致分析偏差，生成低质量反驳

## 关键设计约束（用户反馈）

> **用户反馈**：推荐页的回答本身已经有"阅读全文"按钮了，提示面板中不要再重复加一个"阅读全文"按钮。

因此面板设计需要：**只提示、不替代** —— 引导用户去点击回答本身的"阅读全文"按钮，面板只提供说明和"仍要生成"选项。

## 解决方案：检测折叠状态 + 轻量提示面板

### 核心设计

点击"生成反驳"时，在调用 AI 之前先检测内容是否完整：
- **内容完整** → 正常进入 AI 分析流程
- **内容被折叠** → 弹出轻量提示面板，告诉用户建议先展开：
  - 面板**不替代**回答本身的"阅读全文"按钮
  - 用户自行点击回答上的"阅读全文"展开
  - 展开后 MutationObserver 检测到 DOM 变化，按钮重新可用
  - 用户再次点击"生成反驳"即可基于完整内容生成
  - 同时提供 **"⚠️ 仍要生成"** 选项，用户坚持用不完整内容生成反驳（保留自主权）

### 检测逻辑

```js
_isContentTruncated(answerElement, text) {
  // 1. DOM 中是否存在"阅读全文"按钮
  const readMoreBtn = answerElement.querySelector(
    '.RichContent-lookMore, .ContentItem-rightButton, [class*="readMore" i], [class*="lookMore" i]'
  );
  if (readMoreBtn) return true;

  // 2. RichContent 是否有折叠类
  const richContent = answerElement.querySelector('.RichContent');
  if (richContent?.classList.contains('RichContent--isCollapsible')) return true;

  // 3. 文本末尾有省略号或包含"阅读全文"
  const trimmed = text.trim();
  if (trimmed.endsWith('...') || trimmed.endsWith('…')) return true;
  if (trimmed.includes('阅读全文')) return true;

  return false;
}
```

### 流程设计

```
用户点击"生成反驳"
    │
    ▼
提取回答内容
    │
    ▼
检测是否被折叠？
    │
    ├── 是 ──→ 弹出提示面板（不调用 AI）
    │            ├─ 文案：建议先点击回答下方的"阅读全文"展开
    │            └─ [⚠️ 仍要生成] → 进入正常 AI 生成流程
    │            （用户也可关闭面板，自行点击回答上的"阅读全文"）
    │
    └── 否 ──→ 直接进入正常 AI 生成流程
```

### UI 提示面板（无重复按钮）

```
┌─────────────────────────────────┐
│ ⚠️ 回答内容不完整                │
├─────────────────────────────────┤
│ 当前回答被折叠，AI 无法基于不     │
│ 完整内容准确分析。                │
│                                   │
│ 建议先点击回答下方的"阅读全文"    │
│ 展开完整内容，再生成反驳。        │
├─────────────────────────────────┤
│              [⚠️ 仍要生成]       │
└─────────────────────────────────┘
```

**设计要点**：
- 面板只有一个操作按钮"仍要生成"，**不重复**回答本身已有的"阅读全文"
- 文案明确告诉用户"点击回答下方的'阅读全文'"
- 用户关闭面板后，可自行点击回答上的展开按钮
- 展开后 DOM 变化被 MutationObserver 捕获，按钮状态正常

## 实施方案

### 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/content/injector.js` | 修改 | 添加 `_isContentTruncated()` 检测方法；重构 `_handleGenerateClick` 先检测再决定流程；提取 `_executeGenerate()` 方法 |
| `src/content/ui.js` | 新增 | `createTruncatedPrompt(onGenerateAnyway)` 面板方法（仅一个回调：仍要生成） |
| `src/content/index.js` | 修改 | `injectStyles()` 中添加折叠提示面板 CSS 样式 |
| `src/content/style.css` | 修改 | 同步添加样式（fallback） |

### injector.js 详细改动

**1. 添加 `_isContentTruncated` 方法：**

在 Injector 对象中添加检测方法，通过 DOM 选择器 + 文本特征三重检测折叠状态。

**2. 重构 `_handleGenerateClick`：**

```js
async _handleGenerateClick(button, answerElement) {
  const originalText = button.textContent;

  try {
    // 提取内容
    const content = Extractor.extractFromElement(answerElement);
    if (!content.text || content.text.length < 50) {
      throw new Error('未能提取到有效的回答内容，请尝试刷新页面');
    }

    // === 新增：检测内容是否被折叠 ===
    if (this._isContentTruncated(answerElement, content.text)) {
      UI.createTruncatedPrompt(async () => {
        // 用户坚持用不完整内容生成
        button.disabled = true;
        button.textContent = CONSTANTS.UI.BUTTON_LOADING_TEXT;
        try {
          await this._executeGenerate(content, answerElement);
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      });
      return;
    }

    // 内容完整，正常生成
    button.disabled = true;
    button.textContent = CONSTANTS.UI.BUTTON_LOADING_TEXT;
    await this._executeGenerate(content, answerElement);

  } catch (error) {
    console.error('[知乎反驳助手]', error);
    UI.showError(error.message || '生成失败，请检查配置后重试');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}
```

**3. 提取 `_executeGenerate` 方法：**

将原来的生成逻辑（获取配置 → 初始化风格缓存 → 调用 API → 打开面板）提取为独立方法 `_executeGenerate(content, answerElement)`，供正常流程和"仍要生成"回调复用。

### ui.js 详细改动

**新增 `createTruncatedPrompt` 方法（单按钮版本）：**

```js
createTruncatedPrompt(onGenerateAnyway) {
  const panel = Utils.createElement('div', {
    className: 'zhihu-remark-truncated-panel'
  });

  // 标题栏（含关闭按钮）
  const header = Utils.createElement('div', {
    className: 'zhihu-remark-truncated-panel__header'
  });
  const title = Utils.createElement('span', {
    textContent: '⚠️ 回答内容不完整'
  });
  header.appendChild(title);
  const closeBtn = Utils.createElement('button', {
    className: 'zhihu-remark-analysis-panel__close',
    textContent: '✕',
    onClick: () => this._removePanel(panel)
  });
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // 提示文案
  const body = Utils.createElement('div', {
    className: 'zhihu-remark-truncated-panel__body'
  });
  body.appendChild(Utils.createElement('div', {
    textContent: '当前回答被折叠，AI 无法基于不完整内容准确分析。'
  }));
  body.appendChild(Utils.createElement('div', {
    className: 'zhihu-remark-truncated-panel__hint',
    textContent: '建议先点击回答下方的"阅读全文"展开完整内容，再生成反驳。'
  }));
  panel.appendChild(body);

  // 操作按钮
  const actions = Utils.createElement('div', {
    className: 'zhihu-remark-truncated-panel__actions'
  });
  const anywayBtn = Utils.createElement('button', {
    className: 'zhihu-remark-btn zhihu-remark-btn--secondary',
    textContent: '⚠️ 仍要生成',
    onClick: () => {
      if (onGenerateAnyway) onGenerateAnyway();
      this._removePanel(panel);
    }
  });
  actions.appendChild(anywayBtn);
  panel.appendChild(actions);

  document.body.appendChild(panel);

  requestAnimationFrame(() => {
    panel.classList.add('zhihu-remark-truncated-panel--visible');
  });

  return panel;
}
```

### 样式设计

在 `content/index.js` 的 `injectStyles()` 中添加：

```css
.zhihu-remark-truncated-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 999998;
  width: 420px;
  max-width: 90vw;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  transform: translate(-50%, -50%) scale(0.9);
  opacity: 0;
  transition: all 0.3s ease;
}
.zhihu-remark-truncated-panel--visible {
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
}
.zhihu-remark-truncated-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  border-bottom: 1px solid #f0f0f0;
}
.zhihu-remark-truncated-panel__body {
  padding: 16px 20px;
  font-size: 14px;
  line-height: 1.6;
  color: #595959;
}
.zhihu-remark-truncated-panel__hint {
  margin-top: 8px;
  color: #8c8c8c;
}
.zhihu-remark-truncated-panel__actions {
  padding: 12px 20px 20px;
  display: flex;
  justify-content: flex-end;
}
```

## 验收标准

- [ ] 折叠回答上点击"生成反驳"，弹出"内容不完整"提示面板（不调用 AI）
- [ ] 面板中**没有**"阅读全文"按钮，文案引导用户点击回答本身的"阅读全文"
- [ ] 点击"⚠️ 仍要生成"进入正常 AI 生成流程（基于当前不完整内容）
- [ ] 已展开的回答点击"生成反驳"，直接正常生成，不弹提示
- [ ] 问题页/回答页/专栏页等原本就是完整内容的页面不受影响
- [ ] 面板样式与现有分析面板风格一致，有关闭按钮
