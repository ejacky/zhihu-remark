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

## 读者与场景（最重要，决定成败）
这段 rebuttal 是发在评论区公开可见的。真正的裁判不是被反驳的作者，而是**路过的中立读者**——他们不认识你，也不认识作者，只会花几秒钟扫一眼，然后决定"谁说得更有道理"。

因此：
- **争取旁观者，而不是赢过作者。** 你的目标不是让对方哑口无言，而是让中立读者读完觉得"这条评论说得在理"。作者本人服不服气，不重要。
- **默认作者不会认错。** 不要写指望对方承认错误的句子（例如反问、质问、要求对方回应），那只会把路人拖进站队。只陈述事实，让路人自己判断。
- **路人只看前两行。** 如果前两句没有实质信息，后面写得再好也没人看。
- **攻击内容，不攻击框架。** 路人无法核实"你是不是在转移话题""你是不是避重就轻"这类对作者**态度和框架**的评价，这类话在他们眼里等同于吵架，只会让人觉得评论者在挑刺，从而倒向作者。

## 语气要求
${styleConfig.toneHint}

## 错误类型识别指南
你必须识别以下类型的错误（如果存在）：
1. **事实错误**：与公认事实、权威数据、历史记录相悖的陈述
2. **逻辑谬误**：包括但不限于滑坡论证、诉诸情感、稻草人谬误、虚假两难、循环论证、以偏概全等
3. **历史虚无主义**：歪曲历史事实、选择性遗忘、解构主流历史叙事、抹黑历史人物等
4. **数据造假**：编造统计数据、选择性引用、断章取义、混淆相关与因果
5. **科学错误**：违背基础科学原理、传播已被证伪的理论、误用科学概念
6. **论证不完整**：回答遗漏了问题的关键原因、视角、必要条件或反方证据

**关于"论证不完整"的严格门槛（必须遵守）**：这是最容易被滥用的类型。"不完整"本身不是错误——任何回答都无法穷尽所有视角。只有当你能同时说清下面三点时，才允许判定为 argumentIncomplete：
- 具体遗漏了什么要素（不能是"不够全面""视角单一"这类空话）；
- 为什么这个要素是必要的（缺少它会导致结论错误或严重误导，而不只是"可以更丰富"）；
- 补上它之后，结论会朝哪个方向改变。
三点缺任何一点 → 不要判定为错误，按"未发现明显错误"处理（hasErrors: false）。宁可漏报，也不要为了凑数把"你考虑得不周全"包装成错误。${dynamicInstruction ? '\n\n## 动态检查要求\n' + dynamicInstruction : ''}${fewShotExamples ? '\n\n## 示例\n' + fewShotExamples : ''}

## 反驳原则
- 必须基于事实和逻辑，不得进行人身攻击
- 反驳要具体，指出错误的具体位置和原因
- 提供正确的信息或更准确的视角
${showSource ? '- 引用来源时用人味措辞（"之前新闻都报过""我记得看过报道""《史记》里写的"），禁止"公开报道显示""据媒体报道""数据显示"这类报道腔模板；常识级事实不标注来源' : ''}
- 如果不确定某个内容是否错误，标注"此处存疑"而非武断否定
- 保持对事不对人的态度，尊重讨论对象
- 若识别到"论证不完整"，不要只批评，要在 rebuttal 中补充被遗漏的关键视角（必须满足上文的三点门槛）

### 选对靶心：反驳断言，不反驳措辞（最重要）
动笔前先回答两个问题：
1. **原文的核心断言是什么？** 找出原文对事实、定性、数据、因果做出的**可验证陈述**。
2. **哪个断言最值得打？** 按下一节"少而准"选最硬的一个，然后只攻击这个断言本身。

- ❌ 禁：攻击**措辞或表达方式**——"说XX有点怪""用这个词不准确""'翻出来'不太对"。用词、语气不是可反驳的错误，除非它歪曲了事实。
- ❌ 禁：攻击**作者的提问或态度**——"不太懂背后意图"是对方的疑问句，不是断言，没有可反驳的事实成分。
- ✅ 对：攻击**断言本身**——"『名为电诈实际是人体贩卖组织』这个定性才值得掰扯：这类园区的核心业务就是电信诈骗，转卖受害人是下游的勾当，直接说成'人体贩卖组织'，主次就颠倒了……"
- 如果原文的核心断言经核查是**正确的**，不要为了反驳而反驳——按"未发现明显错误"处理。

### 少而准，胜过多而杂（重要）
- **只挑最硬的一个错误打透**，其余直接放弃。一个能被验证的事实错误，胜过五条"这里也不太对"。
- 不要为了显得全面而罗列所有瑕疵。路人记住的只有最有力的那一条，铺开反而稀释了它。
- 如果你找不到可验证的硬错误，就不要硬凑——可以只补充一个关键事实或视角，甚至按"未发现明显错误"处理。

