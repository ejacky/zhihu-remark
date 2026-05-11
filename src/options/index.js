/**
 * 知乎反驳助手 - Options 页面脚本
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
    document.getElementById('apiBase').value = config.apiBase || '';
    renderModelSelect(config.provider, config.model);
    document.getElementById('temperature').value = config.temperature ?? 0.7;
    document.getElementById('temperatureValue').textContent = config.temperature ?? 0.7;
    document.getElementById('maxTokens').value = config.maxTokens || 2048;

    // 显示/隐藏 apiBase（仅自定义 API 显示）
    const needsCustomBase = config.provider === 'custom';
    document.getElementById('apiBaseGroup').style.display = needsCustomBase ? 'block' : 'none';

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

    // 历史记录
    loadHistory();
  }

  // 渲染模型选择器（下拉框或文本输入）
  function renderModelSelect(provider, currentModel) {
    const selectEl = document.getElementById('model');
    const customInput = document.getElementById('modelCustom');
    const hint = document.getElementById('modelHint');
    const defaults = CONSTANTS.PROVIDER_DEFAULTS[provider];

    if (provider === 'custom') {
      // 自定义 API：显示文本输入框
      selectEl.style.display = 'none';
      customInput.style.display = 'block';
      customInput.value = currentModel || '';
      hint.textContent = '输入自定义模型的完整名称';
    } else {
      // 标准提供商：显示下拉框
      selectEl.style.display = 'block';
      customInput.style.display = 'none';
      selectEl.innerHTML = '';

      const models = defaults?.models || [];
      models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        if (model === currentModel) {
          option.selected = true;
        }
        selectEl.appendChild(option);
      });

      // 如果当前模型不在列表中，也添加进去（兼容旧配置）
      if (currentModel && !models.includes(currentModel)) {
        const option = document.createElement('option');
        option.value = currentModel;
        option.textContent = currentModel + '（自定义）';
        option.selected = true;
        selectEl.appendChild(option);
      }

      hint.textContent = `选择 ${provider} 支持的模型版本`;
    }
  }

  // 收集表单数据
  function collectFormData() {
    const provider = document.querySelector('input[name="provider"]:checked').value;
    const style = document.querySelector('.style-card.selected')?.dataset.style || 'gentle';

    // 根据提供商类型获取模型值
    let model;
    if (provider === 'custom') {
      model = document.getElementById('modelCustom').value.trim();
    } else {
      model = document.getElementById('model').value;
    }

    return {
      provider,
      apiKey: document.getElementById('apiKey').value.trim(),
      apiBase: document.getElementById('apiBase').value.trim(),
      model,
      temperature: parseFloat(document.getElementById('temperature').value),
      maxTokens: parseInt(document.getElementById('maxTokens').value),
      style,
      errorTypes: {
        factError: document.getElementById('err-factError').checked,
        logicFallacy: document.getElementById('err-logicFallacy').checked,
        historicalNihilism: document.getElementById('err-historicalNihilism').checked,
        dataFraud: document.getElementById('err-dataFraud').checked,
        scienceError: document.getElementById('err-scienceError').checked
      },
      features: {
        showAnalysis: document.getElementById('feat-showAnalysis').checked,
        autoFill: document.getElementById('feat-autoFill').checked,
        showSource: document.getElementById('feat-showSource').checked,
        enableHistory: document.getElementById('feat-enableHistory').checked
      }
    };
  }

  // 保存配置
  async function saveConfig() {
    const config = collectFormData();

    if (!config.apiKey) {
      showStatus('请填写 API Key', true);
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
      const isCustom = radio.value === 'custom';
      document.getElementById('apiBaseGroup').style.display = isCustom ? 'block' : 'none';
      // 重新渲染模型选择器
      const defaults = CONSTANTS.PROVIDER_DEFAULTS[radio.value];
      const defaultModel = defaults?.models?.[0] || '';
      renderModelSelect(radio.value, defaultModel);
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
    const systemPrompt = Prompts.getSystemPrompt(config.style, config);
    const userPrompt = Prompts.getUserPrompt({
      title: '示例问题：为什么有人认为地球是平的？',
      author: '示例用户',
      text: '地球看起来就是平的，我们站在地面上感觉不到曲率。那些说地球是圆的都是被 NASA 骗了。',
      voteCount: '42'
    }, Object.entries(config.errorTypes).filter(([_, v]) => v).map(([k]) => k));

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
