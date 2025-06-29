// Content script - handles UI creation and interaction

// --- Globals ---
let currentWidget = null;
let currentChatWindow = null;
let conversationHistory = [];
let isDraggable = false;

// --- Initial Setup ---
// Inject the CSS for styling the UI components once the document is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
} else {
    injectStyles();
}

// Listen for messages from the background script to show the initial widget.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showAIPrompt") {
    // Pass the mouse coordinates for precise positioning.
    showAIWidget(request.selectedText, request.x, request.y);
  }
});

// --- Core Functions ---

/**
 * Creates and shows the initial draggable AI widget.
 * @param {string} selectedText The text highlighted by the user.
 * @param {number} x The x-coordinate of the mouse click.
 * @param {number} y The y-coordinate of the mouse click.
 */
function showAIWidget(selectedText, x, y) {
  // Ensure any previous UI elements are removed.
  removeWidget();
  removeChatWindow();

  // Create the main widget container.
  const widget = document.createElement('div');
  widget.id = 'ai-assistant-widget';
  widget.innerHTML = `
    <div class="ai-widget-header" id="ai-widget-header">
      <span>Ask AI</span>
      <button class="widget-close-btn">&times;</button>
    </div>
    <div class="ai-widget-content">
      <div class="ai-widget-prompt-area">
          <textarea id="ai-prompt-input" rows="2" placeholder="Explain this, summarize it, or ask a question..."></textarea>
          <button id="send-prompt-btn" title="Ask AI">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
      </div>
    </div>
    <div id="ai-response-area" class="ai-response-area" style="display: none;">
      <div class="response-content"></div>
      <div class="response-actions">
        <button id="read-more-btn" class="widget-action-btn">Read More</button>
        <button id="continue-chat-btn" class="widget-action-btn">Continue Chat</button>
      </div>
    </div>
    <div class="loading" id="loading" style="display: none;">
      <div class="spinner"></div>
    </div>
  `;

  // Position the widget near the selected text.
  widget.style.left = Math.min(x, window.innerWidth - 350) + 'px';
  widget.style.top = y + 'px';

  document.body.appendChild(widget);
  currentWidget = widget;

  // Make the widget draggable and set up its event listeners.
  makeDraggable(widget, widget.querySelector('.ai-widget-header'));
  setupWidgetEvents(selectedText);

  // Auto-focus on the input field.
  widget.querySelector('#ai-prompt-input').focus();
}

/**
 * Sends the initial prompt to the AI.
 * @param {string} selectedText The text the user originally selected.
 */
