/**
 * 知乎反驳助手 - Options 页面脚本
 *
 * API Base URL 与模型名称对所有提供商（含内置的 DeepSeek / Kimi / OpenAI / Claude）
 * 都允许手动填写：官方域名与模型名会随时间变化（换域名、上/下线模型、走代理或镜像），
 * 内置值只作为默认地址与输入建议，用户填写的值优先。
 *
 * @doc docs/TECH_DESIGN.md#51-数据模型
 * @doc docs/USER_GUIDE.md#41-api-设置
 */

(async function () {
  let currentConfig = {};

  // Tab 切换
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      navBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.add('active');

      if (tabId === 'prompt') {
        updatePromptPreview();
      }
    });
  });

  // 加载配置
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

  // 填充表单
  function populateForm(config) {
    // API 设置
    document.querySelector(`input[name="provider"][value="${config.provider}"]`).checked = true;
    document.getElementById('apiKey').value = config.apiKey || '';
    renderApiBaseField(config.provider, config.apiBase);
    renderModelField(config.provider, config.model);
    document.getElementById('temperature').value = config.temperature ?? 0.7;
    document.getElementById('temperatureValue').textContent = config.temperature ?? 0.7;
    document.getElementById('maxTokens').value = config.maxTokens || 4096;

    // 风格
    document.querySelectorAll('.style-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.style === config.style);
    });

    // 错误类型
    Object.entries(config.errorTypes || {}).forEach(([key, value]) => {
      const cb = document.getElementById(`err-${key}`);
      if (cb) cb.checked = value;
    });

    // 功能开关
    const features = config.features || {};
    document.getElementById('feat-showAnalysis').checked = features.showAnalysis !== false;
    document.getElementById('feat-autoFill').checked = features.autoFill !== false;
    document.getElementById('feat-showSource').checked = features.showSource !== false;
    document.getElementById('feat-enableHistory').checked = features.enableHistory !== false;
    document.getElementById('feat-enableCompletenessCheck').checked = features.enableCompletenessCheck !== false;

    // 严格程度
    const strictness = config.strictness || 'standard';
    const strictnessRadio = document.querySelector(`input[name="strictness"][value="${strictness}"]`);
    if (strictnessRadio) strictnessRadio.checked = true;

    // 自定义 Prompt 后缀
    document.getElementById('customPromptSuffix').value = config.customPromptSuffix || '';

    // 历史记录
    loadHistory();
  }

  // 渲染 API Base URL 输入框
  //
  // 地址对所有提供商都可编辑：留空表示沿用提供商的内置地址，填写则覆盖
  // （代理商、镜像站、本地网关或官方换域名时都能就地改，无需等扩展发版）。
  // 内置地址同时写进 placeholder 与提示文案，方便用户知道留空会走哪里。
  function renderApiBaseField(provider, currentValue) {
    const input = document.getElementById('apiBase');
    const hint = document.getElementById('apiBaseHint');
    const fallback = CONSTANTS.PROVIDER_DEFAULTS[provider]?.apiBase || '';

    input.value = currentValue || '';
    input.placeholder = fallback || 'https://api.example.com/v1';

    hint.textContent = fallback
      ? `留空使用内置地址 ${fallback}；也可手动填写代理 / 镜像地址（可省略 https://）。若该域名尚未授权，保存时浏览器会弹窗询问`
      : '必填，例如 https://api.example.com/v1（可省略 https://）。若该域名尚未授权，保存时浏览器会弹窗询问';
  }

  // 渲染模型输入框（文本输入 + 常用模型建议）
  //
  // 模型名各厂商迭代很快（改名、下线、新增版本），因此任何提供商都允许手动输入；
  // 内置的模型列表只作为 datalist 建议，不做限制。
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
      hint.textContent = `可直接输入任意模型名称，或从建议列表中选择（当前建议：${models.slice(0, 3).join(' / ')} 等）`;
    } else {
      hint.textContent = '直接输入模型名称';
    }
  }

  // 收集表单数据
  function collectFormData() {
    const provider = document.querySelector('input[name="provider"]:checked').value;
    const style = document.querySelector('.style-card.selected')?.dataset.style || 'gentle';

    const strictness = document.querySelector('input[name="strictness"]:checked')?.value || 'standard';

    return {
      provider,
      apiKey: document.getElementById('apiKey').value.trim(),
      // 空字符串表示沿用内置地址（对自定义 API 则视为未填写，保存时会拦截）
      apiBase: HostAccess.normalizeApiBase(document.getElementById('apiBase').value),
      model: document.getElementById('model').value.trim(),
      temperature: parseFloat(document.getElementById('temperature').value),
      maxTokens: parseInt(document.getElementById('maxTokens').value),
      style,
      strictness,
      errorTypes: {
        factError: document.getElementById('err-factError').checked,
        logicFallacy: document.getElementById('err-logicFallacy').checked,
        historicalNihilism: document.getElementById('err-historicalNihilism').checked,
        dataFraud: document.getElementById('err-dataFraud').checked,
        scienceError: document.getElementById('err-scienceError').checked,
        argumentIncomplete: document.getElementById('err-argumentIncomplete').checked
      },
      features: {
        showAnalysis: document.getElementById('feat-showAnalysis').checked,
        autoFill: document.getElementById('feat-autoFill').checked,
        showSource: document.getElementById('feat-showSource').checked,
        enableHistory: document.getElementById('feat-enableHistory').checked,
        enableCompletenessCheck: document.getElementById('feat-enableCompletenessCheck').checked
      },
      customPromptSuffix: document.getElementById('customPromptSuffix').value.trim()
    };
  }

  // 保存配置
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

    // 原始输入用于区分「留空」（回退内置地址）与「填了但无效」（必须报错，不能静默丢弃）
    const rawApiBase = document.getElementById('apiBase').value.trim();

    if (rawApiBase && !config.apiBase) {
      showStatus('API Base URL 无效，请填写完整地址，例如 https://api.example.com/v1（可省略 https://）', true);
      return;
    }

    // 把完整端点填进 Base URL 是最常见的误用：扩展运行时会自动拼接 /chat/completions
    // （Claude 为 /messages），重复拼接只会得到 404，因此在保存前拦下并说清该填到哪里。
    if (/\/(chat\/completions|messages)\/?$/i.test(config.apiBase)) {
      showStatus('API Base URL 只需填到 /v1 为止，不要包含 /chat/completions 或 /messages（扩展会自动拼接）', true);
      return;
    }

    // 内置提供商的官方域名已在 manifest.host_permissions 中声明，安装即生效；但用户
    // 一旦手动改写 API Base URL（代理商 / 镜像 / 本地网关 / 官方换域名），新域名必须
    // 在此动态申请。这里统一按「实际生效的地址」申请授权，因此对内置提供商同样适用；
    // 已授权时 request() 会静默返回 true，不会重复弹窗。
    //
    // 关键约束：从 collectFormData() 到 HostAccess.request() 之间不能出现任何 await，
    // 否则会丢失用户手势，Chrome 会直接拒绝本次权限申请。
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

    // 明文 http 只有 localhost / 127.0.0.1 在扩展的可选权限范围内，其它 http 域名
    // （含内网 IP）申请不到授权，直说的话用户才不会卡在「点了允许也没弹窗」的死循环里
    if (!HostAccess.isRequestable(origin)) {
      showStatus(`${origin} 无法授权：扩展只能申请 https 地址，或 localhost / 127.0.0.1 的 http。请改用 https 或本地地址`, true);
      return;
    }

    const granted = await HostAccess.request(origin);
    // 兜底：内置提供商的域名已在 host_permissions 中，属于「安装即授权」。Chrome 对这种
    // 已授权域名的 request() 正常情况下静默返回 true；万一某环境返回 false，这里再用
    // contains() 复核一次（此检查放在 request() 之后，不影响用户手势要求），避免把本来
    // 就有权限的内置提供商配置拦在保存之外。
    if (!granted && !(await HostAccess.has(origin))) {
      showStatus(`未授权访问 ${origin}，配置未保存。请重新点击保存并在弹窗中选择「允许」，或改用内置提供商`, true);
      return;
    }

    try {
      const response = await sendMessage({
        type: 'SET_CONFIG',
        data: config
      });

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

  // 显示状态
  function showStatus(text, isError = false) {
    const status = document.getElementById('saveStatus');
    status.textContent = text;
    status.className = 'save-status' + (isError ? ' error' : '');
  }

  // 加载历史记录
  async function loadHistory() {
    try {
      const response = await sendMessage({ type: 'GET_HISTORY', data: { limit: 20 } });
      const list = document.getElementById('historyList');

      if (response.success && response.data.length > 0) {
        list.innerHTML = response.data.map(item => `
          <div class="history-item ${item.hasErrors ? '' : 'history-item--no-error'}">
            <div class="history-item__header">
              <div class="history-item__title">${escapeHtml(item.questionTitle || '未知问题')}</div>
            </div>
            <div class="history-item__meta">
              <span>${formatDate(item.timestamp)}</span>
              <span>作者: ${escapeHtml(item.author || '匿名')}</span>
              <span>置信度: ${item.confidence || 'medium'}</span>
            </div>
            ${item.errorTypes?.length ? `
              <div class="history-item__tags">
                ${item.errorTypes.map(t => {
                  const info = { factError: ['事实错误', '#cf1322'], logicFallacy: ['逻辑谬误', '#d46b08'], historicalNihilism: ['历史虚无', '#389e0d'], dataFraud: ['数据造假', '#096dd9'], scienceError: ['科学错误', '#531dab'] }[t];
                  return info ? `<span class="history-item__tag" style="background:${info[1]}15;color:${info[1]}">${info[0]}</span>` : '';
                }).join('')}
              </div>
            ` : ''}
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

  // 清空历史
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

  // 风格卡片点击
  document.querySelectorAll('.style-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  // 提供商切换
  document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', () => {
      // 地址与模型建议随提供商变化。切回「当前已保存配置的提供商」时要恢复已保存的值：
      // 否则用户只是切出去看一眼再切回来，已保存的地址覆盖就会在下次保存时被静默清空，
      // 请求悄悄回落到官方内置地址（不报错，用户无法察觉）。
      const saved = currentConfig || {};
      const isSavedProvider = saved.provider === radio.value;
      const defaultModel = CONSTANTS.PROVIDER_DEFAULTS[radio.value]?.models?.[0] || '';

      renderApiBaseField(radio.value, isSavedProvider ? saved.apiBase : '');
      renderModelField(radio.value, isSavedProvider ? (saved.model || defaultModel) : defaultModel);
    });
  });

  // Temperature 滑块
  document.getElementById('temperature').addEventListener('input', (e) => {
    document.getElementById('temperatureValue').textContent = e.target.value;
  });

  // 保存按钮
  document.getElementById('btnSave').addEventListener('click', saveConfig);

  // Prompt 预览更新
  function updatePromptPreview() {
    const config = collectFormData();
    const sampleContent = {
      title: '示例问题：为什么有人认为地球是平的？',
      author: '示例用户',
      text: '地球看起来就是平的，我们站在地面上感觉不到曲率。那些说地球是圆的都是被 NASA 骗了。',
      voteCount: '42'
    };
    const systemPrompt = Prompts.getSystemPrompt(config.style, config, sampleContent);
    const userPrompt = Prompts.getUserPrompt(
      sampleContent,
      Object.entries(config.errorTypes).filter(([_, v]) => v).map(([k]) => k)
    );

    document.getElementById('promptPreview').textContent = systemPrompt;
    document.getElementById('promptUserPreview').textContent = userPrompt;
  }

  // 工具函数
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

  // 初始化
  await loadConfig();
})();
