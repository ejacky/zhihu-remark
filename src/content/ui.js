/**
 * 知乎反驳助手 - UI 组件
 *
 * 面板只有一种形态：一段可以直接发的正文 + 两个动作（填入评论框 / 换个说法）。
 * v2.0 之前这里还渲染风格 Tab、错误类型标签、置信度、错误卡片、摘要、"优化这次生成"
 * 输入框、核心意图编辑器、快捷反馈 chips、有用/无用 —— 用户实际只会走两个动作，
 * 其余 19 个可点元素只是把 Prompt 的内部结构摊在界面上。相关结构已随 B2 删除。
 *
 * @doc docs/TECH_DESIGN.md#24-卡片与交互
 * @doc docs/USER_GUIDE.md#3-生成反驳
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

    requestAnimationFrame(() => {
      notification.classList.add('zhihu-remark-notification--visible');
    });

    if (duration > 0) {
      setTimeout(() => {
        this._removeNotification(notification);
      }, duration);
    }

    return notification;
  },

  showSuccess(message, duration) {
    return this.showNotification(message, 'success', duration);
  },

  showError(message, duration = 5000) {
    return this.showNotification(message, 'error', duration);
  },

  showWarning(message, duration) {
    return this.showNotification(message, 'warning', duration);
  },

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
   * 创建反驳卡片
   *
   * @param {Object} opts
   * @param {Object} opts.state - { rebuttal, loading, error }
   * @param {number|null} [opts.cachedAt] - 命中缓存时的生成时间戳（用于"上次生成于…"提示）
   * @param {Function} [opts.onRegenerate] - 「换个说法」
   * @param {Function} [opts.onUse] - 「填入评论框」
   * @param {Function} [opts.onDismiss] - 关闭
   * @returns {Object} { element, update(state), remove() }
   */
  createPanel({ state, cachedAt = null, onRegenerate, onUse, onDismiss }) {
    let current = { rebuttal: '', loading: false, error: null, ...(state || {}) };
    let cachedAtValue = cachedAt;

    const panel = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel'
    });

    // ===== 标题栏（可拖动）=====
    const header = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel__header'
    });
    header.appendChild(Utils.createElement('h3', {
      className: 'zhihu-remark-analysis-panel__title',
      textContent: '🛡️ 反驳'
    }));
    const closeBtn = Utils.createElement('button', {
      className: 'zhihu-remark-analysis-panel__close',
      textContent: '✕',
      onClick: () => closePanel()
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const contentArea = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel__content'
    });
    const actionsArea = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel__actions'
    });
    panel.appendChild(contentArea);
    panel.appendChild(actionsArea);

    // ===== 拖动 =====
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const onDragMove = (e) => {
      if (!isDragging) return;
      panel.style.left = `${e.clientX - dragOffsetX}px`;
      panel.style.top = `${e.clientY - dragOffsetY}px`;
      panel.style.right = 'auto';
    };
    const onDragEnd = () => {
      isDragging = false;
      panel.classList.remove('zhihu-remark-analysis-panel--dragging');
    };

    header.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn) return;
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      panel.classList.add('zhihu-remark-analysis-panel--dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // ===== 生成中计时（深度思考要等 30~50 秒）=====
    let loadingTimer = null;
    const stopLoadingTimer = () => {
      if (loadingTimer) {
        clearInterval(loadingTimer);
        loadingTimer = null;
      }
    };

    // ===== 关闭 =====
    function closePanel() {
      stopLoadingTimer();
      document.removeEventListener('keydown', escHandler);
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      UI._removePanel(panel);
      if (onDismiss) onDismiss();
    }

    function escHandler(e) {
      if (e.key === 'Escape') closePanel();
    }
    document.addEventListener('keydown', escHandler);

    // ===== 渲染 =====
    const formatTime = (ts) => {
      const d = new Date(ts);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    function render() {
      stopLoadingTimer();
      contentArea.replaceChildren();
      actionsArea.replaceChildren();

      // 生成中
      if (current.loading) {
        const startedAt = Date.now();
        const loadingText = Utils.createElement('div', {
          className: 'zhihu-remark-panel__loading-text',
          textContent: '正在思考…已 0 秒'
        });
        contentArea.appendChild(loadingText);

        loadingTimer = setInterval(() => {
          if (!loadingText.isConnected) {
            stopLoadingTimer();
            return;
          }
          const secs = Math.round((Date.now() - startedAt) / 1000);
          loadingText.textContent = secs > 20
            ? `正在深度思考…已 ${secs} 秒（通常 30~60 秒，可以先干别的）`
            : `正在思考…已 ${secs} 秒`;
        }, 1000);
        return;
      }

      // 失败
      if (current.error) {
        contentArea.appendChild(Utils.createElement('div', {
          className: 'zhihu-remark-analysis-panel__no-error',
          textContent: `生成失败：${current.error}`
        }));

        const retryBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--secondary',
          textContent: '🔄 重试',
          onClick: () => {
            retryBtn.disabled = true;
            retryBtn.textContent = '重试中…';
            if (onRegenerate) onRegenerate();
          }
        });
        actionsArea.appendChild(retryBtn);
        return;
      }

      // 正文
      const section = Utils.createElement('div', {
        className: 'zhihu-remark-analysis-panel__rebuttal-section'
      });

      if (cachedAtValue) {
        section.appendChild(Utils.createElement('div', {
          className: 'zhihu-remark-analysis-panel__rebuttal-label',
          textContent: `上次生成于 ${formatTime(cachedAtValue)}`,
          style: 'color:#999;font-weight:400;'
        }));
      }

      if (current.rebuttal) {
        section.appendChild(Utils.createElement('div', {
          className: 'zhihu-remark-analysis-panel__rebuttal-content',
          textContent: current.rebuttal
        }));
      }
      contentArea.appendChild(section);

      if (!current.rebuttal) return;

      const useBtn = Utils.createElement('button', {
        className: 'zhihu-remark-btn zhihu-remark-btn--primary',
        textContent: '填入评论框',
        onClick: async () => {
          useBtn.disabled = true;
          useBtn.textContent = '填充中…';
          if (onUse) await onUse(current.rebuttal);
          useBtn.disabled = false;
          useBtn.textContent = '填入评论框';
        }
      });
      const againBtn = Utils.createElement('button', {
        className: 'zhihu-remark-btn zhihu-remark-btn--secondary',
        textContent: '换个说法',
        onClick: () => {
          againBtn.disabled = true;
          if (onRegenerate) onRegenerate();
        }
      });

      actionsArea.appendChild(useBtn);
      actionsArea.appendChild(againBtn);
    }

    render();
    document.body.appendChild(panel);
    requestAnimationFrame(() => {
      panel.classList.add('zhihu-remark-analysis-panel--visible');
    });

    return {
      element: panel,
      update(next) {
        current = { ...current, ...(next || {}) };
        cachedAtValue = null; // 更新后不再是"上次生成"的内容
        render();
      },
      getState() {
        return { ...current };
      },
      remove: closePanel
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
   * 清理所有 UI 元素
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
