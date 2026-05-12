/**
 * 知乎反驳助手 - 全局常量
 */

const CONSTANTS = {
  // 存储键名
  STORAGE_KEYS: {
    CONFIG: 'zhihu_remark_config',
    HISTORY: 'zhihu_remark_history',
    CACHE: 'zhihu_remark_cache'
  },

  // 默认配置
  DEFAULT_CONFIG: {
    // AI 提供商: 'openai' | 'anthropic' | 'deepseek' | 'kimi' | 'custom'
    provider: 'deepseek',
    // API 配置
    apiKey: '',
    apiBase: '', // 留空使用默认
    model: 'deepseek-v4-pro',
    // 生成参数
    temperature: 0.7,
    maxTokens: 3072,
    // 反驳风格: 'gentle' | 'direct' | 'academic'
    style: 'gentle',
    // 错误类型开关
    errorTypes: {
      factError: true,
      logicFallacy: true,
      historicalNihilism: true,
      dataFraud: true,
      scienceError: true
    },
    // 功能开关
    features: {
      showAnalysis: true,      // 显示错误分析
      autoFill: true,          // 自动填充评论框
      showSource: true,        // 要求AI标注来源
      enableHistory: true      // 启用历史记录
    }
  },

  // 提供商默认配置
  PROVIDER_DEFAULTS: {
    openai: {
      apiBase: 'https://api.openai.com/v1',
      models: ['gpt-5.5', 'gpt-5.4-pro', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    anthropic: {
      apiBase: 'https://api.anthropic.com/v1',
      models: ['claude-4-opus-20250514', 'claude-4-sonnet-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']
    },
    deepseek: {
      apiBase: 'https://api.deepseek.com',
      models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner']
    },
    kimi: {
      apiBase: 'https://api.moonshot.cn/v1',
      models: ['kimi-k2.6', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k']
    },
    custom: {
      apiBase: '',
      models: []
    }
  },

  // 反驳风格定义
  REBUTTAL_STYLES: {
    gentle: {
      name: '温和理性',
      description: '语气平和，以理服人，适合一般讨论场景',
      toneHint: '请保持温和、理性的语气，以建设性的态度指出错误，避免攻击性语言。'
    },
    direct: {
      name: '直接犀利',
      description: '观点鲜明，直击要害，适合明显且恶劣的错误',
      toneHint: '请直接指出错误，语气可以较为犀利，但仍需基于事实和逻辑，避免人身攻击。'
    },
    academic: {
      name: '学术严谨',
      description: '引用规范，论证严密，适合学术和专业话题',
      toneHint: '请采用学术化的严谨语气，引用权威来源，使用专业术语，论证过程严密。'
    }
  },

  // 错误类型定义
  ERROR_TYPES: {
    factError: {
      key: 'factError',
      label: '事实错误',
      description: '与公认事实、权威数据相悖的陈述',
      icon: '❌'
    },
    logicFallacy: {
      key: 'logicFallacy',
      label: '逻辑谬误',
      description: '滑坡论证、诉诸情感、稻草人、虚假两难等',
      icon: '🔄'
    },
    historicalNihilism: {
      key: 'historicalNihilism',
      label: '历史虚无主义',
      description: '歪曲历史事实、解构主流历史叙事',
      icon: '📜'
    },
    dataFraud: {
      key: 'dataFraud',
      label: '数据造假',
      description: '编造统计数据、选择性引用、断章取义',
      icon: '📊'
    },
    scienceError: {
      key: 'scienceError',
      label: '科学错误',
      description: '违背基础科学原理或已被证伪的理论',
      icon: '🔬'
    }
  },

  // 消息类型
  MESSAGE_TYPES: {
    GENERATE_REBUTTAL: 'GENERATE_REBUTTAL',
    GET_CONFIG: 'GET_CONFIG',
    SET_CONFIG: 'SET_CONFIG',
    GET_HISTORY: 'GET_HISTORY',
    CLEAR_HISTORY: 'CLEAR_HISTORY',
    SHOW_NOTIFICATION: 'SHOW_NOTIFICATION'
  },

  // UI 配置
  UI: {
    BUTTON_TEXT: '🛡️ 生成反驳',
    BUTTON_LOADING_TEXT: '生成中...',
    MAX_HISTORY_ITEMS: 10,
    NOTIFICATION_DURATION: 3000
  }
};

// 导出（兼容内容脚本和模块）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONSTANTS;
}
