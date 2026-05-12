# 计划：在错误分析面板中预览生成的反驳内容

## 背景

用户反馈：错误分析弹出框只显示了错误类型标签和分析摘要，但没有显示实际生成的反驳内容。用户必须点击"使用此反驳"、内容被填入评论框后，才能看到具体生成了什么。这个体验很差——用户无法先预览内容再决定是否使用。

## 现状分析

- `UI.createAnalysisPanel(analysisData, onUse, onDismiss, onRegenerate)` 只接收 `analysisData`（含 `hasErrors`, `errorTypes`, `summary`）
- 实际生成的反驳文本 `rebuttal` 在 `injector.js` 的 `_doGenerate` 中通过 `result.rebuttal` 获取，但调用 `createAnalysisPanel` 时没有传入
- 面板中缺少反驳内容的展示区域
- 主要样式内联在 `content/index.js` 的 `injectStyles()` 中

## 实施方案

### 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/content/ui.js` | 修改 | `createAnalysisPanel` 新增 `rebuttal` 参数；在摘要和按钮之间添加反驳内容预览区域 |
| `src/content/injector.js` | 修改 | 调用 `createAnalysisPanel` 时传入 `result.rebuttal` |
| `src/content/index.js` | 修改 | `injectStyles()` 中添加反驳预览区域的 CSS 样式 |
| `src/content/style.css` | 修改 | 同步添加反驳预览区域的 CSS 样式（作为 fallback） |

### 详细设计

#### 1. UI.createAnalysisPanel 修改

新增第 5 个参数 `rebuttal`（字符串，可能为空）。在 `hasErrors` 为 true 时：

- 在"摘要"（`.zhihu-remark-analysis-panel__summary`）之后、"操作按钮"之前，插入一个新的预览区域
- 结构如下：
  - 小标题："📝 生成的反驳"
  - 内容容器：白色背景、浅灰边框、圆角、内边距
  - 文本：14px、行高 1.7、保留换行（`white-space: pre-wrap`）
  - 容器最大高度 200px，超出可滚动

#### 2. injector.js 修改

`_doGenerate` 中调用 `createAnalysisPanel` 时，把 `result.rebuttal` 作为第 5 个参数传入：

```js
UI.createAnalysisPanel(result.analysis, onUse, onDismiss, onRegenerate, result.rebuttal);
```

#### 3. 样式设计

在 `content/index.js` 的 `injectStyles()` 中添加：

```css
.zhihu-remark-analysis-panel__rebuttal-section {
  margin: 0 20px 16px;
}
.zhihu-remark-analysis-panel__rebuttal-label {
  font-size: 13px;
  font-weight: 600;
  color: #262626;
  margin-bottom: 8px;
}
.zhihu-remark-analysis-panel__rebuttal-content {
  max-height: 200px;
  overflow-y: auto;
  padding: 12px 14px;
  background: #f6f6f6;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
}
```

同时在 `content/style.css` 中同步添加相同样式，作为 fallback。

#### 4. 面板布局调整

面板当前布局（有错误时）：
```
标题栏
错误类型标签
分析摘要
[反驳预览 - 新增]
操作按钮（重新生成 / 使用此反驳）
```

面板整体已有 `max-height: 80vh; overflow-y: auto`，新增预览区域后仍在这个限制内。

### 验收标准

- [ ] 分析面板中在"分析摘要"下方显示"📝 生成的反驳"预览区域
- [ ] 预览区域展示完整的 `rebuttal` 文本，保留换行格式
- [ ] 预览区域最大高度 200px，内容过长时可滚动
- [ ] 无错误时（hasErrors=false）不显示预览区域（此时 rebuttal 为空）
- [ ] 重新生成后，新面板也正确显示新生成的反驳内容
