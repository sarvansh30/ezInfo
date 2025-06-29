// Content script - handles UI creation and interaction
let currentTooltip = null;
let currentChatWindow = null;
let conversationHistory = [];

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showAIPrompt") {
    showPromptTooltip(request.selectedText, request.x, request.y);
  }
});

// Simple markdown to HTML converter
function parseMarkdown(text) {
  if (!text) return '';
  
  return text
    // Escape HTML first to prevent XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers (do this before other formatting)
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    // Code blocks (before inline code)
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Lists
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    .replace(/^\+ (.*$)/gim, '<li>$1</li>')
    // Line breaks (convert double newlines to paragraphs, single to br)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

// Wrap list items in ul tags and paragraphs in p tags
function wrapLists(html) {
  // Wrap consecutive list items in ul tags
  html = html.replace(/(<li>.*?<\/li>)(\s*<br>\s*<li>.*?<\/li>)*/g, function(match) {
    return '<ul>' + match.replace(/<br>/g, '') + '</ul>';
  });
  
  // Wrap content in paragraphs if it doesn't start with a block element
  if (html && !html.match(/^<(h[1-6]|ul|ol|pre|div)/)) {
    html = '<p>' + html + '</p>';
  }
  
  return html;
}

// Create and show the prompt tooltip
function showPromptTooltip(selectedText, x, y) {
  // Remove existing tooltip
  removeTooltip();
  
  // Get mouse position if coordinates not provided
  if (!x || !y) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      x = rect.right;
      y = rect.top;
    }
  }

  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'ai-assistant-tooltip';
  tooltip.innerHTML = `
    <div class="tooltip-header">
      <span>Ask AI about selected text</span>
      <button class="close-btn">&times;</button>
    </div>
    <div class="tooltip-content">
      <textarea placeholder="What would you like to know about: '${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}'?" 
                id="ai-prompt-input" rows="3"></textarea>
      <div class="tooltip-buttons">
        <button id="send-prompt-btn">Ask AI</button>
        <button id="cancel-prompt-btn">Cancel</button>
      </div>
    </div>
    <div id="ai-response" class="ai-response" style="display: none;">
      <div class="response-content"></div>
      <div class="response-actions">
        <button id="read-more-btn">Read More</button>
        <button id="continue-chat-btn">Continue Chat</button>
      </div>
    </div>
    <div class="loading" id="loading" style="display: none;">
      <div class="spinner"></div>
      <span>Thinking...</span>
    </div>
  `;
  
  // Position tooltip
  tooltip.style.left = Math.min(x, window.innerWidth - 320) + 'px';
  tooltip.style.top = Math.max(y - 10, 10) + 'px';
  
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;
  
  // Add event listeners
  setupTooltipEvents(selectedText);
  
  // Focus on input
  document.getElementById('ai-prompt-input').focus();
}

function setupTooltipEvents(selectedText) {
  const tooltip = currentTooltip;
  const promptInput = tooltip.querySelector('#ai-prompt-input');
  const sendBtn = tooltip.querySelector('#send-prompt-btn');
  const cancelBtn = tooltip.querySelector('#cancel-prompt-btn');
  const closeBtn = tooltip.querySelector('.close-btn');
  const readMoreBtn = tooltip.querySelector('#read-more-btn');
  const continueBtn = tooltip.querySelector('#continue-chat-btn');
  
  // Close events
  closeBtn.addEventListener('click', removeTooltip);
  cancelBtn.addEventListener('click', removeTooltip);
  
  // Send prompt
  sendBtn.addEventListener('click', () => sendPrompt(selectedText));
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt(selectedText);
    }
  });
  
  // Response actions
  readMoreBtn.addEventListener('click', () => showFullResponse());
  continueBtn.addEventListener('click', () => openChatWindow(selectedText));
  
  // Click outside to close
  document.addEventListener('click', handleOutsideClick);
}

function handleOutsideClick(e) {
  if (currentTooltip && !currentTooltip.contains(e.target)) {
    removeTooltip();
  }
}

