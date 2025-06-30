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

    // Helper function to display status messages with fade effect
    // This function is now defined here to ensure consistent behavior
    function showStatus(message, type, element = settingsStatus) {
        element.textContent = message;
        element.style.opacity = '1';
        element.style.transition = 'opacity 0.5s ease-in-out'; // Ensure transition is applied for fading

        if (type === 'success') {
            element.style.color = 'var(--success-color)';
        } else if (type === 'error') {
            element.style.color = 'var(--error-color)';
        } else {
            element.style.color = ''; // Default or reset
        }

        // Clear any existing timeout to prevent messages from being cut short
        if (element.timeoutId) {
            clearTimeout(element.timeoutId);
        }

        // Set a timeout to fade out the message
        element.timeoutId = setTimeout(() => {
            element.style.opacity = '0';
            // After the fade-out transition completes, clear the text and reset color
            element.timeoutId = setTimeout(() => {
                element.textContent = '';
                element.style.color = ''; // Reset color
            }, 500); // Matches the transition duration
        }, 2000); // Message visible for 2 seconds
    }


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
    helpLink.addEventListener('click', openHelp); // Assuming openHelp function exists or will be added

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
            showStatus('Error loading settings', 'error', settingsStatus); // Pass settingsStatus
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
            // Use the showStatus helper for confirmation
            showStatus('Settings saved successfully!', 'success', settingsStatus);
        } catch (error) {
            showStatus('Error saving settings', 'error', settingsStatus); // Pass settingsStatus
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
            // Optionally show status on UI if desired, e.g., showStatus('Error loading stats', 'error');
        }
    }

    // Clear statistics
    async function clearStats() {
        // Use a custom modal or message box instead of confirm() for browser extension compatibility
        // For this example, we'll use a simple direct call to showStatus
        // In a real extension, you'd implement a custom confirmation dialog
        showStatus('Clearing statistics...', 'info', testStatus); // Temporarily show message

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

    // View chat history (assuming history.html exists)
    function viewChatHistory() {
        chrome.tabs.create({
            url: chrome.runtime.getURL('history.html')
        });
    }

    // Open help link (assuming help page exists or will be implemented)
    function openHelp() {
        // Example: Open a new tab to a help page or a specific section
        chrome.tabs.create({ url: 'https://example.com/ezinfo-help' }); // Replace with your actual help URL
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) { // Ctrl for Windows/Linux, Cmd for macOS
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
