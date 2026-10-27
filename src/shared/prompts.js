/**
 * 知乎反驳助手 - Prompt
 *
 * 设计原则（2026-10 B0 实测结论，见 docs/PROMPT_DESIGN.md）：
 * 模型本身会思考，Prompt 的职责不是"教它守规矩"，而是给它三条可自检的判据、
 * 一个结构模板、一条证据纪律。约束越少，输出越不像公文。
 *
 * 反面经验：曾经有 388 行 / 50 处硬约束，逐条禁止分段、反问、对文本方法的定性，
 * 结果是模型为了不违规，把所有论证压成一句"正确但无用"的概述（B0 中 v1 评分 1/5）。
 * 精简后同一篇文章的评分是 4.5/5，差别只在 Prompt 与 max_tokens。
 *
 * @doc docs/PROMPT_DESIGN.md
 * @doc docs/TECH_DESIGN.md#42-外部-ai-api
 */

const Prompts = {
  /**
   * 系统提示词：三条判据 + 一个结构 + 一条纪律
   *
   * @param {string} style - 反驳风格 key（见 CONSTANTS.REBUTTAL_STYLES）
   * @param {Object} config - 用户配置（用到 customPromptSuffix）
   * @param {Object} [_content] - 保留参数位，当前未使用
   */
  getSystemPrompt(style = 'gentle', config = {}, _content = null) {
    const tone = CONSTANTS.REBUTTAL_STYLES?.[style]?.toneHint || '';
    const custom = String(config.customPromptSuffix || '').trim();

    return [
      `你是一个在知乎评论区发言的普通用户，不是助手，也不是客服。
下面是一条知乎回答。请写一条反驳评论：直接说事，像一个懂行的人当场接话。

三条判据：
1. 主语检验：把句子主语换成「张三说」，仍然成立就是在说文本，可以写；不成立就是在说这个人，删掉。
2. 专名锚定：每个反驳点必须绑一个可核验的具体名词——器物、条文、年份、数字、书名、地名、人名。绑不上就删掉这个点，不要用形容词凑。
3. 点破跳点：必须明确说出对方的推理在哪里跳了——拿个案推全体、证据方向反了、只挑有利样本。不说出来，等于没反驳。

结构（不要编号，不要小标题）：
第一句给一句定性，不超过 25 字，只说这段文本的方法问题；
接着 2~4 段对账，每段写「你说的 X」和「实际 Y」，Y 必须带具体名词；
再用一句点破跳点；最后一句收尾，落在事实上，不要问对方问题。

长度 250~650 字，段间空行。

纪律：不许编造。具体名词拿不准，就把那个点整条删掉，宁可少写一段。写错一个专名，整条评论就废了。
只输出评论正文，不要任何解释、前言、标题或结尾说明。`,
      tone ? `语气：${tone}` : '',
      custom ? `用户补充要求（优先满足）：${custom}` : ''
    ].filter(Boolean).join('\n\n');
  },

  /**
   * 用户提示词：回答信息 + 正文
   *
   * @param {Object} content - { title, author, text, url, voteCount }
   * @param {string[]} [_errorTypeFilter] - 保留参数位（错误类型开关已随结构化分析一并移除）
   */
  getUserPrompt(content, _errorTypeFilter = []) {
    const { title, author, text, url } = content || {};

    return `## 当前日期
${this._getCurrentDateLabel()}（涉及"最近 / 上个月 / 前几年"的时效判断，以此日期为基准）

## 回答信息
- 标题：${title || '无标题'}
- 作者：${author || '匿名用户'}
- 链接：${url || '当前页面'}

## 回答正文
"""
${text || ''}
"""`;
  },

  /**
   * 超长内容使用的提示词
   *
   * 上下文已是 1M 级别，不再需要"简化 Prompt"；保留该函数只为零改动调用方。
   */
  getCondensedUserPrompt(content, errorTypeFilter = []) {
    return this.getUserPrompt(content, errorTypeFilter);
  },

  /**
   * 把用户的补充要求／历史反馈转成一句重写提示
   *
   * @param {Object|string} feedback - { type, reason, customReason } 或纯文本
   */
  buildRegenerateHint(feedback) {
    const text = typeof feedback === 'string'
      ? feedback
      : (feedback?.customReason || feedback?.reason || feedback?.type || '');

    const trimmed = String(text).trim();
    if (!trimmed) return '';

    return `\n\n换一种写法重写这条评论，并且必须满足：${trimmed}`;
  },

  /**
   * 当前日期标签（时效判断的基准）
   * @private
   */
  _getCurrentDateLabel() {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日（星期${weekdays[now.getDay()]}）`;
  }
};

// 导出（兼容内容脚本和模块）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Prompts;
}
