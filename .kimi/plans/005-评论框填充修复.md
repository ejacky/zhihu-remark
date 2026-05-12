# 计划：修复评论框自动填充后发布按钮不可用

> 方案演进记录：
> - **迭代1**（innerHTML + 合成事件）：文本出现在 DOM 中，但不在编辑器内部 state → 发布按钮灰、无法删除文本
> - **迭代2**（execCommand('insertText')）：同上，DOM 与 state 不同步
> - **迭代3**（navigator.clipboard + 模拟 Ctrl+V）：浏览器安全限制，合成键盘事件 `isTrusted=false` 被编辑器框架忽略 → 评论框完全为空
> - **迭代4（当前）**：直接 `ClipboardEvent('paste')` + `DataTransfer` 数据 → 让编辑器走原生 paste handler，state 与 DOM 同步

## 问题再分析

上次的"剪贴板 + 模拟 Ctrl+V"方案完全失效：
1. `navigator.clipboard.writeText` 成功（剪贴板有内容）
2. `KeyboardEvent('keydown', {ctrlKey:true, key:'v'})` dispatch 后，评论框**为空**

### 根本原因：浏览器安全限制

脚本 dispatch 的 `KeyboardEvent` 的 `isTrusted === false`。浏览器和编辑器框架（Slate.js/Draft.js）会忽略非真实用户触发的事件：
- 浏览器不会为合成键盘事件执行默认的粘贴行为
- 编辑器框架的 `keydown` handler 可能直接 `if (!event.isTrusted) return`

模拟键盘事件这条路**彻底走不通**。

### 正确路径：直接触发 `ClipboardEvent('paste')`

手动粘贴 100% 有效的本质是：浏览器触发 `paste` 事件 → 编辑器从 `event.clipboardData` 读取数据 → 更新内部 state。

我们不需要模拟键盘，而是**直接创建一个 `ClipboardEvent('paste')`，并在事件中携带数据**。编辑器只要监听了 `onPaste`，就会正常处理。

关键：Chrome 支持通过构造函数为 `ClipboardEvent` 设置 `clipboardData`（`DataTransfer` 对象），编辑器可以从事件对象中直接读取文本，无需访问系统剪贴板。

## 实施方案

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/content/injector.js` | 重写 `_fillContentEditable`：直接 dispatch `ClipboardEvent('paste')` 并携带 `DataTransfer` 数据 |

### 详细设计

**`_fillContentEditable` 重写：**

```js
async _fillContentEditable(element, text) {
  element.focus();

  // Step 1: 尝试写入系统剪贴板（作为辅助，真实手动粘贴时可用）
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // 忽略权限错误，核心逻辑不依赖系统剪贴板
  }

  // Step 2: 核心方案 — 直接创建带数据的 paste 事件
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  dt.setData('text/html', this._escapeHtml(text).replace(/\n/g, '<br>'));

  const pasteEvent = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dt,
  });

  element.dispatchEvent(pasteEvent);

  // Step 3: 检查编辑器是否处理了 paste（preventDefault = 已处理）
  if (!pasteEvent.defaultPrevented) {
    // 编辑器没拦截 paste，说明它不识别该事件
    // 直接设置 innerHTML 只会留下"僵尸内容"（DOM 中有但 state 为空）
    // 这种情况直接返回失败，外层会 fallback 到剪贴板复制 + 提示手动粘贴
    return false;
  }

  return true;
}
```

### 为什么这个方案有效

| 步骤 | 编辑器如何响应 | 结果 |
|------|---------------|------|
| `new ClipboardEvent('paste', {clipboardData: dt})` | 创建携带文本数据的 paste 事件 | 数据就绪 |
| `element.dispatchEvent(pasteEvent)` | 事件冒泡，React/Slate 的 `onPaste` 捕获 | 编辑器执行 paste handler |
| Slate `onPaste` 内部 | `event.clipboardData.getData('text/plain')` → 转为内部节点 → 更新 state | **state 和 DOM 同步** |
| `pasteEvent.defaultPrevented` | Slate 调用了 `event.preventDefault()` | 确认编辑器已处理 |

### 回退机制（简洁明确）

- **paste 被正确处理**（`defaultPrevented === true`）→ 成功，评论框有内容且 state 同步
- **paste 未被处理**（`defaultPrevented === false`）→ 直接返回失败，外层自动复制到剪贴板并提示"请手动粘贴"

不设置 `innerHTML` fallback，避免留下"看得见但删不掉、发不出"的僵尸内容。

### 验收标准

- [ ] 点击"使用此反驳"后，评论框中**正确显示反驳文本**
- [ ] 显示的文本**可删除、可修改**
- [ ] "发布"按钮变为**蓝色可用**
- [ ] 点击发布**正常提交**，不再报"内容不能为空"
- [ ] paste 失败时，直接复制到剪贴板并提示手动粘贴（不残留僵尸内容）
- [ ] 换行格式正确保留
