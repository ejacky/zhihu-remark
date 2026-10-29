/**
 * 文档完整性：源码头部的 @doc 指向必须真实存在且能找到对应标题。
 *
 * 为什么要测：无模块系统、靠加载顺序共享的仓库里，文档是唯一的导航。
 * 章节改名或删文档后 @doc 会静默失效（点过去是 404），没有任何编译期检查能发现。
 *
 * 纯函数、零依赖、不联网：node tests/docs.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** GitHub 风格的标题锚点：小写、去标点、空格转连字符，中文保留 */
const slug = h => h.toLowerCase()
  .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-');

const headingsOf = (file) => {
  const set = new Set();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) set.add(slug(m[1]));
  }
  return set;
};

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) {
    return ['node_modules', '.git', 'dist', '.kimi'].includes(e.name) ? [] : walk(p);
  }
  return e.name.endsWith('.js') ? [p] : [];
});

const DOCS_CACHE = new Map();
const headingsCached = (doc) => {
  if (!DOCS_CACHE.has(doc)) DOCS_CACHE.set(doc, headingsOf(doc));
  return DOCS_CACHE.get(doc);
};

test('所有 @doc 指向的文档都存在', () => {
  const missing = [];
  for (const file of walk(path.join(ROOT, 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/@doc\s+(docs\/[^#\s]+)/g)) {
      if (!existsSync(path.join(ROOT, m[1]))) missing.push(`${path.relative(ROOT, file)} → ${m[1]}`);
    }
  }
  assert.deepEqual(missing, [], `文档不存在：\n${missing.join('\n')}`);
});

test('所有 @doc 锚点都能命中文档里的标题', () => {
  const broken = [];
  for (const file of walk(path.join(ROOT, 'src'))) {
    const txt = readFileSync(file, 'utf8');
    for (const m of txt.matchAll(/@doc\s+(docs\/[^#\s]+)#(\S+)/g)) {
      const [, doc, anchor] = m;
      const abs = path.join(ROOT, doc);
      if (!existsSync(abs)) continue; // 上一条测试负责
      if (!headingsCached(abs).has(anchor)) {
        broken.push(`${path.relative(ROOT, file)} → ${doc}#${anchor}`);
      }
    }
  }
  assert.deepEqual(broken, [], `锚点失效（章节改名或删除？）：\n${broken.join('\n')}`);
});

test('文档目录只剩五份，且都不为空', () => {
  const files = readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md'));
  assert.deepEqual(
    files.sort(),
    ['PROMPT_DESIGN.md', 'ROADMAP.md', 'STORE.md', 'TECH_DESIGN.md', 'USER_GUIDE.md'],
    '新增或删除文档时，同步更新 AGENTS.md 的文档索引与本条断言'
  );
  for (const f of files) {
    assert.ok(statSync(path.join(ROOT, 'docs', f)).size > 500, `${f} 内容过少`);
  }
});
