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

    const button = this._createButton(answerElement);
    commentArea.appendChild(button);
    this._injectedElements.add(answerElement);
  },

  /**
   * 查找评论区域
   */
  _findCommentArea(answerElement) {
    // 策略1：新版知乎 - 评论按钮所在的 actions bar
    const actionsBar = answerElement.querySelector('.ContentItem-actions, .AnswerCard-actions, .List-item .ContentItem-actions');
    if (actionsBar) {
      // 检查是否已有按钮
      if (!actionsBar.querySelector('.zhihu-remark-btn')) {
        return actionsBar;
      }
    }

    // 策略2：在评论按钮旁边
    const commentBtn = answerElement.querySelector('button[aria-label*="评论"], .ContentItem-action button[data-za-detail-view-id*="comment"]');
    if (commentBtn && commentBtn.parentNode) {
      return commentBtn.parentNode;
    }

    // 策略3：底部操作栏
    const bottomBar = answerElement.querySelector('.RichContent-bottom, .ContentItem-bottom');
    if (bottomBar) {
      return bottomBar;
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
   * 处理生成按钮点击
   */
  async _handleGenerateClick(button, answerElement) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = CONSTANTS.UI.BUTTON_LOADING_TEXT;

    try {
      // 提取内容
      const content = Extractor.extractFromElement(answerElement);
      if (!content.text || content.text.length < 50) {
        throw new Error('未能提取到有效的回答内容，请尝试刷新页面');
      }

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

    } catch (error) {
      console.error('[知乎反驳助手]', error);
      UI.showError(error.message || '生成失败，请检查配置后重试');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
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
      onUse: (style) => {
        const result = styleResults[style];
        if (result && result.rebuttal) {
          this._fillCommentBox(answerElement, result.rebuttal);
          UI.showSuccess('反驳内容已填入评论框，请审核后发布');
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
  _fillCommentBox(answerElement, text) {
    // 先尝试展开评论区域
    const commentBtn = answerElement.querySelector('button[aria-label*="评论"], .ContentItem-action button[data-za-detail-view-id*="comment"]');
    if (commentBtn) {
      commentBtn.click();
    }

    // 等待评论框出现
    setTimeout(() => {
      this._tryFillCommentInput(answerElement, text);
    }, 800);
  },

  /**
   * 尝试填充评论输入框
   * 核心目标：让 React 受控组件正确感知内容变化，使发布按钮可用
   */
  _tryFillCommentInput(answerElement, text) {
    // ===== 策略1：新版知乎富文本编辑器 =====
    const editableDiv = answerElement.querySelector('.Editable-div[contenteditable="true"], .RichContent-editor .Editable-div, [contenteditable="true"]');
    if (editableDiv) {
      this._fillContentEditable(editableDiv, text);
      return true;
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
      this._fillContentEditable(globalEditable, text);
      return true;
    }

    // 如果都失败了，显示提示让用户手动粘贴
    Utils.copyToClipboard(text).then(() => {
      UI.showWarning('未能自动填充评论框，反驳内容已复制到剪贴板，请手动粘贴');
    });

    return false;
  },

  /**
   * 填充 contenteditable 编辑器（触发完整原生事件链）
   */
  _fillContentEditable(element, text) {
    element.focus();

    // Step 1: 清空现有内容并创建选区
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.deleteContents();
    selection.removeAllRanges();
    selection.addRange(range);

    // Step 2: 使用 execCommand 插入文本，触发浏览器原生事件序列
    // execCommand 会触发 beforeinput → input → 内部状态更新
    const success = document.execCommand('insertText', false, text);

    if (!success) {
      // Fallback：直接设置 + 模拟 paste 事件
      element.innerHTML = this._escapeHtml(text).replace(/\n/g, '<br>');
      this._simulatePaste(element, text);
    }
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
   * 模拟 paste 事件（execCommand 失败时的 fallback）
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
   * 监听 DOM 变化，动态注入按钮
   */
  startObserver() {
    // 使用防抖避免频繁触发
    const debouncedInject = Utils.debounce(() => {
      this.injectAll();
    }, 500);

    const observer = new MutationObserver((mutations) => {
      // 检查是否有新的回答被添加
      const hasNewContent = mutations.some(mutation => {
        return Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          return node.matches?.('.AnswerCard, .List-item, .ContentItem') ||
                 node.querySelector?.('.AnswerCard, .List-item, .ContentItem');
        });
      });

      if (hasNewContent) {
        debouncedInject();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
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
