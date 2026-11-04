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
    CACHE: 'zhihu_remark_cache',
    // 设置页「同步模型」拉到的模型列表缓存；只存 ID / 名称 / 同步时间，不存 API Key
    MODEL_CATALOG: 'zhihu_remark_model_catalog'
  },

  // 配置 schema 版本
  //
  // 配置结构（字段增删改名、嵌套层级调整）每变更一次就 +1，并在 CONFIG_MIGRATIONS
  // 里补一条「源版本 → 下一版本」的迁移函数。旧版本数据由 Storage 在读取时自动迁移
  // 并回写，用户不需要重配。新增字段只做「补默认值」时也建议升版本，方便日后判断
  // 用户数据是在哪一版结构下写入的。
  CONFIG_SCHEMA_VERSION: 4,

  // 配置迁移表：键是「源版本」，值是该版本升级到下一版本的函数
  //
  // 约定：迁移函数必须幂等，且只做「补齐 / 改名 / 换结构」，不做业务判断。
  // v1 → v2：customPromptSuffix 自 v1.3 起就在读写，但一直没进默认值（缺字段时
  //          UI 与 Prompt 各自用 || '' 兜底），这里补成正式字段。
  // v2 → v3：新增 thinking（深度思考开关），默认开启——与升级前的实际行为一致
  //          （正文生成改为非 JSON 模式后，这个开关才有意义）。
  // v3 → v4：面板与 Prompt 都不再使用结构化字段，删掉 errorTypes / features / strictness /
  //          temperature / maxTokens；features.enableHistory 提到顶层。
  CONFIG_MIGRATIONS: {
    1: (config) => ({
      ...config,
      customPromptSuffix: typeof config.customPromptSuffix === 'string' ? config.customPromptSuffix : ''
    }),
    2: (config) => ({
      ...config,
      thinking: typeof config.thinking === 'boolean' ? config.thinking : true
    }),
    3: (config) => {
      const {
        errorTypes, features, strictness, temperature, maxTokens,
        ...rest
      } = config;

      return {
        ...rest,
        enableHistory: features ? features.enableHistory !== false : true
      };
    }
  },

  // 默认配置（4 个主设置 + 3 个高级项）
  DEFAULT_CONFIG: {
    // AI 提供商: 'openai' | 'anthropic' | 'deepseek' | 'kimi' | 'custom'
    provider: 'deepseek',
    // API 配置
    apiKey: '',
    apiBase: '', // 留空使用所选提供商的内置地址；填写则覆盖（代理 / 镜像 / 本地网关 / 官方换域名）
    model: 'deepseek-v4-pro',
    // 深度思考：开启后模型先推理再作答（30~50 秒），关闭后 1~3 秒出结果
    thinking: true,
    // 反驳风格: 'gentle' | 'direct' | 'academic' | 'natural'
    style: 'gentle',
    // 是否保存生成历史
    enableHistory: true,
    // 用户自定义 Prompt 后缀（拼接在 system prompt 末尾）
    customPromptSuffix: ''
  },

  // API 失败重试策略
  //
  // 空返回 / 截断 / 网关抖动属于「概率性、再试一次大概率能过」的失败，因此自动退避重试；
  // 鉴权失败、域名未授权、安全拦截等确定性失败不重试（kind 见 background/api.js 的分类表）。
  API_RETRY: {
    maxAttempts: 3,        // 总尝试次数（首次 + 最多 2 次重试）
    delaysMs: [800, 2000] // 与第 N 次失败对应，实际等待带 ±20% 抖动
  },

  // 正文生成的 token 预算
  //
  // 思考模式与正文共用 completion_tokens：实测同一篇回答思考用掉 2300~3500 tokens，
  // 正文 500~600 字（约 800 tokens）。原先固定 4096 会让思考把预算吃光，
  // 表现为 finish_reason=length、正文半截、甚至空返回（B0 实测 v1 必截断）。
  // 该值固定，不再暴露给用户；Anthropic 通路的放宽上限取它的 2 倍。
  GENERATE_MAX_TOKENS: 16384,

  // 提供商默认配置
  //
  // apiBase：用户未填写 API Base URL 时使用的默认地址，设置页会把它显示为「内置地址」，
  //         需要代理 / 镜像时用户可勾选覆盖
  // defaultModel：切换提供商时的初始模型名，不承担「完整列表」职责
  // models：离线兜底列表。只有 OpenCode 的 /v1/models 是公开、免鉴权的，因此只在这里
  //         放 OpenCode Go 的快照；其余提供商的列表由设置页「同步模型」从用户账号拉取
  PROVIDER_DEFAULTS: {
    openai: {
      apiBase: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
      models: []
    },
    anthropic: {
      apiBase: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-sonnet-4-6',
      models: []
    },
    deepseek: {
      apiBase: 'https://api.deepseek.com',
      defaultModel: 'deepseek-v4-pro',
      models: []
    },
    kimi: {
      apiBase: 'https://api.moonshot.cn/v1',
      defaultModel: 'kimi-k2.6',
      models: []
    },
    'opencode-go': {
      apiBase: 'https://opencode.ai/inference/go/openai/v1',
      defaultModel: 'deepseek-v4.1-flash',
      // 2026-11-02 取自 https://opencode.ai/inference/go/v1/models（公开、免鉴权）；
      // 设置页「同步模型」会刷新，这里只是首次打开时的兜底
      models: [
        'deepseek-v4.1-flash',
        'deepseek-v4-pro',
        'glm-5.3-flash',
        'glm-5.3',
        'glm-5.2',
        'kimi-k3.1-pro',
        'kimi-k3',
        'kimi-k2.7-code',
        'claude-haiku-5-5',
        'gpt-6-luna',
        'gpt-5.6-luna',
        'grok-4.7',
        'qwen3.8-max',
        'qwen3.8-flash',
        'qwen3.7-plus',
        'minimax-m3.1-flash',
        'minimax-m3',
        'mimo-v2.6-pro',
        'mimo-v2.6-flash',
        'hy4-preview',
        'hy3',
        'longcat-2.0',
        'step-5-preview',
        'muse-spark-1.3-contributor',
        'muse-spark-1.2-contributor',
        'gemini-4-argon',
        'beam-free',
        'iceman-contributor-free'
      ]
    },
    custom: {
      apiBase: '',
      defaultModel: '',
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

// 默认配置里的 configVersion 直接取自 CONFIG_SCHEMA_VERSION
// （对象字面量内不能自引用，所以在这里补一次，保持单一真源）
CONSTANTS.DEFAULT_CONFIG.configVersion = CONSTANTS.CONFIG_SCHEMA_VERSION;

// 导出（兼容内容脚本和模块）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONSTANTS;
}
