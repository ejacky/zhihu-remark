/**
 * 知乎反驳助手 - AI API 调用封装
 * 支持 OpenAI、Claude 等主流 API
 */

const API = {
  /**
   * 生成反驳
   */
  async generateRebuttal(content, config) {
    const provider = config.provider || 'openai';

    switch (provider) {
      case 'openai':
        return this._callOpenAI(content, config);
      case 'anthropic':
        return this._callAnthropic(content, config);
      case 'custom':
        return this._callCustom(content, config);
      default:
        throw new Error(`不支持的 AI 提供商: ${provider}`);
    }
  },

  /**
   * 调用 OpenAI API
   */
  async _callOpenAI(content, config) {
    const apiKey = config.apiKey;
    if (!apiKey) {
      throw new Error('请先在扩展设置中配置 OpenAI API Key');
    }

    const apiBase = config.apiBase || CONSTANTS.PROVIDER_DEFAULTS.openai.apiBase;
    const model = config.model || CONSTANTS.DEFAULT_CONFIG.model;
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
    const userPrompt = text.length > 3000
      ? Prompts.getCondensedUserPrompt(truncatedContent, activeErrorTypes)
      : Prompts.getUserPrompt(truncatedContent, activeErrorTypes);

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      })
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
  async _callAnthropic(content, config) {
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
    const userPrompt = text.length > 3000
      ? Prompts.getCondensedUserPrompt(truncatedContent, activeErrorTypes)
      : Prompts.getUserPrompt(truncatedContent, activeErrorTypes);

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
  async _callCustom(content, config) {
    if (!config.apiBase) {
      throw new Error('自定义 API 需要配置 API Base URL');
    }
    // 复用 OpenAI 逻辑，但使用自定义 base URL
    return this._callOpenAI(content, { ...config, provider: 'openai' });
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
