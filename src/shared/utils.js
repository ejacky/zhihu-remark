/**
 * 知乎反驳助手 - 工具函数
 */

const Utils = {
  /**
   * 防抖函数
   */
  debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * 节流函数
   */
  throttle(fn, limit = 300) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * 等待元素出现
   */
  waitForElement(selector, timeout = 10000, root = document) {
    return new Promise((resolve, reject) => {
      const el = root.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(root, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  },

  /**
   * 安全的 JSON 解析
   */
  safeJSONParse(str, defaultValue = null) {
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  },

  /**
   * 复制文本到剪贴板
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const result = document.execCommand('copy');
      document.body.removeChild(textarea);
      return result;
    }
  },

  /**
   * 截断文本到指定长度
   */
  truncateText(text, maxLength = 4000) {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '\n\n[内容过长，已截断]';
  },

  /**
   * 生成唯一ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  /**
   * 格式化日期
   */
  formatDate(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  /**
   * 从文本中提取JSON代码块（支持被截断的不完整JSON）
   */
  extractJSON(text) {
    if (!text) return null;

    // 方案1：匹配 ```json ... ``` 代码块
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      const parsed = this.safeJSONParse(codeBlockMatch[1].trim());
      if (parsed) return parsed;
    }

    // 方案2：找文本中第一个 { 到最后一个 } 之间的内容
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const parsed = this.safeJSONParse(text.slice(firstBrace, lastBrace + 1));
      if (parsed) return parsed;
    }

    // 方案3：JSON 被 max_tokens 截断，尝试补全缺失的闭合括号
    if (firstBrace !== -1) {
      let jsonStr = text.slice(firstBrace).trim();

      // 如果最后一个值是未闭合的字符串，补全引号
      if (jsonStr.match(/:\s*"[^"]*$/)) {
        jsonStr += '"';
      }

      // 补全缺失的 } 和 ]
      const openBraces = (jsonStr.match(/\{/g) || []).length;
      const closeBraces = (jsonStr.match(/\}/g) || []).length;
      const openBrackets = (jsonStr.match(/\[/g) || []).length;
      const closeBrackets = (jsonStr.match(/\]/g) || []).length;

      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        jsonStr += ']';
      }
      for (let i = 0; i < openBraces - closeBraces; i++) {
        jsonStr += '}';
      }

      const parsed = this.safeJSONParse(jsonStr);
      if (parsed) return parsed;
    }

    return null;
  },

  /**
   * 创建 DOM 元素（简化版）
   */
  createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        el.className = value;
      } else if (key === 'innerHTML') {
        el.innerHTML = value;
      } else if (key === 'textContent') {
        el.textContent = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        el.setAttribute(key, value);
      }
    });
    children.forEach(child => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    });
    return el;
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
