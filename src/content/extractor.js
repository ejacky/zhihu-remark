/**
 * 知乎反驳助手 - 内容提取器
 * 负责从知乎页面提取回答的标题、正文、作者等信息
 * @doc docs/TECH_DESIGN.md#23-内容提取
 * @doc docs/USER_GUIDE.md#2-如何使用反驳助手
 */

const MIN_TEXT_LENGTH = 30;

const Extractor = {
  /**
   * 主提取函数 - 尝试多种策略提取回答内容
   */
  extractAnswer(element) {
    // 策略1：新版知乎（2024-2025）
    const result = this._tryModernZhihu(element);
    if (result && result.text && result.text.length >= MIN_TEXT_LENGTH) {
      return result;
    }

    // 策略2：旧版知乎
    const result2 = this._tryLegacyZhihu(element);
    if (result2 && result2.text && result2.text.length >= MIN_TEXT_LENGTH) {
      return result2;
    }

    // 策略3：通用提取（fallback）
    const result3 = this._tryGenericExtraction(element);
    if (result3 && result3.text && result3.text.length >= MIN_TEXT_LENGTH) {
      return result3;
    }

    // 所有策略均失败，返回空结果
    return { title: '', author: '', text: '', voteCount: '0', url: '', strategy: 'failed' };
  },

  /**
   * 判断文本是否为日期/时间字符串（而非问题标题）
   */
  _isDateLikeText(text) {
    if (!text) return true;
    // 包含常见日期前缀或时间格式
    const datePatterns = [
      /发布于\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}/,
      /编辑于\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}/,
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}$/,
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,
      /^\d{1,2}:\d{2}$/,
      /\d{4}年\d{1,2}月\d{1,2}日/,
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}$/
    ];
    return datePatterns.some(p => p.test(text));
  },

  /**
   * 提取问题标题
   * @param {Element} answerElement - 回答元素（推荐页需传入，从元素内部提取问题标题）
   */
  extractPageTitle(answerElement) {
    // 策略1：从回答元素内部提取（推荐页 Feed 流等场景，每个回答有自己的问题标题）
    if (answerElement && answerElement.nodeType === Node.ELEMENT_NODE) {
      const innerTitle = answerElement.querySelector(
        '.ContentItem-title, h2.ContentItem-title, .ContentItem-meta a[href*="/question/"], [data-za-detail-view-id="view_question"]'
      );
      if (innerTitle) {
        const text = innerTitle.textContent.trim();
        if (text && text.length > 3 && text.length < 200 && !this._isDateLikeText(text)) return text;
      }

      // 尝试从链接的 aria-label 或 title 中提取
      const questionLink = answerElement.querySelector('a[href*="/question/"]');
      if (questionLink) {
        const text = (questionLink.getAttribute('aria-label') || questionLink.getAttribute('title') || questionLink.textContent).trim();
        if (text && text.length > 3 && text.length < 200 && !this._isDateLikeText(text)) return text;
      }
    }

    // 策略2：从页面级 data-zop-question 属性提取（问题详情页、单个回答页）
    // 该属性包含 JSON 格式的问题元数据，比 DOM 选择器更可靠
    const zopQuestion = document.querySelector('[data-zop-question]');
    if (zopQuestion) {
      try {
        const data = JSON.parse(zopQuestion.getAttribute('data-zop-question'));
        if (data && data.title && data.title.length > 3) {
          return data.title;
        }
      } catch (e) {
        // 解析失败，继续后续策略
      }
    }

    // 策略3：页面级问题标题（问题详情页）
    const questionTitle = document.querySelector('h1.QuestionHeader-title');
    if (questionTitle) return questionTitle.textContent.trim();

    // 策略4：meta 标签
    const titleMeta = document.querySelector('meta[property="og:title"]');
    if (titleMeta) {
      const title = titleMeta.getAttribute('content');
      if (title) {
        const cleaned = title.replace(' - 知乎', '').trim();
        // 过滤掉推荐页的通用标题
        if (cleaned && !this._isGenericPageTitle(cleaned)) return cleaned;
      }
    }

    // 策略4：Fallback
    const pageTitle = document.title.replace(' - 知乎', '').trim();
    if (!this._isGenericPageTitle(pageTitle)) return pageTitle;

    return '知乎回答';
  },

  /**
   * 判断是否为推荐页的通用页面标题（而非具体问题标题）
   */
  _isGenericPageTitle(title) {
    if (!title) return true;
    const genericTitles = [
      '我的首页', '首页', '知乎', '推荐', '热榜', '关注',
      'zhihu', '推荐页', '发现', ' Zhihu'
    ];
    const lower = title.toLowerCase();
    return genericTitles.some(g => lower.includes(g.toLowerCase()));
  },

  /**
   * 提取当前页面URL
   */
  extractURL() {
    return window.location.href;
  },

  /**
   * 新版知乎提取策略
   */
  _tryModernZhihu(answerElement) {
    const el = answerElement || document;

    // 作者名
    const authorEl = el.querySelector('.AuthorInfo-name, [data-za-detail-view-id="view_user"] .UserLink, .ContentItem-author a');
    const author = authorEl ? authorEl.textContent.trim() : '匿名用户';

    // 赞同数
    const voteEl = el.querySelector('.VoteButton--up, .ContentItem-actions button[aria-label*="赞同"], .VoteButton--up span');
    let voteCount = '0';
    if (voteEl) {
      const voteText = voteEl.textContent.trim();
      const match = voteText.match(/[\d.]+[万]?/);
      if (match) voteCount = match[0];
    }

    // 正文内容 - 新版知乎使用 RichContent 结构
    let contentEl = el.querySelector('.RichContent-inner, .RichContent .RichContent-inner');
    if (!contentEl) {
      contentEl = el.querySelector('.AnswerCard .RichContent, .List-item .RichContent');
    }

    let text = '';
    if (contentEl) {
      // 优先获取纯文本
      text = contentEl.innerText || contentEl.textContent || '';
      // 清理
      text = this._cleanText(text);
    }

    return {
      title: this.extractPageTitle(answerElement),
      author,
      text,
      voteCount,
      url: this.extractURL(),
      strategy: 'modern'
    };
  },

  /**
   * 旧版知乎提取策略
   */
  _tryLegacyZhihu(answerElement) {
    const el = answerElement || document;

    const authorEl = el.querySelector('.author-link, .AuthorInfo-name');
    const author = authorEl ? authorEl.textContent.trim() : '匿名用户';

    const voteEl = el.querySelector('.VoteButton--up, .vote-count');
    let voteCount = '0';
    if (voteEl) {
      voteCount = voteEl.textContent.trim();
    }

    const contentEl = el.querySelector('.AnswerItem .RichContent, .AnswerCard .RichContent, .ContentItem .RichContent');
    let text = '';
    if (contentEl) {
      text = this._cleanText(contentEl.innerText || contentEl.textContent || '');
    }

    return {
      title: this.extractPageTitle(answerElement),
      author,
      text,
      voteCount,
      url: this.extractURL(),
      strategy: 'legacy'
    };
  },

  /**
   * 通用提取策略（最后的fallback）
   */
  _tryGenericExtraction(answerElement) {
    const el = answerElement || document.body;

    // 尝试找到任何包含大量文本的元素
    const candidates = el.querySelectorAll('div, article');
    let bestCandidate = null;
    let maxTextLength = 0;

    candidates.forEach(candidate => {
      const text = candidate.innerText || candidate.textContent || '';
      if (text.length > maxTextLength && text.length > 200) {
        // 避免导航栏等
        const parent = candidate.closest('nav, header, footer');
        if (!parent) {
          maxTextLength = text.length;
          bestCandidate = candidate;
        }
      }
    });

    const text = bestCandidate ? this._cleanText(bestCandidate.innerText || bestCandidate.textContent || '') : '';

    return {
      title: this.extractPageTitle(answerElement),
      author: '未知作者',
      text,
      voteCount: '未知',
      url: this.extractURL(),
      strategy: 'generic'
    };
  },

  /**
   * 清理提取的文本
   */
  _cleanText(text) {
    return text
      .replace(/\n{3,}/g, '\n\n')     // 连续换行压缩
      .replace(/[ \t]+/g, ' ')        // 连续空格压缩
      .replace(/^\s+|\s+$/g, '')      // 首尾空白
      .trim();
  },

  /**
   * 获取所有回答元素
   */
  getAllAnswerElements() {
    // 问题页回答
    const modern = document.querySelectorAll('.AnswerCard, .List-item, .ContentItem.AnswerItem');
    if (modern.length > 0) return Array.from(modern);

    // 推荐页 / 首页 Feed
    const feed = document.querySelectorAll('.TopstoryItem, .Topstory-main .ContentItem, .Topstory-recommend .ContentItem');
    if (feed.length > 0) return Array.from(feed);

    // 旧版
    const legacy = document.querySelectorAll('.AnswerItem, .AnswerCard');
    if (legacy.length > 0) return Array.from(legacy);

    // 专栏文章
    const article = document.querySelectorAll('.Post-content, .Post-RichTextContainer');
    if (article.length > 0) return Array.from(article);

    // 搜索页结果
    const search = document.querySelectorAll('.SearchResult-Card .ContentItem, .SearchResult .ContentItem');
    if (search.length > 0) return Array.from(search);

    return [];
  },

  /**
   * 根据DOM元素找到对应的回答数据
   */
  extractFromElement(element) {
    return this.extractAnswer(element);
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Extractor;
}
