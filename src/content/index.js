/**
 * 知乎反驳助手 - 内容脚本主入口
 *
 * 样式统一由 manifest 注入 `style.css`（v2.0 之前这里还内联了一份，已合并成单真源）。
 * SPA 跳转靠 MutationObserver + popstate 覆盖；不 patch history.pushState——
 * 内容脚本运行在隔离世界，改这里的 pushState 影响不到页面自身的调用。
 *
 * @doc docs/TECH_DESIGN.md#24-卡片与交互
 */

(function () {
  'use strict';

  // 防止重复初始化
  if (window.__ZHIHU_REMARK_INITIALIZED__) {
    return;
  }
  window.__ZHIHU_REMARK_INITIALIZED__ = true;

  console.log('[知乎反驳助手] 内容脚本已加载');

  function init() {
    // 启动 DOM 观察者，自动注入按钮
    const observer = Injector.startObserver();

    // 站内跳转（SPA）后补一次扫描
    window.addEventListener('popstate', () => {
      setTimeout(() => Injector.injectAll(), 600);
    });

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
      if (observer) observer.disconnect();
      UI.cleanup();
    });

    // 监听来自 background 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === CONSTANTS.MESSAGE_TYPES.SHOW_NOTIFICATION) {
        UI.showNotification(message.data.message, message.data.type);
        sendResponse({ received: true });
      }
      return true;
    });
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
