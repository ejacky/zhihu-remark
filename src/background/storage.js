/**
 * 知乎反驳助手 - 存储管理
 */

const Storage = {
  /**
   * 获取配置
   */
  async getConfig() {
    try {
      const result = await chrome.storage.local.get(CONSTANTS.STORAGE_KEYS.CONFIG);
      const saved = result[CONSTANTS.STORAGE_KEYS.CONFIG] || {};
      return this._mergeConfig(saved);
    } catch {
      return { ...CONSTANTS.DEFAULT_CONFIG };
    }
  },

  /**
   * 保存配置
   */
  async setConfig(config) {
    const merged = this._mergeConfig(config);
    await chrome.storage.local.set({
      [CONSTANTS.STORAGE_KEYS.CONFIG]: merged
    });
    return merged;
  },

  /**
   * 获取历史记录
   */
  async getHistory(limit = CONSTANTS.UI.MAX_HISTORY_ITEMS) {
    try {
      const result = await chrome.storage.local.get(CONSTANTS.STORAGE_KEYS.HISTORY);
      const history = result[CONSTANTS.STORAGE_KEYS.HISTORY] || [];
      return history.slice(0, limit);
    } catch {
      return [];
    }
  },

  /**
   * 添加历史记录
   */
  async addHistoryItem(item) {
    const history = await this.getHistory(100); // 获取更多用于截断
    const newItem = {
      id: Utils.generateId(),
      timestamp: Date.now(),
      feedback: null,
      ...item
    };

    // 添加到开头，限制数量
    const updated = [newItem, ...history].slice(0, CONSTANTS.UI.MAX_HISTORY_ITEMS);

    await chrome.storage.local.set({
      [CONSTANTS.STORAGE_KEYS.HISTORY]: updated
    });

    return newItem;
  },

  /**
   * 更新历史记录反馈
   * @param {string} id - 历史记录 ID
   * @param {Object} feedback - 反馈数据 { type, reason, customReason, timestamp }
   */
  async updateHistoryFeedback(id, feedback) {
    const history = await this.getHistory(100);
    const updated = history.map(item => {
      if (item.id === id) {
        return { ...item, feedback };
      }
      return item;
    });

    await chrome.storage.local.set({
      [CONSTANTS.STORAGE_KEYS.HISTORY]: updated.slice(0, CONSTANTS.UI.MAX_HISTORY_ITEMS)
    });

    return updated.find(item => item.id === id);
  },

  /**
   * 根据 URL 查找最近一条有反馈的历史记录
   * @param {string} url - 页面 URL
   */
  async getLatestFeedbackByUrl(url) {
    if (!url) return null;
    const history = await this.getHistory(100);
    return history.find(item => item.url === url && item.feedback) || null;
  },

  /**
   * 清空历史记录
   */
  async clearHistory() {
    await chrome.storage.local.remove(CONSTANTS.STORAGE_KEYS.HISTORY);
  },

  /**
   * 合并配置（处理新增字段）
   */
  _mergeConfig(saved) {
    const merged = { ...CONSTANTS.DEFAULT_CONFIG };

    // 深度合并
    Object.keys(saved).forEach(key => {
      if (typeof saved[key] === 'object' && saved[key] !== null && !Array.isArray(saved[key])) {
        merged[key] = { ...merged[key], ...saved[key] };
      } else {
        merged[key] = saved[key];
      }
    });

    return merged;
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}
