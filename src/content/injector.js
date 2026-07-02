/**
 * 知乎反驳助手 - 按钮注入器
 * 负责在知乎评论区域注入"生成反驳"按钮，并操作评论框
 */

const Injector = {
  // 已注入按钮的元素集合
  _injectedElements: new WeakSet(),

  /**
   * 扫描并注入按钮到所有回答的评论区域
   */
  injectAll() {
    const answers = Extractor.getAllAnswerElements();
    answers.forEach(answer => this._injectToAnswer(answer));
  },

  /**
   * 为单个回答注入按钮
   */
  _injectToAnswer(answerElement) {
    // 找到评论按钮或评论区域
    const commentArea = this._findCommentArea(answerElement);
    if (!commentArea) {
      return;
    }

    // 检查当前 DOM 中是否已存在按钮（防止重复注入）
    if (commentArea.querySelector('.zhihu-remark-btn')) {
      this._injectedElements.add(answerElement);
      return;
    }

    // 跳过被折叠的回答（等用户展开后 MutationObserver 会重新注入）
    if (this._isContentTruncated(answerElement, '')) return;

    const button = this._createButton(answerElement);
    commentArea.appendChild(button);
    this._injectedElements.add(answerElement);
  },

  /**
   * 查找评论区域
   */
  _findCommentArea(answerElement) {
    // 策略1：常见操作栏
    const actionsBar = answerElement.querySelector(
      '.ContentItem-actions, .AnswerCard-actions, .List-item .ContentItem-actions, .TopstoryItem .ContentItem-actions'
    );
    if (actionsBar) {
      if (!actionsBar.querySelector('.zhihu-remark-btn')) {
        return actionsBar;
      }
    }

    // 策略2：在评论按钮旁边
    const commentBtn = answerElement.querySelector(
      'button[aria-label*="评论"], .ContentItem-action button[data-za-detail-view-id*="comment"], [data-za-detail-view-id*="Comment"]'
    );
    if (commentBtn && commentBtn.parentNode) {
      return commentBtn.parentNode;
    }

    // 策略3：底部操作栏
    const bottomBar = answerElement.querySelector('.RichContent-bottom, .ContentItem-bottom, .TopstoryItem-bottom');
    if (bottomBar) {
      return bottomBar;
    }

    // 策略4：通用的操作按钮容器
    const genericActions = answerElement.querySelector('[class*="actions" i], [class*="ActionBar" i], [class*="operations" i]');
    if (genericActions && !genericActions.querySelector('.zhihu-remark-btn')) {
      return genericActions;
    }

    return null;
  },

  /**
   * 创建生成反驳按钮
   */
  _createButton(answerElement) {
    const button = Utils.createElement('button', {
      className: 'zhihu-remark-btn zhihu-remark-btn--generate',
      textContent: CONSTANTS.UI.BUTTON_TEXT,
      title: 'AI 分析此回答并生成反驳评论'
    });

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 防止重复点击
      if (button.disabled) return;

      await this._handleGenerateClick(button, answerElement);
    });

    return button;
  },

  /**
   * 检测回答内容是否被折叠（不完整）
   */
  _isContentTruncated(answerElement, text) {
    // 1. RichContent 折叠类（知乎推荐页使用 is-collapsed）
    const richContent = answerElement.querySelector('.RichContent');
    if (richContent?.classList.contains('is-collapsed') || richContent?.classList.contains('RichContent--isCollapsible')) return true;

    // 2. 搜索"阅读全文"按钮（文字匹配，处理嵌套元素的零宽空格干扰）
    const buttons = answerElement.querySelectorAll('button, a');
    for (const btn of buttons) {
      const txt = (btn.textContent || '').trim();
      if (txt.includes('阅读全文') || txt === '展开' || txt === '展开全文') return true;
    }

    // 3. 类名兜底（排除"收起"按钮）
    const classBtns = answerElement.querySelectorAll('.ContentItem-more, [class*="readMore" i], [class*="lookMore" i], .RichContent-lookMore, .ContentItem-rightButton');
    for (const btn of classBtns) {
      const txt = (btn.textContent || '').trim();
      if (!txt.includes('收起') && !txt.includes('折叠')) return true;
    }

    // 4. 文本末尾省略号检测
    const trimmed = text.trim();
    if (trimmed && (trimmed.endsWith('...') || trimmed.endsWith('…'))) return true;

    return false;
  },

  /**
   * 处理生成按钮点击
   */
  async _handleGenerateClick(button, answerElement) {
    const originalText = button.textContent;

    try {
      // 提取内容
      const content = Extractor.extractFromElement(answerElement);
      if (!content.text || content.text.length < 30) {
        throw new Error('未能提取到有效的回答内容，请尝试刷新页面');
      }

      button.disabled = true;
      button.textContent = CONSTANTS.UI.BUTTON_LOADING_TEXT;
      await this._executeGenerate(content, answerElement);

    } catch (error) {
      console.error('[知乎反驳助手]', error);
      UI.showError(error.message || '生成失败，请检查配置后重试');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  },

  /**
   * 执行 AI 生成反驳（提取为独立方法供复用）
   */
  async _executeGenerate(content, answerElement) {
    // 获取当前配置的风格
    const configResponse = await this._sendMessage({ type: CONSTANTS.MESSAGE_TYPES.GET_CONFIG });
    const defaultStyle = configResponse.success ? configResponse.data.style : 'gentle';

    // 初始化多风格缓存
    const styleResults = {
      [defaultStyle]: null
    };
    let currentStyle = defaultStyle;

    // 首次生成
    const loading = UI.createLoading('正在分析回答内容...');
    try {
      loading.updateText('正在调用 AI 分析...');
      const response = await this._sendGenerateMessage(content, defaultStyle);

      if (!response.success) {
        throw new Error(response.error || '生成失败');
      }

      styleResults[defaultStyle] = {
        analysis: response.data.analysis,
        rebuttal: response.data.rebuttal,
        historyId: response.data.historyId,
        feedback: null,
        loading: false,
        error: null
      };

      if (!response.data.analysis.hasErrors) {
        UI.showWarning('未检测到明显错误，未生成反驳内容');
      }
    } catch (error) {
      styleResults[defaultStyle] = {
        analysis: null,
        rebuttal: '',
        loading: false,
        error: error.message || '生成失败'
      };
      UI.showError(error.message || '生成失败，请检查配置后重试');
    } finally {
      loading.remove();
    }

    // 打开面板
    this._openAnalysisPanel(content, answerElement, styleResults, currentStyle);
  },

  /**
   * 打开/管理分析面板（支持多风格切换）
   */
  _openAnalysisPanel(content, answerElement, styleResults, currentStyle) {
    let panelCtrl = null;

    const refreshPanel = () => {
      if (panelCtrl) {
        panelCtrl.update({ styleResults, currentStyle });
      }
    };

    const generateForStyle = async (style, isRegenerate) => {
      // 标记该风格为加载中
      styleResults[style] = { analysis: null, rebuttal: '', loading: true, error: null };
      refreshPanel();

      try {
        const regenerateHint = isRegenerate
          ? '（这是重新生成请求。请换一个角度、换一种表达方式重新生成反驳内容，避免与之前的版本雷同。）'
          : undefined;
        const response = await this._sendGenerateMessage(content, style, regenerateHint);

        if (!response.success) {
          throw new Error(response.error || '生成失败');
        }

        styleResults[style] = {
          analysis: response.data.analysis,
          rebuttal: response.data.rebuttal,
          historyId: response.data.historyId,
          feedback: null,
          loading: false,
          error: null
        };
      } catch (error) {
        styleResults[style] = {
          analysis: null,
          rebuttal: '',
          loading: false,
          error: error.message || '生成失败'
        };
      }

      refreshPanel();
    };

    panelCtrl = UI.createAnalysisPanel({
      styleResults,
      currentStyle,
      onStyleChange: (style) => {
        currentStyle = style;
        if (!styleResults[style]) {
          // 未生成过，自动触发
          generateForStyle(style);
        } else {
          refreshPanel();
        }
      },
      onRegenerate: (style) => {
        generateForStyle(style, true);
      },
      onUse: async (style) => {
        const result = styleResults[style];
        if (result && result.rebuttal) {
          await this._fillCommentBox(answerElement, result.rebuttal);
          UI.showSuccess('反驳内容已填入评论框，请审核后发布');
        }
      },
      onFeedback: async (style, feedback) => {
        const result = styleResults[style];
        if (!result || !result.historyId) {
          UI.showWarning('无法记录反馈，请稍后再试');
          return;
        }

        try {
          const response = await this._sendMessage({
            type: CONSTANTS.MESSAGE_TYPES.UPDATE_FEEDBACK,
            data: { historyId: result.historyId, feedback }
          });

          if (response.success) {
            styleResults[style] = {
              ...result,
              feedback
            };
            refreshPanel();
            UI.showSuccess('反馈已记录，下次重新生成将参考您的意见');
          } else {
            UI.showError(response.error || '反馈记录失败');
          }
        } catch (err) {
          UI.showError(err.message || '反馈记录失败');
        }
      },
      onDismiss: () => {
        panelCtrl = null;
      }
    });
  },

  /**
   * 发送生成消息到 background
   * @param {Object} content - 回答内容
   * @param {string} [style] - 临时指定的风格
   * @param {string} [regenerateHint] - 重新生成提示
   */
  _sendGenerateMessage(content, style, regenerateHint) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: CONSTANTS.MESSAGE_TYPES.GENERATE_REBUTTAL,
        data: { content, style, regenerateHint }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response || { success: false, error: '无响应' });
        }
      });
    });
  },

  /**
   * 通用消息发送
   */
  _sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response || { success: false, error: '无响应' });
        }
      });
    });
  },

  /**
   * 将反驳内容填入评论框
   */
  async _fillCommentBox(answerElement, text) {
    // 先尝试展开评论区域
    const commentBtn = answerElement.querySelector('button[aria-label*="评论"], .ContentItem-action button[data-za-detail-view-id*="comment"]');
    if (commentBtn) {
      commentBtn.click();
    }

    // 等待评论框出现
    await new Promise(resolve => setTimeout(resolve, 800));

    const success = await this._tryFillCommentInput(answerElement, text);
    if (!success) {
      await Utils.copyToClipboard(text);
      UI.showWarning('未能自动填充评论框，反驳内容已复制到剪贴板，请手动粘贴');
    }
  },

  /**
   * 尝试填充评论输入框
   * 核心目标：让编辑器正确感知内容变化，使发布按钮可用
   */
  async _tryFillCommentInput(answerElement, text) {
    // ===== 策略1：新版知乎富文本编辑器 =====
    const editableDiv = answerElement.querySelector('.Editable-div[contenteditable="true"], .RichContent-editor .Editable-div, [contenteditable="true"]');
    if (editableDiv) {
      return await this._fillContentEditable(editableDiv, text);
    }

    // ===== 策略2：textarea =====
    const textarea = answerElement.querySelector('textarea[placeholder*="评论"], textarea[placeholder*="写下你的评论"], .CommentEditorV2-textarea');
    if (textarea) {
      this._fillTextarea(textarea, text);
      return true;
    }

    // ===== 策略3：全局搜索评论框 =====
    const globalEditable = document.querySelector('.Comments-container [contenteditable="true"], .Modal-wrapper [contenteditable="true"]');
    if (globalEditable) {
      return await this._fillContentEditable(globalEditable, text);
    }

    return false;
  },

  /**
   * 填充 contenteditable 编辑器
   * 核心方案：直接创建 ClipboardEvent('paste') 并携带 DataTransfer 数据
   * 让编辑器（Slate.js/Draft.js）走自己的原生 paste handler
   */
  async _fillContentEditable(element, text) {
    element.focus();

    // Step 1: 尝试写入系统剪贴板（作为辅助，真实手动粘贴时可用）
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // 忽略权限错误，核心逻辑不依赖系统剪贴板
    }

    // Step 2: 创建带数据的 paste 事件
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    dt.setData('text/html', this._escapeHtml(text).replace(/\n/g, '<br>'));

    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });

    element.dispatchEvent(pasteEvent);

    // Step 3: 检查编辑器是否处理了 paste
    // Slate.js 等编辑器会在 onPaste 中调用 event.preventDefault()
    if (!pasteEvent.defaultPrevented) {
      // 编辑器没拦截 paste，不设置 innerHTML（避免僵尸内容）
      // 直接返回失败，外层 fallback 到剪贴板复制 + 提示手动粘贴
      return false;
    }

    return true;
  },

  /**
   * 填充 textarea（绕过 React setter 劫持）
   */
  _fillTextarea(textarea, text) {
    textarea.focus();

    // 使用原生 property setter 绕过 React 受控组件封装
    const valueDescriptor = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    );
    if (valueDescriptor && valueDescriptor.set) {
      valueDescriptor.set.call(textarea, text);
    } else {
      textarea.value = text;
    }

    // 触发完整事件序列，让 React 感知变化
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  },

  /**
   * 模拟 paste 事件（fallback）
   */
  _simulatePaste(element, text) {
    try {
      const html = this._escapeHtml(text).replace(/\n/g, '<br>');
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      dt.setData('text/html', html);

      element.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      }));
    } catch (e) {
      // 最小 fallback：触发 input 事件
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText'
      }));
    }
  },

  /**
   * HTML 转义
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * 扫描指定容器内的回答元素并注入按钮
   */
  _scanAndInject(container) {
    const selectors = '.AnswerCard, .List-item, .ContentItem, .TopstoryItem';
    const answers = container.matches?.(selectors)
      ? [container]
      : container.querySelectorAll(selectors);
    answers.forEach(answer => this._injectToAnswer(answer));
  },

  /**
   * 监听 DOM 变化，动态注入按钮
   */
  startObserver() {
    // 使用防抖避免频繁触发
    const debouncedInject = Utils.debounce(() => {
      this.injectAll();
    }, 500);

    const observer = new MutationObserver((mutations) => {
      // 检查是否有新的回答或 Modal 被添加
      const hasNewContent = mutations.some(mutation => {
        return Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          return node.matches?.('.AnswerCard, .List-item, .ContentItem, .TopstoryItem, .Card, .Modal, .Drawer, [class*="modal" i], [class*="drawer" i]') ||
                 node.querySelector?.('.AnswerCard, .List-item, .ContentItem, .TopstoryItem, .Modal, .Drawer');
        });
      });

      // 检测属性变化（class 变化可能意味着展开/收起）
      const hasAttrChange = mutations.some(m => m.type === 'attributes');

      if (hasNewContent || hasAttrChange) {
        debouncedInject();
      }

      // Modal/Drawer 弹出时立即扫描内部（不防抖）
      mutations.forEach(mutation => {
        Array.from(mutation.addedNodes).forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches?.('.Modal, .Drawer, [class*="modal" i], [class*="drawer" i]')) {
              this._scanAndInject(node);
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    // 初始注入
    this.injectAll();

    return observer;
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Injector;
}
