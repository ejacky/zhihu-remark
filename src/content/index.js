/**
 * 知乎反驳助手 - 内容脚本主入口
 * 在知乎页面加载后自动运行
 */

(function () {
  'use strict';

  // 防止重复初始化
  if (window.__ZHIHU_REMARK_INITIALIZED__) {
    return;
  }
  window.__ZHIHU_REMARK_INITIALIZED__ = true;

  console.log('[知乎反驳助手] 内容脚本已加载');

  // 初始化
  function init() {
    // 注入样式
    injectStyles();

    // 启动 DOM 观察者，自动注入按钮
    const observer = Injector.startObserver();

    // SPA 路由变化监听（知乎是单页应用，URL 变化不会刷新页面）
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      setTimeout(() => Injector.injectAll(), 600);
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      setTimeout(() => Injector.injectAll(), 600);
    };
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

  /**
   * 注入内联样式（作为 fallback）
   */
  function injectStyles() {
    const styleId = 'zhihu-remark-inline-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* 生成反驳按钮（与知乎原生操作按钮风格一致） */
      .zhihu-remark-btn--generate {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 10px;
        font-size: 14px;
        font-weight: 400;
        color: #535861;
        background: none;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s ease;
        white-space: nowrap;
        font-family: inherit;
        line-height: 20px;
      }
      .zhihu-remark-btn--generate:hover {
        background: rgba(0, 0, 0, 0.04);
        color: #535861;
      }
      .zhihu-remark-btn--generate:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: none;
      }

      /* 通知提示 */
      .zhihu-remark-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        color: #fff;
        background: #333;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: translateX(120%);
        transition: transform 0.3s ease;
        max-width: 360px;
        word-break: break-word;
      }
      .zhihu-remark-notification--visible {
        transform: translateX(0);
      }
      .zhihu-remark-notification--leaving {
        transform: translateX(120%);
      }
      .zhihu-remark-notification--success { background: #52c41a; }
      .zhihu-remark-notification--error { background: #ff4d4f; }
      .zhihu-remark-notification--warning { background: #faad14; color: #333; }
      .zhihu-remark-notification--info { background: #1890ff; }

      /* 分析面板 */
      .zhihu-remark-analysis-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        z-index: 999998;
        width: 480px;
        max-width: 90vw;
        max-height: 80vh;
        overflow-y: auto;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        transform: translate(-50%, -50%) scale(0.9);
        opacity: 0;
        transition: all 0.3s ease;
      }
      .zhihu-remark-analysis-panel--visible {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
      }
      .zhihu-remark-analysis-panel__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #f0f0f0;
      }
      .zhihu-remark-analysis-panel__title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #1a1a1a;
      }
      .zhihu-remark-analysis-panel__close {
        background: none;
        border: none;
        font-size: 18px;
        color: #999;
        cursor: pointer;
        padding: 4px;
      }
      .zhihu-remark-analysis-panel__close:hover {
        color: #333;
      }
      .zhihu-remark-analysis-panel__tags {
        padding: 12px 20px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .zhihu-remark-tag {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
      }
      .zhihu-remark-tag--factError { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }
      .zhihu-remark-tag--logicFallacy { background: #fff7e6; color: #d46b08; border: 1px solid #ffd591; }
      .zhihu-remark-tag--historicalNihilism { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
      .zhihu-remark-tag--dataFraud { background: #e6f7ff; color: #096dd9; border: 1px solid #91d5ff; }
      .zhihu-remark-tag--scienceError { background: #f9f0ff; color: #531dab; border: 1px solid #d3adf7; }
      .zhihu-remark-analysis-panel__summary {
        padding: 0 20px 16px;
        font-size: 14px;
        line-height: 1.6;
        color: #595959;
      }
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
      .zhihu-remark-analysis-panel__actions {
        padding: 12px 20px 20px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
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
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .zhihu-remark-style-tab:hover {
        background: #e6f0fd;
        color: #056de8;
      }
      .zhihu-remark-style-tab--active {
        background: #056de8;
        color: #fff;
      }
      .zhihu-remark-style-tab--active:hover {
        background: #0461d1;
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
      .zhihu-remark-analysis-panel__no-error {
        padding: 20px;
        text-align: center;
        color: #8c8c8c;
        font-size: 14px;
      }
      .zhihu-remark-analysis-panel__no-error-hint {
        margin-top: 8px;
        font-size: 12px;
        color: #bfbfbf;
      }
      .zhihu-remark-btn--primary {
        padding: 8px 20px;
        font-size: 14px;
        font-weight: 500;
        color: #fff;
        background: #056de8;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .zhihu-remark-btn--primary:hover {
        background: #0461d1;
      }

      /* 加载状态 */
      .zhihu-remark-loading {
        position: fixed;
        top: 50%;
        left: 50%;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 24px 32px;
        background: rgba(255,255,255,0.95);
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        transform: translate(-50%, -50%) scale(0.9);
        opacity: 0;
        transition: all 0.3s ease;
      }
      .zhihu-remark-loading--visible {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
      }
      .zhihu-remark-loading__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #e8e8e8;
        border-top-color: #056de8;
        border-radius: 50%;
        animation: zhihuRemarkSpin 0.8s linear infinite;
      }
      @keyframes zhihuRemarkSpin {
        to { transform: rotate(360deg); }
      }
      .zhihu-remark-loading__text {
        font-size: 14px;
        color: #595959;
      }
    `;
    document.head.appendChild(style);
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
