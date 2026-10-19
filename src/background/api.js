/**
 * 知乎反驳助手 - AI API 调用封装
 * 支持 OpenAI、Claude、DeepSeek、Kimi 等主流 API
 *
 * 地址与模型优先使用用户配置：`config.apiBase` 为空才回退到 PROVIDER_DEFAULTS 的内置地址，
 * 因此内置提供商同样可以指向代理 / 镜像 / 本地网关（官方换域名时无需等扩展更新）。
 *
 * @doc docs/TECH_DESIGN.md#42-外部-ai-api
 * @doc docs/TECH_DESIGN.md#73-网络安全
 */

const API = {
  /**
   * 生成反驳
   * @param {Object} content - 回答内容
   * @param {Object} config - 用户配置
   * @param {string} [regenerateHint] - 重新生成提示，非空时附加到 userPrompt
   */
  async generateRebuttal(content, config, regenerateHint) {
    const provider = config.provider || 'openai';

    switch (provider) {
      case 'openai':
      case 'deepseek':
      case 'kimi':
        return this._callOpenAICompatible(provider, content, config, regenerateHint);
      case 'anthropic':
        return this._callAnthropic(content, config, regenerateHint);
      case 'custom':
        return this._callCustom(content, config, regenerateHint);
      default:
        throw new Error(`不支持的 AI 提供商: ${provider}`);
    }
  },

  /**
   * 通用 OpenAI 兼容格式 API 调用
   * 适用于 OpenAI、DeepSeek、Kimi、自定义 API
   */
  async _callOpenAICompatible(provider, content, config, regenerateHint) {
    const apiKey = config.apiKey;
    if (!apiKey) {
      const providerNames = { openai: 'OpenAI', deepseek: 'DeepSeek', kimi: 'Kimi', custom: '自定义' };
      throw new Error(`请先在扩展设置中配置 ${providerNames[provider] || provider} API Key`);
    }

    // 用户填写的地址优先（内置提供商也可覆盖），留空才用提供商默认地址
    const apiBase = HostAccess.normalizeApiBase(config.apiBase)
      || CONSTANTS.PROVIDER_DEFAULTS[provider]?.apiBase
      || '';
    const model = config.model || CONSTANTS.PROVIDER_DEFAULTS[provider]?.models?.[0] || CONSTANTS.DEFAULT_CONFIG.model;
    const temperature = config.temperature ?? CONSTANTS.DEFAULT_CONFIG.temperature;
    const maxTokens = config.maxTokens ?? CONSTANTS.DEFAULT_CONFIG.maxTokens;

    // 获取激活的错误类型
    const activeErrorTypes = Object.entries(config.errorTypes || {})
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key);

    // 截断内容
    const text = Utils.truncateText(content.text, 6000);
    const truncatedContent = { ...content, text };

    const systemPrompt = Prompts.getSystemPrompt(config.style, config, truncatedContent);
    let userPrompt = text.length > 3000
      ? Prompts.getCondensedUserPrompt(truncatedContent, activeErrorTypes)
      : Prompts.getUserPrompt(truncatedContent, activeErrorTypes);

    if (regenerateHint) {
      userPrompt += '\n\n' + regenerateHint;
    }

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_tokens: maxTokens
    };

    // DeepSeek 和 Kimi 均支持 json_object 模式
    if (provider !== 'custom') {
      requestBody.response_format = { type: 'json_object' };
    }

    await this._assertHostAccess(apiBase);

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: await this._buildHeaders(apiBase, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }, content),
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`API 错误 (${response.status}): ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new Error('API 返回内容为空');
    }

    return this._parseResponse(rawContent);
  },

  /**
   * 调用 Claude API
   */
  async _callAnthropic(content, config, regenerateHint) {
    const apiKey = config.apiKey;
    if (!apiKey) {
      throw new Error('请先在扩展设置中配置 Claude API Key');
    }

    // 同上：用户填写的地址优先
    const apiBase = HostAccess.normalizeApiBase(config.apiBase)
      || CONSTANTS.PROVIDER_DEFAULTS.anthropic.apiBase;
    const model = config.model || 'claude-3-5-sonnet-20241022';
    const maxTokens = config.maxTokens ?? CONSTANTS.DEFAULT_CONFIG.maxTokens;

    const activeErrorTypes = Object.entries(config.errorTypes || {})
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key);

    const text = Utils.truncateText(content.text, 6000);
    const truncatedContent = { ...content, text };

    const systemPrompt = Prompts.getSystemPrompt(config.style, config, truncatedContent);
    let userPrompt = text.length > 3000
      ? Prompts.getCondensedUserPrompt(truncatedContent, activeErrorTypes)
      : Prompts.getUserPrompt(truncatedContent, activeErrorTypes);

    if (regenerateHint) {
      userPrompt += '\n\n' + regenerateHint;
    }

    await this._assertHostAccess(apiBase);

    const response = await fetch(`${apiBase}/messages`, {
      method: 'POST',
      headers: await this._buildHeaders(apiBase, {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }, content),
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`API 错误 (${response.status}): ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const rawContent = data.content?.[0]?.text;

    if (!rawContent) {
      throw new Error('API 返回内容为空');
    }

    return this._parseResponse(rawContent);
  },

  /**
   * 调用自定义 API（OpenAI 兼容格式）
   */
  async _callCustom(content, config, regenerateHint) {
    if (!config.apiBase) {
      throw new Error('自定义 API 需要配置 API Base URL');
    }
    return this._callOpenAICompatible('custom', content, config, regenerateHint);
  },

  /**
   * 组装请求头，并按网关要求补充必需的头
   *
   * OpenCode Go / Zen 要求每个请求携带稳定的 x-opencode-session，否则网关会在进入
   * 模型前直接返回 400（Request is missing x-opencode-session）。会话标识按回答派生，
   * 因此同一回答的首次生成、重新生成、切换风格会复用同一标识，正好匹配网关对
   * 「每个会话一个稳定 ID」的要求（路由亲和 + prompt 缓存）。
   * @param {string} apiBase - 已规范化的 API Base URL
   * @param {Object} baseHeaders - 各提供商自身的鉴权与内容类型头
   * @param {Object} content - 回答内容（用于派生会话标识）
   */
  async _buildHeaders(apiBase, baseHeaders, content) {
    if (OpenCode.isEndpoint(apiBase)) {
      baseHeaders['x-opencode-session'] = await OpenCode.sessionIdFor(content);
    }

    return baseHeaders;
  },

  /**
   * 校验扩展是否有权访问该 API 域名
   *
   * 内置提供商的域名已在 manifest.host_permissions 中声明；自定义 API 的域名
   * 需要在设置页保存时由用户授权（optional_host_permissions）。若未授权，
   * 直接 fetch 只会得到难以理解的跨域错误，因此在此提前给出可操作的提示。
   * @param {string} apiBase - 已规范化的 API Base URL
   */
  async _assertHostAccess(apiBase) {
    const origin = HostAccess.originOf(apiBase);
    if (!origin) {
      throw new Error(`API Base URL 无效：${apiBase || '(未填写)'}，请检查扩展设置`);
    }

    if (await HostAccess.has(origin)) return;

    throw new Error(`未授权访问 ${origin}。请打开扩展设置页重新保存配置，并在弹窗中点击「允许」`);
  },

  /**
   * 解析 API 响应
   */
  _parseResponse(rawContent) {
    const jsonData = Utils.extractJSON(rawContent);

    if (!jsonData) {
      throw new Error('AI 返回格式错误，无法解析 JSON');
    }

    // 验证必要字段
    if (!jsonData.analysis || typeof jsonData.analysis.hasErrors !== 'boolean') {
      throw new Error('AI 返回结构不完整');
    }

    return {
      analysis: {
        hasErrors: jsonData.analysis.hasErrors,
        errorTypes: jsonData.analysis.errorTypes || [],
        summary: jsonData.analysis.summary || ''
      },
      errors: jsonData.errors || [],
      rebuttal: jsonData.rebuttal || '',
      confidence: jsonData.confidence || 'medium'
    };
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
