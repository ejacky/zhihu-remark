/**
 * 知乎反驳助手 - AI API 调用封装
 * 支持 OpenAI、Claude、DeepSeek、Kimi 等主流 API
 *
 * 地址与模型优先使用用户配置：`config.apiBase` 为空才回退到 PROVIDER_DEFAULTS 的内置地址，
 * 因此内置提供商同样可以指向代理 / 镜像 / 本地网关（官方换域名时无需等扩展更新）。
 *
 * 失败处理：空返回 / 输出被截断 / 网关抖动等「再试一次大概率能过」的失败，按
 * CONSTANTS.API_RETRY 自动退避重试（重试时会关闭 json 模式、必要时放宽 max_tokens），
 * 并把最终失败原因（空返回 / 截断 / 安全拦截 / 网关错误）翻译成可操作的提示；
 * 鉴权失败、域名未授权等确定性失败不做重试。
 *
 * @doc docs/TECH_DESIGN.md#42-外部-ai-api
 * @doc docs/TECH_DESIGN.md#7-错误处理
 * @doc docs/TECH_DESIGN.md#63-权限与域名授权
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
      case 'opencode-go':
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
      const providerNames = {
        openai: 'OpenAI',
        deepseek: 'DeepSeek',
        kimi: 'Kimi',
        'opencode-go': 'OpenCode Go',
        custom: '自定义'
      };
      throw new Error(`请先在扩展设置中配置 ${providerNames[provider] || provider} API Key`);
    }

    // 用户填写的地址优先（内置提供商也可覆盖），留空才用提供商默认地址
    const apiBase = HostAccess.normalizeApiBase(config.apiBase)
      || CONSTANTS.PROVIDER_DEFAULTS[provider]?.apiBase
      || '';
    const model = config.model
      || CONSTANTS.PROVIDER_DEFAULTS[provider]?.defaultModel
      || CONSTANTS.DEFAULT_CONFIG.model;

    // token 预算：思考与正文共用 completion_tokens，只给 4096 会被思考吃光
    // （实测思考 2300~3500 + 正文 ~800）。预算固定，不再暴露给用户。
    const baseMaxTokens = CONSTANTS.GENERATE_MAX_TOKENS || 16384;

    // 正文截断：上下文已是 1M 级别，24000 字只用来防极端长文烧钱
    const text = Utils.truncateText(content.text, 24000);
    const truncatedContent = { ...content, text };

    const systemPrompt = Prompts.getSystemPrompt(config.style, config, truncatedContent);
    let userPrompt = Prompts.getUserPrompt(truncatedContent);

    if (regenerateHint) {
      userPrompt += '\n\n' + regenerateHint;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    await this._assertHostAccess(apiBase);

    const headers = await this._buildHeaders(apiBase, {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }, content);

    // 重试过程中可调整的请求状态
    const state = {
      maxTokens: baseMaxTokens,
      // 深度思考开关：none 关闭（1~3 秒），high 开启（30~50 秒）
      effort: config.thinking === false ? 'none' : 'high'
    };

    return this._withRetry(async () => {
      const requestBody = {
        model,
        messages,
        max_tokens: state.maxTokens,
        reasoning_effort: state.effort
      };

      const data = await this._postJson(`${apiBase}/chat/completions`, headers, requestBody);
      const { text: rawContent, finishReason } = this._extractOpenAIResult(data, state.maxTokens);

      // 截断是预算问题（确定性），重试只会再烧一遍思考 token，因此不重试
      if (finishReason === 'length') {
        throw this._fail(`生成被截断：思考与正文共用 ${state.maxTokens} tokens 预算`, 'length', {
          retryable: false,
          finishReason,
          hint: '在设置里调大 Max Tokens，或关闭深度思考后重试'
        });
      }

      return this._wrapRebuttal(rawContent);
    }, {
      attempts: 2, // 思考模式单次 30~50 秒，重试次数必须收紧
      onRetry: (error) => this._applyRetryPolicy(state, error, baseMaxTokens)
    });
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
    const baseMaxTokens = CONSTANTS.GENERATE_MAX_TOKENS || 16384;

    const text = Utils.truncateText(content.text, 24000);
    const truncatedContent = { ...content, text };

    const systemPrompt = Prompts.getSystemPrompt(config.style, config, truncatedContent);
    let userPrompt = Prompts.getUserPrompt(truncatedContent);

    if (regenerateHint) {
      userPrompt += '\n\n' + regenerateHint;
    }

    const messages = [
      { role: 'user', content: userPrompt }
    ];

    await this._assertHostAccess(apiBase);

    const headers = await this._buildHeaders(apiBase, {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }, content);

    const state = {
      maxTokens: baseMaxTokens,
      nudge: false
    };

    return this._withRetry(async () => {
      const requestBody = {
        model,
        max_tokens: state.maxTokens,
        system: systemPrompt,
        messages: state.nudge ? this._withJsonNudge(messages) : messages
      };

      const data = await this._postJson(`${apiBase}/messages`, headers, requestBody);
      const { text: rawContent, finishReason } = this._extractAnthropicResult(data, state.maxTokens);

      return this._acceptOrThrow(rawContent, finishReason, state.maxTokens);
    }, {
      onRetry: (error) => this._applyRetryPolicy(state, error, baseMaxTokens)
    });
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

  // ------------------------------------------------------------------
  // 请求与响应提取
  // ------------------------------------------------------------------

  /**
   * 发送 POST 并解析响应体，把 HTTP / 网络 / 网关层面的失败分类后抛出
   * @private
   */
  async _postJson(url, headers, body) {
    let response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
    } catch (cause) {
      // fetch 抛异常＝完全没拿到响应（断网、DNS、连接被掐）：值得重试
      throw this._fail(`网络请求失败：${cause?.message || '无法连接到 API'}`, 'network', {
        retryable: true
      });
    }

    // 先取文本再自行解析：中转 / 网关在 200 或 5xx 下返回 HTML、空体、纯文本时，
    // response.json() 只会抛一个难以理解的解析错误，拿不到上游真正说了什么
    const rawText = await response.text().catch(() => '');
    let data = null;

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      throw this._buildHttpError(response, data, rawText);
    }

    if (!data) {
      throw this._fail(
        `API 返回内容无法解析 (HTTP ${response.status})：${Utils.truncateText(rawText, 200) || '响应体为空'}`,
        'gateway',
        { retryable: true, status: response.status }
      );
    }

    return data;
  },

  /**
   * 构造 HTTP 层失败：判断哪些是「重试有意义」的
   * @private
   */
  _buildHttpError(response, data, rawText) {
    const status = response.status;
    const upstreamMessage = data?.error?.message || data?.message || '';
    const message = upstreamMessage
      || Utils.truncateText(rawText, 200)
      || response.statusText
      || '无响应体';

    const rateLimited = status === 429 || status >= 500;
    const paramIssue = status === 400 || status === 422;
    const mentionsJson = /response_format|json_object|json\s*mode/i.test(String(upstreamMessage));
    const mentionsTokens = /max_?tokens/i.test(String(upstreamMessage));

    let retryable = rateLimited;
    let disableJsonMode = false;
    let resetTokens = false;

    // 模型 / 网关不接受 json 模式或 token 上限：换个请求形态重试是有意义的
    if (paramIssue && (mentionsJson || mentionsTokens)) {
      retryable = true;
      resetTokens = mentionsTokens;
      disableJsonMode = mentionsJson && !mentionsTokens;
    }

    return this._fail(`API 错误 (${status}): ${message}`, paramIssue && retryable ? 'param' : 'http', {
      retryable,
      status,
      disableJsonMode,
      resetTokens,
      retryAfterMs: this._retryAfterMs(response)
    });
  },

  /**
   * 读取 Retry-After（秒或 HTTP 日期），拿不到就返回 undefined
   * @private
   */
  _retryAfterMs(response) {
    try {
      const header = response.headers?.get?.('Retry-After');
      if (!header) return undefined;

      const seconds = Number(header);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

      const timestamp = Date.parse(header);
      if (!Number.isNaN(timestamp)) return Math.max(0, timestamp - Date.now());
    } catch {
      // 忽略：读不到就走默认退避
    }

    return undefined;
  },

  /**
   * 提取 OpenAI 兼容响应中的正文；拿不到正文时按原因分类抛出
   * @private
   */
  _extractOpenAIResult(data, maxTokens) {
    // 有些中转 / 网关用 HTTP 200 包着错误体返回，不识别就会误报成「内容为空」
    if (data?.error) {
      throw this._fail(
        `API 错误 (200): ${data.error.message || Utils.truncateText(JSON.stringify(data.error), 200)}`,
        'gateway',
        { retryable: true, status: 200 }
      );
    }

    const choice = data?.choices?.[0];
    const message = choice?.message || {};
    const finishReason = choice?.finish_reason;
    const text = this._contentToText(message.content).trim();

    if (text) {
      return { text, finishReason };
    }

    // 安全策略 / 拒答：重试没有意义，必须让用户看到真实原因
    if (finishReason === 'content_filter'
      || (typeof message.refusal === 'string' && message.refusal.trim())) {
      throw this._fail('内容被模型的安全策略拦截，未返回文本', 'filter', {
        finishReason,
        hint: '可尝试更换模型，或调整设置中的「自定义 Prompt 后缀」'
      });
    }

    if (finishReason === 'length') {
      throw this._fail(`生成被截断：模型在 ${maxTokens} tokens 内没有输出完整结果`, 'length', {
        retryable: true,
        finishReason,
        escalateTokens: true,
        hint: '请在设置中调大 Max Tokens，或更换模型'
      });
    }

    // 思考型模型把预算花在推理上、正文为空：同样是「放宽预算再试一次」
    if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
      throw this._fail(`模型只输出了思考内容，没有返回正文（已用 ${maxTokens} tokens）`, 'length', {
        retryable: true,
        finishReason,
        escalateTokens: true,
        hint: '请在设置中调大 Max Tokens，或更换模型'
      });
    }

    if (!choice) {
      throw this._fail('API 返回内容为空：响应中没有 choices（HTTP 200）', 'gateway', {
        retryable: true,
        status: 200
      });
    }

    throw this._fail('API 返回内容为空', 'empty', {
      retryable: true,
      finishReason,
      hint: '常见于 JSON 模式的偶发空返回，可稍后重试或在设置中更换模型'
    });
  },

  /**
   * 提取 Claude 响应中的正文；拿不到正文时按原因分类抛出
   * @private
   */
  _extractAnthropicResult(data, maxTokens) {
    if (data?.error) {
      throw this._fail(
        `API 错误 (200): ${data.error.message || Utils.truncateText(JSON.stringify(data.error), 200)}`,
        'gateway',
        { retryable: true, status: 200 }
      );
    }

    const blocks = Array.isArray(data?.content) ? data.content : [];
    const stopReason = data?.stop_reason;

    // Claude 可能先返回 thinking / redacted_thinking 块，正文在后面的 text 块里，
    // 因此不能写死取 content[0].text（那会把有内容的响应误判成「空返回」）
    const textBlock = blocks.find(block =>
      block?.type === 'text' && typeof block.text === 'string' && block.text.trim());

    if (textBlock) {
      return { text: textBlock.text, finishReason: stopReason };
    }

    if (stopReason === 'refusal') {
      throw this._fail('内容被模型的安全策略拦截，未返回文本', 'filter', {
        finishReason: stopReason,
        hint: '可尝试更换模型，或调整设置中的「自定义 Prompt 后缀」'
      });
    }

    if (stopReason === 'max_tokens') {
      throw this._fail(`生成被截断：模型在 ${maxTokens} tokens 内没有输出完整结果`, 'length', {
        retryable: true,
        finishReason: stopReason,
        escalateTokens: true,
        hint: '请在设置中调大 Max Tokens，或更换模型'
      });
    }

    if (blocks.some(block => block?.type === 'thinking' || block?.type === 'redacted_thinking')) {
      throw this._fail(`模型只输出了思考内容，没有返回正文（已用 ${maxTokens} tokens）`, 'length', {
        retryable: true,
        finishReason: stopReason,
        escalateTokens: true,
        hint: '请在设置中调大 Max Tokens，或更换模型'
      });
    }

    if (!blocks.length) {
      throw this._fail('API 返回内容为空：响应中没有 content（HTTP 200）', 'gateway', {
        retryable: true,
        status: 200
      });
    }

    throw this._fail('API 返回内容为空', 'empty', {
      retryable: true,
      finishReason: stopReason,
      hint: '可稍后重试或在设置中更换模型'
    });
  },

  /**
   * 把 content 字段（字符串或分块数组）统一成文本
   * @private
   */
  _contentToText(content) {
    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
      return content
        .map(part => {
          if (typeof part === 'string') return part;
          return typeof part?.text === 'string' ? part.text : '';
        })
        .join('');
    }

    return '';
  },

  /**
   * 校验并解析正文；截断响应在结构仍完整时直接采用，避免白烧重试
   * @private
   */
  _acceptOrThrow(text, finishReason, maxTokens) {
    let parsed = null;
    let parseError = null;

    try {
      parsed = this._parseResponse(text);
    } catch (error) {
      parseError = error;
    }

    if (finishReason === 'length') {
      // 被截断但 JSON 仍然可用（含 extractJSON 的补全能力）就先用起来
      if (parsed && (parsed.rebuttal || parsed.analysis?.hasErrors === false)) {
        return parsed;
      }

      throw this._fail(`生成被截断：模型在 ${maxTokens} tokens 内没有输出完整结果`, 'length', {
        retryable: true,
        finishReason,
        escalateTokens: true,
        hint: '请在设置中调大 Max Tokens，或更换模型'
      });
    }

    if (parsed) return parsed;

    throw this._fail(parseError?.message || 'AI 返回格式错误，无法解析 JSON', 'format', {
      retryable: true,
      finishReason
    });
  },

  // ------------------------------------------------------------------
  // 重试
  // ------------------------------------------------------------------

  /**
   * 带退避的重试包装
   *
   * 只重试 `error.retryable === true` 的失败（概率性 / 抖动类）；
   * 鉴权、域名未授权、安全拦截等确定性失败立即抛出，不额外消耗时间与费用。
   *
   * @param {Function} attemptFn - 一次尝试，返回最终结果
   * @param {Object} [opts] - { onRetry(error, attempt), attempts, delaysMs }
   * @private
   */
  async _withRetry(attemptFn, opts = {}) {
    const retryConfig = CONSTANTS.API_RETRY || {};
    const maxAttempts = opts.attempts ?? retryConfig.maxAttempts ?? 3;
    const delays = opts.delaysMs ?? retryConfig.delaysMs ?? [800, 2000];

    let lastError = null;
    let retries = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await attemptFn(attempt);
      } catch (error) {
        lastError = error;

        if (!error || error.retryable !== true || attempt >= maxAttempts) break;

        retries++;
        if (typeof opts.onRetry === 'function') opts.onRetry(error, attempt);

        const wait = this._backoffMs(error, delays[attempt - 1]);
        console.warn(
          `[知乎反驳助手] 第 ${attempt}/${maxAttempts} 次调用失败：kind=${error.kind || 'unknown'}`
          + (error.status ? `, status=${error.status}` : '')
          + (error.finishReason ? `, finish_reason=${error.finishReason}` : '')
          + `；${wait}ms 后重试`
        );

        await this._sleep(wait);
      }
    }

    throw this._finalError(lastError, retries);
  },

  /**
   * 按失败原因调整下一次请求的形态
   * @private
   */
  _applyRetryPolicy(state, error, baseMaxTokens) {
    if (error?.resetTokens) {
      // 放宽后的 token 上限被上游拒绝：退回用户设定值再试
      state.maxTokens = baseMaxTokens;
    } else if (error?.escalateTokens) {
      state.maxTokens = this._escalateTokens(state.maxTokens);
    }

    const jsonRelated = error?.kind === 'empty'
      || error?.kind === 'format'
      || error?.disableJsonMode === true;

    if (jsonRelated && 'jsonMode' in state) {
      // JSON Output 空返回是官方已知问题，换一种输出约束重试
      state.jsonMode = false;
    }

    if (error?.kind === 'empty') {
      state.nudge = true;
    }
  },

  /**
   * 退避时长：优先用上游给的 Retry-After，否则用配置值，带 ±20% 抖动
   * @private
   */
  _backoffMs(error, base) {
    const fallback = Number.isFinite(base) ? base : 800;
    const retryAfter = Number.isFinite(error?.retryAfterMs)
      ? Math.min(error.retryAfterMs, 3000)
      : fallback;

    const jitter = 1 + (Math.random() * 0.4 - 0.2);
    return Math.max(0, Math.round(retryAfter * jitter));
  },

  /**
   * 放宽 max_tokens（仅 Anthropic 通路还会用到；OpenAI 通路的截断不再重试）
   * 上限取正文预算的 2 倍，保证放宽时不会反而把预算改小。
   * @private
   */
  _escalateTokens(current) {
    const base = Number.isFinite(current) ? current : (CONSTANTS.GENERATE_MAX_TOKENS || 16384);
    const ceiling = (CONSTANTS.GENERATE_MAX_TOKENS || 16384) * 2;
    return Math.min(Math.max(base * 2, base + 512), ceiling);
  },

  /**
   * 在最后一条用户消息末尾追加「只输出 JSON」提醒
   * @private
   */
  _withJsonNudge(messages) {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') return messages;

    return [
      ...messages.slice(0, -1),
      {
        ...last,
        content: `${last.content}\n\n（注意：直接输出 JSON 对象本身，不要输出任何解释、前言或空白内容。）`
      }
    ];
  },

  /**
   * 组装最终抛给用户的错误：补上重试次数与可操作提示
   * @private
   */
  _finalError(error, retries) {
    if (!error) return new Error('生成反驳时发生未知错误');
    if (retries === 0 && !error.hint) return error;

    const note = retries > 0 ? `（已自动重试 ${retries} 次）` : '';
    const finalError = new Error(`${error.message}${note}${error.hint ? '。' + error.hint : ''}`);
    finalError.kind = error.kind;
    finalError.status = error.status;

    return finalError;
  },

  /**
   * 创建带分类信息的错误（kind / retryable 等字段供 _withRetry 决策）
   * @private
   */
  _fail(message, kind, extra = {}) {
    const error = new Error(message);
    error.kind = kind;
    error.retryable = extra.retryable === true;

    if (extra.status !== undefined) error.status = extra.status;
    if (extra.finishReason) error.finishReason = extra.finishReason;
    if (extra.retryAfterMs !== undefined) error.retryAfterMs = extra.retryAfterMs;
    if (extra.escalateTokens) error.escalateTokens = true;
    if (extra.disableJsonMode) error.disableJsonMode = true;
    if (extra.resetTokens) error.resetTokens = true;
    if (extra.hint) error.hint = extra.hint;

    return error;
  },

  /**
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // ------------------------------------------------------------------
  // 请求头、权限与解析
  // ------------------------------------------------------------------

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
   * 把纯文本响应包装成面板 / 历史记录需要的结构
   *
   * 正文生成已不走 JSON 模式（JSON Output 会把段落、对账式论证压平成一句概述），
   * 因此 analysis / errors / confidence 只保留空壳：面板在没有结构化数据时
   * 会自动跳过标签、错误详情与摘要区块，只渲染反驳正文。
   *
   * @private
   */
  _wrapRebuttal(rawContent) {
    let text = String(rawContent || '')
      .replace(/^```[a-zA-Z]*\s*/, '')
      .replace(/\s*```$/, '')
      .trim();

    // 模型偶尔会加一句前缀说明（"评论："），剥掉
    text = text.replace(/^(反驳|评论|回复|答案)[：:]\s*/, '').trim();

    if (!text) {
      throw this._fail('模型没有返回正文（思考可能占满了预算）', 'empty', {
        retryable: false,
        hint: '关闭深度思考或调大 Max Tokens 后重试'
      });
    }

    return {
      analysis: { hasErrors: true, errorTypes: [], summary: '' },
      errors: [],
      rebuttal: text,
      confidence: ''
    };
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
