// Content script - compact horizontal UI
let currentTooltip = null;
let currentChatWindow = null;
let conversationHistory = [];
let conversationContext = [];
let mouseX = 0;
let mouseY = 0;
let selectionIcon = null; // NEW: Variable for the selection icon

// Track mouse position for tooltip placement
document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// Listen for messages from background script (for context menu)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showAIPrompt") {
    // This is triggered by the context menu. We should also remove the selection icon if it exists.
    removeSelectionIcon();
    showPromptTooltip(request.selectedText, mouseX, mouseY);
  }
});

// NEW: Listen for text selection to show the icon
document.addEventListener('mouseup', (e) => {
    // Use a short timeout to allow the browser to register the selection
    setTimeout(() => {
        const selection = window.getSelection();
        if (!selection) return;

        const selectedText = selection.toString().trim();

        // Don't show icon if interacting with our own UI elements or if the target is the icon itself
        if (e.target.closest('#ai-assistant-tooltip, #ai-chat-window, #ai-selection-icon')) {
            return;
        }

        // Only show for selections of a reasonable length
        if (selectedText.length > 1) {
            // If the selection is inside a textarea or input, don't show the icon.
            const activeEl = document.activeElement;
            const isEditable = activeEl && (activeEl.tagName.toLowerCase() === 'textarea' || activeEl.isContentEditable || (activeEl.tagName.toLowerCase() === 'input' && /text|search|password|email|url/.test(activeEl.type)));
            if (isEditable) {
                 removeSelectionIcon();
                 return;
            }

            // Use pageX/Y to position relative to the document, not viewport, to handle scrolling
            showSelectionIcon(e.pageX, e.pageY, selectedText);
        } else {
            removeSelectionIcon();
        }
    }, 10);
});


// MODIFIED: Function to show the selection icon, now using a PNG
function showSelectionIcon(x, y, selectedText) {
    removeSelectionIcon(); // Remove any old icon

    selectionIcon = document.createElement('div');
    selectionIcon.id = 'ai-selection-icon';
    selectionIcon.style.position = 'absolute';
    // Position it top-left of the cursor
    selectionIcon.style.left = `${x - 32}px`;
    selectionIcon.style.top = `${y - 32}px`;
    selectionIcon.style.width = '28px';
    selectionIcon.style.height = '28px';
    selectionIcon.style.borderRadius = '50%';
    
    // MODIFICATION: Use the correct icon path from your manifest.json.
    try {
        const iconUrl = chrome.runtime.getURL('icons/icon-16.png');
        selectionIcon.style.backgroundImage = `url('${iconUrl}')`;
        selectionIcon.style.backgroundSize = 'cover';
        selectionIcon.style.backgroundPosition = 'center';
        selectionIcon.style.backgroundRepeat = 'no-repeat';
    } catch (error) {
        // Fallback to a visible style if the icon fails to load (e.g., not in manifest)
        console.error("Ask AI Extension: Could not load custom icon. Check manifest.json's web_accessible_resources.", error);
        selectionIcon.style.backgroundColor = 'white';
        selectionIcon.style.border = '1px solid #ccc';
        selectionIcon.style.display = 'flex';
        selectionIcon.style.alignItems = 'center';
        selectionIcon.style.justifyContent = 'center';
        selectionIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    }

    selectionIcon.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    selectionIcon.style.cursor = 'pointer';
    selectionIcon.style.zIndex = '2147483647'; // Max z-index
    selectionIcon.style.transition = 'transform 0.1s ease-out, box-shadow 0.1s ease-out';
    selectionIcon.title = 'Ask AI';

    document.body.appendChild(selectionIcon);

    // Add a little hover effect for better UX
    selectionIcon.addEventListener('mouseenter', () => {
        selectionIcon.style.transform = 'scale(1.1)';
        selectionIcon.style.boxShadow = '0 4px 8px rgba(0,0,0,0.25)';
    });
    selectionIcon.addEventListener('mouseleave', () => {
        selectionIcon.style.transform = 'scale(1)';
        selectionIcon.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    });

    // Prevent mousedown on icon from deselecting text
    selectionIcon.addEventListener('mousedown', (e) => {
        e.preventDefault(); // This is the key fix to keep text selected
        e.stopPropagation();
    });

    // On click, trigger the main UI
    selectionIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        // **FIX**: Use the 'selectedText' variable passed into this function.
        // This is more reliable than re-getting the selection, which might have been cleared by the click.
        if (selectedText) {
            // Get position from the icon itself to place the tooltip nearby
            const rect = selectionIcon.getBoundingClientRect();
            // Position the tooltip below the icon
            showPromptTooltip(selectedText, rect.left + window.scrollX, rect.bottom + 5 + window.scrollY);
        }
        removeSelectionIcon();
    });
}

