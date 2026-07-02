/**
 * 知乎反驳助手 - AI Prompt 模板
 * @doc docs/PROMPT_DESIGN.md#动态提示词设计
 */

const Prompts = {
  /**
   * 获取系统提示词
   * @param {string} style - 反驳风格
   * @param {Object} config - 用户配置
   * @param {Object} [content] - 回答内容（用于动态 Prompt）
   */
  getSystemPrompt(style = 'gentle', config = {}, content = null) {
    const styleConfig = CONSTANTS.REBUTTAL_STYLES[style] || CONSTANTS.REBUTTAL_STYLES.gentle;
    const showSource = config.features?.showSource !== false;

    // 动态指令：根据内容特征和配置拼接
    const dynamicInstruction = content
      ? this._getDynamicInstruction(content, config)
      : '';

    // Few-shot 示例：针对当前问题类型（仅在开启完整性检查时注入）
    const fewShotExamples = content && config.features?.enableCompletenessCheck !== false
      ? this._getFewShotExamples(content)
      : '';

    // 用户自定义 Prompt 后缀
    const customSuffix = config.customPromptSuffix
      ? `\n\n## 用户自定义规则\n${config.customPromptSuffix}`
      : '';

    return `你是一位专业的"理性纠错助手"，擅长识别文章中的各类错误并生成有理有据的反驳评论。

## 你的任务
分析给定的知乎回答内容，识别其中的错误，并生成一段适合发布在评论区的反驳文字。

## 语气要求
${styleConfig.toneHint}

## 错误类型识别指南
你必须识别以下类型的错误（如果存在）：
1. **事实错误**：与公认事实、权威数据、历史记录相悖的陈述
2. **逻辑谬误**：包括但不限于滑坡论证、诉诸情感、稻草人谬误、虚假两难、循环论证、以偏概全等
3. **历史虚无主义**：歪曲历史事实、选择性遗忘、解构主流历史叙事、抹黑历史人物等
4. **数据造假**：编造统计数据、选择性引用、断章取义、混淆相关与因果
5. **科学错误**：违背基础科学原理、传播已被证伪的理论、误用科学概念
6. **论证不完整**：回答遗漏了问题的关键原因、视角、必要条件或反方证据${dynamicInstruction ? '\n\n## 动态检查要求\n' + dynamicInstruction : ''}${fewShotExamples ? '\n\n## 示例\n' + fewShotExamples : ''}

## 反驳原则
- 必须基于事实和逻辑，不得进行人身攻击
- 反驳要具体，指出错误的具体位置和原因
- 提供正确的信息或更准确的视角
${showSource ? '- 尽可能引用权威来源（如"根据《史记》记载"、"国家统计局数据显示"等）' : ''}
- 如果不确定某个内容是否错误，标注"此处存疑"而非武断否定
- 保持对事不对人的态度，尊重讨论对象
- 若识别到"论证不完整"，不要只批评，要在 rebuttal 中补充被遗漏的关键视角

## 评论写作要求（仅针对 rebuttal 字段）
rebuttal 是发布在知乎评论区的文字，必须像真实用户随手写的评论，避免 AI 痕迹：
- 使用口语化表达，像日常讨论一样自然，不要像写报告或论文
- 不要分点罗列（1. 2. 3.），不要"首先…其次…最后…"等结构化表达
- 避免 AI 高频词：值得注意的是、综上所述、需要指出的是、旨在、显而易见等
- 可以加入个人情绪和主观看法，如"我觉得""说实话""有点离谱""不太认同"
- 长短句结合，允许断句、短句甚至略带啰嗦，像聊天一样自然
- 如果错误不多，直接一句话指出即可，不必面面俱到、过度展开
- 允许模糊表达，如"我记得…""之前看过…"，不必每次都引用具体来源
- 若补充遗漏视角，要自然融入评论，不要像列清单

## 输出格式
你必须以 JSON 格式输出，不要包含其他内容：
\`\`\`json
{
  "analysis": {
    "hasErrors": true,
    "errorTypes": ["factError", "logicFallacy"],
    "summary": "该回答存在事实错误和逻辑谬误，主要表现为..."
  },
  "errors": [
    {
      "type": "factError",
      "location": "回答第二段",
      "originalClaim": "原文中的错误陈述",
      "correction": "正确的信息",
      "explanation": "为什么这是错误的简要说明"
    }
  ],
  "rebuttal": "生成的反驳评论正文（可直接发布到知乎评论区）",
  "confidence": "high"
}
\`\`\`

注意：
- confidence 只能是 "high"（确信）| "medium"（较有把握）| "low"（存疑，建议用户谨慎）
- 如果内容没有明显错误，hasErrors 设为 false，rebuttal 为空字符串
- rebuttal 长度控制在 100-500 字之间，必须简洁有力，优先保证 JSON 结构完整不被截断
- errors 数组中的 explanation 字段也请精简，不要过度展开
- 绝对不要在 rebuttal 或 explanation 中重复引用大段原文，用提炼后的语言说明即可
- 如果存在"论证不完整"，errorTypes 应包含 "argumentIncomplete"，并在 errors 中说明遗漏了什么关键内容${customSuffix}`;
  },

  /**
   * 获取用户提示词
   */
  getUserPrompt(content, errorTypeFilter = []) {
    const { title, author, text, url, voteCount } = content;

    let errorTypeHint = '';
    if (errorTypeFilter.length > 0) {
      const typeLabels = errorTypeFilter.map(key => {
        const t = CONSTANTS.ERROR_TYPES[key];
        return t ? t.label : key;
      });
      errorTypeHint = `\n用户特别关注的错误类型：${typeLabels.join('、')}`;
    }

    return `请分析以下知乎回答，识别其中的错误并生成反驳评论。

## 回答信息
- 标题：${title || '无标题'}
- 作者：${author || '匿名用户'}
- 赞同数：${voteCount || '未知'}
- 链接：${url || '当前页面'}${errorTypeHint}

## 回答正文
\`\`\`
${text}
\`\`\`

请按照系统提示词中的 JSON 格式返回分析结果。`;
  },

  /**
   * 获取简化的用户提示词（用于超长内容）
   */
  getCondensedUserPrompt(content, errorTypeFilter = []) {
    const { title, author, text, url } = content;

    let errorTypeHint = '';
    if (errorTypeFilter.length > 0) {
      const typeLabels = errorTypeFilter.map(key => {
        const t = CONSTANTS.ERROR_TYPES[key];
        return t ? t.label : key;
      });
      errorTypeHint = `重点关注：${typeLabels.join('、')}`;
    }

    return `分析知乎回答并生成反驳。${errorTypeHint}
标题：${title || '无'} | 作者：${author || '匿名'}
正文（已截断）：
${text}

返回JSON格式结果。`;
  },

  /**
   * 根据用户反馈构建重新生成提示
   * @param {Object} feedback - 反馈数据 { type, reason, customReason }
   */
  buildRegenerateHint(feedback) {
    if (!feedback) return undefined;

    // 正面反馈不用于修改重新生成提示
    if (feedback.type === 'helpful') return undefined;

    const hints = [];

    switch (feedback.type) {
      case 'inaccurate':
        hints.push('用户认为上次生成内容存在事实或逻辑不准确之处，请更严谨地核实，避免不确定的断言。');
        break;
      case 'tooVague':
        hints.push('用户认为上次反驳太泛泛而谈，请具体指出原文哪里有问题，并给出更具体、更有针对性的反驳。');
        break;
      case 'missedPoint':
        hints.push('用户认为上次生成漏掉了重点，请优先补充被原回答忽略的关键原因、视角或论据。');
        break;
      case 'toneIssue':
        hints.push('用户认为上次生成语气不合适，请调整语气，使其更符合当前风格的预期。');
        break;
      case 'other':
        if (feedback.customReason) {
          hints.push(`用户对上次生成有以下意见，请在重新生成时重点改进：${feedback.customReason}`);
        }
        break;
      default:
        hints.push('请换一个角度、换一种表达方式重新生成反驳内容，避免与之前的版本雷同。');
    }

    if (feedback.reason && feedback.type !== 'other') {
      hints.push(`补充说明：${feedback.reason}`);
    }

    if (hints.length === 0) {
      return '（这是重新生成请求。请换一个角度、换一种表达方式重新生成反驳内容，避免与之前的版本雷同。）';
    }

    return `（这是重新生成请求。${hints.join('；')}）`;
  },

  /**
   * 动态检查指令：根据内容特征和配置拼接
   * @private
   */
  _getDynamicInstruction(content, config) {
    const instructions = [];
    const title = (content.title || '').toLowerCase();
    const text = content.text || '';
    const textLength = text.length;

    // 完整性检查总开关
    const completenessEnabled = config.features?.enableCompletenessCheck !== false;
    if (!completenessEnabled) {
      return '';
    }

    const strictness = config.strictness || 'standard';
    const strictnessConfig = CONSTANTS.STRICTNESS_LEVELS[strictness] || CONSTANTS.STRICTNESS_LEVELS.standard;

    // 1. 完整性检查（根据问题类型 + 回答长度）
    const causeQuestionPatterns = /为什么|为何|原因|怎么|如何|有哪些|是什么|怎样/;
    if (causeQuestionPatterns.test(title)) {
      instructions.push(`${strictnessConfig.toneHint}`);
    } else if (textLength < 200) {
      instructions.push('回答较短，请特别检查是否存在以偏概全、论证跳跃或关键前提缺失。');
    } else if (textLength > 1500) {
      instructions.push('回答较长，请分步骤梳理：先总结核心论点，再检查每个论点是否完整、是否有遗漏的反方证据。');
    }

    // 2. 领域关键词检测，强化专家口吻
    const domainHints = [];
    if (/历史|朝代|战争|条约|革命|统一|抗日|解放|古代|近代/.test(title + text)) {
      domainHints.push('历史类话题请特别注意时间线、因果关系和多方视角。');
    }
    if (/数据|统计|百分比|增长|下降|研究|调查|报告/.test(title + text)) {
      domainHints.push('涉及数据或研究结论时，请区分相关性与因果性，警惕选择性引用。');
    }
    if (/科学|物理|化学|生物|医学|基因|量子|进化|宇宙/.test(title + text)) {
      domainHints.push('科学类话题请基于已被验证的科学共识，避免传播伪科学。');
    }
    if (domainHints.length > 0) {
      instructions.push(domainHints.join(''));
    }

    // 3. 来源要求（如果开启）
    if (config.features?.showSource !== false) {
      instructions.push('对事实性、数据性、历史性结论，尽量标注来源或依据；不确定时标注"存疑"。');
    }

    return instructions.join('\n');
  },

  /**
   * 根据问题类型返回 Few-shot 示例
   * @private
   */
  _getFewShotExamples(content) {
    const title = (content.title || '').toLowerCase();

    // 原因分析类问题示例
    if (/为什么|为何|原因|怎么|如何|没能|为何没有/.test(title)) {
      return `问题：日本侵华为什么没能三个月灭亡中国？
回答：因为国民政府一直不投降。
分析：该回答只提及国民政府不投降这一表面原因，遗漏了中国共产党在敌后战场的作用、全民族统一战线的形成、中国地大物博带来的战略纵深、国际反法西斯援助等更关键因素。errorTypes 应包含 "argumentIncomplete"。`;
    }

    // 评价类问题示例
    if (/如何评价|怎么看|有哪些/.test(title)) {
      return `问题：如何评价某历史事件的影响？
回答：该事件加速了社会变革。
分析：回答过于笼统，遗漏了事件的政治、经济、文化等多维度影响，也未区分短期与长期影响。errorTypes 可包含 "argumentIncomplete"。`;
    }

    // 其他类型问题不注入示例，避免无关干扰
    return '';
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Prompts;
}
