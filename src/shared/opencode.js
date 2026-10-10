/**
 * 知乎反驳助手 - OpenCode Go / Zen 网关适配
 *
 * OpenCode Go 与 Zen 要求每个请求携带稳定的 `x-opencode-session`，
 * 用于把同一会话的请求路由到同一后端并复用 prompt 缓存；缺失该头会被网关
 * 以 400 直接拒绝（"Request is missing x-opencode-session"）。
 * 参考：https://opencode.ai/docs/go/#where-can-i-use-it
 *
 * 会话标识按「回答」维度派生：同一条回答的首次生成、重新生成、切换风格会复用
 * 同一个 ID（正好命中网关的缓存诉求），不同回答之间互相隔离。派生是确定性的，
 * 因此 Service Worker 重启后仍然稳定，无需持久化任何状态。
 *
 * @doc docs/TECH_DESIGN.md#42-外部-ai-api
 * @doc docs/USER_GUIDE.md#41-api-设置
 */

const OpenCode = {
  // 网关主机（Go 与 Zen 共用同一入口域）
  HOST: 'opencode.ai',

  /**
   * 判断 API Base 是否指向 OpenCode 网关
   * @param {string} apiBase - 已规范化的 API Base URL
   * @returns {boolean}
   */
  isEndpoint(apiBase) {
    if (!apiBase) return false;

    try {
      const host = new URL(apiBase).hostname.toLowerCase();
      return host === this.HOST || host.endsWith(`.${this.HOST}`);
    } catch {
      return false;
    }
  },

  /**
   * 派生会话标识（UUID v4 形状，便于下游按格式处理）
   * @param {Object} content - 回答内容 { url, author, text }
   * @returns {Promise<string>}
   */
  async sessionIdFor(content) {
    const seed = [
      content?.url || '',
      content?.author || '',
      (content?.text || '').slice(0, 300)
    ].join('|');

    const bytes = await this._digestBytes(seed);

    // 按 UUID v4 规范设置版本位与变体位
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join('')
    ].join('-');
  },

  /**
   * 取 16 字节摘要：优先 SHA-256，环境不支持时退化为 FNV-1a
   * 该值只用于会话亲和，不承担安全职责
   * @private
   */
  async _digestBytes(seed) {
    if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
      try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
        return new Uint8Array(digest).slice(0, 16);
      } catch {
        // 落到 FNV 兜底
      }
    }

    return this._fallbackBytes(seed);
  },

  /**
   * 无 WebCrypto 时的兜底摘要（FNV-1a 32bit × 4 轮）
   * @private
   */
  _fallbackBytes(seed) {
    const out = new Uint8Array(16);

    for (let round = 0; round < 4; round++) {
      const input = `${seed}#${round}`;
      let hash = (0x811c9dc5 ^ Math.imul(round, 0x9e3779b9)) >>> 0;

      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }

      out[round * 4] = hash & 0xff;
      out[round * 4 + 1] = (hash >>> 8) & 0xff;
      out[round * 4 + 2] = (hash >>> 16) & 0xff;
      out[round * 4 + 3] = (hash >>> 24) & 0xff;
    }

    return out;
  }
};
