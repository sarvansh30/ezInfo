// popup.js for AI Text Assistant extension

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const apiProviderSelect = document.getElementById('apiProvider');
    const apiKeyInput = document.getElementById('apiKey');
    const maxTokensSelect = document.getElementById('maxTokens');
    const temperatureSelect = document.getElementById('temperature');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const settingsStatus = document.getElementById('settingsStatus');
    const toggleApiKeyBtn = document.getElementById('toggleApiKey');
    const testConnectionBtn = document.getElementById('testConnection');
    const testStatus = document.getElementById('testStatus');
    const clearStatsBtn = document.getElementById('clearStats');
    const viewHistoryBtn = document.getElementById('viewHistory');
    const helpLink = document.getElementById('helpLink');

    // Stats elements
    const dailyCountSpan = document.getElementById('dailyCount');
    const totalCountSpan = document.getElementById('totalCount');
    const lastUsedSpan = document.getElementById('lastUsed');

    // Ensure MistralAI is present in the provider dropdown
    if (apiProviderSelect && !apiProviderSelect.querySelector('option[value="mistralai"]')) {
        const mistralOption = document.createElement('option');
        mistralOption.value = 'mistralai';
        mistralOption.textContent = 'MistralAI';
        apiProviderSelect.appendChild(mistralOption);
    }

    // Load settings on popup open
    loadSettings();
    loadStats();

    // Event listeners
    saveSettingsBtn.addEventListener('click', saveSettings);
    toggleApiKeyBtn.addEventListener('click', toggleApiKeyVisibility);
    testConnectionBtn.addEventListener('click', testApiConnection);
    clearStatsBtn.addEventListener('click', clearStats);
    viewHistoryBtn.addEventListener('click', viewChatHistory);
    helpLink.addEventListener('click', openHelp);

    // Auto-save settings on change
    [apiProviderSelect, maxTokensSelect, temperatureSelect].forEach(element => {
        element.addEventListener('change', saveSettings);
    });

    // Load settings from storage
    async function loadSettings() {
        try {
            const result = await chrome.storage.sync.get([
                'apiProvider', 'apiKey', 'maxTokens', 'temperature'
            ]);
            if (result.apiProvider) apiProviderSelect.value = result.apiProvider;
            if (result.apiKey) apiKeyInput.value = result.apiKey;
            if (result.maxTokens) maxTokensSelect.value = result.maxTokens;
            if (result.temperature) temperatureSelect.value = result.temperature;
        } catch (error) {
            showStatus('Error loading settings', 'error');
        }
    }

    // Save settings to storage
    async function saveSettings() {
        try {
            const settings = {
                apiProvider: apiProviderSelect.value,
                apiKey: apiKeyInput.value,
                maxTokens: maxTokensSelect.value,
                temperature: temperatureSelect.value
            };
            await chrome.storage.sync.set(settings);
            showStatus('Settings saved successfully!', 'success');
            setTimeout(() => {
                settingsStatus.innerHTML = '';
            }, 2000);
        } catch (error) {
            showStatus('Error saving settings', 'error');
        }
    }

    // Load usage statistics
    async function loadStats() {
        try {
            const result = await chrome.storage.local.get([
                'dailyCount', 'totalCount', 'lastUsed', 'lastDate'
            ]);
            const today = new Date().toDateString();
            const lastDate = result.lastDate || '';
            const dailyCount = lastDate === today ? (result.dailyCount || 0) : 0;
            dailyCountSpan.textContent = dailyCount;
            totalCountSpan.textContent = result.totalCount || 0;
            lastUsedSpan.textContent = result.lastUsed ? 
                new Date(result.lastUsed).toLocaleString() : 'Never';
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    // Clear statistics
    async function clearStats() {
        if (confirm('Are you sure you want to clear all usage statistics?')) {
            try {
                await chrome.storage.local.remove([
                    'dailyCount', 'totalCount', 'lastUsed', 'lastDate'
                ]);
                loadStats();
                showStatus('Statistics cleared!', 'success', testStatus);
            } catch (error) {
                showStatus('Error clearing statistics', 'error', testStatus);
            }
        }
    }

    // Toggle API key visibility
    function toggleApiKeyVisibility() {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        toggleApiKeyBtn.textContent = isPassword ? '🙈' : '👁️';
    }

    // Test API connection
    async function testApiConnection() {
        const apiKey = apiKeyInput.value;
        const provider = apiProviderSelect.value;
        if (!apiKey) {
            showStatus('Please enter an API key first', 'error', testStatus);
            return;
        }
        testConnectionBtn.disabled = true;
        testConnectionBtn.textContent = 'Testing...';
        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'testAPI',
                    apiKey: apiKey,
                    provider: provider
                }, (response) => {
                    if (response && response.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response ? response.error : 'No response'));
                    }
                });
            });
            showStatus('✅ API connection successful!', 'success', testStatus);
        } catch (error) {
            showStatus(`❌ Connection failed: ${error.message}`, 'error', testStatus);
        } finally {
            testConnectionBtn.disabled = false;
            testConnectionBtn.textContent = 'Test API Connection';
        }
    }

    // View chat history
    function viewChatHistory() {
        chrome.tabs.create({
            url: chrome.runtime.getURL('history.html')
        });
    }

    // Open help documentation
    function openHelp() {
        chrome.tabs.create({
            url: 'https://github.com/your-username/ai-text-assistant#readme'
        });
    }

    // Show status message
    function showStatus(message, type, element = settingsStatus) {
        element.innerHTML = `<div class="status ${type}">${message}</div>`;
        if (type === 'success') {
            setTimeout(() => {
                element.innerHTML = '';
            }, 3000);
        }
    }

    // Update stats when extension is used
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.dailyCount || changes.totalCount || changes.lastUsed)) {
            loadStats();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 's':
                    e.preventDefault();
                    saveSettings();
                    break;
                case 't':
                    e.preventDefault();
                    testApiConnection();
                    break;
            }
        }
    });

    // Auto-focus API key input if empty
    setTimeout(() => {
        if (!apiKeyInput.value) {
            apiKeyInput.focus();
        }
    }, 100);
});
