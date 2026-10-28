/**
 * 知乎反驳助手 - Service Worker（后台脚本）主入口
 * @doc docs/TECH_DESIGN.md#25-后台与消息处理
 */

// 加载依赖脚本（共享模块和后台模块）
importScripts(
  '../shared/constants.js',
  '../shared/utils.js',
  '../shared/permissions.js',
  '../shared/opencode.js',
  '../shared/prompts.js',
  './storage.js',
  './api.js'
);

/**
 * 安装事件
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[知乎反驳助手] 扩展已安装/更新', details.reason);

  // 初始化默认配置
  Storage.getConfig().then(config => {
    console.log('[知乎反驳助手] 当前配置:', config.provider, config.model);
  });
});

/**
 * 消息处理中心
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message;

  switch (type) {
    case CONSTANTS.MESSAGE_TYPES.GENERATE_REBUTTAL:
      handleGenerateRebuttal(data, sender).then(sendResponse);
      return true; // 保持消息通道开启

    case CONSTANTS.MESSAGE_TYPES.GET_CONFIG:
      Storage.getConfig().then(config => {
        sendResponse({ success: true, data: config });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case CONSTANTS.MESSAGE_TYPES.SET_CONFIG:
      Storage.setConfig(data).then(config => {
        sendResponse({ success: true, data: config });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case CONSTANTS.MESSAGE_TYPES.GET_HISTORY:
      Storage.getHistory(data?.limit).then(history => {
        sendResponse({ success: true, data: history });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case CONSTANTS.MESSAGE_TYPES.CLEAR_HISTORY:
      Storage.clearHistory().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case CONSTANTS.MESSAGE_TYPES.UPDATE_FEEDBACK:
      handleUpdateFeedback(data).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    default:
      sendResponse({ success: false, error: '未知的消息类型' });
      return false;
  }
});

/**
 * 处理生成反驳请求
 */
async function handleGenerateRebuttal(data, sender) {
  try {
    const { content, regenerateHint, style } = data;

    // 获取配置
    const config = await Storage.getConfig();

    // 支持面板内临时切换风格（不持久化）
    if (style) {
      config.style = style;
    }

    // 检查 API Key
    if (!config.apiKey) {
      return {
        success: false,
        error: '未配置 API Key，请点击扩展图标进入设置页面配置'
      };
    }

    // 如果没有显式重新生成提示，尝试根据历史反馈构造提示
    let effectiveRegenerateHint = regenerateHint;
    if (!effectiveRegenerateHint && content.url) {
      const latestFeedback = await Storage.getLatestFeedbackByUrl(content.url);
      if (latestFeedback) {
        effectiveRegenerateHint = Prompts.buildRegenerateHint(latestFeedback.feedback);
      }
    }

    // 调用 AI API
    const result = await API.generateRebuttal(content, config, effectiveRegenerateHint);

    // 保存到历史记录
    let historyId = null;
    if (config.features?.enableHistory !== false) {
      const historyItem = await Storage.addHistoryItem({
        questionTitle: content.title,
        author: content.author,
        url: content.url,
        hasErrors: result.analysis.hasErrors,
        errorTypes: result.analysis.errorTypes,
        rebuttal: result.rebuttal,
        confidence: result.confidence
      });
      historyId = historyItem.id;
    }

    return {
      success: true,
      data: {
        ...result,
        historyId
      }
    };

  } catch (error) {
    console.error('[知乎反驳助手] 生成反驳失败:', error);
    return {
      success: false,
      error: error.message || '生成反驳时发生未知错误'
    };
  }
}

/**
 * 处理更新反馈请求
 */
async function handleUpdateFeedback(data) {
  try {
    const { historyId, feedback } = data;

    if (!historyId) {
      return { success: false, error: '缺少历史记录 ID' };
    }

    if (!feedback || !feedback.type) {
      return { success: false, error: '反馈数据不完整' };
    }

    const updatedItem = await Storage.updateHistoryFeedback(historyId, {
      ...feedback,
      timestamp: Date.now()
    });

    return { success: true, data: updatedItem };
  } catch (error) {
    console.error('[知乎反驳助手] 更新反馈失败:', error);
    return {
      success: false,
      error: error.message || '更新反馈时发生未知错误'
    };
  }
}

console.log('[知乎反驳助手] Service Worker 已启动');
