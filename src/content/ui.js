/**
 * 知乎反驳助手 - UI 组件
 * 负责浮动提示、通知、加载状态等界面元素
 */

const UI = {
  // 存储已创建的通知元素
  _notifications: new Set(),

  /**
   * 创建通知提示
   */
  showNotification(message, type = 'info', duration = CONSTANTS.UI.NOTIFICATION_DURATION) {
    const notification = Utils.createElement('div', {
      className: `zhihu-remark-notification zhihu-remark-notification--${type}`,
      textContent: message
    });

    document.body.appendChild(notification);
    this._notifications.add(notification);

    // 动画进入
    requestAnimationFrame(() => {
      notification.classList.add('zhihu-remark-notification--visible');
    });

    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        this._removeNotification(notification);
      }, duration);
    }

    return notification;
  },

  /**
   * 显示成功通知
   */
  showSuccess(message, duration) {
    return this.showNotification(message, 'success', duration);
  },

  /**
   * 显示错误通知
   */
  showError(message, duration = 5000) {
    return this.showNotification(message, 'error', duration);
  },

  /**
   * 显示警告通知
   */
  showWarning(message, duration) {
    return this.showNotification(message, 'warning', duration);
  },

  /**
   * 移除通知
   */
  _removeNotification(notification) {
    notification.classList.remove('zhihu-remark-notification--visible');
    notification.classList.add('zhihu-remark-notification--leaving');

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      this._notifications.delete(notification);
    }, 300);
  },

  /**
   * 创建浮动分析面板（状态驱动，支持多风格切换）
   * @param {Object} options - 配置选项
   * @param {Object} options.styleResults - 各风格生成结果缓存 { gentle: {...}, direct: null, ... }
   * @param {string} options.currentStyle - 当前选中的风格 key
   * @param {Function} options.onStyleChange - 切换风格回调 (style) => {}
   * @param {Function} options.onRegenerate - 重新生成回调 (style) => {}
   * @param {Function} options.onUse - 使用此反驳回调 (style) => {}
   * @param {Function} options.onDismiss - 关闭面板回调
   * @returns {Object} { element, update, remove }
   */
  createAnalysisPanel({ styleResults, currentStyle, onStyleChange, onRegenerate, onUse, onDismiss }) {
    const panel = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel'
    });

    // ===== 标题栏 =====
    const header = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel__header'
    });
    const title = Utils.createElement('h3', {
      className: 'zhihu-remark-analysis-panel__title',
      textContent: '🔍 错误分析'
    });
    header.appendChild(title);
    const closeBtn = Utils.createElement('button', {
      className: 'zhihu-remark-analysis-panel__close',
      textContent: '✕',
      onClick: () => {
        this._removePanel(panel);
        if (onDismiss) onDismiss();
      }
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // ===== 风格选项卡 =====
    const tabsContainer = Utils.createElement('div', {
      className: 'zhihu-remark-style-tabs'
    });
    const tabElements = {};
    Object.keys(CONSTANTS.REBUTTAL_STYLES).forEach(styleKey => {
      const styleInfo = CONSTANTS.REBUTTAL_STYLES[styleKey];
      const tab = Utils.createElement('button', {
        className: 'zhihu-remark-style-tab',
        textContent: styleInfo.name,
        onClick: () => {
          if (tab.disabled) return;
          if (onStyleChange) onStyleChange(styleKey);
        }
      });
      tabElements[styleKey] = tab;
      tabsContainer.appendChild(tab);
    });
    panel.appendChild(tabsContainer);

    // ===== 内容区域（动态更新）=====
    const contentArea = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel__content'
    });
    panel.appendChild(contentArea);

    // ===== 操作按钮区域（动态更新）=====
    const actionsArea = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel__actions'
    });
    panel.appendChild(actionsArea);

    document.body.appendChild(panel);

    // 动画进入
    requestAnimationFrame(() => {
      panel.classList.add('zhihu-remark-analysis-panel--visible');
    });

    // ---- 渲染/更新内容的方法 ----
    function renderContent() {
      const result = styleResults[currentStyle];

      // 更新选项卡样式
      Object.keys(tabElements).forEach(key => {
        const tab = tabElements[key];
        const isActive = key === currentStyle;
        const isLoading = styleResults[key]?.loading;
        tab.className = 'zhihu-remark-style-tab' +
          (isActive ? ' zhihu-remark-style-tab--active' : '') +
          (isLoading ? ' zhihu-remark-style-tab--loading' : '');
        tab.disabled = isLoading;
      });

      // 清空内容区
      contentArea.innerHTML = '';
      actionsArea.innerHTML = '';

      // 无数据 / 加载中 / 错误 / 有数据
      if (!result || result.loading) {
        // 加载中
        const loadingText = Utils.createElement('div', {
          className: 'zhihu-remark-panel__loading-text',
          textContent: `正在生成 ${CONSTANTS.REBUTTAL_STYLES[currentStyle]?.name || ''}风格的反驳...`
        });
        contentArea.appendChild(loadingText);
      } else if (result.error) {
        // 生成失败
        const errorBox = Utils.createElement('div', {
          className: 'zhihu-remark-analysis-panel__no-error',
          textContent: `生成失败：${result.error}`
        });
        contentArea.appendChild(errorBox);

        // 重试按钮
        const retryBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--secondary',
          textContent: '🔄 重试',
          onClick: () => {
            if (onRegenerate) onRegenerate(currentStyle);
          }
        });
        actionsArea.appendChild(retryBtn);
      } else if (!result.analysis?.hasErrors) {
        // 未检测到错误
        const noErrorBox = Utils.createElement('div', {
          className: 'zhihu-remark-analysis-panel__no-error'
        });
        const noErrorTip = Utils.createElement('div', {
          textContent: 'AI 未在该回答中发现明显的事实错误或逻辑谬误。'
        });
        noErrorBox.appendChild(noErrorTip);
        const noErrorHint = Utils.createElement('div', {
          className: 'zhihu-remark-analysis-panel__no-error-hint',
          textContent: 'AI 判定可能存在方差，如对内容有疑问可再次检测。'
        });
        noErrorBox.appendChild(noErrorHint);
        contentArea.appendChild(noErrorBox);

        // 再次检测按钮
        const retryBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--secondary',
          textContent: '🔄 再次检测',
          onClick: () => {
            retryBtn.disabled = true;
            retryBtn.textContent = '检测中...';
            if (onRegenerate) onRegenerate(currentStyle);
          }
        });
        actionsArea.appendChild(retryBtn);
      } else {
        // 有数据：显示错误标签、摘要、反驳预览
        const { analysis, rebuttal } = result;

        // 错误类型标签
        const tagsContainer = Utils.createElement('div', {
          className: 'zhihu-remark-analysis-panel__tags'
        });
        (analysis.errorTypes || []).forEach(typeKey => {
          const typeInfo = CONSTANTS.ERROR_TYPES[typeKey];
          if (typeInfo) {
            const tag = Utils.createElement('span', {
              className: `zhihu-remark-tag zhihu-remark-tag--${typeKey}`,
              textContent: `${typeInfo.icon} ${typeInfo.label}`
            });
            tagsContainer.appendChild(tag);
          }
        });
        contentArea.appendChild(tagsContainer);

        // 摘要
        const summaryEl = Utils.createElement('div', {
          className: 'zhihu-remark-analysis-panel__summary',
          textContent: analysis.summary || ''
        });
        contentArea.appendChild(summaryEl);

        // 反驳内容预览
        if (rebuttal) {
          const rebuttalSection = Utils.createElement('div', {
            className: 'zhihu-remark-analysis-panel__rebuttal-section'
          });
          const rebuttalLabel = Utils.createElement('div', {
            className: 'zhihu-remark-analysis-panel__rebuttal-label',
            textContent: '📝 生成的反驳'
          });
          rebuttalSection.appendChild(rebuttalLabel);
          const rebuttalContent = Utils.createElement('div', {
            className: 'zhihu-remark-analysis-panel__rebuttal-content',
            textContent: rebuttal
          });
          rebuttalSection.appendChild(rebuttalContent);
          contentArea.appendChild(rebuttalSection);
        }

        // 操作按钮
        const regenerateBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--secondary',
          textContent: '🔄 重新生成',
          onClick: () => {
            regenerateBtn.disabled = true;
            regenerateBtn.textContent = '生成中...';
            if (onRegenerate) onRegenerate(currentStyle);
          }
        });
        actionsArea.appendChild(regenerateBtn);

        const useBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--primary',
          textContent: '使用此反驳',
          onClick: () => {
            if (onUse) onUse(currentStyle);
            UI._removePanel(panel);
          }
        });
        actionsArea.appendChild(useBtn);
      }
    }

    // 初始渲染
    renderContent();

    return {
      element: panel,
      update(newState) {
        if (newState.currentStyle !== undefined) currentStyle = newState.currentStyle;
        if (newState.styleResults !== undefined) Object.assign(styleResults, newState.styleResults);
        renderContent();
      },
      remove() {
        this._removePanel(panel);
      }
    };
  },

  /**
   * 创建加载状态
   */
  createLoading(text = CONSTANTS.UI.BUTTON_LOADING_TEXT) {
    const loading = Utils.createElement('div', {
      className: 'zhihu-remark-loading'
    });

    const spinner = Utils.createElement('div', {
      className: 'zhihu-remark-loading__spinner'
    });

    const label = Utils.createElement('span', {
      className: 'zhihu-remark-loading__text',
      textContent: text
    });

    loading.appendChild(spinner);
    loading.appendChild(label);
    document.body.appendChild(loading);

    requestAnimationFrame(() => {
      loading.classList.add('zhihu-remark-loading--visible');
    });

    return {
      element: loading,
      updateText(newText) {
        label.textContent = newText;
      },
      remove() {
        loading.classList.remove('zhihu-remark-loading--visible');
        setTimeout(() => {
          if (loading.parentNode) {
            loading.parentNode.removeChild(loading);
          }
        }, 300);
      }
    };
  },

  /**
   * 移除面板
   */
  _removePanel(panel) {
    panel.classList.remove('zhihu-remark-analysis-panel--visible');
    panel.classList.remove('zhihu-remark-truncated-panel--visible');
    setTimeout(() => {
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }, 300);
  },

  /**
   * 清理所有UI元素
   */
  cleanup() {
    this._notifications.forEach(n => this._removeNotification(n));
    document.querySelectorAll('.zhihu-remark-analysis-panel, .zhihu-remark-truncated-panel, .zhihu-remark-loading').forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UI;
}
