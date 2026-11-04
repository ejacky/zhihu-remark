/**
 * 设置页模型目录：端点、鉴权头与响应解析的纯函数测试
 *
 * 不联网、不加载扩展：node tests/options/models.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

globalThis.CONSTANTS = require('../../src/shared/constants.js');
const ModelCatalog = require('../../src/options/models.js');

test('OpenCode Go 使用公开的 Go models 端点', () => {
  assert.equal(
    ModelCatalog.endpointFor('opencode-go'),
    'https://opencode.ai/inference/go/v1/models'
  );
});

test('OpenCode Go + 自定义代理：走代理的 {base}/models，不落到 opencode.ai', () => {
  assert.equal(
    ModelCatalog.endpointFor('opencode-go', 'https://proxy.example.com/v1'),
    'https://proxy.example.com/v1/models'
  );
  assert.equal(
    ModelCatalog.endpointFor('opencode-go', 'https://my-mirror.example.com/inference/go/openai/v1'),
    'https://my-mirror.example.com/inference/go/openai/v1/models'
  );
  // 代理场景必须用用户自己的 Key，且 Key 只发给代理
  assert.deepEqual(
    ModelCatalog.headersFor('opencode-go', 'sk-secret', 'https://proxy.example.com/v1'),
    { Authorization: 'Bearer sk-secret' }
  );
  // 内置地址仍然免鉴权
  assert.deepEqual(ModelCatalog.headersFor('opencode-go', 'sk-secret', ''), {});
});

test('OpenCode 网关保留端口，不写死 443', () => {
  assert.equal(
    ModelCatalog.endpointFor('opencode-go', 'https://opencode.ai:8443/inference/go/openai/v1'),
    'https://opencode.ai:8443/inference/go/v1/models'
  );
});

test('自定义地址指向 OpenCode 时按 Go / Console 分开', () => {
  assert.equal(
    ModelCatalog.endpointFor('custom', 'https://opencode.ai/inference/go/openai/v1'),
    'https://opencode.ai/inference/go/v1/models'
  );
  assert.equal(
    ModelCatalog.endpointFor('custom', 'https://opencode.ai/inference/openai/v1'),
    'https://opencode.ai/inference/v1/models'
  );
  assert.equal(
    ModelCatalog.endpointFor('custom', 'https://opencode.ai/zen/v1'),
    'https://opencode.ai/inference/v1/models'
  );
});

test('其余提供商走 {base}/models，Claude 带 limit 参数', () => {
  assert.equal(ModelCatalog.endpointFor('openai'), 'https://api.openai.com/v1/models');
  assert.equal(ModelCatalog.endpointFor('anthropic'), 'https://api.anthropic.com/v1/models?limit=1000');
  assert.equal(
    ModelCatalog.endpointFor('custom', 'https://api.example.com/v1'),
    'https://api.example.com/v1/models'
  );
  assert.equal(ModelCatalog.endpointFor('custom', ''), null);
});

test('OpenCode 不带鉴权；Claude 用 x-api-key；其余用 Bearer', () => {
  assert.deepEqual(ModelCatalog.headersFor('opencode-go', 'sk-x', ''), {});
  assert.deepEqual(
    ModelCatalog.headersFor('custom', 'sk-x', 'https://opencode.ai/inference/openai/v1'),
    {}
  );
  assert.deepEqual(ModelCatalog.headersFor('anthropic', 'sk-a', ''), {
    'x-api-key': 'sk-a',
    'anthropic-version': '2023-06-01'
  });
  assert.deepEqual(ModelCatalog.headersFor('openai', 'sk-o', ''), {
    Authorization: 'Bearer sk-o'
  });
  assert.deepEqual(ModelCatalog.headersFor('openai', '', ''), {});
});

test('是否需要 Key：OpenCode 公开端点不需要，代理和其他提供商需要', () => {
  assert.equal(ModelCatalog.needsApiKey('opencode-go', ''), false);
  assert.equal(ModelCatalog.needsApiKey('opencode-go', 'https://proxy.example.com/v1'), true);
  assert.equal(ModelCatalog.needsApiKey('openai', ''), true);
  assert.equal(
    ModelCatalog.needsApiKey('custom', 'https://opencode.ai/inference/openai/v1'),
    false
  );
});

test('parse 兼容 data / 数组 / models，并按 id 去重', () => {
  assert.deepEqual(
    ModelCatalog.parse({
      data: [
        { id: 'a', name: 'A' },
        { id: 'a', name: 'A duplicate' },
        { id: 'b', display_name: 'B' },
        'c',
        null,
        { id: '' }
      ]
    }),
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'c' }
    ]
  );

  assert.deepEqual(ModelCatalog.parse(['x']), [{ id: 'x', name: 'x' }]);
  assert.deepEqual(ModelCatalog.parse({ models: [{ id: 'm' }] }), [{ id: 'm', name: 'm' }]);
});

test('parse 拒绝无效结构，但接受空列表', () => {
  assert.throws(() => ModelCatalog.parse(null), /不是有效的模型列表/);
  assert.throws(() => ModelCatalog.parse({ data: {} }), /不是有效的模型列表/);
  assert.deepEqual(ModelCatalog.parse({ data: [] }), []);
});

test('parse 最多保留 500 个模型', () => {
  const many = Array.from({ length: 600 }, (_, i) => ({ id: `m${i}` }));
  assert.equal(ModelCatalog.parse(many).length, ModelCatalog.MAX_MODELS);
});

test('常量只保留 OpenCode Go 的离线快照，其余提供商不再写死列表', () => {
  const defaults = CONSTANTS.PROVIDER_DEFAULTS;

  for (const provider of ['openai', 'anthropic', 'deepseek', 'kimi']) {
    assert.deepEqual(defaults[provider].models, [], `${provider} 不应再写死模型列表`);
  }

  assert.ok(defaults['opencode-go'].models.includes('deepseek-v4.1-flash'));
  assert.ok(defaults['opencode-go'].models.length >= 20);
  assert.equal(ModelCatalog.CACHE_KEY, CONSTANTS.STORAGE_KEYS.MODEL_CATALOG);
  assert.equal(ModelCatalog.CACHE_KEY, 'zhihu_remark_model_catalog');
});

test('HTTP 失败映射成可操作中文，且不拼接请求头', () => {
  assert.match(ModelCatalog._httpError(401, null), /API Key 无效/);
  assert.match(ModelCatalog._httpError(403, null), /没有读取模型的权限/);
  assert.match(ModelCatalog._httpError(404, null), /没有模型列表端点/);
  assert.match(ModelCatalog._httpError(429, null), /请求太频繁/);
  assert.match(ModelCatalog._httpError(503, null), /暂时不可用/);
  assert.doesNotMatch(ModelCatalog._httpError(401, { message: 'sk-secret' }), /sk-secret/);
});

test('缓存按 provider 读写，读不到时回退空对象', async () => {
  let store = {};

  globalThis.chrome = {
    storage: {
      local: {
        get: async key => ({ [key]: store[key] }),
        set: async value => { store = { ...store, ...value }; }
      }
    }
  };

  try {
    assert.deepEqual(await ModelCatalog.readCache(), {});

    const catalog = {
      'opencode-go': {
        models: [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }],
        fetchedAt: 1730600000000
      }
    };

    await ModelCatalog.writeCache(catalog);
    assert.deepEqual(await ModelCatalog.readCache(), catalog);
    assert.ok(!JSON.stringify(store).includes('sk-'));
  } finally {
    delete globalThis.chrome;
  }
});
