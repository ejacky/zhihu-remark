/**
 * 知乎反驳助手 - AI Prompt 模板
 */

const Prompts = {
  /**
   * 获取系统提示词
   */
  getSystemPrompt(style = 'gentle', config = {}) {
    const styleConfig = CONSTANTS.REBUTTAL_STYLES[style] || CONSTANTS.REBUTTAL_STYLES.gentle;
    const showSource = config.features?.showSource !== false;

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

## 反驳原则
- 必须基于事实和逻辑，不得进行人身攻击
- 反驳要具体，指出错误的具体位置和原因
- 提供正确的信息或更准确的视角
${showSource ? '- 尽可能引用权威来源（如"根据《史记》记载"、"国家统计局数据显示"等）' : ''}
- 如果不确定某个内容是否错误，标注"此处存疑"而非武断否定
- 保持对事不对人的态度，尊重讨论对象

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
- 绝对不要在 rebuttal 或 explanation 中重复引用大段原文，用提炼后的语言说明即可`;
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
- 链接：${url || '当前页面'}
${errorTypeHint}

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
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Prompts;
}
