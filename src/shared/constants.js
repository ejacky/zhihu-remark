/**
 * 知乎反驳助手 - 全局常量
 *
 * PROVIDER_DEFAULTS 中的 apiBase / models 只是「默认地址」与「输入建议」：
 * 设置页允许用户为任何提供商手动改写 API Base URL 与模型名称（官方地址与模型名
 * 会随时间变化），运行时以用户填写的值为准，留空才回退到这里的内置值。
 *
 * @doc docs/TECH_DESIGN.md#51-数据模型
 * @doc docs/USER_GUIDE.md#41-api-设置
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
    apiBase: '', // 留空使用所选提供商的内置地址；填写则覆盖（代理 / 镜像 / 本地网关 / 官方换域名）
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
      scienceError: true,
      argumentIncomplete: true // 论证不完整 / 遗漏关键视角
    },
    // 功能开关
    features: {
      showAnalysis: true,          // 显示错误分析
      autoFill: true,              // 自动填充评论框
      showSource: true,            // 要求AI标注来源
      enableHistory: true,         // 启用历史记录
      enableCompletenessCheck: true // 补充遗漏视角（动态完整性检查）
    },
    // 完整性检查严格程度
    strictness: 'standard'
  },

  // 提供商默认配置
  //
  // apiBase：用户未填写 API Base URL 时使用的默认地址，设置页会把它显示为输入框 placeholder
  // models：设置页模型输入框的建议列表（datalist），不限制用户手动输入其他模型名
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
    },
    natural: {
      name: '自然真实',
      description: '像真实知乎用户一样随口评论，最不易被察觉',
      toneHint: '请像一个正在刷知乎的普通网友，随手写一条评论。语气自然、口语化，可以带一点个人情绪和主观看法，像真人之间的讨论。不要像 AI 助手在写分析报告，不要分点罗列，不要"综上所述"等套话。允许句子不完整、略带啰嗦，重点是读起来像真人写的。'
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
    },
    argumentIncomplete: {
      key: 'argumentIncomplete',
      label: '论证不完整',
      description: '回答遗漏了问题的关键原因、视角或必要条件',
      icon: '🧩'
    }
  },

  // 完整性检查严格程度
  STRICTNESS_LEVELS: {
    loose: {
      key: 'loose',
      name: '宽松',
      description: '仅在明显遗漏时指出',
      toneHint: '如果回答明显遗漏了问题的关键原因或视角，再补充说明；不必苛求面面俱到。'
    },
    standard: {
      key: 'standard',
      name: '标准',
      description: '正常检查遗漏的关键论点',
      toneHint: '请检查回答是否遗漏了问题的关键原因、视角或必要条件，若有遗漏，在反驳中补充更重要的视角。'
    },
    strict: {
      key: 'strict',
      name: '严格',
      description: '主动挖掘被忽略的深层原因',
      toneHint: '请深入检查回答是否遗漏了关键原因、反方证据或更深层视角，主动补充被忽略的重要内容。'
    }
  },

  // 消息类型
  MESSAGE_TYPES: {
    GENERATE_REBUTTAL: 'GENERATE_REBUTTAL',
    GET_CONFIG: 'GET_CONFIG',
    SET_CONFIG: 'SET_CONFIG',
    GET_HISTORY: 'GET_HISTORY',
    CLEAR_HISTORY: 'CLEAR_HISTORY',
    UPDATE_FEEDBACK: 'UPDATE_FEEDBACK',
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