async function sendPrompt(selectedText) {
  const promptInput = document.getElementById('ai-prompt-input');
  // If the user input is empty, default to "Explain this".
  const userPrompt = promptInput.value.trim() || 'Explain this';

  showLoading(true);

  try {
    const response = await callAI(userPrompt, selectedText);
    
    // Clear previous history and start a new conversation thread.
    conversationHistory = [{
      role: 'user',
      content: `Context: "${selectedText}"\n\nQuestion: "${userPrompt}"`
    }, {
      role: 'assistant',
      content: response
    }];
    
    showResponse(response);

  } catch (error) {
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

/**
 * Displays the AI's response in the widget.
 * @param {string} response The full text of the AI's response.
 */
function showResponse(response) {
  const responseArea = document.getElementById('ai-response-area');
  const contentDiv = responseArea.querySelector('.response-content');
  const readMoreBtn = document.getElementById('read-more-btn');

  const maxLength = 180; // Max characters before "Read More" appears.
  const isTruncated = response.length > maxLength;

  contentDiv.textContent = isTruncated ? response.substring(0, maxLength) + '...' : response;
  responseArea.dataset.fullResponse = response; // Store the full response.

  // Show the "Read More" button only if the text is truncated.
  readMoreBtn.style.display = isTruncated ? 'inline-block' : 'none';
  
  // Animate the appearance of the response area.
  responseArea.style.display = 'block';
  currentWidget.classList.add('expanded');
}


/**
 * Opens a dedicated chat window on the side of the screen.
 */
function openChatWindow() {
  if (currentChatWindow) {
    currentChatWindow.focus();
    return;
  }

  const chatWindow = document.createElement('div');
  chatWindow.id = 'ai-chat-window';
  chatWindow.innerHTML = `
    <div class="chat-header" id="chat-header">
      <span>AI Chat</span>
      <div class="chat-controls">
        <button id="clear-chat-btn" title="Clear Conversation">Clear</button>
        <button id="close-chat-btn" title="Close Chat">&times;</button>
      </div>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-area">
      <textarea id="chat-input" placeholder="Ask a follow-up..." rows="1"></textarea>
      <button id="send-chat-btn" title="Send Message">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  `;

  document.body.appendChild(chatWindow);
  currentChatWindow = chatWindow;

  loadChatHistory();
  setupChatEvents();
  makeDraggable(chatWindow, chatWindow.querySelector('.chat-header'));

  // Remove the initial widget as the chat window is now active.
  removeWidget();
}

/**
 * Sends a follow-up message from the chat window, maintaining conversation context.
 */
async function sendChatMessage() {
  const chatInput = document.getElementById('chat-input');
  const message = chatInput.value.trim();

  if (!message) return;

  addChatMessage(message, 'user');
  chatInput.value = '';
  chatInput.style.height = 'auto'; // Reset height

  const typingIndicator = addChatMessage('...', 'ai typing');

  try {
    // Add user message to history before making the API call.
    conversationHistory.push({ role: 'user', content: message });
    
    // Call AI with the entire conversation history for context.
    const responseText = await callAI(message, '', conversationHistory);
    
    // Update the typing indicator with the actual response.
    typingIndicator.classList.remove('typing');
    typingIndicator.querySelector('.message-content').textContent = responseText;
    
    // Add AI response to history.
    conversationHistory.push({ role: 'assistant', content: responseText });

  } catch (error) {
    typingIndicator.remove();
    addChatMessage(`Error: ${error.message}`, 'error');
  }
}


// --- Event Setup ---

/**
 * Sets up event listeners for the initial AI widget.
 * @param {string} selectedText The text the user originally selected.
 */
function setupWidgetEvents(selectedText) {
  const closeBtn = currentWidget.querySelector('.widget-close-btn');
  const sendBtn = currentWidget.querySelector('#send-prompt-btn');
  const promptInput = currentWidget.querySelector('#ai-prompt-input');
  const readMoreBtn = currentWidget.querySelector('#read-more-btn');
  const continueBtn = currentWidget.querySelector('#continue-chat-btn');

  closeBtn.addEventListener('click', removeWidget);
  sendBtn.addEventListener('click', () => sendPrompt(selectedText));
  continueBtn.addEventListener('click', openChatWindow);
  
  // Add listener to expand the content area when "Read More" is clicked.
  readMoreBtn.addEventListener('click', () => {
      const responseArea = document.getElementById('ai-response-area');
      const contentDiv = responseArea.querySelector('.response-content');
      contentDiv.textContent = responseArea.dataset.fullResponse;
      readMoreBtn.style.display = 'none'; // Hide button after expanding.
  });

  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt(selectedText);
    }
  });
  
  // Close the widget if the user clicks outside of it.
  document.addEventListener('click', handleOutsideClick, true);
}


/**
 * Sets up event listeners for the chat window.
 */
function setupChatEvents() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-chat-btn');
    const closeBtn = document.getElementById('close-chat-btn');
    const clearBtn = document.getElementById('clear-chat-btn');

    sendBtn.addEventListener('click', sendChatMessage);
    closeBtn.addEventListener('click', removeChatWindow);
    
    // Clear conversation history and UI.
    clearBtn.addEventListener('click', () => {
        document.getElementById('chat-messages').innerHTML = '';
        conversationHistory = [];
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
    
    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    });
}


// --- UI & Utility Functions ---

/**
 * Calls the background script to interact with the AI API.
 * @param {string} prompt The user's prompt.
 * @param {string} selectedText The selected text context.
 * @param {Array} history The conversation history for context.
 * @returns {Promise<string>} A promise that resolves with the AI's response.
 */
