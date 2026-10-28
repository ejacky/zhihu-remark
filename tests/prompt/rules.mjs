/**
 * 知乎反驳助手 - Prompt 输出的 L0 判据
 *
 * 用途：把「什么样的生成结果算不合格」写成可执行断言，替代"跑完再靠肉眼掂量"。
 * 约束：纯函数、零依赖、零网络、不读文件、不碰 chrome —— 因此可以被 `node --test` 直接跑。
 *
 * 分工（重要）：
 *   L0（本文件）只负责 **淘汰**：结构、禁句、黑话、专名密度这类可计算的东西。
 *   L1 由人做配对盲评，负责 **择优**：判卷感、有气无力、说服力，指标测不出来。
 *   千万不要用 L0 选出"更好的"那版 —— 2026-10-27 那次评审改版指标全合规，读起来像免责声明。
 *
 * @doc docs/PROMPT_DESIGN.md
 */

/** 段数上限：跟着原文长度走（原文字数 → 允许的最大段数） */
export function paragraphCap(articleChars) {
  if (!Number.isFinite(articleChars) || articleChars <= 0) return 4;
  if (articleChars <= 200) return 2;
  if (articleChars <= 1000) return 3;
  return 4;
}

/** 段落切分：空行分段，过滤空段 */
export function splitParagraphs(text) {
  return String(text || '')
    .split(/\r?\n\s*\r?\n/)
    .map(p => p.trim())
    .filter(Boolean);
}

/** 中文字数（不含标点、空白） */
export function countChars(text) {
  return (String(text || '').match(/[\u4e00-\u9fa5]/g) || []).length;
}

/** 具体名词：书名号、引号术语、四位年份、数字+量词 */
export function properNouns(text) {
  const re = /《[^》]{1,30}》|「[^」]{1,20}」|“[^”]{2,24}”|\d{3,4}\s*年|\d+(?:\.\d+)?\s*(?:万|亿|人|年|件|次|个|米|公斤|吨)/g;
  return Array.from(new Set((String(text || '').match(re) || []).map(s => s.trim())));
}

/** 跳点标记（模型是否真的点破了推理断点） */
export function jumpMarkers(text) {
  const re = /个案|个例|孤例|幸存者|以偏概全|反过来|方向反|只挑|样本|推不出|不等于/g;
  return (String(text || '').match(re) || []).length;
}

/** 「你说的」出现次数：连用三次读起来是逐条点名 */
export function youShuoCount(text) {
  return (String(text || '').match(/你说的/g) || []).length;
}

/** 判卷式开场：一上来给整篇下评语 */
const BANNED_OPENERS = [
  /^你(?:这|这段|这篇)(?:的)?(?:问题|毛病|说法)/,
  /^这段(?:的)?(?:问题|方法|说法)/,
  /^方法站不住/,
  /^这(?:个|种|套)(?:框架|说法|思路)解释不了/,
  /^与其说是/
];

/** 教训式收尾：把讨论变成批作业 */
const BANNED_CLOSERS = [/账要算全/, /建议你/, /这就不用我多说了/, /不用我多说/];

/** Prompt 黑话漏进正文：读者不认识这些词 */
const JARGON = [/跳点/, /逻辑谬误/];

/**
 * 对一条生成结果做 L0 评估
 *
 * @param {string} text - 生成的反驳正文
 * @param {{articleChars?: number}} [opts] - articleChars = 原文中文字数
 * @returns {{paras:number, chars:number, proper:number, jump:number, youShuo:number,
 *            opener:string, violations:string[]}}
 */
export function evaluate(text, opts = {}) {
  const body = String(text || '');
  const paras = splitParagraphs(body);
  const first = paras[0] || '';
  const last = paras[paras.length - 1] || '';
  const cap = paragraphCap(opts.articleChars ?? 0);
  const violations = [];

  if (!body.trim()) {
    return { paras: 0, chars: 0, proper: 0, jump: 0, youShuo: 0, opener: '', violations: ['empty'] };
  }

  if (BANNED_OPENERS.some(re => re.test(first))) violations.push('opener-banned');
  if (BANNED_CLOSERS.some(re => re.test(last))) violations.push('closer-banned');
  if (JARGON.some(re => re.test(body))) violations.push('jargon');

  const youShuo = youShuoCount(body);
  if (youShuo > 2) violations.push('you-shuo-too-many');

  if (paras.length > cap) violations.push('too-many-paras');

  const proper = properNouns(body).length;
  if (proper === 0) violations.push('no-anchor');

  const chars = countChars(body);
  if (opts.articleChars > 0 && opts.articleChars <= 200 && chars > 300) {
    violations.push('too-long-for-short-article');
  }

  return { paras: paras.length, chars, proper, jump: jumpMarkers(body), youShuo, opener: first.slice(0, 40), violations };
}

/** Prompt 文本层面的护栏：约束密度与长度（防止再走"加 12 条禁令"的老路） */
export const PROMPT_LIMITS = {
  maxConstraints: 42,
  maxChars: 1300
};

/** 统计约束词出现次数（不要/禁止/必须…） */
export function countConstraints(promptText) {
  const re = /不要|禁止|必须|不得|切勿|避免|严禁|不准/g;
  return (String(promptText || '').match(re) || []).length;
}