async function sendPrompt(selectedText) {
  const promptInput = document.getElementById('ai-prompt-input');
  const userPrompt = promptInput.value.trim();
  
  if (!userPrompt) return;
  
  // Show loading
  showLoading(true);
  
  try {
    // Call AI API through background script with proper error handling
    const response = await new Promise((resolve, reject) => {
      // Check if chrome.runtime is available
      if (!chrome.runtime) {
        reject(new Error('Extension context invalidated. Please reload the page.'));
        return;
      }

      const messageId = Date.now(); // Add unique ID for debugging
      
      chrome.runtime.sendMessage({
        action: 'callAI',
        prompt: userPrompt,
        selectedText: selectedText,
        messageId: messageId
      }, (response) => {
        // Check for chrome.runtime.lastError
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(`Connection error: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        if (!response) {
          reject(new Error('No response received from background script'));
          return;
        }
        
        if (response.success) {
          resolve(response.response);
        } else {
          reject(new Error(response.error || 'Unknown error occurred'));
        }
      });
    });
    
    // Store in conversation history
    conversationHistory.push({
      userPrompt: userPrompt,
      selectedText: selectedText,
      aiResponse: response,
      timestamp: new Date()
    });
    
    // Show response
    showResponse(response);
    
  } catch (error) {
    console.error('Error in sendPrompt:', error);
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

function showResponse(response) {
  const responseDiv = document.getElementById('ai-response');
  const contentDiv = responseDiv.querySelector('.response-content');
  
  // Calculate truncation based on plain text length
  const plainText = response.replace(/[#*`_\-+]/g, ''); // Remove markdown chars for length calc
  const maxLength = 200;
  const truncated = plainText.length > maxLength;
  
  let displayText;
  if (truncated) {
    // Find a good truncation point (try to break at sentence end)
    let truncateAt = maxLength;
    const sentences = response.split(/[.!?]\s+/);
    let currentLength = 0;
    let safeText = '';
    
    for (const sentence of sentences) {
      if (currentLength + sentence.length > maxLength) break;
      safeText += sentence + '. ';
      currentLength = safeText.replace(/[#*`_\-+]/g, '').length;
    }
    
    displayText = safeText || response.substring(0, maxLength);
    if (!displayText.endsWith('...')) {
      displayText += '...';
    }
  } else {
    displayText = response;
  }
  
  // Convert markdown to HTML and set as innerHTML
  const formattedText = wrapLists(parseMarkdown(displayText));
  contentDiv.innerHTML = formattedText;
  responseDiv.style.display = 'block';
  
  // Show/hide read more button
  const readMoreBtn = document.getElementById('read-more-btn');
  readMoreBtn.style.display = truncated ? 'inline-block' : 'none';
  
  // Store full response
  responseDiv.dataset.fullResponse = response;
}

function showFullResponse() {
  const responseDiv = document.getElementById('ai-response');
  const fullResponse = responseDiv.dataset.fullResponse;
  
  // Create modal for full response
  const modal = document.createElement('div');
  modal.id = 'ai-response-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>AI Response</h3>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="response-text">${wrapLists(parseMarkdown(fullResponse))}</div>
      </div>
      <div class="modal-footer">
        <button id="continue-from-modal">Continue Chat</button>
        <button id="close-modal">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listeners
  modal.querySelector('.close-btn').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  modal.querySelector('#close-modal').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  modal.querySelector('#continue-from-modal').addEventListener('click', () => {
    document.body.removeChild(modal);
    openChatWindow();
  });
}

function openChatWindow(selectedText) {
  if (currentChatWindow) {
    currentChatWindow.focus();
    return;
  }
  
  // Create chat window
  const chatWindow = document.createElement('div');
  chatWindow.id = 'ai-chat-window';
  chatWindow.innerHTML = `
    <div class="chat-header">
      <span>AI Chat</span>
      <div class="chat-controls">
        <button id="minimize-chat">_</button>
        <button id="close-chat">&times;</button>
      </div>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-area">
      <textarea id="chat-input" placeholder="Ask a follow-up question..." rows="2"></textarea>
      <button id="send-chat">Send</button>
    </div>
  `;
  
  document.body.appendChild(chatWindow);
  currentChatWindow = chatWindow;
  
  // Load conversation history
  loadChatHistory();
  
  // Setup chat events
  setupChatEvents();
  
  // Remove tooltip
  removeTooltip();
}

function loadChatHistory() {
  const messagesDiv = document.getElementById('chat-messages');
  
  conversationHistory.forEach(item => {
    // Add user message
    addChatMessage(`About "${item.selectedText}": ${item.userPrompt}`, 'user');
    // Add AI response
    addChatMessage(item.aiResponse, 'ai');
  });
  
  // Scroll to bottom
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addChatMessage(content, sender) {
  const messagesDiv = document.getElementById('chat-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${sender}`;
  
  // Format content based on sender
  let formattedContent;
  if (sender === 'ai') {
    formattedContent = wrapLists(parseMarkdown(content));
  } else if (sender === 'error') {
    formattedContent = `<span class="error">${content}</span>`;
  } else {
    formattedContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Escape user content
  }
  
  messageDiv.innerHTML = `
    <div class="message-content">${formattedContent}</div>
    <div class="message-time">${new Date().toLocaleTimeString()}</div>
  `;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function setupChatEvents() {
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-chat');
  const closeBtn = document.getElementById('close-chat');
  const minimizeBtn = document.getElementById('minimize-chat');
  
  sendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  
  closeBtn.addEventListener('click', closeChatWindow);
  minimizeBtn.addEventListener('click', minimizeChatWindow);
  
  // Make draggable
  makeDraggable(currentChatWindow);
}

async function sendChatMessage() {
  const chatInput = document.getElementById('chat-input');
  const message = chatInput.value.trim();
  
  if (!message) return;
  
  // Add user message
  addChatMessage(message, 'user');
  chatInput.value = '';
  
  // Show typing indicator
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-message ai typing';
  typingDiv.innerHTML = '<div class="message-content">AI is typing...</div>';
  document.getElementById('chat-messages').appendChild(typingDiv);
  
  try {
    // Call AI API with improved error handling
    const response = await new Promise((resolve, reject) => {
      if (!chrome.runtime) {
        reject(new Error('Extension context invalidated. Please reload the page.'));
        return;
      }

      chrome.runtime.sendMessage({
        action: 'callAI',
        prompt: message,
        selectedText: '' // Follow-up question
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(`Connection error: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        if (!response) {
          reject(new Error('No response received from background script'));
          return;
        }
        
        if (response.success) {
          resolve(response.response);
        } else {
          reject(new Error(response.error || 'Unknown error occurred'));
        }
      });
    });
    
    // Remove typing indicator
    typingDiv.remove();
    
    // Add AI response
    addChatMessage(response, 'ai');
    
    // Store in history
    conversationHistory.push({
      userPrompt: message,
      selectedText: '',
      aiResponse: response,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Error in sendChatMessage:', error);
    typingDiv.remove();
    addChatMessage(`Error: ${error.message}`, 'error');
  }
}

function closeChatWindow() {
  if (currentChatWindow) {
    document.body.removeChild(currentChatWindow);
    currentChatWindow = null;
  }
}

function minimizeChatWindow() {
  if (currentChatWindow) {
    currentChatWindow.classList.toggle('minimized');
  }
}

function makeDraggable(element) {
  const header = element.querySelector('.chat-header');
  let isDragging = false;
  let startX, startY, initialX, initialY;
  
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialX = element.offsetLeft;
    initialY = element.offsetTop;
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
  });
  
  function drag(e) {
    if (!isDragging) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    element.style.left = (initialX + dx) + 'px';
    element.style.top = (initialY + dy) + 'px';
  }
  
  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  }
}

function showLoading(show) {
  const loading = document.getElementById('loading');
  const sendBtn = document.getElementById('send-prompt-btn');
  
  if (show) {
    loading.style.display = 'flex';
    sendBtn.disabled = true;
  } else {
    loading.style.display = 'none';
    sendBtn.disabled = false;
  }
}

function showError(message) {
  const responseDiv = document.getElementById('ai-response');
  const contentDiv = responseDiv.querySelector('.response-content');
  
  contentDiv.innerHTML = `<span class="error">Error: ${message}</span>`;
  responseDiv.style.display = 'block';
  
  // Hide action buttons for errors
  responseDiv.querySelector('.response-actions').style.display = 'none';
}

function removeTooltip() {
  if (currentTooltip) {
    document.body.removeChild(currentTooltip);
    currentTooltip = null;
    document.removeEventListener('click', handleOutsideClick);
  }
}