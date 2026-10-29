/**
 * 商店文案同步：从 manifest.json 重生成 docs/STORE.md 的「自动生成区」
 *
 * 为什么需要它：版本号、权限清单在发版时会变，而商店文案里的这些值一旦手抄就会漂移
 * （v1.1.1 时 marketing 文案写着「五种错误/三种风格」，实际是 6 类/4 种，被评审记为文档漂移）。
 *
 * 用法：
 *   node scripts/sync-store.mjs            # 就地更新 docs/STORE.md
 *   node scripts/sync-store.mjs --check    # 只检查是否需要更新（退出码 1 表示过期），用于 CI
 *
 * 打 v* tag 时由 .github/workflows/store-doc.yml 自动运行并提交。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'manifest.json');
const DOC = path.join(ROOT, 'docs', 'STORE.md');

const START = '<!-- AUTO:START -->';
const END = '<!-- AUTO:END -->';

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

const code = (s) => '`' + s + '`';
const list = (arr) => (arr && arr.length ? arr.map(code).join('<br>') : '—');
const today = new Date().toISOString().slice(0, 10);

/** 自动生成区的内容：只放会随 manifest 变化的事实，不放需要人写的文案 */
function renderBlock() {
  return [
    START,
    '| 项 | 值 |',
    '|---|---|',
    `| 当前版本 | ${code(manifest.version)} |`,
    `| 扩展名称 | ${manifest.name} |`,
    `| 一句话 | ${manifest.description} |`,
    `| 声明权限 | ${list(manifest.permissions)} |`,
    `| 站点权限 | ${list(manifest.host_permissions)} |`,
    `| 可选权限 | ${list(manifest.optional_host_permissions)} |`,
    '| 远程代码 | 否 |',
    `| 同步时间 | ${today} |`,
    END
  ].join('\n');
}

const doc = readFileSync(DOC, 'utf8');
const start = doc.indexOf(START);
const end = doc.indexOf(END);

if (start < 0 || end < 0) {
  console.error(`✗ docs/STORE.md 里找不到 ${START} / ${END} 标记，无法同步`);
  process.exit(1);
}

const next = doc.slice(0, start) + renderBlock() + doc.slice(end + END.length);
const changed = next !== doc;

if (process.argv.includes('--check')) {
  if (changed) {
    console.error('✗ docs/STORE.md 的自动生成区已过期，请运行 node scripts/sync-store.mjs');
    process.exit(1);
  }
  console.log('✓ docs/STORE.md 与 manifest.json 一致');
  process.exit(0);
}

if (!changed) {
  console.log('✓ docs/STORE.md 已是最新，无需改动');
  process.exit(0);
}

writeFileSync(DOC, next, 'utf8');
console.log(`✓ 已更新 docs/STORE.md（版本 ${manifest.version}，同步时间 ${today}）`);
