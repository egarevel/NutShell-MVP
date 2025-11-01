/**
 * Chat View - Interactive Q&A Interface
 */

export class ChatView {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks || {};
    this.messages = [];
    this.isWaiting = false;
    
    this.render();
    this.setupEventListeners();
  }
  
  /**
   * Render chat UI
   */
  render() {
    this.container.innerHTML = `
      <div class="chat-container">
        <!-- Header -->
        <div class="chat-header">
          <button class="back-btn" id="chatBackBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Back
          </button>
          <div class="chat-header-title">
            <h2>Ask Questions</h2>
            <div class="multi-page-indicator hidden" id="multiPageIndicator">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 11H15M12 8V14M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span id="multiPageCount">0 pages</span>
            </div>
          </div>
          <div class="chat-header-actions">
            <button class="icon-btn" id="newChatBtn" title="New Chat">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="icon-btn" id="clearChatBtn" title="Clear Chat">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 6H5H21M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Session Recap Badge (hidden by default) -->
        <div class="session-recap-badge hidden" id="sessionRecapBadge">
          <div class="recap-badge-icon">💭</div>
          <div class="recap-badge-content">
            <div class="recap-badge-title">Welcome back! You were away for <span id="recapInactiveTime"></span></div>
            <div class="recap-badge-hint">Tap to see what you discussed</div>
          </div>
          <button class="recap-badge-close" id="recapBadgeClose" title="Dismiss">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        
        <!-- Messages -->
        <div class="chat-messages" id="chatMessages">
          <div class="chat-welcome">
            <div class="welcome-icon">💬</div>
            <h3>Ask me anything about this page</h3>
            <p>I'll search through the content and provide accurate answers with citations.</p>
          </div>
        </div>
        
        <!-- Input -->
        <div class="chat-input-container">
          <!-- @mention autocomplete dropdown -->
          <div class="mention-dropdown hidden" id="mentionDropdown">
            <div class="mention-dropdown-header">Select a tab to mention</div>
            <div class="mention-dropdown-list" id="mentionDropdownList">
              <!-- Dynamically populated -->
            </div>
          </div>
          
          <div class="chat-input-wrapper">
            <div 
              id="chatInput" 
              class="chat-input" 
              contenteditable="true"
              data-placeholder="Ask a question... (Type @ to mention other tabs)"
              role="textbox"
              aria-multiline="true"
            ></div>
            <button class="send-btn" id="sendBtn" disabled title="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 8L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <div class="chat-hint">
            Press Enter to send, Shift+Enter for new line · Type @ to mention tabs
          </div>
        </div>
        
        <!-- Session Recap Modal (hidden by default) -->
        <div class="session-recap-modal hidden" id="sessionRecapModal">
          <div class="recap-modal-overlay"></div>
          <div class="recap-modal-content">
            <div class="recap-modal-header">
              <h2>📖 Session Recap</h2>
              <button class="icon-btn" id="recapModalClose" title="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="recap-modal-body" id="recapModalBody">
              <!-- Content will be dynamically injected -->
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Get elements
    this.elements = {
      messages: this.container.querySelector('#chatMessages'),
      input: this.container.querySelector('#chatInput'),
      sendBtn: this.container.querySelector('#sendBtn'),
      backBtn: this.container.querySelector('#chatBackBtn'),
      newChatBtn: this.container.querySelector('#newChatBtn'),
      clearBtn: this.container.querySelector('#clearChatBtn'),
      multiPageIndicator: this.container.querySelector('#multiPageIndicator'),
      multiPageCount: this.container.querySelector('#multiPageCount'),
      
      // @mention elements
      mentionDropdown: this.container.querySelector('#mentionDropdown'),
      mentionDropdownList: this.container.querySelector('#mentionDropdownList'),
      
      // Session Recap elements
      recapBadge: this.container.querySelector('#sessionRecapBadge'),
      recapBadgeClose: this.container.querySelector('#recapBadgeClose'),
      recapInactiveTime: this.container.querySelector('#recapInactiveTime'),
      recapModal: this.container.querySelector('#sessionRecapModal'),
      recapModalClose: this.container.querySelector('#recapModalClose'),
      recapModalBody: this.container.querySelector('#recapModalBody')
    };
    
    // Multi-page state
    this.isMultiPage = false;
    this.streamingMessageId = null;
    
    // @mention state
    this.mentionState = {
      isOpen: false,
      availableTabs: [],
      selectedIndex: 0,
      mentionStartPos: -1,
      mentionedTabs: [], // { tabId, title, domain }
      savedRange: null, // Store range when dropdown opens
      savedTextNode: null, // Store text node containing @
      savedCursorOffset: -1 // Store cursor offset in text node
    };
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Send button
    this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
    
    // Enter to send
    this.elements.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // Input event listener (for contenteditable)
    this.elements.input.addEventListener('input', (e) => {
      // Enable/disable send button
      const hasText = this.getInputText().trim().length > 0;
      this.elements.sendBtn.disabled = !hasText || this.isWaiting;
      
      // Handle @mention
      this.handleMentionInput();
    });
    
    // Handle arrow keys for mention dropdown
    this.elements.input.addEventListener('keydown', (e) => {
      if (this.mentionState.isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectNextMention();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectPreviousMention();
        } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          if (this.mentionState.availableTabs.length > 0) {
            e.preventDefault();
            this.insertMention();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeMentionDropdown();
        }
      }
    });
    
    // Click outside to close mention dropdown
    document.addEventListener('click', (e) => {
      if (this.mentionState.isOpen && 
          !this.elements.mentionDropdown.contains(e.target) && 
          e.target !== this.elements.input) {
        this.closeMentionDropdown();
      }
    });
    
    // Back button
    this.elements.backBtn.addEventListener('click', () => {
      if (this.callbacks.onBack) {
        this.callbacks.onBack();
      }
    });
    
    // New chat button
    this.elements.newChatBtn.addEventListener('click', () => {
      if (this.callbacks.onNewChat) {
        this.callbacks.onNewChat();
      }
    });
    
    // Clear chat
    this.elements.clearBtn.addEventListener('click', () => {
      if (confirm('Clear all messages?')) {
        this.clearChat();
      }
    });
    
    // Session Recap Badge
    this.elements.recapBadge.addEventListener('click', (e) => {
      if (!e.target.closest('.recap-badge-close')) {
        this.showRecapModal();
      }
    });
    
    this.elements.recapBadgeClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideRecapBadge();
    });
    
    // Session Recap Modal
    this.elements.recapModalClose.addEventListener('click', () => {
      this.hideRecapModal();
    });
    
    // Click overlay to close
    this.elements.recapModal.querySelector('.recap-modal-overlay').addEventListener('click', () => {
      this.hideRecapModal();
    });
  }
  
  /**
   * Send message
   */
  sendMessage() {
    const question = this.getInputText().trim();
    
    if (!question || this.isWaiting) {
      return;
    }
    
    // Get mentions from chips in input
    const mentions = this.getMentionsFromInput();
    
    // Add user message
    this.addMessage('user', question, { mentions });
    
    // Clear input and mentioned tabs
    this.elements.input.innerHTML = '';
    this.elements.sendBtn.disabled = true;
    this.mentionState.mentionedTabs = []; // Reset for next message
    
    // Set waiting state
    this.isWaiting = true;
    this.addThinkingMessage();
    
    // Callback with mentions
    if (this.callbacks.onSendMessage) {
      this.callbacks.onSendMessage(question, mentions);
    }
  }
  
  /**
   * Get text content from contenteditable input
   */
  getInputText() {
    const input = this.elements.input;
    let text = '';
    
    // Walk through all child nodes
    for (const node of input.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList.contains('mention-chip-input')) {
          text += node.textContent; // Add @domain
        } else {
          text += node.textContent;
        }
      }
    }
    
    return text;
  }
  
  /**
   * Get mentions from chips in input
   */
  getMentionsFromInput() {
    const chips = this.elements.input.querySelectorAll('.mention-chip-input');
    const mentions = [];
    
    chips.forEach(chip => {
      const tabId = parseInt(chip.dataset.tabId);
      const domain = chip.dataset.domain;
      
      // Find full tab info from mentionedTabs
      const tab = this.mentionState.mentionedTabs.find(t => t.tabId === tabId);
      
      if (tab) {
        mentions.push({
          text: `@${domain}`,
          tabId: tab.tabId,
          title: tab.title,
          fullTitle: tab.fullTitle,
          domain: tab.domain
        });
      }
    });
    
    return mentions;
  }
  
  /**
   * Add message to chat
   */
  addMessage(role, content, metadata = {}, autoScroll = true, skipArrayPush = false) {
    // Remove welcome message if exists
    const welcome = this.elements.messages.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }
    
    // Remove thinking message if exists
    const thinking = this.elements.messages.querySelector('.message-thinking');
    if (thinking) {
      thinking.remove();
    }
    
    const message = {
      role,
      content,
      metadata,
      timestamp: Date.now()
    };
    
    // Only push to array if not rendering from existing array
    if (!skipArrayPush) {
      this.messages.push(message);
    }
    
    // Create message element
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${role}`;
    
    if (role === 'user') {
      // Check if message has @mentions
      const mentions = metadata.mentions || [];
      let displayContent = this.escapeHTML(content);
      
      // Replace @mentions with chips
      if (mentions.length > 0) {
        mentions.forEach(mention => {
          const mentionRegex = new RegExp(`@${this.escapeRegex(mention.title)}`, 'g');
          displayContent = displayContent.replace(
            mentionRegex,
            `<span class="mention-chip"><span class="mention-chip-icon">📄</span>${this.escapeHTML(mention.title)}</span>`
          );
        });
      }
      
      messageEl.innerHTML = `
        <div class="message-content">
          <div class="message-text">${displayContent}</div>
          ${mentions.length > 0 ? `
            <div class="message-mentions-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Using context from ${mentions.length} other tab${mentions.length > 1 ? 's' : ''}
            </div>
          ` : ''}
        </div>
      `;
    } else {
      // Assistant message with citations
      const citations = metadata.citations || [];
      
      // Format content (handle markdown-like syntax)
      let formattedContent = this.escapeHTML(content);
      formattedContent = formattedContent.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      formattedContent = formattedContent.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      formattedContent = formattedContent.replace(/\n/g, '<br>');
      
      messageEl.innerHTML = `
        <div class="message-avatar">
          <img src="../assets/logo.png" alt="NutShell" class="assistant-logo">
        </div>
        <div class="message-content">
          <div class="message-text">${formattedContent}</div>
          ${citations.length > 0 ? `
            <div class="message-citations">
              <div class="citations-label">Sources:</div>
              <div class="citations-list">
                ${citations.map((cite, idx) => {
                  let pageLabel = '';
                  let tooltipText = 'Click to see this section';
                  let badgeClass = '';
                  
                  if (cite.isMentionedTab) {
                    // From a mentioned tab
                    pageLabel = ` (${this.escapeHTML(cite.mentionedTabDomain || cite.pageTitle)})`;
                    tooltipText = `From mentioned tab: ${cite.pageTitle}`;
                    badgeClass = 'citation-mentioned-tab';
                  } else if (!cite.isCurrentPage) {
                    // From a recent page (multi-page context)
                    pageLabel = ` (${this.escapeHTML(cite.pageTitle)})`;
                    tooltipText = `From: ${cite.pageTitle} - Click to see section`;
                    badgeClass = 'citation-other-page';
                  }
                  
                  return `
                    <button class="citation-badge ${badgeClass}" 
                            data-section-id="${cite.sectionId}" 
                            title="${tooltipText}">
                      ${idx + 1}. ${this.escapeHTML(cite.heading)}${pageLabel}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
          ${metadata.responseTime ? `
            <div class="message-meta">
              Answered in ${(metadata.responseTime / 1000).toFixed(1)}s
            </div>
          ` : ''}
        </div>
      `;
      
      // Add citation click listeners
      setTimeout(() => {
        messageEl.querySelectorAll('.citation-badge').forEach(badge => {
          badge.addEventListener('click', () => {
            const sectionId = badge.dataset.sectionId;
            if (this.callbacks.onCitationClick) {
              this.callbacks.onCitationClick(sectionId);
            }
          });
        });
      }, 0);
    }
    
    this.elements.messages.appendChild(messageEl);
    
    if (autoScroll) {
      this.scrollToBottom();
    }
    
    return messageEl;
  }
  
  /**
   * Add thinking/loading message
   */
  addThinkingMessage() {
    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'message message-assistant message-thinking';
    thinkingEl.innerHTML = `
      <div class="message-content">
        <div class="thinking-animation">
          <div class="thinking-dot"></div>
          <div class="thinking-dot"></div>
          <div class="thinking-dot"></div>
        </div>
        <div class="message-text thinking-text">Thinking...</div>
      </div>
    `;
    
    this.elements.messages.appendChild(thinkingEl);
    this.scrollToBottom();
  }
  
  /**
   * Update thinking message status
   */
  updateThinkingStatus(status) {
    const thinking = this.elements.messages.querySelector('.thinking-text');
    if (thinking) {
      thinking.textContent = status;
    }
  }
  
  /**
   * Start streaming response
   */
  startStreamingResponse(citations = []) {
    // Remove thinking message
    const thinking = this.elements.messages.querySelector('.message-thinking');
    if (thinking) {
      thinking.remove();
    }
    
    // Create streaming message with citations
    const streamingMsg = document.createElement('div');
    streamingMsg.className = 'message message-assistant message-streaming';
    
    // Store streaming message ID
    this.streamingMessageId = Date.now();
    streamingMsg.dataset.messageId = this.streamingMessageId;
    
    let citationsHTML = '';
    if (citations && citations.length > 0) {
      citationsHTML = '<div class="message-citations">';
      citations.forEach((citation, index) => {
        citationsHTML += `
          <span class="citation-badge" data-section-id="${citation.sectionId}">
            ${index + 1}. ${this.escapeHTML(citation.heading)}
          </span>
        `;
      });
      citationsHTML += '</div>';
    }
    
    streamingMsg.innerHTML = `
      <div class="message-content">
        <div class="message-text streaming-text"></div>
        ${citationsHTML}
      </div>
    `;
    
    this.elements.messages.appendChild(streamingMsg);
    this.scrollToBottom();
  }
  
  /**
   * Update streaming response (real-time text updates)
   */
  updateStreamingResponse(chunk) {
    // Find or create streaming message
    let streamingMsg = this.elements.messages.querySelector('.message-streaming');
    
    if (!streamingMsg) {
      // Remove thinking message
      const thinking = this.elements.messages.querySelector('.message-thinking');
      if (thinking) {
        thinking.remove();
      }
      
      // Create streaming message
      streamingMsg = document.createElement('div');
      streamingMsg.className = 'message message-assistant message-streaming';
      
      // Store streaming message ID
      this.streamingMessageId = Date.now();
      streamingMsg.dataset.messageId = this.streamingMessageId;
      
      streamingMsg.innerHTML = `
        <div class="message-content">
          <div class="message-text streaming-text"></div>
        </div>
      `;
      this.elements.messages.appendChild(streamingMsg);
      this.scrollToBottom();
    }
    
    // Update the streaming text (chunk contains full text so far)
    const streamingText = streamingMsg.querySelector('.streaming-text');
    if (streamingText) {
      // Format content (handle markdown-like syntax)
      let formattedContent = this.escapeHTML(chunk);
      formattedContent = formattedContent.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      formattedContent = formattedContent.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      
      // Convert newlines to <br>, but collapse multiple consecutive newlines
      formattedContent = formattedContent.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
      formattedContent = formattedContent.replace(/\n/g, '<br>');
      
      // Update with cursor
      streamingText.innerHTML = formattedContent + ' <span class="cursor-blink">▊</span>';
    }
    
    // Auto-scroll during streaming (smooth UX)
    // Use requestAnimationFrame for better performance during rapid updates
    if (!this._scrollQueued) {
      this._scrollQueued = true;
      requestAnimationFrame(() => {
        const messagesEl = this.elements.messages;
        const isNearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 150;
        if (isNearBottom) {
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        this._scrollQueued = false;
      });
    }
  }
  
  /**
   * Finalize streaming response (convert to regular message)
   */
  finalizeStreamingResponse(answer, metadata = {}) {
    this.isWaiting = false;
    this.elements.sendBtn.disabled = this.getInputText().trim().length === 0;
    
    // Remove streaming message
    const streamingMsg = this.elements.messages.querySelector('.message-streaming');
    if (streamingMsg) {
      streamingMsg.remove();
    }
    
    // Clear streaming state
    this.streamingMessageId = null;
    
    // Add as regular message with citations
    this.addMessage('assistant', answer, metadata);
  }
  
  /**
   * Add assistant response
   */
  addResponse(answer, metadata = {}) {
    this.isWaiting = false;
    this.elements.sendBtn.disabled = this.getInputText().trim().length === 0;
    
    // Remove streaming message if exists
    const streamingMsg = this.elements.messages.querySelector('.message-streaming');
    if (streamingMsg) {
      streamingMsg.remove();
    }
    
    this.addMessage('assistant', answer, metadata);
  }
  
  /**
   * Show error
   */
  showError(message) {
    this.isWaiting = false;
    this.elements.sendBtn.disabled = this.getInputText().trim().length === 0;
    
    // Remove thinking message
    const thinking = this.elements.messages.querySelector('.message-thinking');
    if (thinking) {
      thinking.remove();
    }
    
    const errorEl = document.createElement('div');
    errorEl.className = 'message message-error';
    errorEl.innerHTML = `
      <div class="message-content">
        <div class="error-icon">⚠️</div>
        <div class="message-text">${this.escapeHTML(message)}</div>
      </div>
    `;
    
    this.elements.messages.appendChild(errorEl);
    this.scrollToBottom();
  }
  
  /**
   * Clear chat
   */
  clearChat() {
    this.messages = [];
    this.elements.messages.innerHTML = `
      <div class="chat-welcome">
        <div class="welcome-icon">💬</div>
        <h3>Ask me anything about this page</h3>
        <p>I'll search through the content and provide accurate answers with citations.</p>
      </div>
    `;
    
    if (this.callbacks.onClear) {
      this.callbacks.onClear();
    }
  }
  
  /**
   * Alias for clearChat (for compatibility)
   */
  clear() {
    this.clearChat();
  }
  
  /**
   * Add navigation message (breadcrumb) with optional conversation summary
   */
  addNavigationMessage(oldUrl, newUrl, newTitle, conversationSummary = null) {
    // Remove welcome if present
    const welcome = this.elements.messages.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }
    
    // Get previous page title (from oldUrl)
    let oldPageTitle = 'previous page';
    try {
      if (oldUrl) {
        const oldHostname = new URL(oldUrl).hostname.replace('www.', '');
        oldPageTitle = oldHostname;
      }
    } catch (e) {
      oldPageTitle = 'previous page';
    }
    
    const navEl = document.createElement('div');
    navEl.className = 'navigation-message';
    
    // Build summary HTML if available
    const summaryHTML = conversationSummary ? `
      <div class="nav-summary">
        <div class="nav-summary-label">📝 Previous chat on ${this.escapeHTML(oldPageTitle)}:</div>
        <div class="nav-summary-text">${this.escapeHTML(conversationSummary)}</div>
      </div>
    ` : '';
    
    navEl.innerHTML = `
      <div class="nav-icon">🔗</div>
      <div class="nav-content">
        <div class="nav-label">Navigated to new page</div>
        <div class="nav-title">${this.escapeHTML(newTitle || new URL(newUrl).hostname)}</div>
        ${summaryHTML}
        <div class="nav-hint">Previous conversation kept. New questions will use this page's content.</div>
      </div>
    `;
    
    this.elements.messages.appendChild(navEl);
    this.scrollToBottom();
  }
  
  /**
   * Add system message
   */
  addSystemMessage(text) {
    const welcome = this.elements.messages.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }
    
    const sysEl = document.createElement('div');
    sysEl.className = 'system-message';
    sysEl.innerHTML = `
      <div class="system-icon">ℹ️</div>
      <div class="system-text">${this.escapeHTML(text)}</div>
    `;
    
    this.elements.messages.appendChild(sysEl);
    this.scrollToBottom();
  }
  
  /**
   * Render all messages (for restoring chat history)
   */
  renderAllMessages() {
    // Clear welcome
    const welcome = this.elements.messages.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }
    
    // Clear existing messages
    this.elements.messages.innerHTML = '';
    
    // Render each message
    this.messages.forEach(msg => {
      // skipArrayPush=true to prevent duplicating messages in array
      this.addMessage(msg.role, msg.content, msg.metadata, false, true);
    });
    
    // Scroll once at the end
    this.scrollToBottom();
  }
  
  /**
   * Clear all messages (for starting fresh chat)
   */
  clearMessages() {
    // Clear messages array
    this.messages = [];
    
    // Clear DOM
    this.elements.messages.innerHTML = '';
    
    // Show welcome message
    this.showWelcome();
    
    // Reset state
    this.isWaiting = false;
    this.streamingMessageId = null;
    
    // Hide multi-page indicator
    if (this.elements.multiPageIndicator) {
      this.elements.multiPageIndicator.classList.add('hidden');
    }
  }
  
  /**
   * Show welcome message
   */
  showWelcome() {
    const welcomeHTML = `
      <div class="chat-welcome">
        <div class="welcome-icon">💬</div>
        <h3>Ready to answer your questions</h3>
        <p>Ask anything about this page. Use @ to mention other tabs for comparison.</p>
      </div>
    `;
    this.elements.messages.innerHTML = welcomeHTML;
  }
  
  /**
   * Load conversation history
   */
  loadHistory(history) {
    // Clear and re-render
    const welcome = this.elements.messages.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }
    
    // Clear existing messages
    this.messages = [];
    this.elements.messages.innerHTML = '';
    
    // Add each message from history
    history.forEach(msg => {
      this.addMessage(msg.role, msg.content, msg.metadata);
    });
  }
  
  /**
   * Scroll to bottom
   */
  scrollToBottom() {
    // Use requestAnimationFrame for smoother scrolling
    requestAnimationFrame(() => {
      if (this.elements.messages) {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
        
        // Double-check after a brief delay (for images/content that might load)
        setTimeout(() => {
          if (this.elements.messages) {
            this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
          }
        }, 50);
      }
    });
  }
  
  /**
   * Show session recap badge
   * @param {number} inactiveMinutes - Minutes of inactivity
   */
  showRecapBadge(inactiveMinutes) {
    if (!this.elements.recapBadge || !this.elements.recapInactiveTime) return;
    
    // Format time
    let timeText = '';
    if (inactiveMinutes < 60) {
      timeText = `${Math.floor(inactiveMinutes)} min`;
    } else {
      const hours = Math.floor(inactiveMinutes / 60);
      timeText = `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    
    this.elements.recapInactiveTime.textContent = timeText;
    this.elements.recapBadge.classList.remove('hidden');
    
    // console.log('[ChatView] Session recap badge shown:', timeText);
  }
  
  /**
   * Hide session recap badge
   */
  hideRecapBadge() {
    if (!this.elements.recapBadge) return;
    this.elements.recapBadge.classList.add('hidden');
  }
  
  /**
   * Show session recap modal
   */
  showRecapModal() {
    if (!this.elements.recapModal) return;
    
    // Trigger callback to load recap data
    if (this.callbacks.onShowRecap) {
      this.callbacks.onShowRecap();
    }
    
    this.elements.recapModal.classList.remove('hidden');
    // console.log('[ChatView] Session recap modal shown');
  }
  
  /**
   * Hide session recap modal
   */
  hideRecapModal() {
    if (!this.elements.recapModal) return;
    this.elements.recapModal.classList.add('hidden');
  }
  
  /**
   * Update recap modal content
   * @param {Object} data - Recap data {summary, timeline, actions}
   */
  updateRecapContent(data) {
    if (!this.elements.recapModalBody) return;
    
    const { inactiveMinutes, aiSummary, timeline, questionCounts } = data;
    
    // Format inactive time
    let inactiveTime = '';
    if (inactiveMinutes < 60) {
      inactiveTime = `${Math.floor(inactiveMinutes)} minute${Math.floor(inactiveMinutes) !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(inactiveMinutes / 60);
      const mins = Math.floor(inactiveMinutes % 60);
      inactiveTime = `${hours} hour${hours > 1 ? 's' : ''}`;
      if (mins > 0) {
        inactiveTime += ` and ${mins} minute${mins !== 1 ? 's' : ''}`;
      }
    }
    
    // Build timeline HTML
    const timelineHTML = timeline && timeline.length > 0 ? `
      <div class="recap-timeline">
        <h3>📍 Your Journey:</h3>
        <div class="timeline-list">
          ${timeline.map((page, idx) => {
            const domain = this.getDomain(page.url);
            const isCurrent = idx === timeline.length - 1;
            const questions = questionCounts[page.url] || 0;
            
            return `
              <div class="timeline-item ${isCurrent ? 'timeline-current' : ''}">
                <div class="timeline-marker">${idx + 1}</div>
                <div class="timeline-content">
                  <div class="timeline-title">${this.escapeHTML(domain)}</div>
                  <div class="timeline-meta">${questions} question${questions !== 1 ? 's' : ''}${isCurrent ? ' (current)' : ''}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '';
    
    this.elements.recapModalBody.innerHTML = `
      <div class="recap-time">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 8V12L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
        </svg>
        <span>You were here ${inactiveTime} ago</span>
      </div>
      
      <div class="recap-summary">
        <h3>🤖 What Happened:</h3>
        <div class="recap-summary-content" id="recapSummaryContent">
          ${aiSummary ? this.escapeHTML(aiSummary) : '<div class="recap-loading">Generating summary...</div>'}
        </div>
      </div>
      
      ${timelineHTML}
      
      <div class="recap-actions">
        <button class="primary-btn" id="recapContinueBtn">Continue Chat</button>
        <button class="secondary-btn" id="recapNewChatBtn">Start Fresh</button>
        <button class="secondary-btn" id="recapHistoryBtn">View Full History</button>
      </div>
    `;
    
    // Add event listeners for action buttons
    this.setupRecapActions();
  }
  
  /**
   * Setup event listeners for recap action buttons
   */
  setupRecapActions() {
    const continueBtn = this.elements.recapModalBody.querySelector('#recapContinueBtn');
    const newChatBtn = this.elements.recapModalBody.querySelector('#recapNewChatBtn');
    const historyBtn = this.elements.recapModalBody.querySelector('#recapHistoryBtn');
    
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        this.hideRecapModal();
        this.hideRecapBadge();
      });
    }
    
    if (newChatBtn) {
      newChatBtn.addEventListener('click', () => {
        this.hideRecapModal();
        this.hideRecapBadge();
        if (this.callbacks.onNewChat) {
          this.callbacks.onNewChat();
        }
      });
    }
    
    if (historyBtn) {
      historyBtn.addEventListener('click', () => {
        this.hideRecapModal();
        if (this.callbacks.onShowHistory) {
          this.callbacks.onShowHistory();
        }
      });
    }
  }
  
  /**
   * Update streaming recap summary
   * @param {string} chunk - Streaming text chunk
   */
  updateRecapSummary(chunk) {
    const summaryEl = this.elements.recapModalBody?.querySelector('#recapSummaryContent');
    if (summaryEl) {
      summaryEl.innerHTML = this.escapeHTML(chunk);
    }
  }
  
  /**
   * Get domain from URL
   */
  getDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (e) {
      return url;
    }
  }
  
  /**
   * Escape HTML
   */
  escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Set multi-page mode (show indicator)
   * @param {number} pageCount - Number of pages in multi-page session
   */
  setMultiPageMode(pageCount) {
    this.isMultiPage = true;
    this.elements.multiPageCount.textContent = `${pageCount} pages`;
    this.elements.multiPageIndicator.classList.remove('hidden');
    // console.log('[ChatView] Multi-page mode enabled:', pageCount, 'pages');
  }
  
  /**
   * Disable multi-page mode
   */
  disableMultiPageMode() {
    this.isMultiPage = false;
    this.elements.multiPageIndicator.classList.add('hidden');
    // console.log('[ChatView] Multi-page mode disabled');
  }
  
  /**
   * Append streaming chunk to the current assistant message
   * @param {string} chunk - Streaming text chunk
   */
  appendStreamingChunk(chunk) {
    // console.log('[ChatView] Appending streaming chunk:', chunk.length, 'chars');
    
    // Find or create the streaming message
    let messageEl;
    
    if (this.streamingMessageId) {
      messageEl = this.elements.messages.querySelector(`[data-message-id="${this.streamingMessageId}"]`);
    }
    
    if (!messageEl) {
      // Create new assistant message for streaming
      this.streamingMessageId = `msg_${Date.now()}`;
      
      // Remove thinking message if exists
      const thinkingMsg = this.elements.messages.querySelector('.message-thinking');
      if (thinkingMsg) {
        thinkingMsg.remove();
      }
      
      messageEl = document.createElement('div');
      messageEl.className = 'message message-assistant';
      messageEl.dataset.messageId = this.streamingMessageId;
      messageEl.innerHTML = `
        <div class="message-avatar">
          <img src="../assets/logo.png" alt="NutShell" class="assistant-logo">
        </div>
        <div class="message-content">
          <div class="message-text"></div>
        </div>
      `;
      
      this.elements.messages.appendChild(messageEl);
    }
    
    // Update message content
    const contentEl = messageEl.querySelector('.message-text');
    if (contentEl) {
      contentEl.textContent = chunk;
      
      // Auto-scroll
      this.scrollToBottom();
    }
  }
  
  /**
   * Finalize streaming message (format with markdown)
   * @param {string} finalText - Final complete text
   */
  finalizeStreamingMessage(finalText) {
    if (!this.streamingMessageId) return;
    
    const messageEl = this.elements.messages.querySelector(`[data-message-id="${this.streamingMessageId}"]`);
    if (messageEl) {
      const contentEl = messageEl.querySelector('.message-text');
      if (contentEl) {
        // Format content (handle markdown-like syntax)
        let formatted = this.escapeHTML(finalText);
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/\n/g, '<br>');
        contentEl.innerHTML = formatted;
      }
    }
    
    // Clear streaming state
    this.streamingMessageId = null;
    this.isWaiting = false;
    
    // Re-enable input
    this.elements.sendBtn.disabled = this.getInputText().trim().length === 0;
    
    // console.log('[ChatView] Streaming message finalized');
  }
  
  /**
   * Handle @mention input detection (contenteditable)
   */
  async handleMentionInput() {
    const selection = window.getSelection();
    if (!selection.rangeCount) {
      this.closeMentionDropdown();
      return;
    }
    
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    
    // Only process if we're in a text node
    if (textNode.nodeType !== Node.TEXT_NODE) {
      this.closeMentionDropdown();
      return;
    }
    
    const text = textNode.textContent;
    const cursorPos = range.startOffset;
    
    // Find @ symbol before cursor
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === '@') {
        // Check if it's at start or after whitespace
        if (i === 0 || /\s/.test(text[i - 1])) {
          atPos = i;
          break;
        }
      } else if (/\s/.test(text[i])) {
        // Hit whitespace before finding @
        break;
      }
    }
    
    if (atPos !== -1) {
      // @ found, save cursor position and show dropdown
      this.mentionState.mentionStartPos = atPos;
      this.mentionState.savedTextNode = textNode;
      this.mentionState.savedCursorOffset = cursorPos;
      this.mentionState.savedRange = range.cloneRange();
      
      await this.showMentionDropdown();
    } else {
      // No @ found, close dropdown
      this.closeMentionDropdown();
    }
  }
  
  /**
   * Show @mention dropdown
   */
  async showMentionDropdown() {
    if (this.mentionState.isOpen) return;
    
    try {
      // Get available tabs from service worker
      const response = await chrome.runtime.sendMessage({
        type: 'GET_AVAILABLE_TABS',
        data: { currentTabId: await this.getCurrentTabId() }
      });
      
      if (response.success && response.tabs.length > 0) {
        this.mentionState.availableTabs = response.tabs;
        this.mentionState.selectedIndex = 0;
        this.mentionState.isOpen = true;
        
        this.renderMentionDropdown();
        this.elements.mentionDropdown.classList.remove('hidden');
      }
    } catch (error) {
      console.error('[ChatView] Failed to get available tabs:', error);
    }
  }
  
  /**
   * Render @mention dropdown
   */
  renderMentionDropdown() {
    const html = this.mentionState.availableTabs.map((tab, index) => `
      <div class="mention-item ${index === this.mentionState.selectedIndex ? 'selected' : ''}" 
           data-tab-id="${tab.tabId}" 
           data-index="${index}">
        <div class="mention-item-icon">📄</div>
        <div class="mention-item-content">
          <div class="mention-item-title">${this.escapeHTML(tab.title)}</div>
          <div class="mention-item-domain">${this.escapeHTML(tab.domain)}</div>
        </div>
        ${tab.hasSession ? '<div class="mention-item-badge">Active</div>' : ''}
      </div>
    `).join('');
    
    this.elements.mentionDropdownList.innerHTML = html;
    
    // Add click listeners
    this.elements.mentionDropdownList.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.mentionState.selectedIndex = index;
        this.insertMention();
      });
    });
  }
  
  /**
   * Select next mention in dropdown
   */
  selectNextMention() {
    this.mentionState.selectedIndex = 
      (this.mentionState.selectedIndex + 1) % this.mentionState.availableTabs.length;
    this.renderMentionDropdown();
  }
  
  /**
   * Select previous mention in dropdown
   */
  selectPreviousMention() {
    this.mentionState.selectedIndex = 
      (this.mentionState.selectedIndex - 1 + this.mentionState.availableTabs.length) % 
      this.mentionState.availableTabs.length;
    this.renderMentionDropdown();
  }
  
  /**
   * Insert selected mention into input
   */
  insertMention() {
    const selectedTab = this.mentionState.availableTabs[this.mentionState.selectedIndex];
    if (!selectedTab) return;
    
    // Use saved text node and cursor position
    const textNode = this.mentionState.savedTextNode;
    const atPos = this.mentionState.mentionStartPos;
    const cursorOffset = this.mentionState.savedCursorOffset;
    
    if (!textNode || atPos === -1) {
      console.warn('[ChatView] No saved position for mention insertion');
      this.closeMentionDropdown();
      return;
    }
    
    // Get current text from the saved node
    const text = textNode.textContent;
    
    // Remove @ and any text typed after it (up to saved cursor position)
    const beforeAt = text.substring(0, atPos);
    const afterCursor = text.substring(cursorOffset);
    textNode.textContent = beforeAt + afterCursor;
    
    // Create new range at the position where @ was
    const newRange = document.createRange();
    newRange.setStart(textNode, beforeAt.length);
    newRange.collapse(true);
    
    // Create mention chip element
    const chip = document.createElement('span');
    chip.className = 'mention-chip-input';
    chip.contentEditable = 'false';
    chip.dataset.tabId = selectedTab.tabId;
    chip.dataset.domain = selectedTab.domain;
    chip.textContent = `@${selectedTab.domain}`;
    
    // Insert chip at the position
    newRange.insertNode(chip);
    
    // Add space after chip
    const space = document.createTextNode(' ');
    if (chip.nextSibling) {
      chip.parentNode.insertBefore(space, chip.nextSibling);
    } else {
      chip.parentNode.appendChild(space);
    }
    
    // Move cursor after space
    const selection = window.getSelection();
    const finalRange = document.createRange();
    finalRange.setStartAfter(space);
    finalRange.collapse(true);
    
    selection.removeAllRanges();
    selection.addRange(finalRange);
    
    // Track mentioned tab (store full info for later use)
    this.mentionState.mentionedTabs.push({
      tabId: selectedTab.tabId,
      title: selectedTab.title,
      fullTitle: selectedTab.fullTitle,
      domain: selectedTab.domain
    });
    
    this.closeMentionDropdown();
    this.elements.input.focus();
  }
  
  /**
   * Find text node containing @ symbol
   */
  findTextNodeWithAt(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.includes('@')) {
        return node;
      }
    }
    return null;
  }
  
  /**
   * Close @mention dropdown
   */
  closeMentionDropdown() {
    this.mentionState.isOpen = false;
    this.mentionState.mentionStartPos = -1;
    this.mentionState.savedRange = null;
    this.mentionState.savedTextNode = null;
    this.mentionState.savedCursorOffset = -1;
    this.elements.mentionDropdown.classList.add('hidden');
  }
  
  /**
   * Parse @mentions from text
   */
  parseMentions(text) {
    const mentions = [];
    const regex = /@([^\s@]+)/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const mentionText = match[1];
      // Find matching tab from mentioned tabs by domain
      const tab = this.mentionState.mentionedTabs.find(t => 
        t.domain === mentionText || 
        t.domain.includes(mentionText) ||
        t.title === mentionText || 
        t.fullTitle.startsWith(mentionText)
      );
      
      if (tab) {
        mentions.push({
          text: match[0], // @domain
          tabId: tab.tabId,
          title: tab.title,
          fullTitle: tab.fullTitle,
          domain: tab.domain
        });
      }
    }
    
    return mentions;
  }
  
  /**
   * Get current tab ID
   */
  async getCurrentTabId() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id;
  }
  
  /**
   * Escape regex special characters
   */
  escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * Destroy view
   */
  destroy() {
    this.container.innerHTML = '';
  }
}