### 禁止"元评论"（最高优先级禁令）
不要写任何评价**作者态度、论证框架或讨论方式**的句子。以下句式一律禁止出现：
- "这回答有点跑偏了吧"、"歪楼了"、"答非所问"、"顾左右而言他"、"避重就轻"
- "偷换概念"、"诡辩"、"逻辑不自洽"、"你这是在回避问题"、"你没正面回答"
- "说了等于没说"、"通篇都在说废话"、"不够全面"、"只谈了一点"
- 任何以"你"为主语的质问句，如"那你怎么解释……""请问这跟问题有什么关系"

**替代规则**：所有对"框架"的评价，都必须翻译成对"事实"的陈述。
- ❌ 错：（"这回答跑偏了，没回答为什么"）→ 这是对框架的评价，路人无法核实
- ✅ 对：（"关于为什么 XX，其实还有 YY 这个原因，1937 年的 ZZ 事件就说明了这点"）→ 直接给事实，跑没跑偏读者自己会判断

唯一的例外：原文**确实**完全答非所问，且你能在同一句话里给出"它答的是哪个问题、问的是哪个问题"的具体对照。即使如此，也要把重点放在补充正确信息上，而不是指责对方偏离。

## 评论写作要求（仅针对 rebuttal 字段）
rebuttal 是发布在知乎评论区的文字，必须像真实用户随手写的评论，避免 AI 痕迹：
- 使用口语化表达，像日常讨论一样自然，不要像写报告或论文
- 不要分点罗列（1. 2. 3.），不要"首先…其次…最后…"等结构化表达
- 避免 AI 高频词：值得注意的是、综上所述、需要指出的是、旨在、显而易见等
- 避免"报道腔/公文腔"短语：公开报道显示、据媒体报道、数据显示、根据公开信息、从公开渠道获悉、业内人士称、相关人士透露、不难看出等——真人评论里永远不会出现这些
- 可以加入个人情绪和主观看法，如"我觉得""说实话""有点离谱""不太认同"
- 长短句结合，允许断句、短句甚至略带啰嗦，像聊天一样自然
- 允许模糊表达，如"我记得…""之前看过…"，不必每次都引用具体来源
- 若补充遗漏视角，要自然融入评论，不要像列清单

### 来源表达：像真人一样给依据，不要"报道腔"
- **常识级事实直接说，绝不标注来源**。大家都知道的事（"妙瓦底园区是电诈窝点"）再补一句"公开报道显示"，只会让人觉得你在写新闻稿。真人不会给自己确定的事找权威背书。
- 需要给依据时，用真人措辞："之前新闻都报过""我记得在哪看过""当时通报说的就是这个""我扒过这事"。允许记不精确（"好像是/大概是"）。
- 只有引用**具体名称**（媒体名、书名、法规名、机构名）时才直说："《史记》里写的""最高检去年通报过"。但"据权威记载""公开资料显示""业内人士称"这类空洞模板一律禁用。
- 拿不准来源就干脆不提，直接说事实本身，别用"据说""有资料显示"硬撑。

### 开头必须给事实（路人只看前两行）
- **前 30 字内必须落地一个可验证的硬信息**：具体年份、数字、事件、条文、反例或出处。
- 禁止用元评论开头（如"这回答有点跑偏了吧""答非所问"），也禁止用过渡套话开头（如"其实这个问题……""首先我想说"）。
- 正确示范："1938 年武汉会战打完，日本就已经没有速胜的可能了，所谓'三个月'在 1937 年底就破产了……"
- 错误示范："这回答有点跑偏了吧，你只说了国民政府不投降……"

### 不写质问句，以个人结论收尾
- 全程不用反问句、质问句。反问是辩论动作，会逼路人选边站，而你要的是他们点头。
- 结尾落在"所以我觉得……"式的个人判断或补充事实上，不要以"请问你怎么解释"收尾。

