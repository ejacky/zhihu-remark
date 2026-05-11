/**
 * 知乎反驳助手 - AI API 调用封装
 * 支持 OpenAI、Claude、DeepSeek、Kimi 等主流 API
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

    const apiBase = config.apiBase || CONSTANTS.PROVIDER_DEFAULTS[provider]?.apiBase || '';
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

    const systemPrompt = Prompts.getSystemPrompt(config.style, config);
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

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
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

    const apiBase = config.apiBase || CONSTANTS.PROVIDER_DEFAULTS.anthropic.apiBase;
    const model = config.model || 'claude-3-5-sonnet-20241022';
    const maxTokens = config.maxTokens ?? CONSTANTS.DEFAULT_CONFIG.maxTokens;

    const activeErrorTypes = Object.entries(config.errorTypes || {})
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key);

    const text = Utils.truncateText(content.text, 6000);
    const truncatedContent = { ...content, text };

    const systemPrompt = Prompts.getSystemPrompt(config.style, config);
    let userPrompt = text.length > 3000
      ? Prompts.getCondensedUserPrompt(truncatedContent, activeErrorTypes)
      : Prompts.getUserPrompt(truncatedContent, activeErrorTypes);

    if (regenerateHint) {
      userPrompt += '\n\n' + regenerateHint;
    }

    const response = await fetch(`${apiBase}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
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
