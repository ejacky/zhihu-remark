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
    if (this._injectedElements.has(answerElement)) {
      return;
    }

    // 找到评论按钮或评论区域
    const commentArea = this._findCommentArea(answerElement);
    if (!commentArea) {
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

    const loading = UI.createLoading('正在分析回答内容...');

    try {
      // 提取内容
      const content = Extractor.extractFromElement(answerElement);
      if (!content.text || content.text.length < 50) {
        throw new Error('未能提取到有效的回答内容，请尝试刷新页面');
      }

      loading.updateText('正在调用 AI 分析...');

      // 发送消息给 background 生成反驳
      const response = await this._sendGenerateMessage(content);

      if (!response.success) {
        throw new Error(response.error || '生成失败');
      }

      const result = response.data;

      // 显示分析面板
      UI.createAnalysisPanel(result.analysis, () => {
        // 用户点击"使用此反驳"
        this._fillCommentBox(answerElement, result.rebuttal);
        UI.showSuccess('反驳内容已填入评论框，请审核后发布');
      }, () => {
        // 用户关闭面板
      });

      // 如果开启了自动填充且没有错误分析面板（无错误时）
      if (!result.analysis.hasErrors) {
        UI.showWarning('未检测到明显错误，未生成反驳内容');
      }

    } catch (error) {
      console.error('[知乎反驳助手]', error);
      UI.showError(error.message || '生成失败，请检查配置后重试');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      loading.remove();
    }
  },

  /**
   * 发送生成消息到 background
   */
  _sendGenerateMessage(content) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: CONSTANTS.MESSAGE_TYPES.GENERATE_REBUTTAL,
        data: { content }
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
   */
  _tryFillCommentInput(answerElement, text) {
    // 策略1：新版知乎富文本编辑器
    const editableDiv = answerElement.querySelector('.Editable-div[contenteditable="true"], .RichContent-editor .Editable-div, [contenteditable="true"]');
    if (editableDiv) {
      // 设置内容
      editableDiv.focus();
      editableDiv.innerHTML = this._escapeHtml(text).replace(/\n/g, '<br>');

      // 触发输入事件
      const inputEvent = new InputEvent('input', { bubbles: true });
      editableDiv.dispatchEvent(inputEvent);

      // 触发知乎内部的事件监听
      const changeEvent = new Event('change', { bubbles: true });
      editableDiv.dispatchEvent(changeEvent);

      return true;
    }

    // 策略2：textarea
    const textarea = answerElement.querySelector('textarea[placeholder*="评论"], textarea[placeholder*="写下你的评论"], .CommentEditorV2-textarea');
    if (textarea) {
      textarea.value = text;
      textarea.focus();

      // 触发事件
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    }

    // 策略3：全局搜索评论框
    const globalEditable = document.querySelector('.Comments-container [contenteditable="true"], .Modal-wrapper [contenteditable="true"]');
    if (globalEditable) {
      globalEditable.focus();
      globalEditable.innerHTML = this._escapeHtml(text).replace(/\n/g, '<br>');
      globalEditable.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return true;
    }

    // 如果都失败了，显示提示让用户手动粘贴
    Utils.copyToClipboard(text).then(() => {
      UI.showWarning('未能自动填充评论框，反驳内容已复制到剪贴板，请手动粘贴');
    });

    return false;
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
