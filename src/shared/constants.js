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

  // 配置 schema 版本
  //
  // 配置结构（字段增删改名、嵌套层级调整）每变更一次就 +1，并在 CONFIG_MIGRATIONS
  // 里补一条「源版本 → 下一版本」的迁移函数。旧版本数据由 Storage 在读取时自动迁移
  // 并回写，用户不需要重配。新增字段只做「补默认值」时也建议升版本，方便日后判断
  // 用户数据是在哪一版结构下写入的。
  CONFIG_SCHEMA_VERSION: 3,

  // 配置迁移表：键是「源版本」，值是该版本升级到下一版本的函数
  //
  // 约定：迁移函数必须幂等，且只做「补齐 / 改名 / 换结构」，不做业务判断。
  // v1 → v2：customPromptSuffix 自 v1.3 起就在读写，但一直没进默认值（缺字段时
  //          UI 与 Prompt 各自用 || '' 兜底），这里补成正式字段。
  // v2 → v3：新增 thinking（深度思考开关），默认开启——与升级前的实际行为一致
  //          （正文生成改为非 JSON 模式后，这个开关才有意义）。
  CONFIG_MIGRATIONS: {
    1: (config) => ({
      ...config,
      customPromptSuffix: typeof config.customPromptSuffix === 'string' ? config.customPromptSuffix : ''
    }),
    2: (config) => ({
      ...config,
      thinking: typeof config.thinking === 'boolean' ? config.thinking : true
    })
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
    temperature: 0.7, // 仅非思考模式生效；思考模式下官方忽略该值
    maxTokens: 4096,  // 用户可调值的下限保护见 GENERATE_MAX_TOKENS
    // 深度思考：开启后模型先推理再作答（30~50 秒），关闭后 1~3 秒出结果
    thinking: true,
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
    strictness: 'standard',
    // 用户自定义 Prompt 后缀（拼接在 system prompt 末尾）
    customPromptSuffix: ''
  },

  // API 失败重试策略
  //
  // 空返回 / 截断 / 网关抖动属于「概率性、再试一次大概率能过」的失败，因此自动退避重试；
  // 鉴权失败、域名未授权、安全拦截等确定性失败不重试（kind 见 background/api.js 的分类表）。
  API_RETRY: {
    maxAttempts: 3,        // 总尝试次数（首次 + 最多 2 次重试）
    delaysMs: [800, 2000], // 与第 N 次失败对应，实际等待带 ±20% 抖动
    maxTokensCeiling: 8192 // 截断后自动放宽 max_tokens 的硬上限
  },

  // 正文生成的 token 预算
  //
  // 思考模式与正文共用 completion_tokens：实测同一篇回答思考用掉 2300~3500 tokens，
  // 正文 500~600 字（约 800 tokens）。原先固定 4096 会让思考把预算吃光，
  // 表现为 finish_reason=length、正文半截、甚至空返回（B0 实测 v1 必截断）。
  // 用户配置的 maxTokens 只作为下限保护，低于该值时按该值执行。
  GENERATE_MAX_TOKENS: 16384,

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

// 默认配置里的 configVersion 直接取自 CONFIG_SCHEMA_VERSION
// （对象字面量内不能自引用，所以在这里补一次，保持单一真源）
CONSTANTS.DEFAULT_CONFIG.configVersion = CONSTANTS.CONFIG_SCHEMA_VERSION;

// 导出（兼容内容脚本和模块）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONSTANTS;
}
