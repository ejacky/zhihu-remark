/**
 * 知乎反驳助手 - 存储管理
 *
 * 配置结构带 schema 版本号（CONSTANTS.CONFIG_SCHEMA_VERSION）：读取时先按
 * CONSTANTS.CONFIG_MIGRATIONS 把旧版本数据迁移到当前结构，再与默认值合并；
 * 迁移过的结果会立即回写，避免每次读取都重跑迁移。
 *
 * @doc docs/TECH_DESIGN.md#51-数据模型
 * @doc docs/TECH_DESIGN.md#52-存储策略
 */

const Storage = {
  /**
   * 获取配置
   *
   * 存储里的旧版本配置会在这里迁移并回写；回写失败不影响本次读取
   * （迁移后的配置仍然生效，只是下次读取会再迁移一次）。
   */
  async getConfig() {
    try {
      const result = await chrome.storage.local.get(CONSTANTS.STORAGE_KEYS.CONFIG);
      const saved = result[CONSTANTS.STORAGE_KEYS.CONFIG] || {};
      const { config, migrated } = this._migrateConfig(saved);
      const merged = this._mergeConfig(config);

      if (migrated) {
        try {
          await this.setConfig(merged);
        } catch (err) {
          console.warn('[知乎反驳助手] 配置迁移回写失败，本次仍按迁移后的配置运行:', err);
        }
      }

      return merged;
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
   * 把存储里读到的配置迁移到当前 schema 版本
   *
   * - 没有版本号的旧数据（v1.3 之前写入）视为 v1
   * - 版本比当前新（用户回退过扩展版本）无法向前迁移，按当前版本归一，只做默认值兜底
   * - 迁移函数缺失时跳过该版本，不阻塞读取
   *
   * @private
   * @returns {{config: Object, migrated: boolean}}
   */
  _migrateConfig(saved) {
    const current = CONSTANTS.CONFIG_SCHEMA_VERSION;
    const hasSaved = Object.keys(saved || {}).length > 0;

    // 全新安装（存储里没有配置）不需要迁移，直接走默认值
    if (!hasSaved) return { config: {}, migrated: false };

    const storedVersion = Number.isInteger(saved.configVersion) ? saved.configVersion : 1;
    const from = Math.min(storedVersion, current);

    let config = { ...saved };
    for (let v = from; v < current; v++) {
      const migrate = CONSTANTS.CONFIG_MIGRATIONS?.[v];
      if (typeof migrate !== 'function') continue;
      config = migrate(config) || config;
      config.configVersion = v + 1;
    }

    return { config, migrated: storedVersion !== current };
  },

  /**
   * 合并配置（处理新增字段）
   *
   * 无论存储里是什么版本，读出来的配置一律盖章为当前 schema 版本。
   */
  _mergeConfig(saved) {
    const merged = { ...CONSTANTS.DEFAULT_CONFIG };

    // 深度合并
    Object.keys(saved || {}).forEach(key => {
      if (typeof saved[key] === 'object' && saved[key] !== null && !Array.isArray(saved[key])) {
        merged[key] = { ...merged[key], ...saved[key] };
      } else {
        merged[key] = saved[key];
      }
    });

    merged.configVersion = CONSTANTS.CONFIG_SCHEMA_VERSION;
    return merged;
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}
