/**
 * 知乎反驳助手 - UI 组件
 * 负责浮动提示、通知、加载状态等界面元素
 * @doc docs/TECH_DESIGN.md#内容脚本
 * @doc docs/USER_GUIDE.md#生成反驳
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
   * @param {Function} options.onFeedback - 反馈回调 (style, feedback) => {}
   * @param {Function} options.onDismiss - 关闭面板回调
   * @returns {Object} { element, update, remove }
   */
  createAnalysisPanel({ styleResults, currentStyle, onStyleChange, onRegenerate, onUse, onFeedback, onDismiss }) {
    const panel = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel'
    });

    // 各风格独立的自定义要求缓存
    const styleCustomHints = {};

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
      onClick: () => closePanel()
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

    // 统一关闭面板并清理事件
    const closePanel = () => {
      UI._removePanel(panel);
      document.removeEventListener('mousedown', outsideClickHandler);
      document.removeEventListener('keydown', escHandler);
      if (onDismiss) onDismiss();
    };

    function outsideClickHandler(e) {
      if (!panel.contains(e.target)) {
        closePanel();
      }
    }

    function escHandler(e) {
      if (e.key === 'Escape') {
        closePanel();
      }
    }

    document.addEventListener('mousedown', outsideClickHandler);
    document.addEventListener('keydown', escHandler);

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
        // 有数据：显示错误标签、摘要、错误详情、反驳预览
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

        // 置信度与错误数量
        const metaRow = Utils.createElement('div', {
          className: 'zhihu-remark-analysis-panel__meta'
        });
        if (result.confidence) {
          const confidenceBadge = Utils.createElement('span', {
            className: `zhihu-remark-confidence-badge zhihu-remark-confidence-badge--${result.confidence}`,
            textContent: `置信度：${UI._getConfidenceLabel(result.confidence)}`
          });
          metaRow.appendChild(confidenceBadge);
        }
        if (result.errors?.length) {
          const countBadge = Utils.createElement('span', {
            className: 'zhihu-remark-error-count',
            textContent: `${result.errors.length} 处错误`
          });
          metaRow.appendChild(countBadge);
        }
        contentArea.appendChild(metaRow);

        // 错误详情
        if (result.errors?.length) {
          const errorList = Utils.createElement('div', {
            className: 'zhihu-remark-error-list'
          });
          const errorListTitle = Utils.createElement('div', {
            className: 'zhihu-remark-error-list__title',
            textContent: '错误详情'
          });
          errorList.appendChild(errorListTitle);
          result.errors.forEach(err => {
            const typeInfo = CONSTANTS.ERROR_TYPES[err.type];
            const card = Utils.createElement('div', {
              className: 'zhihu-remark-error-card'
            });
            const cardType = Utils.createElement('div', {
              className: 'zhihu-remark-error-card__type',
              textContent: `${typeInfo?.icon || '•'} ${typeInfo?.label || err.type || '未知类型'}`
            });
            const cardClaim = Utils.createElement('div', {
              className: 'zhihu-remark-error-card__claim',
              textContent: `原文：${err.originalClaim || ''}`
            });
            const cardCorrection = Utils.createElement('div', {
              className: 'zhihu-remark-error-card__correction',
              textContent: `纠正：${err.correction || ''}`
            });
            card.appendChild(cardType);
            card.appendChild(cardClaim);
            card.appendChild(cardCorrection);
            errorList.appendChild(card);
          });
          contentArea.appendChild(errorList);
        }

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
          const rebuttalHeader = Utils.createElement('div', {
            className: 'zhihu-remark-analysis-panel__rebuttal-header'
          });
          const rebuttalLabel = Utils.createElement('div', {
            className: 'zhihu-remark-analysis-panel__rebuttal-label',
            textContent: '📝 生成的反驳'
          });
          const copyBtn = Utils.createElement('button', {
            className: 'zhihu-remark-copy-btn',
            textContent: '📋 复制',
            onClick: async () => {
              const ok = await Utils.copyToClipboard(rebuttal);
              copyBtn.textContent = ok ? '✅ 已复制' : '❌ 复制失败';
              setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 1500);
            }
          });
          rebuttalHeader.appendChild(rebuttalLabel);
          rebuttalHeader.appendChild(copyBtn);
          rebuttalSection.appendChild(rebuttalHeader);
          const rebuttalContent = Utils.createElement('div', {
            className: 'zhihu-remark-analysis-panel__rebuttal-content',
            textContent: rebuttal
          });
          rebuttalSection.appendChild(rebuttalContent);

          // 自定义要求输入区（可折叠）
          const hintKey = `hint-${currentStyle}`;
          const customHintId = `zhihu-remark-custom-hint-${currentStyle}`;
          const isExpanded = styleCustomHints[hintKey] !== undefined;
          const currentHint = styleCustomHints[hintKey] || '';

          const customHintSection = Utils.createElement('div', {
            className: 'zhihu-remark-custom-hint-section'
          });

          const toggleBtn = Utils.createElement('button', {
            className: 'zhihu-remark-custom-hint-toggle',
            textContent: isExpanded ? '收起要求 ▲' : '✏️ 添加自定义要求'
          });

          const textarea = Utils.createElement('textarea', {
            id: customHintId,
            className: 'zhihu-remark-custom-hint-textarea',
            placeholder: '例如：请更简短一些；重点反驳数据造假部分；语气再温和一点……',
            value: currentHint
          });

          toggleBtn.addEventListener('click', () => {
            const expanded = customHintSection.classList.toggle('zhihu-remark-custom-hint-section--expanded');
            toggleBtn.textContent = expanded ? '收起要求 ▲' : '✏️ 添加自定义要求';
            if (expanded) {
              setTimeout(() => textarea.focus(), 50);
            }
          });

          textarea.addEventListener('input', (e) => {
            styleCustomHints[hintKey] = e.target.value;
          });

          customHintSection.appendChild(toggleBtn);
          customHintSection.appendChild(textarea);

          if (isExpanded) {
            customHintSection.classList.add('zhihu-remark-custom-hint-section--expanded');
          }

          rebuttalSection.appendChild(customHintSection);
          contentArea.appendChild(rebuttalSection);
        }

        // 上次使用的自定义要求提示
        if (result.lastCustomHint) {
          const lastHintTip = Utils.createElement('div', {
            className: 'zhihu-remark-last-hint-tip',
            textContent: `✅ 已按“${result.lastCustomHint}”重新生成`
          });
          contentArea.appendChild(lastHintTip);
        }

        // 反馈区
        const feedbackArea = Utils.createElement('div', {
          className: 'zhihu-remark-feedback-area'
        });
        if (result.feedback) {
          const feedbackThanks = Utils.createElement('div', {
            className: 'zhihu-remark-feedback-thanks',
            textContent: `✅ 已收到反馈：${UI._getFeedbackLabel(result.feedback.type)}`
          });
          feedbackArea.appendChild(feedbackThanks);
        } else {
          const feedbackLabel = Utils.createElement('span', {
            className: 'zhihu-remark-feedback-label',
            textContent: '这次生成有帮助吗？'
          });
          feedbackArea.appendChild(feedbackLabel);

          const feedbackButtons = [
            { type: 'helpful', label: '👍 有用' },
            { type: 'missedPoint', label: '漏重点' },
            { type: 'tooVague', label: '太泛泛' },
            { type: 'inaccurate', label: '不准确' },
            { type: 'toneIssue', label: '语气差' }
          ];

          feedbackButtons.forEach(({ type, label }) => {
            const btn = Utils.createElement('button', {
              className: 'zhihu-remark-feedback-btn',
              textContent: label,
              onClick: () => {
                if (onFeedback) {
                  onFeedback(currentStyle, { type });
                }
              }
            });
            feedbackArea.appendChild(btn);
          });
        }
        actionsArea.appendChild(feedbackArea);

        // 操作按钮
        const regenerateBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--secondary',
          textContent: '🔄 重新生成',
          onClick: () => {
            regenerateBtn.disabled = true;
            regenerateBtn.textContent = '生成中...';
            const customHint = styleCustomHints[`hint-${currentStyle}`]?.trim() || '';
            if (onRegenerate) onRegenerate(currentStyle, customHint);
          }
        });
        actionsArea.appendChild(regenerateBtn);

        const useBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--primary',
          textContent: '使用此反驳',
          onClick: () => {
            if (onUse) onUse(currentStyle);
            closePanel();
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
        closePanel();
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
   * 获取反馈类型显示文本
   */
  _getFeedbackLabel(type) {
    const labels = {
      helpful: '有用',
      missedPoint: '漏重点',
      tooVague: '太泛泛',
      inaccurate: '不准确',
      toneIssue: '语气差',
      other: '其他'
    };
    return labels[type] || type;
  },

  /**
   * 获取置信度显示文本
   */
  _getConfidenceLabel(confidence) {
    const labels = {
      high: '高',
      medium: '中',
      low: '低'
    };
    return labels[confidence] || confidence;
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
