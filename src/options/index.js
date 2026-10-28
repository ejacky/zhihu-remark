/**
 * 知乎反驳助手 - Options 页面脚本
 *
 * 只有四项主设置：API Key / 模型 / 深度思考 / 历史记录。
 * 其余（提供商、API Base URL、风格、自定义字体后缀）收在「高级设置」里。
 *
 * API Base URL 与模型名对所有提供商都可手填：官方域名与模型名会变（换域名、
 * 上下线、走代理），内置值只是默认地址与输入建议。
 *
 * @doc docs/TECH_DESIGN.md#51-数据模型
 * @doc docs/USER_GUIDE.md#4-设置
 */

(async function () {
  'use strict';

  let currentConfig = {};

  // ---- 加载与填充 ----
  async function loadConfig() {
    try {
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

  /** API Base：留空沿用内置地址，填了则覆盖；提示里写清留空会走哪里 */
  function renderApiBaseField(provider, currentValue) {
    const input = document.getElementById('apiBase');
    const hint = document.getElementById('apiBaseHint');
    const fallback = CONSTANTS.PROVIDER_DEFAULTS[provider]?.apiBase || '';

    input.value = currentValue || '';
    input.placeholder = fallback || 'https://api.example.com/v1';
    hint.textContent = fallback
      ? `留空使用内置地址 ${fallback}；也可填代理 / 镜像地址。若该域名未授权，保存时浏览器会弹窗询问`
      : '必填，例如 https://api.example.com/v1。若该域名未授权，保存时浏览器会弹窗询问';
  }

  /** 模型名：自由输入 + 建议列表（datalist），不限制用户输入 */
  function renderModelField(provider, currentModel) {
    const input = document.getElementById('model');
    const listEl = document.getElementById('modelOptions');
    const hint = document.getElementById('modelHint');
    const models = CONSTANTS.PROVIDER_DEFAULTS[provider]?.models || [];

    listEl.innerHTML = '';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      listEl.appendChild(option);
    });

    input.value = currentModel || '';
    input.placeholder = models[0] || '输入模型名称';

    if (provider === 'custom') {
      hint.textContent = '输入自定义模型的完整名称';
    } else if (models.length) {
      hint.textContent = `可直接输入任意模型名，或从建议里选（当前建议：${models.slice(0, 3).join(' / ')} 等）`;
    } else {
      hint.textContent = '直接输入模型名称';
    }
  }

  function collectFormData() {
    const provider = document.querySelector('input[name="provider"]:checked')?.value || 'deepseek';

    return {
      provider,
      apiKey: document.getElementById('apiKey').value.trim(),
      apiBase: HostAccess.normalizeApiBase(document.getElementById('apiBase').value),
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

    if (!config.apiKey) {
      showStatus('请填写 API Key', true);
      return;
    }
    if (!config.model) {
      showStatus('请填写模型名称', true);
      return;
    }

    // 用原始输入区分「留空」（回退内置地址）与「填了但无效」（必须报错）
    const rawApiBase = document.getElementById('apiBase').value.trim();
    if (rawApiBase && !config.apiBase) {
      showStatus('API Base URL 无效，请填完整地址，例如 https://api.example.com/v1（可省略 https://）', true);
      return;
    }

    // 完整端点填进 Base URL 是最常见的误用：运行时会自动拼 /chat/completions
    if (/\/(chat\/completions|messages)\/?$/i.test(config.apiBase)) {
      showStatus('API Base URL 只需填到 /v1 为止，不要包含 /chat/completions 或 /messages（会自动拼接）', true);
      return;
    }

    // 从 collectFormData() 到 HostAccess.request() 之间不能有任何 await，
    // 否则丢失用户手势，Chrome 会直接拒绝权限申请。
    const effectiveApiBase = config.apiBase
      || CONSTANTS.PROVIDER_DEFAULTS[config.provider]?.apiBase
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

  // 切换提供商时更新地址与模型建议；切回已保存的提供商时恢复已保存的值，
  // 否则"切出去看一眼再切回来"会在下次保存时把 apiBase 静默清空。
  document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const saved = currentConfig || {};
      const isSavedProvider = saved.provider === radio.value;
      const defaultModel = CONSTANTS.PROVIDER_DEFAULTS[radio.value]?.models?.[0] || '';

      renderApiBaseField(radio.value, isSavedProvider ? saved.apiBase : '');
      renderModelField(radio.value, isSavedProvider ? (saved.model || defaultModel) : defaultModel);
    });
  });

  // ---- 工具 ----
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

  await loadConfig();
})();
