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
  createAnalysisPanel({ styleResults, currentStyle, onStyleChange, onRegenerate, onUse, onFeedback, onDismiss, initialState }) {
    const panel = Utils.createElement('div', {
      className: 'zhihu-remark-analysis-panel'
    });

    // 各风格独立的自定义要求缓存与历史
    const styleCustomHints = initialState?.styleCustomHints || {};
    const customHintHistory = initialState?.customHintHistory || {};
    const coreIntents = initialState?.coreIntents || {};

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

    // 拖动状态
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    header.addEventListener('mousedown', (e) => {
      // 只有点击标题栏空白处或文字时才拖动，不响应关闭按钮
      if (e.target === closeBtn) return;
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      panel.classList.add('zhihu-remark-analysis-panel--dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - dragOffsetX;
      const y = e.clientY - dragOffsetY;
      panel.style.transform = 'none';
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        panel.classList.remove('zhihu-remark-analysis-panel--dragging');
      }
    });

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

    // 统一关闭面板
    const closePanel = () => {
      UI._removePanel(panel);
      document.removeEventListener('keydown', escHandler);
      if (onDismiss) onDismiss();
    };

    function escHandler(e) {
      if (e.key === 'Escape') {
        closePanel();
      }
    }
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

          // 优化区（自定义要求 + 快捷反馈）
          const hintKey = `hint-${currentStyle}`;
          const historyKey = `history-${currentStyle}`;
          const intentKey = `intent-${currentStyle}`;
          const customHintId = `zhihu-remark-custom-hint-${currentStyle}`;
          const isExpanded = styleCustomHints[hintKey] !== undefined;
          const currentHint = styleCustomHints[hintKey] || '';

          const optimizationSection = Utils.createElement('div', {
            className: 'zhihu-remark-optimization-section'
          });

          const optimizationToggle = Utils.createElement('button', {
            className: 'zhihu-remark-optimization-toggle',
            textContent: isExpanded ? '收起优化 ▲' : '✏️ 优化这次生成'
          });

          const optimizationContent = Utils.createElement('div', {
            className: 'zhihu-remark-optimization-content'
          });

          const textarea = Utils.createElement('textarea', {
            id: customHintId,
            className: 'zhihu-remark-custom-hint-textarea',
            placeholder: '例如：请更简短一些；重点反驳数据造假部分；语气再温和一点……',
            value: currentHint
          });

          textarea.addEventListener('input', (e) => {
            styleCustomHints[hintKey] = e.target.value;
          });

          // 快捷反馈标签
          const feedbackChips = Utils.createElement('div', {
            className: 'zhihu-remark-feedback-chips'
          });

          const chipMap = [
            { type: 'missedPoint', label: '漏重点', hint: '请优先补充被原回答忽略的关键原因、视角或论据。' },
            { type: 'tooVague', label: '太泛泛', hint: '请具体指出原文哪里有问题，给出更有针对性的反驳。' },
            { type: 'inaccurate', label: '不准确', hint: '请更严谨地核实事实和逻辑，避免不确定的断言。' },
            { type: 'toneIssue', label: '语气差', hint: '请调整语气，使其更符合当前风格的预期。' }
          ];

          chipMap.forEach(({ type, label, hint }) => {
            const chip = Utils.createElement('button', {
              className: 'zhihu-remark-feedback-chip',
              textContent: label
            });
            chip.addEventListener('click', () => {
              if (onFeedback) {
                onFeedback(currentStyle, { type });
              }
              optimizationSection.classList.add('zhihu-remark-optimization-section--expanded');
              optimizationToggle.textContent = '收起优化 ▲';
              const existing = styleCustomHints[hintKey] || '';
              const separator = existing && !existing.endsWith('，') && !existing.endsWith('。') && !existing.endsWith('；') ? '；' : '';
              const newValue = existing ? `${existing}${separator}${hint}` : hint;
              styleCustomHints[hintKey] = newValue;
              textarea.value = newValue;
              setTimeout(() => textarea.focus(), 50);
            });
            feedbackChips.appendChild(chip);
          });

          optimizationContent.appendChild(textarea);
          optimizationContent.appendChild(feedbackChips);

          optimizationToggle.addEventListener('click', () => {
            const expanded = optimizationSection.classList.toggle('zhihu-remark-optimization-section--expanded');
            optimizationToggle.textContent = expanded ? '收起优化 ▲' : '✏️ 优化这次生成';
            if (expanded) {
              setTimeout(() => textarea.focus(), 50);
            }
          });

          optimizationSection.appendChild(optimizationToggle);
          optimizationSection.appendChild(optimizationContent);

          if (isExpanded) {
            optimizationSection.classList.add('zhihu-remark-optimization-section--expanded');
          }

          rebuttalSection.appendChild(optimizationSection);

          // 核心意图摘要展示与编辑
          const history = customHintHistory[historyKey] || [];
          const currentIntent = coreIntents[intentKey];
          if (history.length > 0 || currentIntent) {
            const intentSection = Utils.createElement('div', {
              className: 'zhihu-remark-intent-section'
            });

            const intentHeader = Utils.createElement('div', {
              className: 'zhihu-remark-intent-header'
            });
            const intentTitle = Utils.createElement('span', {
              className: 'zhihu-remark-intent-title',
              textContent: '💡 我理解你的要求'
            });
            const intentEditBtn = Utils.createElement('button', {
              className: 'zhihu-remark-intent-edit-btn',
              textContent: '修改'
            });
            intentHeader.appendChild(intentTitle);
            intentHeader.appendChild(intentEditBtn);
            intentSection.appendChild(intentHeader);

            const intentText = currentIntent
              ? currentIntent.text
              : UI._deriveCoreIntent(history).text;
            const intentBody = Utils.createElement('div', {
              className: 'zhihu-remark-intent-body',
              textContent: intentText
            });
            intentSection.appendChild(intentBody);

            const intentEditor = Utils.createElement('textarea', {
              className: 'zhihu-remark-intent-editor',
              value: intentText
            });
            intentEditor.addEventListener('input', (e) => {
              coreIntents[intentKey] = { text: e.target.value, manual: true };
            });
            intentSection.appendChild(intentEditor);

            intentEditBtn.addEventListener('click', () => {
              const editing = intentSection.classList.toggle('zhihu-remark-intent-section--editing');
              intentEditBtn.textContent = editing ? '保存' : '修改';
              if (editing) {
                intentEditor.value = coreIntents[intentKey]?.text || UI._deriveCoreIntent(history).text;
                setTimeout(() => intentEditor.focus(), 50);
              } else {
                coreIntents[intentKey] = { text: intentEditor.value.trim() || intentText, manual: true };
                intentBody.textContent = coreIntents[intentKey].text;
              }
            });

            rebuttalSection.appendChild(intentSection);
          }

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

        // 操作区
        const feedbackLeft = Utils.createElement('div', {
          className: 'zhihu-remark-feedback-left'
        });
        if (result.feedback) {
          const feedbackThanks = Utils.createElement('span', {
            className: 'zhihu-remark-feedback-thanks',
            textContent: result.feedback.type === 'helpful'
              ? '✅ 已标记为有用'
              : `✅ 已收到反馈：${UI._getFeedbackLabel(result.feedback.type)}`
          });
          feedbackLeft.appendChild(feedbackThanks);
        } else {
          const thumbsUpBtn = Utils.createElement('button', {
            className: 'zhihu-remark-thumbs-up-btn',
            title: '这次生成有用',
            textContent: '👍 有用'
          });
          thumbsUpBtn.addEventListener('click', () => {
            if (onFeedback) {
              onFeedback(currentStyle, { type: 'helpful' });
            }
          });
          feedbackLeft.appendChild(thumbsUpBtn);
        }

        // 操作按钮
        const regenerateBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--secondary',
          textContent: '🔄 重新生成',
          onClick: () => {
            regenerateBtn.disabled = true;
            regenerateBtn.textContent = '生成中...';

            const rawHint = styleCustomHints[`hint-${currentStyle}`]?.trim() || '';
            const historyKey = `history-${currentStyle}`;
            const intentKey = `intent-${currentStyle}`;

            if (rawHint) {
              customHintHistory[historyKey] = [...(customHintHistory[historyKey] || []), { text: rawHint, timestamp: Date.now() }].slice(-5);
            }

            const history = customHintHistory[historyKey] || [];
            const manualIntent = coreIntents[intentKey];
            let finalHint = '';

            if (manualIntent) {
              finalHint = manualIntent.text;
            } else if (history.length > 0) {
              finalHint = UI._deriveCoreIntent(history).text;
            } else {
              finalHint = rawHint;
            }

            if (onRegenerate) onRegenerate(currentStyle, finalHint.trim());
          }
        });

        const useBtn = Utils.createElement('button', {
          className: 'zhihu-remark-btn zhihu-remark-btn--primary',
          textContent: '使用此反驳',
          onClick: () => {
            if (onUse) onUse(currentStyle);
            closePanel();
          }
        });

        actionsArea.appendChild(feedbackLeft);
        actionsArea.appendChild(regenerateBtn);
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
      },
      getState() {
        return {
          styleResults: { ...styleResults },
          currentStyle,
          styleCustomHints: { ...styleCustomHints },
          customHintHistory: { ...customHintHistory },
          coreIntents: { ...coreIntents }
        };
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
   * 从自定义要求历史中归纳核心意图
   * @param {Array<{text: string, timestamp: number}>} hints
   * @returns {{text: string, tags: string[]}}
   */
  _deriveCoreIntent(hints) {
    if (!hints || hints.length === 0) {
      return { text: '', tags: [] };
    }

    const rules = [
      // 结构类（优先级较高，因为结构要求通常更明确）
      {
        tag: 'structured',
        keywords: ['分点', '列出来', '123', '1 2 3', '逐条', '条目'],
        label: '分点陈述'
      },
      {
        tag: 'paragraph',
        keywords: ['不要分点', '连起来', '一段话', '一段', '写成一段'],
        label: '写成一段'
      },

      // 语气/风格类
      {
        tag: 'concise',
        keywords: ['简短', '简短点', '短一点', '精简', '短一些', '简短些', '少点', '字数少'],
        label: '简短'
      },
      {
        tag: 'detailed',
        keywords: ['详细', '详细点', '详细一些', '具体', '具体点', '多说', '多写', '丰富'],
        label: '详细'
      },
      {
        tag: 'natural',
        keywords: ['自然', '像真人', '口语化', '不要 ai 味', '不要AI味', '像人写的', '像网友', '像评论', '真人', '随意'],
        label: '自然、像真人'
      },
      {
        tag: 'gentle',
        keywords: ['温和', '委婉', '客气', '友善', '不要攻击性', '别攻击性', '柔和', '平和'],
        label: '温和'
      },
      {
        tag: 'direct',
        keywords: ['犀利', '直接', '有力', '强硬', '尖锐', '一针见血', '直击要害'],
        label: '直接犀利'
      },
      {
        tag: 'academic',
        keywords: ['学术', '严谨', '引用', '专业', '术语', '规范'],
        label: '学术严谨'
      },

      // 内容侧重类
      {
        tag: 'focus',
        keywords: ['重点反驳', '重点说', '多说说', '抓住', '聚焦', '围绕', '主要反驳'],
        label: '重点反驳'
      },
      {
        tag: 'avoid',
        keywords: ['不要提', '跳过', '别提', '避免', '不要围绕', '不要重点'],
        label: '避免涉及'
      }
    ];

    const matchedTags = new Set();
    const matchedLabels = [];

    // 从最近一条开始扫描，后出现的同类别要求覆盖前面的
    for (let i = hints.length - 1; i >= 0; i--) {
      const text = hints[i].text.toLowerCase();
      for (const rule of rules) {
        if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
          if (!matchedTags.has(rule.tag)) {
            matchedTags.add(rule.tag);
            matchedLabels.push(rule.label);
          }
        }
      }
    }

    // 处理冲突：concise 与 detailed 同时存在时，以最近一条为准
    const orderedTags = Array.from(matchedTags);
    const hasConcise = orderedTags.includes('concise');
    const hasDetailed = orderedTags.includes('detailed');
    const lastHint = hints[hints.length - 1].text.toLowerCase();
    if (hasConcise && hasDetailed) {
      const conciseIndex = lastHint.search(/简短|精简|短一点|字数少/);
      const detailedIndex = lastHint.search(/详细|具体|多说|多写|丰富/);
      if (conciseIndex >= 0 && (detailedIndex < 0 || conciseIndex < detailedIndex)) {
        orderedTags.splice(orderedTags.indexOf('detailed'), 1);
      } else if (detailedIndex >= 0) {
        orderedTags.splice(orderedTags.indexOf('concise'), 1);
      }
    }

    // 生成自然语言摘要
    const labels = rules
      .filter(rule => orderedTags.includes(rule.tag))
      .map(rule => rule.label);

    if (labels.length === 0) {
      // 没有命中规则时，直接拼接最近的 2 条原始输入
      const recentHints = hints.slice(-2).map(h => h.text).join('；');
      return { text: `请根据以下要求重新生成反驳：${recentHints}。`, tags: [] };
    }

    const text = `请重新生成反驳，要求：${labels.join('、')}。请综合满足这些要求。`;
    return { text, tags: orderedTags };
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