// NEW: Function to remove the selection icon
function removeSelectionIcon() {
    if (selectionIcon && selectionIcon.parentNode) {
        selectionIcon.parentNode.removeChild(selectionIcon);
        selectionIcon = null;
    }
}


// Simple markdown to HTML converter
function parseMarkdown(text) {
  if (!text) return '';
  // Basic markdown parsing
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/g, (_match, p1) => `<pre><code>${escapeHtml(p1)}</code></pre>`)
    .replace(/`([^`]+)`/g, (_match, p1) => `<code>${escapeHtml(p1)}</code>`)
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    .replace(/^\+ (.*$)/gim, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function wrapLists(html) {
  // Wrap list items in <ul>
  html = html.replace(/(<li>.*?<\/li>)(\s*<br>\s*<li>.*?<\/li>)*/g, (match) => {
    return '<ul>' + match.replace(/<br>/g, '') + '</ul>';
  });
  // Wrap non-tagged text in <p>
  if (html && !html.match(/^<(h[1-6]|ul|ol|pre|div|p)/)) {
    html = '<p>' + html + '</p>';
  }
  return html;
}

// MODIFIED: showPromptTooltip now also removes the icon
function showPromptTooltip(selectedText, x, y) {
  removeTooltip(); // Ensure no other tooltips are open
  removeSelectionIcon(); // NEW: Remove the icon when the tooltip appears

  let tooltipX = x || mouseX;
  let tooltipY = y || mouseY;

  // Fallback positioning if mouse coordinates are not available
  if (!tooltipX || !tooltipY) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      tooltipX = rect.right + window.scrollX;
      tooltipY = rect.top + window.scrollY;
    } else {
      tooltipX = window.innerWidth / 2;
      tooltipY = window.innerHeight / 2;
    }
  }

  const tooltip = document.createElement('div');
  tooltip.id = 'ai-assistant-tooltip';
  tooltip.innerHTML = `
    <div class="compact-container">
      <input type="text" id="ai-prompt-input" placeholder="Ask about: '${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}'" />
      <button id="send-prompt-btn" title="Send">Send</button>
      <button id="clear-prompt-btn" title="Clear">Clear</button>
      <button id="close-tooltip-btn" title="Close">Close</button>
    </div>
    <div id="ai-response" class="response-container" style="display: none;">
      <div class="response-content"></div>
      <div class="response-buttons">
        <button id="read-more-btn" class="action-btn" title="Read More">Read More</button>
        <button id="continue-chat-btn" class="action-btn" title="Continue Chat">Continue in Chat</button>
      </div>
    </div>
    <div class="loading" id="loading" style="display: none;">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>
  `;
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;

  // Position tooltip dynamically
  const tooltipRect = tooltip.getBoundingClientRect();
  const tooltipWidth = tooltipRect.width;
  const tooltipHeight = tooltipRect.height;
  const finalX = Math.min(Math.max(tooltipX + 10, 10), window.innerWidth - tooltipWidth - 10);
  const finalY = Math.min(Math.max(tooltipY - 10, 10), window.innerHeight - tooltipHeight - 10);

  tooltip.style.left = `${finalX}px`;
  tooltip.style.top = `${finalY}px`;

  makeDraggable(tooltip);
  setupTooltipEvents(selectedText);

  setTimeout(() => {
    const input = document.getElementById('ai-prompt-input');
    if (input) input.focus();
  }, 100);
}


function setupTooltipEvents(selectedText) {
  const tooltip = currentTooltip;
  if (!tooltip) return;

  const promptInput = tooltip.querySelector('#ai-prompt-input');
  const sendBtn = tooltip.querySelector('#send-prompt-btn');
  const clearBtn = tooltip.querySelector('#clear-prompt-btn');
  const closeBtn = tooltip.querySelector('#close-tooltip-btn');
  const readMoreBtn = tooltip.querySelector('#read-more-btn');
  const continueBtn = tooltip.querySelector('#continue-chat-btn');

  if (closeBtn) closeBtn.addEventListener('click', removeTooltip);
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (promptInput) promptInput.value = '';
    promptInput.focus();
  });

  if (sendBtn) sendBtn.addEventListener('click', () => sendPrompt(selectedText));
  if (promptInput) {
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendPrompt(selectedText);
      }
    });
  }

  if (readMoreBtn) readMoreBtn.addEventListener('click', () => showFullResponse());
  if (continueBtn) continueBtn.addEventListener('click', () => openChatWindow(selectedText));

  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 100);
}

// MODIFIED: handleOutsideClick needs to be aware of the new icon
function handleOutsideClick(e) {
  if (currentTooltip && !currentTooltip.contains(e.target) &&
      (!currentChatWindow || !currentChatWindow.contains(e.target)) &&
      !e.target.closest('#ai-selection-icon')) { // NEW Check to prevent closing when icon is clicked
    removeTooltip();
  }
}

async function sendPrompt(selectedText) {
  const promptInput = document.getElementById('ai-prompt-input');
  if (!promptInput) return;

  let userPrompt = promptInput.value.trim();
  if (!userPrompt) {
    userPrompt = "Explain this with examples and meaning";
  }

  showLoading(true);

  try {
    const contextMessages = conversationContext.slice();
    const currentMessage = selectedText 
      ? `About "${selectedText}": ${userPrompt}`
      : userPrompt;

    const response = await new Promise((resolve, reject) => {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        return reject(new Error('Extension context invalidated. Please reload the page.'));
      }
      
      const timeoutId = setTimeout(() => reject(new Error('Request timeout - please try again')), 30000);

      chrome.runtime.sendMessage({
        action: 'callAI',
        prompt: userPrompt,
        selectedText: selectedText,
        conversationContext: contextMessages
      }, (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          return reject(new Error(`Connection error: ${chrome.runtime.lastError.message}`));
        }
        if (!response) {
          return reject(new Error('No response received from background script.'));
        }
        if (response.success) {
          resolve(response.response);
        } else {
          reject(new Error(response.error || 'An unknown error occurred.'));
        }
      });
    });

    conversationContext.push({ role: 'user', content: currentMessage });
    conversationContext.push({ role: 'assistant', content: response });

    if (conversationContext.length > 20) {
      conversationContext = conversationContext.slice(-20);
    }
    
    conversationHistory.push({
      userPrompt: userPrompt,
      selectedText: selectedText,
      aiResponse: response,
      timestamp: new Date()
    });

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
  if (!responseDiv) return;

  const contentDiv = responseDiv.querySelector('.response-content');
  if (!contentDiv) return;

  const plainText = response.replace(/[#*`_\-+]/g, '');
  const maxLength = 150;
  const truncated = plainText.length > maxLength;
  
  let displayText = response;
  if (truncated) {
    let truncatedText = response.substring(0, maxLength);
    truncatedText = truncatedText.substring(0, Math.min(truncatedText.length, truncatedText.lastIndexOf(' ')));
    displayText = truncatedText + '...';
  }

  const formattedText = wrapLists(parseMarkdown(displayText));
  contentDiv.innerHTML = formattedText;
  responseDiv.style.display = 'block';

  const readMoreBtn = document.getElementById('read-more-btn');
  if (readMoreBtn) {
    readMoreBtn.style.display = truncated ? 'inline-block' : 'none';
  }

  responseDiv.dataset.fullResponse = response;
}

