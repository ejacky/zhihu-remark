# 计划：推荐页折叠回答检测与友好提示

## 问题分析

推荐页面中回答默认折叠，Extractor 提取到的是**不完整内容**（包含"...阅读全文"等截断标记）。用户反馈：

> 前一次 ## 回答正文不完整包含"...阅读全文"，点开后的 ## 回答正文是完整的。

如果 AI 基于不完整内容分析，可能：
1. 遗漏后半部分的关键错误
2. 上下文断裂导致分析偏差
3. 生成低质量反驳

## 解决方案：检测折叠状态 + 友好提示面板

### 核心设计

点击"生成反驳"时，先检测内容是否完整：
- **完整** → 正常生成
- **被折叠** → 弹出提示面板，给用户两个选择：
  1. **"📖 阅读全文"** — 自动点击展开按钮，内容展开后用户再次点击生成
  2. **"⚠️ 仍要生成"** — 用户坚持用当前不完整内容生成（保留自主权）

### 检测逻辑

```js
_isContentTruncated(answerElement, text) {
  // 1. DOM 中是否存在"阅读全文"按钮
  const readMoreBtn = answerElement.querySelector(
    '.RichContent-lookMore, .ContentItem-rightButton, [class*="readMore"], [class*="lookMore"]'
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

### UI 提示面板

面板布局：
```
┌─────────────────────────────────┐
│ ⚠️ 回答内容不完整                │
├─────────────────────────────────┤
│ 当前回答被折叠，AI 无法基于不     │
│ 完整内容准确分析。建议展开后再    │
│ 生成反驳。                        │
├─────────────────────────────────┤
│ [📖 阅读全文]  [⚠️ 仍要生成]     │
└─────────────────────────────────┘
```

- **"📖 阅读全文"**（主按钮样式）：自动点击回答中的"阅读全文"按钮，面板关闭
- **"⚠️ 仍要生成"**（次要按钮样式）：坚持用当前内容生成，进入正常生成流程

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/content/injector.js` | 添加 `_isContentTruncated()` 检测；修改 `_handleGenerateClick` 先检测再决定流程 |
| `src/content/ui.js` | 新增 `createTruncatedPrompt(onReadMore, onGenerateAnyway)` 面板 |
| `src/content/index.js` | `injectStyles()` 中添加提示面板样式 |
| `src/content/style.css` | 同步添加样式 |

### 详细设计

**injector.js 中 `_handleGenerateClick` 修改：**

```js
async _handleGenerateClick(button, answerElement) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = CONSTANTS.UI.BUTTON_LOADING_TEXT;

  try {
    // 提取内容
    const content = Extractor.extractFromElement(answerElement);
    if (!content.text || content.text.length < 50) {
      throw new Error('未能提取到有效的回答内容，请尝试刷新页面');
    }

    // 检测内容是否被折叠
    if (this._isContentTruncated(answerElement, content.text)) {
      UI.createTruncatedPrompt(
        () => {
          // 自动点击"阅读全文"
          const readMoreBtn = answerElement.querySelector(
            '.RichContent-lookMore, .ContentItem-rightButton, [class*="readMore"], [class*="lookMore"]'
          );
          if (readMoreBtn) readMoreBtn.click();
        },
        async () => {
          // 用户坚持用不完整内容生成
          await this._doGenerate(content, answerElement, button, originalText);
        }
      );
      return;
    }

    // 内容完整，正常生成
    await this._doGenerate(content, answerElement, button, originalText);

  } catch (error) {
    console.error('[知乎反驳助手]', error);
    UI.showError(error.message || '生成失败，请检查配置后重试');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}
```

**ui.js 中新增 `createTruncatedPrompt`：**

```js
createTruncatedPrompt(onReadMore, onGenerateAnyway) {
  const panel = Utils.createElement('div', {
    className: 'zhihu-remark-truncated-panel'
  });

  // 标题
  const header = Utils.createElement('div', {
    className: 'zhihu-remark-truncated-panel__header',
    textContent: '⚠️ 回答内容不完整'
  });
  panel.appendChild(header);

  // 提示文案
  const body = Utils.createElement('div', {
    className: 'zhihu-remark-truncated-panel__body',
    textContent: '当前回答被折叠，AI 无法基于不完整内容准确分析。建议展开后再生成反驳。'
  });
  panel.appendChild(body);

  // 按钮组
  const actions = Utils.createElement('div', {
    className: 'zhihu-remark-truncated-panel__actions'
  });

  const readMoreBtn = Utils.createElement('button', {
    className: 'zhihu-remark-btn zhihu-remark-btn--primary',
    textContent: '📖 阅读全文',
    onClick: () => {
      if (onReadMore) onReadMore();
      this._removePanel(panel);
    }
  });
  actions.appendChild(readMoreBtn);

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

### 验收标准

- [ ] 折叠回答上点击"生成反驳"，弹出"内容不完整"提示面板
- [ ] 点击"📖 阅读全文"自动展开回答内容，面板关闭
- [ ] 点击"⚠️ 仍要生成"进入正常生成流程（基于当前不完整内容）
- [ ] 已展开的回答点击"生成反驳"，直接正常生成，不弹提示
- [ ] 问题页/回答页等原本就是完整内容的页面不受影响
- [ ] 面板样式与现有分析面板风格一致
