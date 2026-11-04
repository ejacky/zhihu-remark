/**
 * 知乎反驳助手 - Options 页面脚本
 *
 * 只有四项主设置：API Key / 模型 / 深度思考 / 历史记录。
 * 其余（提供商、API Base URL、风格、自定义提示词后缀）收在「高级设置」里。
 *
 * 模型列表不再写死：点「同步模型」从服务商拉取，按提供商缓存在本地；
 * OpenCode Go 有公开的 /v1/models，其余提供商用自己的 Key 读账号列表。
 *
 * Base URL 对内置提供商默认隐藏，只显示内置地址；需要代理 / 镜像时勾选覆盖。
 *
 * @doc docs/TECH_DESIGN.md#44-模型列表同步
 * @doc docs/TECH_DESIGN.md#51-数据模型
 * @doc docs/USER_GUIDE.md#4-设置
 */

(async function () {
  'use strict';

  let currentConfig = {};
  let modelCatalog = {}; // { [provider]: { models: [{ id, name }], fetchedAt } }
  let syncingProvider = null;

  // ---- 加载与填充 ----
  async function loadConfig() {
    try {
      modelCatalog = await ModelCatalog.readCache();

      const response = await sendMessage({ type: 'GET_CONFIG' });
      if (response.success) {
        currentConfig = response.data;
        populateForm(currentConfig);
      }
    } catch (err) {
      console.error('加载配置失败:', err);
      showStatus('加载配置失败', true);
    }
  }

  function populateForm(config) {
    const provider = config.provider || 'deepseek';
    const radio = document.querySelector(`input[name="provider"][value="${provider}"]`);
    if (radio) radio.checked = true;

    document.getElementById('apiKey').value = config.apiKey || '';
    document.getElementById('thinking').checked = config.thinking !== false;
    document.getElementById('enableHistory').checked = config.enableHistory !== false;
    document.getElementById('style').value = config.style || 'gentle';
    document.getElementById('customPromptSuffix').value = config.customPromptSuffix || '';

    renderApiBaseField(provider, config.apiBase);
    renderModelField(provider, config.model);
    loadHistory();
  }

  /** API Base：内置提供商默认只显示内置地址，勾选覆盖后才出现输入框 */
  function renderApiBaseField(provider, currentValue) {
    const input = document.getElementById('apiBase');
    const hint = document.getElementById('apiBaseHint');
    const row = document.getElementById('builtinBaseRow');
    const valueEl = document.getElementById('builtinBaseValue');
    const override = document.getElementById('apiBaseOverride');
    const fallback = CONSTANTS.PROVIDER_DEFAULTS[provider]?.apiBase || '';
    const isCustom = provider === 'custom';
    const hasOverride = !isCustom && !!currentValue;

    row.hidden = isCustom || !fallback;
    valueEl.textContent = fallback || '(无)';
    override.checked = hasOverride;

    input.value = currentValue || '';
    input.placeholder = fallback || 'https://api.example.com/v1';
    input.hidden = isCustom ? false : !hasOverride;

    hint.classList.remove('is-error');

    if (isCustom) {
      hint.textContent = '必填，例如 https://api.example.com/v1。若该域名未授权，保存时浏览器会弹窗询问';
      return;
    }

    if (!fallback) {
      hint.textContent = '请填写该提供商的 API Base URL';
      return;
    }

    if (hasOverride) {
      hint.textContent = `当前使用自定义地址；取消勾选则恢复内置地址 ${fallback}`;
      return;
    }

    hint.textContent = provider === 'opencode-go'
      ? `默认使用内置地址 ${fallback}；需要代理 / 镜像时勾选「使用自定义地址」。首次保存会请求访问 opencode.ai 的权限`
      : `默认使用内置地址 ${fallback}；需要代理 / 镜像时勾选「使用自定义地址」`;
  }

  /** 模型名：同步 / 内置列表 + 自由输入（datalist），不限制用户输入 */
  function renderModelField(provider, currentModel) {
    const input = document.getElementById('model');
    const listEl = document.getElementById('modelOptions');
    const models = modelOptionsFor(provider);
    const cached = modelCatalog[provider];

    listEl.innerHTML = '';
    models.forEach(({ id, name }) => {
      const option = document.createElement('option');
      option.value = id;
      if (name && name !== id) option.label = name;
      listEl.appendChild(option);
    });

    input.value = currentModel || '';
    input.placeholder = models[0]?.id || defaultModelFor(provider) || '输入模型名称';

    if (cached?.fetchedAt && models.length) {
      setModelHint(`已同步 ${models.length} 个模型（${formatShortDate(cached.fetchedAt)}）`);
    } else if (models.length && provider === 'opencode-go') {
      setModelHint(`内置 ${models.length} 个 OpenCode Go 模型；点「同步模型」获取最新列表`);
    } else if (models.length) {
      setModelHint(`已加载 ${models.length} 个模型；点「同步模型」获取最新列表`);
    } else {
      setModelHint('点「同步模型」从服务商拉取列表，或直接输入模型名');
    }
  }

  function modelOptionsFor(provider) {
    const cached = modelCatalog[provider]?.models;
    const source = Array.isArray(cached) && cached.length
      ? cached
      : (CONSTANTS.PROVIDER_DEFAULTS[provider]?.models || []);

    return source.map(item => {
      if (typeof item === 'string') return { id: item, name: item };
      const id = String(item?.id || '').trim();
      return { id, name: String(item?.name || id).trim() || id };
    }).filter(item => item.id);
  }

  function defaultModelFor(provider) {
    return CONSTANTS.PROVIDER_DEFAULTS[provider]?.defaultModel || '';
  }

  function providerLabel(provider) {
    const labels = {
      openai: 'OpenAI',
      anthropic: 'Claude',
      deepseek: 'DeepSeek',
      kimi: 'Kimi',
      'opencode-go': 'OpenCode Go',
      custom: '自定义'
    };
    return labels[provider] || provider;
  }

  function collectFormData() {
    const provider = getSelectedProvider();
    const useOverride = provider === 'custom'
      || document.getElementById('apiBaseOverride').checked;

    return {
      provider,
      apiKey: document.getElementById('apiKey').value.trim(),
      apiBase: useOverride
        ? HostAccess.normalizeApiBase(document.getElementById('apiBase').value)
        : '',
      model: document.getElementById('model').value.trim(),
      thinking: document.getElementById('thinking').checked,
      enableHistory: document.getElementById('enableHistory').checked,
      style: document.getElementById('style').value,
      customPromptSuffix: document.getElementById('customPromptSuffix').value.trim()
    };
  }

  // ---- 保存 ----
  async function saveConfig() {
    const config = collectFormData();
    const provider = config.provider;
    const isCustom = provider === 'custom';
    const useOverride = isCustom || document.getElementById('apiBaseOverride').checked;
    const rawApiBase = document.getElementById('apiBase').value.trim();

    if (!config.apiKey) {
      showStatus('请填写 API Key', true);
      return;
    }
    if (!config.model) {
      showStatus('请选择或填写模型名称', true);
      return;
    }

    if (useOverride && !rawApiBase) {
      showStatus(
        isCustom
          ? '自定义 API 需要填写 API Base URL，例如 https://api.example.com/v1'
          : '已勾选「使用自定义地址」，请填写地址；或取消勾选使用内置地址',
        true
      );
      return;
    }

    // 用原始输入区分「留空」（回退内置地址）与「填了但无效」（必须报错）
    if (useOverride && rawApiBase && !config.apiBase) {
      showStatus('API Base URL 无效，请填完整地址，例如 https://api.example.com/v1（可省略 https://）', true);
      return;
    }

    // 完整端点填进 Base URL 是最常见的误用：运行时会自动拼 /chat/completions
    if (config.apiBase && /\/(chat\/completions|messages)\/?$/i.test(config.apiBase)) {
      showStatus('API Base URL 只需填到 /v1 为止，不要包含 /chat/completions 或 /messages（会自动拼接）', true);
      return;
    }

    // 从 collectFormData() 到 HostAccess.request() 之间不能有任何 await，
    // 否则丢失用户手势，Chrome 会直接拒绝权限申请。
    const effectiveApiBase = config.apiBase
      || CONSTANTS.PROVIDER_DEFAULTS[provider]?.apiBase
      || '';
    const origin = HostAccess.originOf(effectiveApiBase);

    if (!origin) {
      showStatus(
        !config.apiBase
          ? '自定义 API 需要填写 API Base URL，例如 https://api.example.com/v1'
          : '请填写有效的 API Base URL，例如 https://api.example.com/v1',
        true
      );
      return;
    }

    if (!HostAccess.isRequestable(origin)) {
      showStatus(`${origin} 无法授权：只能申请 https 地址，或 localhost / 127.0.0.1 的 http`, true);
      return;
    }

    const granted = await HostAccess.request(origin);
    if (!granted && !(await HostAccess.has(origin))) {
      showStatus(`未授权访问 ${origin}，配置未保存。请重新点保存并在弹窗里选「允许」`, true);
      return;
    }

    try {
      const response = await sendMessage({ type: 'SET_CONFIG', data: config });
      if (response.success) {
        currentConfig = response.data;
        showStatus('✅ 设置已保存');
        setTimeout(() => showStatus(''), 3000);
      } else {
        showStatus(response.error || '保存失败', true);
      }
    } catch (err) {
      showStatus('保存失败: ' + err.message, true);
    }
  }

  // ---- 同步模型 ----
  async function syncModels() {
    if (syncingProvider) return;

    const provider = getSelectedProvider();
    setSyncing(provider);

    const apiKey = document.getElementById('apiKey').value.trim();
    const isCustom = provider === 'custom';
    const useOverride = isCustom || document.getElementById('apiBaseOverride').checked;
    const apiBase = useOverride
      ? HostAccess.normalizeApiBase(document.getElementById('apiBase').value)
      : (CONSTANTS.PROVIDER_DEFAULTS[provider]?.apiBase || '');

    if (useOverride && !apiBase) {
      return syncFail(
        isCustom
          ? '先填写 API Base URL 再同步'
          : '勾选了自定义地址，但地址无效；请填写完整地址或取消勾选'
      );
    }

    if (ModelCatalog.needsApiKey(provider, apiBase) && !apiKey) {
      return syncFail('先填写 API Key 再同步（列表来自你的账号）');
    }

    const endpoint = ModelCatalog.endpointFor(provider, apiBase);
    if (!endpoint) {
      return syncFail('当前提供商没有可用的模型列表地址，请直接输入模型名');
    }

    const origin = HostAccess.originOf(endpoint);
    if (!origin || !HostAccess.isRequestable(origin)) {
      return syncFail(`无法访问 ${origin || endpoint}：只能申请 https 地址，或 localhost / 127.0.0.1 的 http`);
    }

    // 从这里到 HostAccess.request() 不能有 await：权限申请必须发生在点击手势的同步帧内
    const headers = ModelCatalog.headersFor(provider, apiKey, apiBase);
    const granted = await HostAccess.request(origin);

    if (!granted && !(await HostAccess.has(origin))) {
      return syncFail(`未授权访问 ${origin}，请重新点「同步模型」并在弹窗里选「允许」`);
    }

    if (getSelectedProvider() !== provider) {
      setSyncing(null);
      return;
    }

    setModelHint(`正在同步 ${providerLabel(provider)} 的模型列表…`);

    try {
      const models = await ModelCatalog.fetchModels(endpoint, headers);

      if (getSelectedProvider() !== provider) return;

      modelCatalog = {
        ...modelCatalog,
        [provider]: { models, fetchedAt: Date.now() }
      };
      await ModelCatalog.writeCache(modelCatalog);

      if (getSelectedProvider() !== provider) return;

      const input = document.getElementById('model');
      renderModelField(provider, input.value.trim() || models[0]?.id || '');
      setModelHint(`已同步 ${models.length} 个模型（${formatShortDate(Date.now())}）`);
    } catch (err) {
      if (getSelectedProvider() !== provider) return;
      setModelHint(`同步失败：${err?.message || '未知错误'}`, true);
    } finally {
      setSyncing(null);
    }
  }

  function setSyncing(provider) {
    syncingProvider = provider;
    const button = document.getElementById('btnSyncModels');
    button.disabled = !!provider;
    button.textContent = provider ? '同步中…' : '同步模型';
  }

  function syncFail(message) {
    setSyncing(null);
    setModelHint(message, true);
  }

  function setModelHint(text, isError = false) {
    const hint = document.getElementById('modelHint');
    hint.textContent = text;
    hint.classList.toggle('is-error', isError);
  }

  function showStatus(text, isError = false) {
    const status = document.getElementById('saveStatus');
    status.textContent = text;
    status.className = 'save-status' + (isError ? ' error' : '');
  }

  // ---- 历史 ----
  async function loadHistory() {
    try {
      const response = await sendMessage({ type: 'GET_HISTORY', data: { limit: 10 } });
      const list = document.getElementById('historyList');

      if (response.success && response.data.length > 0) {
        list.innerHTML = response.data.map(item => `
          <div class="history-item">
            <div class="history-item__header">
              <div class="history-item__title">${escapeHtml(item.questionTitle || '未知问题')}</div>
            </div>
            <div class="history-item__meta">
              <span>${formatDate(item.timestamp)}</span>
              <span>${escapeHtml(item.author || '匿名')}</span>
            </div>
            ${item.rebuttal ? `<div class="history-item__rebuttal">${escapeHtml(item.rebuttal)}</div>` : ''}
          </div>
        `).join('');
      } else {
        list.innerHTML = '<div class="history-empty">暂无历史记录</div>';
      }
    } catch (err) {
      console.error('加载历史失败:', err);
    }
  }

  document.getElementById('btnClearHistory').addEventListener('click', async () => {
    if (!confirm('确定要清空所有历史记录吗？')) return;
    try {
      await sendMessage({ type: 'CLEAR_HISTORY' });
      loadHistory();
      showStatus('历史记录已清空');
    } catch (err) {
      showStatus('清空失败', true);
    }
  });

  // ---- 事件 ----
  document.getElementById('btnSave').addEventListener('click', saveConfig);
  document.getElementById('btnSyncModels').addEventListener('click', syncModels);

  document.getElementById('apiBaseOverride').addEventListener('change', (event) => {
    const provider = getSelectedProvider();
    const input = document.getElementById('apiBase');
    const hint = document.getElementById('apiBaseHint');
    const fallback = CONSTANTS.PROVIDER_DEFAULTS[provider]?.apiBase || '';

    input.hidden = !event.target.checked;
    if (!event.target.checked) input.value = '';

    hint.classList.remove('is-error');
    hint.textContent = event.target.checked
      ? `填写代理 / 镜像地址；留空不会保存，取消勾选则恢复内置地址 ${fallback}`
      : `默认使用内置地址 ${fallback}；需要代理 / 镜像时勾选「使用自定义地址」`;

    if (event.target.checked) input.focus();
  });

  // 切换提供商时更新地址与模型建议；切回已保存的提供商时恢复已保存的值，
  // 否则"切出去看一眼再切回来"会在下次保存时把 apiBase 静默清空。
  document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const saved = currentConfig || {};
      const isSavedProvider = saved.provider === radio.value;
      const defaultModel = defaultModelFor(radio.value);

      renderApiBaseField(radio.value, isSavedProvider ? saved.apiBase : '');
      renderModelField(radio.value, isSavedProvider ? (saved.model || defaultModel) : defaultModel);
    });
  });

  // ---- 工具 ----
  function getSelectedProvider() {
    return document.querySelector('input[name="provider"]:checked')?.value || 'deepseek';
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatShortDate(timestamp) {
    const date = new Date(timestamp);
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  await loadConfig();
})();
