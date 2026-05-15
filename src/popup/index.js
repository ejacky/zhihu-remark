/**
 * 知乎反驳助手 - Popup 脚本
 * @doc docs/USER_GUIDE.md#Popup-面板使用说明
 */

(async function () {
  const statusCard = document.getElementById('statusCard');
  const statusIcon = document.getElementById('statusIcon');
  const statusTitle = document.getElementById('statusTitle');
  const statusDesc = document.getElementById('statusDesc');
  const btnOptions = document.getElementById('btnOptions');
  const btnHistory = document.getElementById('btnHistory');
  const recentSection = document.getElementById('recentSection');
  const recentList = document.getElementById('recentList');

  // 加载配置状态
  async function loadStatus() {
    try {
      const response = await sendMessage({ type: 'GET_CONFIG' });
      if (response.success) {
        const config = response.data;
        updateStatusUI(config);
      }
    } catch (err) {
      console.error('加载状态失败:', err);
    }
  }

  // 更新状态 UI
  function updateStatusUI(config) {
    if (config.apiKey) {
      statusCard.className = 'status-card status-ok';
      statusIcon.textContent = '✅';
      statusTitle.textContent = `${CONSTANTS.PROVIDER_DEFAULTS[config.provider] ? getProviderName(config.provider) : config.provider} 已配置`;
      statusDesc.textContent = `模型: ${config.model || '默认'}`;
    } else {
      statusCard.className = 'status-card status-warn';
      statusIcon.textContent = '⚠️';
      statusTitle.textContent = '未配置 API Key';
      statusDesc.textContent = '点击"详细设置"进行配置';
    }
  }

  // 获取提供商显示名
  function getProviderName(provider) {
    const names = { openai: 'OpenAI', anthropic: 'Claude', deepseek: 'DeepSeek', kimi: 'Kimi', custom: '自定义' };
    return names[provider] || provider;
  }

  // 加载最近历史
  async function loadRecentHistory() {
    try {
      const response = await sendMessage({ type: 'GET_HISTORY', data: { limit: 3 } });
      if (response.success && response.data.length > 0) {
        recentSection.style.display = 'block';
        recentList.innerHTML = '';

        response.data.forEach(item => {
          const el = document.createElement('div');
          el.className = 'recent-item';
          el.innerHTML = `
            <div class="recent-item-title">${escapeHtml(item.questionTitle || '未知问题')}</div>
            <div class="recent-item-meta">
              <span>${formatDate(item.timestamp)}</span>
              <span class="recent-item-tag ${item.hasErrors ? 'tag-error' : 'tag-ok'}">
                ${item.hasErrors ? '发现错误' : '无明显错误'}
              </span>
            </div>
          `;
          el.addEventListener('click', () => {
            if (item.url) {
              chrome.tabs.create({ url: item.url });
            }
          });
          recentList.appendChild(el);
        });
      }
    } catch (err) {
      console.error('加载历史失败:', err);
    }
  }

  // 事件绑定
  btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  btnHistory.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  document.getElementById('linkHelp').addEventListener('click', (e) => {
    e.preventDefault();
    // 可以打开帮助文档
    chrome.tabs.create({ url: 'https://github.com/your-repo/zhihu-remark' });
  });

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
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  // 初始化
  await loadStatus();
  await loadRecentHistory();
})();
