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
   * 创建浮动分析面板
   * @param {Object} analysisData - 分析数据
   * @param {Function} onUse - 点击"使用此反驳"回调
   * @param {Function} onDismiss - 点击关闭回调
   * @param {Function} [onRegenerate] - 点击"重新生成"回调
   * @param {string} [rebuttal] - 生成的反驳内容预览
   */
  createAnalysisPanel(analysisData, onUse, onDismiss, onRegenerate, rebuttal) {
    const { hasErrors, errorTypes, summary } = analysisData;

    const panel = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel'
    });

    // 标题
    const header = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel__header'
    });

    const title = Utils.createElement('h3', {
      className: 'zhihu-remark-analysis-panel__title',
      textContent: hasErrors ? '🔍 错误分析' : '✅ 未检测到明显错误'
    });
    header.appendChild(title);

    // 关闭按钮
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

    if (hasErrors) {
      // 错误类型标签
      const tagsContainer = Utils.createElement('div', {
        className: 'zhihu-remark-analysis-panel__tags'
      });

      errorTypes.forEach(typeKey => {
        const typeInfo = CONSTANTS.ERROR_TYPES[typeKey];
        if (typeInfo) {
          const tag = Utils.createElement('span', {
            className: `zhihu-remark-tag zhihu-remark-tag--${typeKey}`,
            textContent: `${typeInfo.icon} ${typeInfo.label}`
          });
          tagsContainer.appendChild(tag);
        }
      });
      panel.appendChild(tagsContainer);

      // 摘要
      const summaryEl = Utils.createElement('div', {
        className: 'zhihu-remark-analysis-panel__summary',
        textContent: summary
      });
      panel.appendChild(summaryEl);

      // 生成的反驳内容预览
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
        panel.appendChild(rebuttalSection);
      }

      // 操作按钮
      const actions = Utils.createElement('div', {
        className: 'zhihu-remark-analysis-panel__actions'
      });

      if (onRegenerate) {
        const regenerateBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--secondary',
          textContent: '🔄 重新生成',
          onClick: () => {
            regenerateBtn.disabled = true;
            regenerateBtn.textContent = '生成中...';
            if (onRegenerate) onRegenerate(panel, regenerateBtn);
          }
        });
        actions.appendChild(regenerateBtn);
      }

      const useBtn = Utils.createElement('button', {
        className: 'zhihu-remark-btn zhihu-remark-btn--primary',
        textContent: '使用此反驳',
        onClick: () => {
          if (onUse) onUse();
          this._removePanel(panel);
        }
      });
      actions.appendChild(useBtn);
      panel.appendChild(actions);
    } else {
      // 无错误时的提示
      const noErrorTip = Utils.createElement('div', {
        className: 'zhihu-remark-analysis-panel__no-error',
        textContent: 'AI 未在该回答中发现明显的事实错误或逻辑谬误。如果您认为有误，可以尝试手动触发分析。'
      });
      panel.appendChild(noErrorTip);
    }

    document.body.appendChild(panel);

    // 动画
    requestAnimationFrame(() => {
      panel.classList.add('zhihu-remark-analysis-panel--visible');
    });

    return panel;
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
    document.querySelectorAll('.zhihu-remark-analysis-panel, .zhihu-remark-loading').forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UI;
}
