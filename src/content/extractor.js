/**
 * 知乎反驳助手 - 内容提取器
 * 负责从知乎页面提取回答的标题、正文、作者等信息
 */

const Extractor = {
  /**
   * 主提取函数 - 尝试多种策略提取回答内容
   */
  extractAnswer(element) {
    // 策略1：新版知乎（2024-2025）
    const result = this._tryModernZhihu(element);
    if (result && result.text && result.text.length > 50) {
      return result;
    }

    // 策略2：旧版知乎
    const result2 = this._tryLegacyZhihu(element);
    if (result2 && result2.text && result2.text.length > 50) {
      return result2;
    }

    // 策略3：通用提取（fallback）
    return this._tryGenericExtraction(element);
  },

  /**
   * 提取页面标题（问题标题）
   */
  extractPageTitle() {
    // 新版知乎
    const h1 = document.querySelector('h1.QuestionHeader-title, h1[data-za-detail-view-id]');
    if (h1) return h1.textContent.trim();

    // 旧版
    const titleMeta = document.querySelector('meta[property="og:title"]');
    if (titleMeta) {
      const title = titleMeta.getAttribute('content');
      if (title) return title.replace(' - 知乎', '').trim();
    }

    // Fallback
    return document.title.replace(' - 知乎', '').trim();
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
      title: this.extractPageTitle(),
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
      title: this.extractPageTitle(),
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
      title: this.extractPageTitle(),
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
