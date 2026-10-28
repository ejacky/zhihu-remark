/**
 * Prompt 回归网：node --test tests/prompt/
 *
 * 三条护栏，对应三次真实翻车：
 *   1. 输出结构与禁句（L0 判据本身要准，否则评分器会漂）
 *   2. Prompt 的约束密度（第 4 轮：加了 12 条禁令 → 输出有气无力，指标却全合规）
 *   3. Prompt 的关键指令不能丢（第 5 轮：删掉"并段"→ 30 字原文出 4 段）
 *
 * 不需要 API Key、不联网、不加载扩展。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { evaluate, paragraphCap, countConstraints, PROMPT_LIMITS } from './rules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '../..');

// 用真实模块取 prompt，避免测试里维护第二份副本
globalThis.CONSTANTS = require('../../src/shared/constants.js');
const Prompts = require('../../src/shared/prompts.js');
const SYSTEM_PROMPT = Prompts.getSystemPrompt('gentle', {});

const read = f => readFile(path.join(__dirname, f), 'utf8');

test('L0：合格样本零违规（2 段 / 短原文）', async () => {
  const r = evaluate(await read('fixtures/good-2para.txt'), { articleChars: 131 });
  assert.equal(r.paras, 2, '应为 2 段');
  assert.deepEqual(r.violations, [], `不应有违规，实际：${r.violations.join(',')}`);
  assert.ok(r.proper >= 1, '应至少有一个具体名词');
});

test('L0：坏样本逐条命中（判卷开场 / 教训收尾 / 黑话 / 你说的过多 / 段数超限）', async () => {
  const r = evaluate(await read('fixtures/bad-4para.txt'), { articleChars: 131 });
  for (const v of ['opener-banned', 'closer-banned', 'jargon', 'you-shuo-too-many', 'too-many-paras']) {
    assert.ok(r.violations.includes(v), `应命中 ${v}，实际：${r.violations.join(',')}`);
  }
});

test('L0：空内容单独报 empty，不误判成其它违规', () => {
  const r = evaluate('   \n\n ', { articleChars: 100 });
  assert.deepEqual(r.violations, ['empty']);
});

test('段数上限随原文长度变化：短 2 / 中 3 / 长 4', () => {
  assert.equal(paragraphCap(131), 2);
  assert.equal(paragraphCap(593), 3);
  assert.equal(paragraphCap(6100), 4);
});

test('Prompt 护栏：约束密度不超过上限（防"加禁令治反感"复发）', () => {
  const n = countConstraints(SYSTEM_PROMPT);
  assert.ok(
    n <= PROMPT_LIMITS.maxConstraints,
    `约束词 ${n} 处，超过上限 ${PROMPT_LIMITS.maxConstraints}。加禁令通常让输出更保守，先改单个句式。`
  );
  assert.ok(
    SYSTEM_PROMPT.length <= PROMPT_LIMITS.maxChars,
    `Prompt ${SYSTEM_PROMPT.length} 字符，超过 ${PROMPT_LIMITS.maxChars}`
  );
});

test('Prompt 护栏：不出现被否掉的绝对模板「2~4 段」', () => {
  assert.ok(!/2\s*[~～-]\s*4\s*段/.test(SYSTEM_PROMPT), '「2~4 段」是已废弃的硬编码模板');
});

test('Prompt 护栏：保留长度闸门「并段」与「跟原文分了几段无关」', () => {
  // 第 5 轮教训：删掉"并段"后，模型改成一段一个点，30 字原文出了 4 段
  assert.ok(SYSTEM_PROMPT.includes('并在一段'), '缺「一段里能说清两个点就并在一段」');
  assert.ok(SYSTEM_PROMPT.includes('跟原文分了几段无关'), '缺「与原文段落数无关」的阻断');
});

test('Prompt 护栏：三条判据齐全', () => {
  for (const k of ['主语检验', '专名锚定', '点破跳点']) {
    assert.ok(SYSTEM_PROMPT.includes(k), `缺判据：${k}`);
  }
});

test('golden 集：覆盖短/中/长，且有且仅有 1 篇 holdout', async () => {
  const files = (await readdir(path.join(__dirname, 'golden'))).filter(f => f.endsWith('.txt'));
  assert.ok(files.length >= 5, `golden 至少 5 篇，实际 ${files.length}`);
  assert.ok(files.some(f => f.includes('短')), '缺短原文');
  assert.ok(files.some(f => f.includes('中')), '缺中等原文');
  assert.ok(files.some(f => f.includes('长')), '缺长原文');
  assert.equal(files.filter(f => f.includes('HOLDOUT')).length, 1, 'holdout 必须恰好 1 篇');
});

test('golden 集：每篇都有标题行且正文够长', async () => {
  const files = (await readdir(path.join(__dirname, 'golden'))).filter(f => f.endsWith('.txt'));
  for (const f of files) {
    const body = await readFile(path.join(__dirname, 'golden', f), 'utf8');
    assert.ok(body.startsWith('# '), `${f} 首行应为「# 标题」`);
    assert.ok(body.length > 80, `${f} 正文过短（${body.length} 字符），不像真实回答`);
  }
});

test('仓库里不应出现 .env 或密钥文件', async () => {
  const susp = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'dist'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/^\.env($|\.)/.test(e.name)) susp.push(path.relative(ROOT, p));
    }
  };
  await walk(ROOT);
  assert.deepEqual(susp, [], `仓库里出现了 .env：${susp.join(', ')}`);
});
