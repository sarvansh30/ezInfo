// Background script - handles context menu and API calls
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu item
  chrome.contextMenus.create({
    id: "askAI",
    title: "Ask AI: %s",
    contexts: ["selection"]
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "askAI" && info.selectionText) {
    // Send selected text to content script
    chrome.tabs.sendMessage(tab.id, {
      action: "showAIPrompt",
      selectedText: info.selectionText,
      x: info.x || 0,
      y: info.y || 0
    });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callAI") {
    callAIAPI(request.prompt, request.selectedText)
      .then(response => {
        sendResponse({ success: true, response: response });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});

// AI API call function
async function callAIAPI(userPrompt, selectedText) {
  // Get API key from storage
  const result = await chrome.storage.sync.get(['apiKey', 'apiProvider']);
  const apiKey = result.apiKey;
  const provider = result.apiProvider || 'openai';
  
  if (!apiKey) {
    throw new Error('Please set your API key in extension options');
  }

  const fullPrompt = `${userPrompt}\n\nSelected text: "${selectedText}"`;

  if (provider === 'openai') {
    return await callOpenAI(apiKey, fullPrompt);
  } else if (provider === 'anthropic') {
    return await callAnthropic(apiKey, fullPrompt);
  } else if (provider === 'mistralai') {
    return await callMistralAI(apiKey, fullPrompt);
  }
}

async function callOpenAI(apiKey, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(apiKey, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Add MistralAI API call
async function callMistralAI(apiKey, prompt) {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'mistral-medium',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
            temperature: 0.7
        })
    });
    if (!response.ok) {
        throw new Error(`API call failed: ${response.statusText}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
}