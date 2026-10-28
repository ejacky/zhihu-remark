/**
 * 生成盲评页（工具，不是测试）
 *
 * 用途：把一轮对照的输出做成"随机左右、隐藏版本名"的 A/B 题，人只答左/右/平。
 * 为什么必须盲评：跨轮次打 1~5 分不可比（同一篇给过 4.5、给过 1），
 * 而"这两条哪条更好"稳定得多；且代理/作者知道哪条是自己改的，会带偏见。
 *
 * 用法：
 *   node tests/prompt/blind-sheet.mjs --run dist/b0/out/20261028-1152-v7拆段 --a v6 --b v7
 *   → 生成 <run>/blind.md，填完把答案贴回来即可
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const run = arg('run', '');
const A = arg('a', '');
const B = arg('b', '');
const SAMPLES = Math.max(1, Number(arg('samples', '1')) || 1);
if (!run || !A || !B) {
  console.error('用法：node tests/prompt/blind-sheet.mjs --run <输出目录> --a <变体前缀> --b <变体前缀> [--samples 1|2]');
  process.exit(1);
}

/** 读一个 md：去掉标题行与 ">" 元信息行，返回正文 */
const bodyOf = (text) => text
  .split(/\r?\n/)
  .filter(l => !l.startsWith('#') && !l.startsWith('>'))
  .join('\n')
  .trim();

/** 文件名形如 "<文章>--<变体>#<第几次>.md" */
const parse = (file) => {
  const [article, rest = ''] = file.replace(/\.md$/, '').split('--');
  const sample = (rest.match(/#(\d+)/) || [, '1'])[1];
  const variant = rest.split('#')[0];
  return { article, sample, variant };
};

const files = await readdir(run);
const byKey = (files ?? [])
  .filter(f => f.endsWith('.md') && f !== 'blind.md')
  .map(f => ({ file: f, ...parse(f) }));

const pairs = [];
const articles = [...new Set(byKey.map(x => x.article))];
for (const article of articles) {
  for (let s = 1; s <= SAMPLES; s++) {
    const a = byKey.find(x => x.article === article && x.sample === String(s) && x.variant.startsWith(A));
    const b = byKey.find(x => x.article === article && x.sample === String(s) && x.variant.startsWith(B));
    if (a && b) pairs.push({ article, sample: s, a: a.file, b: b.file });
  }
}

if (!pairs.length) {
  console.error(`没找到可配对的文件：A=${A} B=${B}（目录里有没有带 #1 的样本？）`);
  process.exit(1);
}

const lines = [
  '# 盲评页',
  '',
  '> 每道题两条回答，顺序已随机。**每题只回答一个问题**：哪条更可能让一个中立读者点头，',
  '> 且不觉得被冒犯？填 `A` / `B` / `平`。不要分析，凭第一反应。',
  ''
];

let i = 0;
for (const p of pairs) {
  i++;
  const [ta, tb] = await Promise.all([
    readFile(path.join(run, p.a), 'utf8'),
    readFile(path.join(run, p.b), 'utf8')
  ]);
  const left = Math.random() < 0.5;
  const L = bodyOf(left ? ta : tb);
  const R = bodyOf(left ? tb : ta);

  lines.push(`## 第 ${i} 题（${p.article}）`, '');
  lines.push(`**左**（${L.replace(/\s/g, '').length} 字）`, '', L, '');
  lines.push(`**右**（${R.replace(/\s/g, '').length} 字）`, '', R, '');
  lines.push('选择：____', '', '---', '');
}

lines.push('', '> 填完把这份文件贴回来。左右对应的真实版本不必猜，脚本会按顺序还原。');

const out = path.join(run, 'blind.md');
await writeFile(out, lines.join('\n'), 'utf8');
console.log(`生成 ${out}（${pairs.length} 题，A=${A} B=${B}）`);
console.log('注意：左右顺序是随机的，同一道题别回头看原始文件名。');
