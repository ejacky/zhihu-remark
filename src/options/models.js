/**
 * 知乎反驳助手 - 设置页模型目录
 *
 * 「同步模型」的数据源、鉴权头与响应解析都在这里：
 * - OpenCode Go / Console 的 /models 是公开接口，不发送 API Key；
 * - OpenAI 兼容提供商用自己的 Bearer Key 请求 {apiBase}/models；
 * - Claude 用 x-api-key + anthropic-version。
 *
 * 同步结果按提供商缓存在 chrome.storage.local 的 MODEL_CATALOG 键里，
 * 只存模型 ID / 名称 / 同步时间，不存 Key。
 *
 * @doc docs/TECH_DESIGN.md#44-模型列表同步
 * @doc docs/TECH_DESIGN.md#53-模型目录缓存
 */

const ModelCatalog = {
  CACHE_VERSION: 1,
  MAX_MODELS: 500,
  TIMEOUT_MS: 15000,

  /** 缓存键从 CONSTANTS 取，取不到时用同名兜底，保证本模块可被 Node 测试直接 require */
  get CACHE_KEY() {
    return (typeof CONSTANTS !== 'undefined' && CONSTANTS.STORAGE_KEYS?.MODEL_CATALOG)
      || 'zhihu_remark_model_catalog';
  },

  /**
   * 该地址是否指向 OpenCode 网关
   * @param {string} apiBase
   * @returns {boolean}
   */
  _isOpenCodeHost(apiBase) {
    if (!apiBase) return false;

    try {
      const host = new URL(apiBase).hostname.toLowerCase();
      return host === 'opencode.ai' || host.endsWith('.opencode.ai');
    } catch {
      return false;
    }
  },

  /**
   * OpenCode 的模型列表不在 {base}/models 下，要按 Go / Console 换成独立端点
   * @param {string} apiBase
   * @returns {string|null}
   */
  _openCodeModelsEndpoint(apiBase) {
    try {
      const url = new URL(apiBase);
      const isGo = /\/inference\/go(\/|$)/i.test(url.pathname);
      // 用 origin 拼端点，保留用户填的端口（自定义镜像可能不是 443）
      return `${url.origin}${isGo ? '/inference/go/v1/models' : '/inference/v1/models'}`;
    } catch {
      return null;
    }
  },

  /**
   * 解析某个提供商应请求的模型列表地址
   * @param {string} provider - 配置里的 provider
   * @param {string} [apiBase] - 用户覆盖的地址；空则用内置地址
   * @returns {string|null} 无法确定时返回 null
   */
  endpointFor(provider, apiBase) {
    const base = typeof apiBase === 'string' ? apiBase.trim() : '';

    // 自定义地址（代理 / 镜像 / 本地网关）按 OpenAI 兼容的 {base}/models 走。
    // 不能落进下面的 OpenCode 分支：那会把主机改写成 opencode.ai，
    // 代理配置被忽略，用户的 Key 还会被发到没有指定的域名。
    if (base && !this._isOpenCodeHost(base)) {
      return this._modelsEndpointAt(base, provider);
    }

    // 地址指向 OpenCode 时，按 Go / Console 走专用端点
    if (base) {
      return this._openCodeModelsEndpoint(base);
    }

    if (provider === 'opencode-go') {
      const fallback = (typeof CONSTANTS !== 'undefined'
        && CONSTANTS.PROVIDER_DEFAULTS?.['opencode-go']?.apiBase) || '';
      const target = base || fallback;
      return target ? this._openCodeModelsEndpoint(target) : null;
    }

    const effective = base
      || (typeof CONSTANTS !== 'undefined' ? CONSTANTS.PROVIDER_DEFAULTS?.[provider]?.apiBase : '')
      || '';
    if (!effective) return null;

    return this._modelsEndpointAt(effective, provider);
  },

  /**
   * 拼 OpenAI 兼容的模型列表地址；Claude 额外带分页参数
   * @param {string} base
   * @param {string} provider
   * @returns {string}
   * @private
   */
  _modelsEndpointAt(base, provider) {
    const normalized = base.replace(/\/+$/, '');
    return provider === 'anthropic'
      ? `${normalized}/models?limit=1000`
      : `${normalized}/models`;
  },

  /**
   * 该提供商是否需要 API Key 才能读模型列表
   * @param {string} provider
   * @param {string} [apiBase]
   * @returns {boolean}
   */
  needsApiKey(provider, apiBase) {
    return !(this._isOpenCodeHost(apiBase) || (provider === 'opencode-go' && !apiBase));
  },

  /**
   * 组装模型列表请求头；OpenCode 公开端点不携带任何凭据
   * @param {string} provider
   * @param {string} [apiKey]
   * @param {string} [apiBase]
   * @returns {Object}
   */
  headersFor(provider, apiKey, apiBase) {
    if (this._isOpenCodeHost(apiBase) || (provider === 'opencode-go' && !apiBase)) {
      return {};
    }

    if (provider === 'anthropic') {
      return {
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01'
      };
    }

    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  },

  /**
   * 把 OpenAI / Anthropic / OpenCode 的响应统一成 [{ id, name }]
   *
   * 兼容 `{ data: [...] }`、纯数组与少见的 `{ models: [...] }`；
   * 只保留非空 id，按 id 去重，最多 MAX_MODELS 条。
   *
   * @param {*} payload
   * @returns {Array<{id: string, name: string}>}
   */
  parse(payload) {
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : null;

    if (!list) throw new Error('返回内容不是有效的模型列表');

    const seen = new Set();
    const models = [];

    for (const item of list) {
      const id = typeof item === 'string' ? item.trim() : String(item?.id || '').trim();
      if (!id || seen.has(id)) continue;

      const name = typeof item === 'string'
        ? item
        : String(item?.display_name || item?.name || id).trim() || id;

      seen.add(id);
      models.push({ id, name });

      if (models.length >= this.MAX_MODELS) break;
    }

    return models;
  },

  /**
   * 读取缓存；任何异常都退回空对象，让调用方使用内置列表
   * @returns {Promise<Object>}
   */
  async readCache() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};

      const result = await chrome.storage.local.get(this.CACHE_KEY);
      const saved = result?.[this.CACHE_KEY];
      if (!saved || saved.version !== this.CACHE_VERSION || typeof saved.providers !== 'object') {
        return {};
      }

      return saved.providers || {};
    } catch (err) {
      console.warn('[知乎反驳助手] 读取模型缓存失败，改用内置列表:', err);
      return {};
    }
  },

  /**
   * 写回缓存；失败只 warn，本次同步结果仍然可用
   * @param {Object} providers
   */
  async writeCache(providers) {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

      await chrome.storage.local.set({
        [this.CACHE_KEY]: {
          version: this.CACHE_VERSION,
          providers: providers || {}
        }
      });
    } catch (err) {
      console.warn('[知乎反驳助手] 写入模型缓存失败，本次结果仍可用:', err);
    }
  },

  /**
   * 请求模型列表，把 HTTP / 网络 / 解析失败翻译成可读中文
   * @param {string} endpoint
   * @param {Object} [headers]
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  async fetchModels(endpoint, headers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    let response;
    let payload;

    try {
      response = await fetch(endpoint, { headers, signal: controller.signal });
      payload = await response.json().catch(() => null);
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error(`同步超时（${this.TIMEOUT_MS / 1000} 秒），请检查网络或 Base URL`);
      }
      throw new Error('网络请求失败：请检查网络连接或 API Base URL');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(this._httpError(response.status, payload));
    }

    const models = this.parse(payload);
    if (!models.length) throw new Error('服务商返回了空列表');

    return models;
  },

  /**
   * HTTP 失败 → 可操作提示；不拼接请求头，避免泄露 Key
   * @private
   */
  _httpError(status, payload) {
    if (status === 401 || status === 403) {
      return 'API Key 无效或没有读取模型的权限，请检查 Key';
    }

    if (status === 404) {
      return '该地址没有模型列表端点（HTTP 404），请直接手填模型名';
    }

    if (status === 429) {
      return '请求太频繁（HTTP 429），请稍后再试';
    }

    if (status >= 500) {
      return `服务商暂时不可用（HTTP ${status}），请稍后再试`;
    }

    const detail = String(payload?.error?.message || payload?.message || '').slice(0, 120);
    return `同步失败（HTTP ${status}）${detail ? '：' + detail : ''}`;
  }
};

// 导出（供 Node 测试 require）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModelCatalog;
}
