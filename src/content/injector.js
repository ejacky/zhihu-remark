/**
 * 知乎反驳助手 - 按钮注入器
 * 负责在知乎评论区域注入"生成反驳"按钮，并操作评论框
 */

const Injector = {
  // 已注入按钮的元素集合
  _injectedElements: new WeakSet(),

  // 已关闭面板的状态缓存（按回答内容标识）
  _panelCache: new Map(),

  // 「换个说法」时附带的提示：换角度重写，避免和上一版雷同
  REGENERATE_HINT: '换一个角度、换一种说法重写这条评论，不要和上一版本雷同。',

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
   * 获取回答的稳定标识（用于缓存面板状态）
   */
  _getAnswerId(content) {
    const url = content.url || window.location.href;
    const author = content.author || '';
    const textPreview = (content.text || '').slice(0, 300).replace(/\s+/g, ' ').trim();
    return `${url}|${author}|${textPreview}`;
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

      const answerId = this._getAnswerId(content);
      const cached = this._panelCache.get(answerId);

      if (cached) {
        // 有缓存：直接恢复面板，不重新生成
        this._openPanel(content, answerElement, cached.state, cached.cachedAt);
        return;
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
    // 获取配置里的默认风格（面板不再提供风格切换，风格在设置页统一设定）
    const configResponse = await this._sendMessage({ type: CONSTANTS.MESSAGE_TYPES.GET_CONFIG });
    const style = configResponse.success ? configResponse.data.style : 'gentle';

    // 先开面板（loading 态）再请求：深度思考要等 30~50 秒，用户必须看到计时
    const panel = this._openPanel(
      content,
      answerElement,
      { rebuttal: '', loading: true, error: null, style },
      null
    );

    await this._generateInto(panel, content, style, '');
  },

  /**
   * 发起一次生成并写回面板
   * @param {Object} panel - UI.createPanel 返回的控制器
   * @param {Object} content - 回答内容
   * @param {string} style - 风格
   * @param {string} regenerateHint - 重新生成提示（空字符串表示首次生成）
   */
  async _generateInto(panel, content, style, regenerateHint) {
    try {
      const response = await this._sendGenerateMessage(content, style, regenerateHint || undefined);

      if (!response.success) {
        throw new Error(response.error || '生成失败');
      }

      panel.update({
        rebuttal: response.data.rebuttal,
        loading: false,
        error: null,
        historyId: response.data.historyId,
        style
      });
    } catch (error) {
      panel.update({
        rebuttal: '',
        loading: false,
        error: error.message || '生成失败',
        style
      });
    }
  },

  /**
   * 打开反驳卡片
   *
   * 面板只保留一份状态（不再按风格各存一份），缓存也按回答维度存这一份。
   *
   * @param {Object} content - 回答内容
   * @param {Element} answerElement - 回答 DOM
   * @param {Object} state - { rebuttal, loading, error, style }
   * @param {number|null} [cachedAt] - 命中缓存时的时间戳
   * @returns {Object} 面板控制器
   */
  _openPanel(content, answerElement, state, cachedAt = null) {
    const answerId = this._getAnswerId(content);
    let panelCtrl = null;

    panelCtrl = UI.createPanel({
      state,
      cachedAt,
      onRegenerate: () => {
        panelCtrl.update({ rebuttal: '', loading: true, error: null });
        this._generateInto(panelCtrl, content, state.style || 'gentle', this.REGENERATE_HINT);
      },
      onUse: async (rebuttal) => {
        await this._fillCommentBox(answerElement, rebuttal);
        UI.showSuccess('反驳内容已填入评论框，请审核后发布');
        // 使用后清除缓存，避免下次打开时仍显示旧结果
        this._panelCache.delete(answerId);
      },
      onDismiss: () => {
        const latest = panelCtrl.getState();
        if (latest.rebuttal && !latest.error) {
          this._panelCache.set(answerId, { state: latest, cachedAt: Date.now() });
        }
      }
    });

    return panelCtrl;
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