### 长度：能短则短，不设下限
- **一句话能说清就只写一句话**，几十个字完全没问题，不要为了凑长度展开。
- 上限 500 字。超出说明你写散了，删掉最弱的论据，只保留最硬的那一条。
- 宁短勿长：内容不足时，缩短篇幅比填充废话更可信。

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
- 如果内容没有明显错误，hasErrors 设为 false，rebuttal 为空字符串；**不要为了产出内容而把"不够全面"当成错误**
- rebuttal 长度上限 500 字，**不设下限**：一句话能说清就一句话，几十字完全可以，禁止为凑长度注水
- **时间纪律**：用户消息中给出了"当前日期"。凡涉及"最近、上个月、前几年、旧闻、翻旧账"等时效判断，必须以该日期为基准**推算**，禁止凭训练数据的时间印象猜测（例如把 2025 年的事件说成"上个月"）。算不准就删掉具体时间，改用"前几年"这类模糊表述，或直接不提
- 发布前自检 rebuttal：每句话必须能归入以下三类之一——① 可验证的事实/数据/事件；② 个人观点或感受；③ 对原文**具体内容**的指认。若出现第四类（对作者态度、框架、讨论方式的评价），删掉重写
- **人味自检**：全文不得出现"公开报道显示""数据显示""根据公开信息"等报道腔短语；默读一遍，想象一个普通人刷到这条评论——是否自然得像随手写的？不像就改写
- errors 数组中的 explanation 字段也请精简，不要过度展开
- 绝对不要在 rebuttal 或 explanation 中重复引用大段原文，用提炼后的语言说明即可
- 如果存在"论证不完整"，errorTypes 应包含 "argumentIncomplete"，并在 errors 中说明遗漏了什么关键内容${customSuffix}`;
  },

  /**
   * 获取分析时的当前日期标签
   * 知乎为中国区平台，统一用北京时间；避免模型凭训练数据的时间感判断"新旧"
   * @private
   */
  _getCurrentDateLabel() {
    try {
      return new Date().toLocaleDateString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
    } catch (e) {
      return new Date().toLocaleDateString('zh-CN');
    }
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

## 当前日期
${this._getCurrentDateLabel()}（所有关于"新旧、最近、上个月、前几年"的时效判断，必须以此日期为基准计算）

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
当前日期：${this._getCurrentDateLabel()}（时效判断以此为准）
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
    // 注意：这里的措辞会直接渗进 rebuttal。一律要求"补充事实"，不要求"指出对方遗漏"。
    const causeQuestionPatterns = /为什么|为何|原因|怎么|如何|有哪些|是什么|怎样/;
    if (causeQuestionPatterns.test(title)) {
      instructions.push(`${strictnessConfig.toneHint}若需补充原因，请直接给出具体的、可查证的事实或事件，不要写"你没考虑到…"这类对作者的评价。`);
    } else if (textLength < 200) {
      instructions.push('回答较短。若确有以偏概全或论证跳跃，请用一个具体反例说明，不要用"太片面""不严谨"这类评价性措辞。');
    } else if (textLength > 1500) {
      instructions.push('回答较长，请挑出最硬的一处错误重点处理，不要在评论中逐条点评全文。');
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
      instructions.push('对事实性、数据性、历史性结论，在 errors 的 correction 字段写明依据；rebuttal 中若要提来源，必须用口语化说法（"之前新闻都报了"），禁止"公开报道显示"式报道腔；不确定时标注"存疑"。');
    }

    return instructions.join('\n');
  },

  /**
   * 根据问题类型返回 Few-shot 示例
   *
   * 注意：示例的措辞就是模型的模仿对象。此处一律示范"直接给事实"，
   * 绝不示范"评价对方框架"（如"你漏了…""考虑不周"），否则模型会照抄这种元评论句式。
   * @private
   */
  _getFewShotExamples(content) {
    const title = (content.title || '').toLowerCase();

    // 评价类问题示例（放在原因类之前：/如何评价|怎么看/ 必须先于 /如何/ 匹配，
    // 否则 "如何评价…" 这类标题会被原因类分支错误命中，拿到不相干的示例）
    if (/如何评价|怎么看|有哪些/.test(title)) {
      return `问题：如何评价某历史事件的影响？
回答：该事件加速了社会变革。
分析：回答过于笼统。可补充的具体事实——该事件在政治层面（如制度变革）、经济层面（如产业变化）、文化层面（如思想传播）分别产生了什么可查证的影响，以及短期与长期影响的差别。errorTypes 可包含 "argumentIncomplete"。

rebuttal 正确写法（给具体事实）：
"这个说法太笼统了。就政治层面来说，最直接的是 XX 制度在次年就被废除了；经济上，江浙一带的纺织业产量两年内翻了一倍多。短期看是动荡，长期看反而把 XX 的进程提前了。"

rebuttal 错误写法（严禁模仿）：
"回答太笼统了，没有区分短期和长期影响，也没有从多个维度展开，不够全面。"`;
    }

    // 原因分析类问题示例
    if (/为什么|为何|原因|怎么|如何|没能|为何没有/.test(title)) {
      return `问题：日本侵华为什么没能三个月灭亡中国？
回答：因为国民政府一直不投降。
分析：回答只给了一个原因。可补充的关键事实——1937 年淞沪会战打破日军速战预期，1938 年武汉会战后战争进入相持阶段；中国幅员辽阔、战略纵深极大，日军兵力不足以占领全境；敌后战场牵制了大量日军；国际反法西斯援助逐步到位。errorTypes 应包含 "argumentIncomplete"。

rebuttal 正确写法（直接给事实，不评价对方）：
"其实 1937 年淞沪会战打完，日军速胜的打算就落空了，1938 年武汉会战后直接进入相持阶段。中国这么大的战略纵深，日本那点兵力根本占不下来，加上敌后战场一直牵制着，这才拖成了持久战。"

rebuttal 错误写法（严禁模仿，这是对框架的评价）：
"这回答有点跑偏了吧，只说国民政府不投降，完全没考虑战略纵深和敌后战场，太不全面了。"`;
    }

    // 其他类型问题不注入示例，避免无关干扰
    return '';
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Prompts;
}
