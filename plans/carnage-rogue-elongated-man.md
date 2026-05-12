# 计划：修复推荐页面"阅读全文"后按钮消失

## 问题分析

用户在知乎推荐页面（Feed 流）看到简要回答时按钮存在，点击"阅读全文"展开后按钮消失。

### 已排除的因素

之前的修复已确保：知乎重绘操作栏后，若 DOM 中按钮被移除，`_injectToAnswer` 会重新检测并注入。此机制本身正确。

### 可能的根因

1. **推荐页面 URL 未匹配 manifest** — `manifest.json` 的 `matches` 只包含 `/question/*`、`/answer/*`、`/zhuanlan.zhihu.com/p/*`，不包含知乎首页 `/` 及 `/hot`、`/follow` 等推荐页面
2. **SPA 路由跳转未触发 content script 重载** — 知乎是 SPA，从推荐页点击"阅读全文"后 URL 变为 `/question/xxx`，但页面未真正刷新，Chrome 不会自动重新注入 content script
3. **回答元素选择器覆盖不全** — 推荐页 Feed 流的 DOM class 可能不同于问题页（如 `.TopstoryItem` 而非 `.List-item`）
4. **Modal/Drawer 弹窗未检测** — "阅读全文"可能以弹窗形式展示，新 DOM 不在 MutationObserver 的检测范围内

## 实施方案

### 改动文件

| 文件 | 改动 |
|------|------|
| `manifest.json` | 扩展 `matches`，覆盖知乎首页、推荐页、搜索页等 |
| `src/content/extractor.js` | 扩展 `getAllAnswerElements()` 选择器，覆盖 Feed 流元素 |
| `src/content/injector.js` | 扩展 `_findCommentArea()` 策略；增强 `MutationObserver`；添加 SPA 路由变化监听 |

### 详细设计

#### 1. manifest.json — 扩展 URL 匹配

当前 `matches` 只覆盖特定页面，推荐页、首页、搜索页等未覆盖：

```json
"matches": [
  "https://www.zhihu.com/*",
  "https://zhuanlan.zhihu.com/p/*"
]
```

保留 `host_permissions` 中的 API 域名不变。

#### 2. extractor.js — 扩展回答元素选择器

```js
getAllAnswerElements() {
  // 问题页回答
  const modern = document.querySelectorAll('.AnswerCard, .List-item, .ContentItem.AnswerItem');
  if (modern.length > 0) return Array.from(modern);

  // 推荐页 / 首页 Feed
  const feed = document.querySelectorAll('.TopstoryItem, .Topstory-main .ContentItem, .Topstory-recommend .ContentItem');
  if (feed.length > 0) return Array.from(feed);

  // 旧版
  const legacy = document.querySelectorAll('.AnswerItem, .AnswerCard');
  if (legacy.length > 0) return Array.from(legacy);

  // 专栏文章
  const article = document.querySelectorAll('.Post-content, .Post-RichTextContainer');
  if (article.length > 0) return Array.from(article);

  // 搜索页结果
  const search = document.querySelectorAll('.SearchResult-Card .ContentItem, .SearchResult .ContentItem');
  if (search.length > 0) return Array.from(search);

  return [];
}
```

#### 3. injector.js — 三方面增强

**A. 扩展 `_findCommentArea()` 操作栏选择器**

推荐页"阅读全文"展开后，操作栏 class 可能不同：

```js
_findCommentArea(answerElement) {
  // 策略1：常见操作栏
  const actionsBar = answerElement.querySelector(
    '.ContentItem-actions, .AnswerCard-actions, .List-item .ContentItem-actions, .TopstoryItem .ContentItem-actions'
  );
  if (actionsBar && !actionsBar.querySelector('.zhihu-remark-btn')) {
    return actionsBar;
  }

  // 策略2：评论按钮旁边
  const commentBtn = answerElement.querySelector(
    'button[aria-label*="评论"], .ContentItem-action button[data-za-detail-view-id*="comment"], [data-za-detail-view-id*="Comment"]'
  );
  if (commentBtn && commentBtn.parentNode) {
    return commentBtn.parentNode;
  }

  // 策略3：底部操作栏
  const bottomBar = answerElement.querySelector(
    '.RichContent-bottom, .ContentItem-bottom, .TopstoryItem-bottom'
  );
  if (bottomBar) {
    return bottomBar;
  }

  // 策略4：通用的操作按钮容器
  const genericActions = answerElement.querySelector(
    '[class*="actions"], [class*="ActionBar"], [class*="operations"]'
  );
  if (genericActions && !genericActions.querySelector('.zhihu-remark-btn')) {
    return genericActions;
  }

  return null;
}
```

**B. 增强 `MutationObserver` — 检测 Modal/Drawer 和更多元素类型**

当前只检测 `.AnswerCard, .List-item, .ContentItem`，推荐页的 Modal 可能使用不同的 class：

```js
startObserver() {
  const debouncedInject = Utils.debounce(() => {
    this.injectAll();
  }, 500);

  const observer = new MutationObserver((mutations) => {
    const hasNewContent = mutations.some(mutation => {
      return Array.from(mutation.addedNodes).some(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        // 扩展检测范围
        return node.matches?.('.AnswerCard, .List-item, .ContentItem, .TopstoryItem, .Card, .Modal, .Drawer, [class*="Modal"], [class*="Drawer"]') ||
               node.querySelector?.('.AnswerCard, .List-item, .ContentItem, .TopstoryItem, .Modal, .Drawer');
      });
    });

    // 同时检测属性变化（class 变化可能意味着展开/收起）
    const hasAttrChange = mutations.some(m => m.type === 'attributes');

    if (hasNewContent || hasAttrChange) {
      debouncedInject();
    }
    
    // 每次 mutation 都尝试注入（不防抖，用于快速响应 Modal 弹出）
    mutations.forEach(mutation => {
      Array.from(mutation.addedNodes).forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches?.('.Modal, .Drawer, [class*="modal"], [class*="drawer"]')) {
            // Modal 弹出时立即扫描内部
            this._scanAndInject(node);
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,  // 监听属性变化（class 切换）
    attributeFilter: ['class', 'style']
  });

  this.injectAll();
  return observer;
}
```

新增 `_scanAndInject(container)` 方法，用于扫描指定容器内的回答元素：

```js
_scanAndInject(container) {
  const answers = container.querySelectorAll('.AnswerCard, .List-item, .ContentItem, .TopstoryItem');
  answers.forEach(answer => this._injectToAnswer(answer));
}
```

**C. 添加 SPA 路由变化监听**

知乎是 SPA，URL 变化时 content script 不会重新加载。需要监听 `history.pushState` / `popstate`：

```js
// 在 content/index.js 的 init() 中添加
function init() {
  injectStyles();
  const observer = Injector.startObserver();
  
  // SPA 路由变化监听
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    setTimeout(() => Injector.injectAll(), 500);
  };
  window.addEventListener('popstate', () => {
    setTimeout(() => Injector.injectAll(), 500);
  });
  
  // ...其余代码
}
```

### 验收标准

- [ ] 知乎首页 `/`、推荐页 `/hot`、关注页 `/follow` 上能看到"生成反驳"按钮
- [ ] 点击"阅读全文"展开回答后，按钮仍然可见（或自动重新注入）
- [ ] SPA 路由跳转（如从首页进入问题页）后，按钮正常显示
- [ ] Modal/弹窗形式展开的回答中也能看到按钮
- [ ] 不影响已有页面（问题页、回答页、专栏页）的正常功能