function callAI(prompt, selectedText = '', history = []) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'callAI',
            prompt,
            selectedText,
            conversationHistory: history,
        }, (response) => {
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }
            if (response.success) {
                resolve(response.response);
            } else {
                reject(new Error(response.error));
            }
        });
    });
}

/**
 * Populates the chat window with the current conversation history.
 */
function loadChatHistory() {
  const messagesDiv = document.getElementById('chat-messages');
  messagesDiv.innerHTML = ''; // Clear existing messages
  
  // The first message in the history is a combined context/question, so we need to parse it.
  if (conversationHistory.length > 0) {
      const firstUserMessage = conversationHistory[0].content;
      const match = firstUserMessage.match(/Context: "([^"]+)"\n\nQuestion: "([^"]+)"/);
      if(match) {
          addChatMessage(`About "${match[1]}": ${match[2]}`, 'user');
      }

      const firstAiResponse = conversationHistory[1].content;
      addChatMessage(firstAiResponse, 'ai');

      // Add the rest of the conversation
      for(let i = 2; i < conversationHistory.length; i++) {
          addChatMessage(conversationHistory[i].content, conversationHistory[i].role);
      }
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/**
 * Adds a new message to the chat display.
 * @param {string} content The text content of the message.
 * @param {string} sender The sender role ('user', 'ai', 'error', 'ai typing').
 * @returns {HTMLElement} The created message element.
 */
function addChatMessage(content, sender) {
  const messagesDiv = document.getElementById('chat-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${sender}`;
  messageDiv.innerHTML = `<div class="message-content">${content.replace(/\n/g, '<br>')}</div>`;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  return messageDiv;
}


/**
 * Makes a UI element draggable by its header.
 * @param {HTMLElement} element The element to make draggable.
 * @param {HTMLElement} header The header element that initiates the drag.
 */
function makeDraggable(element, header) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  header.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function showLoading(show) {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = show ? 'flex' : 'none';
  const sendBtn = document.getElementById('send-prompt-btn');
  if (sendBtn) sendBtn.disabled = show;
}

function showError(message) {
  const responseArea = document.getElementById('ai-response-area');
  if (!responseArea) return;
  const contentDiv = responseArea.querySelector('.response-content');
  contentDiv.innerHTML = `<span class="error">Error: ${message}</span>`;
  responseArea.style.display = 'block';
}

function handleOutsideClick(event) {
    if (currentWidget && !currentWidget.contains(event.target)) {
        removeWidget();
    }
}

function removeWidget() {
  if (currentWidget) {
    currentWidget.remove();
    currentWidget = null;
    document.removeEventListener('click', handleOutsideClick, true);
  }
}

function removeChatWindow() {
    if(currentChatWindow) {
        currentChatWindow.remove();
        currentChatWindow = null;
    }
}


/**
 * Injects all the necessary CSS styles into the page's head.
 */
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --ai-bg-dark: #2a2a2e;
            --ai-bg-light: #3a3a3e;
            --ai-text-primary: #f0f0f0;
            --ai-text-secondary: #a0a0a0;
            --ai-accent-orange: #ff9900;
            --ai-accent-orange-hover: #ffad33;
            --ai-border-color: #4a4a4e;
        }

        #ai-assistant-widget {
            position: fixed;
            z-index: 999999;
            background-color: var(--ai-bg-dark);
            color: var(--ai-text-primary);
            border: 1px solid var(--ai-border-color);
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            width: 340px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            overflow: hidden;
            transition: height 0.3s ease;
        }

        .ai-widget-header {
            background-color: var(--ai-bg-light);
            padding: 8px 12px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--ai-border-color);
            user-select: none;
        }

        .ai-widget-header span {
            font-weight: 600;
        }

        .widget-close-btn {
            background: none;
            border: none;
            color: var(--ai-text-secondary);
            font-size: 20px;
            cursor: pointer;
            padding: 0 4px;
        }
        .widget-close-btn:hover {
            color: var(--ai-text-primary);
        }

        .ai-widget-content {
            padding: 12px;
        }

        .ai-widget-prompt-area {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        #ai-prompt-input {
            flex-grow: 1;
            background-color: var(--ai-bg-light);
            color: var(--ai-text-primary);
            border: 1px solid var(--ai-border-color);
            border-radius: 8px;
            padding: 8px 10px;
            font-family: inherit;
            resize: none;
        }
        #ai-prompt-input::placeholder {
            color: var(--ai-text-secondary);
        }

        #send-prompt-btn {
            background-color: var(--ai-accent-orange);
            border: none;
            border-radius: 8px;
            padding: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            transition: background-color 0.2s ease;
        }
        #send-prompt-btn:hover {
            background-color: var(--ai-accent-orange-hover);
        }
        #send-prompt-btn:disabled {
            background-color: #555;
            cursor: not-allowed;
        }
        
        .ai-response-area {
            padding: 0 12px 12px 12px;
            border-top: 1px solid var(--ai-border-color);
            margin-top: 10px;
        }

        .response-content {
            margin-top: 10px;
            max-height: 100px;
            overflow: hidden;
            transition: max-height 0.3s ease;
            line-height: 1.5;
        }

        .widget-action-btn {
            background-color: transparent;
            color: var(--ai-accent-orange);
            border: 1px solid var(--ai-accent-orange);
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 12px;
            margin-right: 8px;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        .widget-action-btn:hover {
            background-color: var(--ai-accent-orange);
            color: white;
        }
        
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid var(--ai-accent-orange);
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Chat Window Styles */
        #ai-chat-window {
            position: fixed;
            z-index: 999999;
            right: 20px;
            top: 20px;
            width: 400px;
            height: 600px;
            max-height: 80vh;
            background-color: var(--ai-bg-dark);
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            display: flex;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .chat-header {
            background-color: var(--ai-bg-light);
            color: var(--ai-text-primary);
            padding: 10px 15px;
            border-bottom: 1px solid var(--ai-border-color);
            border-radius: 12px 12px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            user-select: none;
        }
        .chat-header span { font-weight: 600; font-size: 16px; }

        .chat-controls button {
            background: none;
            border: none;
            color: var(--ai-text-secondary);
            font-size: 18px;
            cursor: pointer;
            margin-left: 10px;
        }
        #clear-chat-btn {
            font-size: 13px;
            color: var(--ai-accent-orange);
            font-weight: 500;
        }
        #clear-chat-btn:hover, .chat-controls button:hover {
            color: white;
        }
        
        .chat-messages {
            flex-grow: 1;
            padding: 15px;
            overflow-y: auto;
            color: var(--ai-text-primary);
        }

        .chat-message {
            margin-bottom: 12px;
            display: flex;
            flex-direction: column;
        }
        .chat-message.user { align-items: flex-end; }
        .chat-message.ai, .chat-message.error, .chat-message.typing { align-items: flex-start; }

        .message-content {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 18px;
            line-height: 1.5;
            font-size: 15px;
        }
        .chat-message.user .message-content {
            background-color: var(--ai-accent-orange);
            color: white;
            border-bottom-right-radius: 4px;
        }
        .chat-message.ai .message-content {
            background-color: var(--ai-bg-light);
            color: var(--ai-text-primary);
            border-bottom-left-radius: 4px;
        }
        .chat-message.error .message-content {
            background-color: #581d1d;
            color: #ffb8b8;
        }
        .chat-message.typing .message-content {
            font-style: italic;
            color: var(--ai-text-secondary);
        }

        .chat-input-area {
            border-top: 1px solid var(--ai-border-color);
            padding: 10px 15px;
            display: flex;
            align-items: flex-end;
            gap: 10px;
        }
        #chat-input {
            flex-grow: 1;
            background-color: var(--ai-bg-light);
            border: 1px solid var(--ai-border-color);
            border-radius: 18px;
            padding: 10px 15px;
            color: var(--ai-text-primary);
            font-size: 15px;
            resize: none;
            max-height: 120px;
            overflow-y: auto;
        }
        #send-chat-btn {
            background-color: var(--ai-accent-orange);
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s ease;
        }
        #send-chat-btn:hover { background-color: var(--ai-accent-orange-hover); }

    `;
    document.head.appendChild(style);
}