function showFullResponse() {
  const tooltip = currentTooltip;
  const responseDiv = document.getElementById('ai-response');
  if (!tooltip || !responseDiv) return;

  const fullResponse = responseDiv.dataset.fullResponse;
  if (!fullResponse) return;

  const contentDiv = responseDiv.querySelector('.response-content');
  if (!contentDiv) return;
  
  // Expand the tooltip and show full content
  tooltip.classList.add('is-expanded');
  contentDiv.innerHTML = wrapLists(parseMarkdown(fullResponse));

  // Hide the "Read More" button after expanding
  const readMoreBtn = document.getElementById('read-more-btn');
  if (readMoreBtn) {
    readMoreBtn.style.display = 'none';
  }
}

function openChatWindow(selectedText) {
  if (currentChatWindow) {
    currentChatWindow.focus();
    return;
  }
  
  removeTooltip();

  const chatWindow = document.createElement('div');
  chatWindow.id = 'ai-chat-window';
  chatWindow.innerHTML = `
    <div class="chat-header">
      <span>AI Assistant</span>
      <div class="chat-controls">
        <button id="clear-chat-btn" title="Clear Chat">Clear</button>
        <button id="minimize-chat" title="Minimize">_</button>
        <button id="close-chat" title="Close">&times;</button>
      </div>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-area">
      <textarea id="chat-input" placeholder="Ask a follow-up question..." rows="1"></textarea>
      <button id="send-chat" title="Send">Send</button>
    </div>
  `;

  // Default position
  chatWindow.style.top = '100px';
  chatWindow.style.right = '20px';

  document.body.appendChild(chatWindow);
  currentChatWindow = chatWindow;

  loadChatHistory();
  setupChatEvents();
}

