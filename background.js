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
    }).catch(error => {
      console.error('Error sending message to content script:', error);
    });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action, request.messageId || 'no-id');
  
  if (request.action === "callAI") {
    // Handle the API call asynchronously
    handleAICall(request, sendResponse);
    return true; // Keep message channel open for async response
  }
});

async function handleAICall(request, sendResponse) {
  try {
    console.log('Calling AI API...');
    const response = await callAIAPI(request.prompt, request.selectedText);
    console.log('AI API response received');
    
    // Send success response
    sendResponse({ 
      success: true, 
      response: response,
      messageId: request.messageId 
    });
    
  } catch (error) {
    console.error('AI API error:', error);
    
    // Send error response
    sendResponse({ 
      success: false, 
      error: error.message,
      messageId: request.messageId 
    });
  }
}

// AI API call function
async function callAIAPI(userPrompt, selectedText) {
  try {
    // Get API key from storage
    const result = await chrome.storage.sync.get(['apiKey', 'apiProvider']);
    const apiKey = result.apiKey;
    const provider = result.apiProvider || 'openai';
    
    if (!apiKey) {
      throw new Error('Please set your API key in extension options');
    }

    const fullPrompt = selectedText 
      ? `${userPrompt}\n\nSelected text: "${selectedText}"`
      : userPrompt;

    console.log(`Calling ${provider} API...`);

    if (provider === 'openai') {
      return await callOpenAI(apiKey, fullPrompt);
    } else if (provider === 'anthropic') {
      return await callAnthropic(apiKey, fullPrompt);
    } else if (provider === 'mistralai') {
      return await callMistralAI(apiKey, fullPrompt);
    } else {
      throw new Error(`Unknown API provider: ${provider}`);
    }
  } catch (error) {
    console.error('Error in callAIAPI:', error);
    throw error;
  }
}

async function callOpenAI(apiKey, prompt) {
  try {
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
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from OpenAI API');
    }
    
    return data.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API call failed:', error);
    throw new Error(`OpenAI API call failed: ${error.message}`);
  }
}

async function callAnthropic(apiKey, prompt) {
  try {
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
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      throw new Error(`Anthropic API error (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Invalid response format from Anthropic API');
    }
    
    return data.content[0].text;
  } catch (error) {
    console.error('Anthropic API call failed:', error);
    throw new Error(`Anthropic API call failed: ${error.message}`);
  }
}

// Add MistralAI API call
async function callMistralAI(apiKey, prompt) {
  try {
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
      const errorText = await response.text();
      console.error('MistralAI API error:', response.status, errorText);
      throw new Error(`MistralAI API error (${response.status}): ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from MistralAI API');
    }
    
    return data.choices[0].message.content;
  } catch (error) {
    console.error('MistralAI API call failed:', error);
    throw new Error(`MistralAI API call failed: ${error.message}`);
  }
}