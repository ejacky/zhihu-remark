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
   * 同时拦下「只有协议」（`https://`、`http:/`）与非 http(s) 协议（`ftp://…`）：
   * 这类输入若继续往下走，会被补协议逻辑拼成 `https://https:` 这种畸形串，
   * 而 `originOf()` 还能从中解析出非空 origin（`https://https`），从而绕过
   * 调用方的有效性校验、把垃圾地址存进配置，最终让该提供商彻底不可用。
   *
   * @param {string} apiBase
   * @returns {string} 规范化后的地址；空值或无效值返回空字符串
   */
  normalizeApiBase(apiBase) {
    if (!apiBase || typeof apiBase !== 'string') return '';

    let base = apiBase.trim();
    if (!base) return '';

    // 常见手误：少写一个斜杠（`https:/api.example.com`）→ 补全为 `https://`
    base = base.replace(/^(https?):\/(?!\/)/i, '$1://');

    // 只有协议、或非 http(s) 协议：判为无效，交由调用方提示用户
    if (/^https?:\/*$/i.test(base)) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(base) && !/^https?:\/\//i.test(base)) return '';

    // 协议后紧跟多余的 `/`、`?`、`#`（`https:///x`、`https://?x`）：WHATWG URL 会跳过多余的
    // 前导斜杠，把 `https:///x` 解析成主机 `x`（origin 非空），从而绕过调用方的有效性校验。
    // 这类输入一律判为无效，避免「畸形地址被判有效」。
    if (/^https?:\/\/[\/?#]/i.test(base)) return '';

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
   * @returns {string|null} 例如 `https://api.example.com`；无法解析或畸形时返回 null
   */
  originOf(apiBase) {
    const base = this.normalizeApiBase(apiBase);
    if (!base) return null;

    try {
      const url = new URL(base);
      // 主机名缺失（`https:///x`）或主机名等于协议名（`https://https`）都说明地址畸形
      if (!url.hostname || url.hostname === url.protocol.slice(0, -1)) return null;
      return url.origin;
    } catch {
      return null;
    }
  },

  /**
   * 该 origin 是否落在扩展可申请（或已持有）的权限范围内
   *
   * `manifest.json` 的 `optional_host_permissions` 只声明了「任意 https 主机」与 http 的
   * `localhost` / `127.0.0.1` 这几类模式，因此其它明文 http 域名（含 `192.168.x.x` 这类内网地址）
   * 无法动态授权。若不提前告知，用户只会看到「请重新点击保存并在弹窗中选择允许」，
   * 而那个弹窗永远不会出现。
   *
   * @param {string} origin
   * @returns {boolean}
   */
  isRequestable(origin) {
    if (!origin) return false;

    try {
      const url = new URL(origin);
      if (url.protocol === 'https:') return true;
      return url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(url.hostname);
    } catch {
      return false;
    }
  },

  /**
   * origin 转 Chrome 匹配模式
   *
   * 端口会被剔除：Chrome 的匹配模式以主机为粒度（同一主机的所有端口共用一条模式），
   * 而 `URL.origin` 是带端口的（`http://localhost:11434`），直接拼接会得到
   * `http://localhost:11434/*` 这种 Chrome 可能拒收的形式。剔除后：
   * `https://localhost:11434` 与 `https://localhost:8080` 共用 `http://localhost/*`，
   * 与 manifest 中 `http://localhost/*` / `http://127.0.0.1/*` 的写法保持一致。
   *
   * @param {string} origin
   * @returns {string}
   */
  patternOf(origin) {
    try {
      const url = new URL(origin);
      return `${url.protocol}//${url.hostname}/*`;
    } catch {
      return `${origin}/*`;
    }
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