function loadChatHistory() {
  const messagesDiv = document.getElementById('chat-messages');
  if (!messagesDiv) return;

  messagesDiv.innerHTML = ''; 
  
  conversationContext.forEach(item => {
    addChatMessage(item.content, item.role);
  });
  
  if (messagesDiv.innerHTML.trim() === '') {
      addChatMessage("Hello! How can I help you today?", 'system');
  }
  
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addChatMessage(content, sender) { 
  const messagesDiv = document.getElementById('chat-messages');
  if (!messagesDiv) return;

  const messageDiv = document.createElement('div');
  messageDiv.classList.add('chat-message', sender);
  
  let formattedContent;
  if (sender === 'assistant') {
    formattedContent = wrapLists(parseMarkdown(content));
  } else {
    formattedContent = escapeHtml(content);
  }

  messageDiv.innerHTML = formattedContent;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupChatEvents() {
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-chat');
  const closeBtn = document.getElementById('close-chat');
  const minimizeBtn = document.getElementById('minimize-chat');
  const clearChatBtn = document.getElementById('clear-chat-btn');

  if (sendBtn) sendBtn.addEventListener('click', sendChatMessage);
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeChatWindow);
  if (minimizeBtn) minimizeBtn.addEventListener('click', minimizeChatWindow);
  if (clearChatBtn) clearChatBtn.addEventListener('click', clearChat);
  
  if (currentChatWindow) {
    makeDraggable(currentChatWindow);
  }
}

function clearChat() {
    conversationContext = [];
    conversationHistory = []; 
    const messagesDiv = document.getElementById('chat-messages');
    if (messagesDiv) {
        messagesDiv.innerHTML = '';
        addChatMessage('Chat cleared.', 'system');
    }
}

async function sendChatMessage() {
  const chatInput = document.getElementById('chat-input');
  if (!chatInput) return;

  const message = chatInput.value.trim();
  if (!message) return;

  const systemMessage = document.querySelector('.chat-message.system');
  if (systemMessage) {
      systemMessage.remove();
  }

  addChatMessage(message, 'user');
  chatInput.value = '';
  chatInput.style.height = 'auto'; 

  conversationContext.push({ role: 'user', content: message });
  
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-message assistant typing';
  typingDiv.innerHTML = '<span></span><span></span><span></span>';
  const messagesDiv = document.getElementById('chat-messages');
  if (messagesDiv) {
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  try {
    const response = await new Promise((resolve, reject) => {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        return reject(new Error('Extension context invalidated. Please reload the page.'));
      }
      
      const timeoutId = setTimeout(() => reject(new Error('Request timeout - please try again')), 30000);

      chrome.runtime.sendMessage({
        action: 'callAI',
        prompt: message,
        selectedText: '',
        conversationContext: conversationContext.slice()
      }, (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          return reject(new Error(`Connection error: ${chrome.runtime.lastError.message}`));
        }
        if (!response) {
          return reject(new Error('No response received from background script.'));
        }
        if (response.success) {
          resolve(response.response);
        } else {
          reject(new Error(response.error || 'An unknown error occurred.'));
        }
      });
    });

    if (typingDiv && typingDiv.parentNode) {
      typingDiv.remove();
    }
    
    conversationContext.push({ role: 'assistant', content: response });
    addChatMessage(response, 'assistant');
    
    if (conversationContext.length > 20) {
      conversationContext = conversationContext.slice(-20);
    }

  } catch (error) {
    console.error('Error in sendChatMessage:', error);
    if (typingDiv && typingDiv.parentNode) {
      typingDiv.remove();
    }
    addChatMessage(`Error: ${error.message}`, 'error');
  }
}

function closeChatWindow() {
  if (currentChatWindow && document.body.contains(currentChatWindow)) {
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
  const header = element.querySelector('.chat-header') || element;
  if (!header) return;

  let isDragging = false;
  let startX, startY, initialX, initialY;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, input, textarea, select')) {
        return;
    }
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialX = element.offsetLeft;
    initialY = element.offsetTop;

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  });

  function drag(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    element.style.left = `${initialX + dx}px`;
    element.style.top = `${initialY + dy}px`;
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  }
}

function showLoading(show) {
  const loadingDiv = document.getElementById('loading');
  const sendBtn = document.getElementById('send-prompt-btn');

  if (loadingDiv) {
    loadingDiv.style.display = show ? 'flex' : 'none';
  }
  if (sendBtn) {
    sendBtn.disabled = show;
  }
}

function showError(message) {
  const responseDiv = document.getElementById('ai-response');
  if (!responseDiv) return;

  const contentDiv = responseDiv.querySelector('.response-content');
  if (!contentDiv) return;

  contentDiv.innerHTML = `<span class="error-message">Error: ${escapeHtml(message)}</span>`;
  responseDiv.style.display = 'block';

  const buttonsDiv = responseDiv.querySelector('.response-buttons');
  if (buttonsDiv) {
    buttonsDiv.style.display = 'none';
  }
}

// MODIFIED: removeTooltip should also remove the icon for good measure
function removeTooltip() {
  if (currentTooltip && document.body.contains(currentTooltip)) {
    document.body.removeChild(currentTooltip);
    currentTooltip = null;
    document.removeEventListener('click', handleOutsideClick);
  }
  removeSelectionIcon(); // NEW: Cleanup icon as well
}
