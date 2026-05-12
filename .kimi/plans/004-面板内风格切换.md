# 计划：分析面板内支持风格切换与多风格缓存

## 背景

用户希望在错误分析弹出框内直接切换反驳风格（温和/直接/学术），并能比较不同风格的结果后再决定使用哪一种。核心需求：
1. 面板内提供风格切换选项卡
2. 切换风格时，前一种风格的结果**不丢失**
3. 某种风格下点击"重新生成"，**只改变该风格**的结果
4. "使用此反驳"使用当前选中风格的内容

## 现状分析

- 当前风格由用户在 Options 页面配置，`config.style` 通过 `Prompts.getSystemPrompt(config.style, config)` 传给 AI
- `createAnalysisPanel` 接收固定的 `analysisData + rebuttal`，面板内容一次成型、不可更新
- `_doGenerate` 每次调用会创建新面板、销毁旧面板
- 没有机制在面板内临时切换风格并保留多份结果

## 实施方案

### 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/background/index.js` | 修改 | `handleGenerateRebuttal` 支持 `data.style` 临时覆盖 config.style |
| `src/content/injector.js` | 大改 | 引入多风格缓存 `styleResults`，重构面板生命周期管理 |
| `src/content/ui.js` | 大改 | `createAnalysisPanel` 改为"创建+更新"模式，支持风格选项卡 |
| `src/content/index.js` | 修改 | `injectStyles()` 添加风格选项卡、加载状态等样式 |
| `src/content/style.css` | 修改 | 同步新增样式 |

### 详细设计

#### 1. Background 层：支持临时风格覆盖

`handleGenerateRebuttal` 中：
```js
const { content, regenerateHint, style } = data;
const config = await Storage.getConfig();
if (style) {
  config.style = style;  // 临时覆盖，不影响持久化配置
}
```

`API.generateRebuttal` 本来就从 `config.style` 读取，因此 `api.js` **无需改动**。

#### 2. Injector 层：多风格缓存与面板管理

**缓存结构**（每个面板实例独立，闭包在 `_openAnalysisPanel` 中）：
```js
const styleResults = {
  gentle:  { analysis, rebuttal, loading: false, error: null },  // 已生成
  direct:  null,   // 未生成
  academic: null   // 未生成
};
```

**核心方法重构**：
- `_handleGenerateClick` → 提取内容 → 以当前配置风格首次生成 → 打开面板
- `_openAnalysisPanel(content, answerElement, styleResults, currentStyle)` 
  - 创建面板，传入缓存和回调
  - 返回后面板由 UI 控制器管理
- `_generateForStyle(content, style, styleResults, panelCtrl)` 
  - 为指定风格触发 API 请求
  - 请求前设置 `styleResults[style].loading = true`，调用 `panelCtrl.update()`
  - 请求完成后写入结果，调用 `panelCtrl.update()`
- 风格切换回调：若目标风格已有缓存 → 直接 `panelCtrl.update()`；若无 → 触发 `_generateForStyle`
- 重新生成回调：对当前风格触发 `_generateForStyle`，保留其他风格数据
- 使用回调：用当前风格的 `rebuttal` 填充评论框

#### 3. UI 层：面板改为状态驱动

**新接口**：
```js
UI.createAnalysisPanel({ styleResults, currentStyle, onStyleChange, onRegenerate, onUse, onDismiss })
```

返回控制器对象：
```js
{
  element: panelDiv,           // DOM 元素
  update({ styleResults, currentStyle }),  // 更新内容，不重建 DOM
  remove()                      // 移除面板
}
```

**面板内部结构**：
```
标题栏（🔍 错误分析 + 关闭按钮）
风格选项卡 [温和理性] [直接犀利] [学术严谨]   ← 新增
─────────────
错误类型标签（根据当前风格的数据显示）
分析摘要
📝 生成的反驳（预览区域）
[🔄 重新生成] [使用此反驳]
```

**风格选项卡交互**：
- 当前选中的风格：蓝色底 + 白色字
- 未选中：灰色底
- 正在加载的风格：显示 spinner + 文字变灰
- 生成失败的风格：红色提示 + 可点击重试

**内容区域状态机**：
| 状态 | 显示 |
|------|------|
| 有数据 | analysis + rebuttal 正常展示 |
| 加载中 | 显示 "正在生成 XX 风格的反驳..." + spinner |
| 失败 | 显示错误信息 + "重试" 按钮 |
| 无数据（初始）| 空状态或自动触发加载 |

#### 4. 样式设计

风格选项卡样式（添加至 `injectStyles()`）：
```css
.zhihu-remark-style-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid #f0f0f0;
}
.zhihu-remark-style-tab {
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  border: none;
  background: #f0f0f0;
  color: #595959;
  transition: all 0.2s;
}
.zhihu-remark-style-tab:hover { background: #e6f0fd; color: #056de8; }
.zhihu-remark-style-tab--active {
  background: #056de8;
  color: #fff;
}
.zhihu-remark-style-tab--loading {
  opacity: 0.6;
  cursor: wait;
}
.zhihu-remark-panel__loading-text {
  padding: 40px 20px;
  text-align: center;
  color: #8c8c8c;
  font-size: 14px;
}
```

### 数据流

```
用户点击"生成反驳"
  → 以配置风格（如 gentle）生成
  → styleResults = { gentle: result, direct: null, academic: null }
  → 打开面板，currentStyle = 'gentle'

用户点击"直接犀利"选项卡
  → styleResults.direct === null
  → 触发 API 生成 direct 风格
  → styleResults.direct = { loading: true }
  → panel.update() 显示加载态
  → API 返回
  → styleResults.direct = { analysis, rebuttal, loading: false }
  → panel.update() 显示内容

用户点击"温和理性"选项卡
  → styleResults.gentle 有数据
  → currentStyle = 'gentle'
  → panel.update() 直接显示缓存内容（无闪烁、无请求）

用户在"直接犀利"下点击"重新生成"
  → 仅重置 styleResults.direct，触发重新生成
  → gentle 和 academic 数据完全不受影响

用户点击"使用此反驳"
  → 使用 styleResults[currentStyle].rebuttal 填充评论框
```

### 验收标准

- [ ] 分析面板顶部显示三个风格选项卡，可点击切换
- [ ] 首次打开面板时，用配置中的默认风格生成并展示
- [ ] 切换到未生成过的风格时，自动触发 API 生成并显示 loading
- [ ] 切换回已生成过的风格时，直接显示缓存内容，不重新请求
- [ ] 某种风格下点击"重新生成"，只刷新该风格的结果，其他风格数据保留
- [ ] "使用此反驳"使用当前选中风格的反驳内容
- [ ] 面板关闭后，所有内存缓存自然释放（无内存泄漏）
- [ ] 生成失败时显示友好错误提示，并提供"重试"按钮
