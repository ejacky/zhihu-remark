/**
 * 知乎反驳助手 - API 域名访问权限工具
 *
 * 内置提供商（OpenAI / Anthropic / DeepSeek / Kimi）的域名写在 manifest.json 的
 * host_permissions 中，安装即生效；自定义 API 的域名无法预先声明，只能在用户
 * 保存配置时通过 chrome.permissions.request() 动态申请
 * （对应 manifest.json 的 optional_host_permissions）。
 *
 * @doc docs/TECH_DESIGN.md#73-网络安全
 * @doc docs/USER_GUIDE.md#41-api-设置
 */

const HostAccess = {
  /**
   * 规范化 API Base URL：补全协议、去掉末尾斜杠
   *
   * 用户经常直接粘贴 `api.example.com/v1`（缺少协议）。缺少协议不仅会导致
   * fetch 失败，也无法解析出 origin 用于权限申请，因此在此统一补齐。
   *
   * @param {string} apiBase
   * @returns {string} 规范化后的地址；空值返回空字符串
   */
  normalizeApiBase(apiBase) {
    if (!apiBase || typeof apiBase !== 'string') return '';

    let base = apiBase.trim();
    if (!base) return '';

    if (!/^https?:\/\//i.test(base)) {
      // 本地模型（Ollama / LM Studio 等）默认走 http，其余按 https 处理
      const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(base);
      base = `${isLocalhost ? 'http' : 'https'}://${base}`;
    }

    return base.replace(/\/+$/, '');
  },

  /**
   * 取出 API Base 对应的 origin（host 权限以 origin 为单位申请与校验）
   * @param {string} apiBase
   * @returns {string|null} 例如 `https://api.example.com`；无法解析时返回 null
   */
  originOf(apiBase) {
    const base = this.normalizeApiBase(apiBase);
    if (!base) return null;

    try {
      return new URL(base).origin;
    } catch {
      return null;
    }
  },

  /**
   * origin 转 Chrome 匹配模式
   * Chrome 的匹配模式忽略端口，因此 `https://localhost:11434` 与
   * `https://localhost:8080` 共用同一个 `http://localhost/*` 模式
   * @param {string} origin
   * @returns {string}
   */
  patternOf(origin) {
    return `${origin}/*`;
  },

  /**
   * 当前扩展是否已获得该域名的访问权限
   * manifest.host_permissions 中已声明的域名同样返回 true，因此无需另行维护内置域名清单
   * @param {string} origin
   * @returns {Promise<boolean>}
   */
  async has(origin) {
    if (!origin || typeof chrome === 'undefined' || !chrome.permissions?.contains) {
      return true;
    }

    try {
      return await chrome.permissions.contains({ origins: [this.patternOf(origin)] });
    } catch {
      return false;
    }
  },

  /**
   * 申请该域名的访问权限（已授权时静默返回 true，不会再次弹窗）
   *
   * 注意：Chrome 要求在用户手势的同步调用帧内发起该请求，因此本方法的第一条
   * 语句就是 request()。调用方在调用本方法之前不要 await 任何异步操作，
   * 否则会丢失用户手势导致请求被拒绝。
   *
   * @param {string} origin
   * @returns {Promise<boolean>} 用户是否授权
   */
  request(origin) {
    if (!origin || typeof chrome === 'undefined' || !chrome.permissions?.request) {
      return Promise.resolve(true);
    }

    try {
      return Promise.resolve(
        chrome.permissions.request({ origins: [this.patternOf(origin)] })
      ).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }
};
