/**
 * History View - View all past chat sessions
 */

export class HistoryView {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks || {};
    this.sessions = [];
    this.filteredSessions = [];
    this.serpSessions = [];
    this.filteredSerpSessions = [];
    this.researchSessions = [];
    this.filteredResearchSessions = [];
    this.currentTab = 'chats'; // 'chats', 'searches', or 'research'
    
    this.render();
    this.setupEventListeners();
  }
  
  /**
   * Render history UI
   */
  render() {
    this.container.innerHTML = `
      <div class="history-container">
        <!-- Header -->
        <div class="history-header">
          <button class="back-btn" id="historyBackBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Back
          </button>
          <h2>History</h2>
        </div>
        
        <!-- Tabs -->
        <div class="history-tabs">
          <button class="history-tab active" data-tab="chats" id="chatsTab">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2"/>
            </svg>
            Chats
          </button>
          <button class="history-tab" data-tab="searches" id="searchesTab">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
              <path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Search Analysis
          </button>
          <button class="history-tab" data-tab="research" id="researchTab">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Research Mode
          </button>
        </div>
        
        <!-- Search -->
        <div class="history-search">
          <div class="search-wrapper">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="search-icon">
              <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
              <path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <input 
              type="text" 
              id="historySearch" 
              class="search-input" 
              placeholder="Search..."
            />
          </div>
        </div>
        
        <!-- Sessions List -->
        <div class="history-content" id="historyContent">
          <div class="history-loading">
            <div class="loading-spinner"></div>
            <p>Loading chat history...</p>
          </div>
        </div>
        
        <!-- Empty State -->
        <div class="history-empty hidden" id="historyEmpty">
          <div class="empty-icon">💬</div>
          <h3>No conversations yet</h3>
          <p>Start chatting with pages to build your history</p>
        </div>
      </div>
    `;
    
    // Get elements
    this.elements = {
      backBtn: this.container.querySelector('#historyBackBtn'),
      search: this.container.querySelector('#historySearch'),
      content: this.container.querySelector('#historyContent'),
      empty: this.container.querySelector('#historyEmpty'),
      chatsTab: this.container.querySelector('#chatsTab'),
      searchesTab: this.container.querySelector('#searchesTab'),
      researchTab: this.container.querySelector('#researchTab')
    };
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Back button
    this.elements.backBtn.addEventListener('click', () => {
      if (this.callbacks.onBack) {
        this.callbacks.onBack();
      }
    });
    
    // Tab switching
    this.elements.chatsTab.addEventListener('click', () => {
      this.switchTab('chats');
    });
    
    this.elements.searchesTab.addEventListener('click', () => {
      this.switchTab('searches');
    });
    
    this.elements.researchTab.addEventListener('click', () => {
      this.switchTab('research');
    });
    
    // Search
    this.elements.search.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });
    
    // Session card clicks - use event delegation
    this.elements.content.addEventListener('click', (e) => {
      // Handle SERP action button clicks
      const serpActionBtn = e.target.closest('.serp-action-btn');
      if (serpActionBtn) {
        e.preventDefault();
        e.stopPropagation();
        
        // Check if it's a research action or SERP action
        if (serpActionBtn.dataset.entryId) {
          // Research action
          const entryId = serpActionBtn.dataset.entryId;
          const action = serpActionBtn.dataset.action;
          this.handleResearchAction(entryId, action);
        } else {
          // SERP action
          const sessionId = serpActionBtn.dataset.sessionId;
          const action = serpActionBtn.dataset.action;
          this.handleSerpAction(sessionId, action);
        }
        return;
      }
      
      // Handle SERP card clicks (view analysis)
      const serpCard = e.target.closest('.serp-card');
      if (serpCard) {
        // Check if it's a research card or SERP card
        if (serpCard.dataset.entryId) {
          // Research card
          const entryId = serpCard.dataset.entryId;
          this.handleResearchAction(entryId, 'view');
        } else {
          // SERP card
          const sessionId = serpCard.dataset.sessionId;
          this.handleSerpAction(sessionId, 'view');
        }
        return;
      }
      
      // Handle delete button clicks (now outside the card)
      const deleteBtn = e.target.closest('.session-delete-btn');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const sessionId = deleteBtn.dataset.sessionId;
        this.handleDelete(sessionId);
        return;
      }
      
      // Handle session card clicks
      const sessionCard = e.target.closest('.session-card');
      if (sessionCard) {
        const sessionId = sessionCard.dataset.sessionId;
        if (this.callbacks.onSessionClick) {
          this.callbacks.onSessionClick(sessionId);
        }
      }
    });
  }
  
  /**
   * Switch tab
   */
  switchTab(tab) {
    this.currentTab = tab;
    
    // Update tab styling
    this.elements.chatsTab.classList.toggle('active', tab === 'chats');
    this.elements.searchesTab.classList.toggle('active', tab === 'searches');
    this.elements.researchTab.classList.toggle('active', tab === 'research');
    
    // Clear search
    this.elements.search.value = '';
    
    // Load appropriate data
    if (tab === 'chats') {
      this.filteredSessions = [...this.sessions];
      this.renderSessions();
    } else if (tab === 'searches') {
      this.filteredSerpSessions = [...this.serpSessions];
      this.renderSerpSessions();
    } else if (tab === 'research') {
      this.filteredResearchSessions = [...this.researchSessions];
      this.renderResearchSessions();
    }
  }
  
  /**
   * Load sessions from storage
   */
  async loadSessions() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ALL_SESSIONS',
        data: {}
      });
      
      if (response && response.success) {
        this.sessions = response.sessions || [];
        this.filteredSessions = [...this.sessions];
        if (this.currentTab === 'chats') {
          this.renderSessions();
        }
      } else {
        this.showError('Failed to load chat history');
      }
    } catch (error) {
      console.error('[HistoryView] Failed to load sessions:', error);
      this.showError('Failed to load chat history');
    }
  }
  
  /**
   * Load SERP sessions from storage
   */
  async loadSerpSessions() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SERP_SESSIONS',
        data: {}
      });
      
      if (response && response.success) {
        this.serpSessions = response.sessions || [];
        this.filteredSerpSessions = [...this.serpSessions];
        if (this.currentTab === 'searches') {
          this.renderSerpSessions();
        }
      } else {
        this.showError('Failed to load search history');
      }
    } catch (error) {
      console.error('[HistoryView] Failed to load SERP sessions:', error);
      this.showError('Failed to load search history');
    }
  }
  
  /**
   * Load research sessions
   */
  async loadResearchSessions() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_RESEARCH_HISTORY',
        data: {}
      });
      
      if (response && response.success) {
        this.researchSessions = response.entries || [];
        this.filteredResearchSessions = [...this.researchSessions];
        if (this.currentTab === 'research') {
          this.renderResearchSessions();
        }
      } else {
        this.showError('Failed to load research history');
      }
    } catch (error) {
      console.error('[HistoryView] Failed to load research sessions:', error);
      this.showError('Failed to load research history');
    }
  }
  
  /**
   * Handle delete
   */
  async handleDelete(sessionId) {
    // Confirm deletion
    const session = this.sessions.find(s => s.sessionId === sessionId);
    if (!session) return;
    
    const confirmed = confirm(`Delete conversation "${session.metadata.title}"?\n\nThis cannot be undone.`);
    if (!confirmed) return;
    
    try {
      // Send delete request to service worker
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_SESSION',
        data: { sessionId }
      });
      
      if (response && response.success) {
        // Remove from local arrays
        this.sessions = this.sessions.filter(s => s.sessionId !== sessionId);
        this.filteredSessions = this.filteredSessions.filter(s => s.sessionId !== sessionId);
        
        // Re-render
        this.renderSessions();
        
        // console.log('[HistoryView] ✅ Session deleted:', sessionId);
      } else {
        alert('Failed to delete conversation. Please try again.');
      }
    } catch (error) {
      console.error('[HistoryView] Failed to delete session:', error);
      alert('Failed to delete conversation. Please try again.');
    }
  }
  
  /**
   * Handle search
   */
  handleSearch(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    if (this.currentTab === 'chats') {
      if (!lowerQuery) {
        this.filteredSessions = [...this.sessions];
      } else {
        this.filteredSessions = this.sessions.filter(session => {
          const titleMatch = session.metadata.title.toLowerCase().includes(lowerQuery);
          const urlMatch = session.url.toLowerCase().includes(lowerQuery);
          return titleMatch || urlMatch;
        });
      }
      this.renderSessions();
    } else if (this.currentTab === 'searches') {
      if (!lowerQuery) {
        this.filteredSerpSessions = [...this.serpSessions];
      } else {
        this.filteredSerpSessions = this.serpSessions.filter(session => {
          const queryMatch = session.searchQuery.toLowerCase().includes(lowerQuery);
          return queryMatch;
        });
      }
      this.renderSerpSessions();
    } else if (this.currentTab === 'research') {
      if (!lowerQuery) {
        this.filteredResearchSessions = [...this.researchSessions];
      } else {
        this.filteredResearchSessions = this.researchSessions.filter(entry => {
          const queryMatch = entry.query.toLowerCase().includes(lowerQuery);
          return queryMatch;
        });
      }
      this.renderResearchSessions();
    }
  }
  
  /**
   * Render sessions list
   */
  renderSessions() {
    // Hide loading
    const loading = this.elements.content.querySelector('.history-loading');
    if (loading) {
      loading.remove();
    }
    
    // Show empty state if no sessions
    if (this.filteredSessions.length === 0) {
      this.elements.content.classList.add('hidden');
      this.elements.empty.classList.remove('hidden');
      return;
    }
    
    this.elements.content.classList.remove('hidden');
    this.elements.empty.classList.add('hidden');
    
    // Group sessions by date
    const grouped = this.groupByDate(this.filteredSessions);
    
    // Render grouped sessions
    let html = '';
    for (const [group, sessions] of Object.entries(grouped)) {
      html += `
        <div class="history-group">
          <div class="group-header">${group}</div>
          <div class="group-items">
            ${sessions.map(session => this.renderSessionCard(session)).join('')}
          </div>
        </div>
      `;
    }
    
    this.elements.content.innerHTML = html;
    
    // Add click listeners
    this.elements.content.querySelectorAll('.session-card').forEach(card => {
      card.addEventListener('click', () => {
        const sessionId = card.dataset.sessionId;
        this.handleSessionClick(sessionId);
      });
    });
    
    // Add error handlers for favicons
    this.elements.content.querySelectorAll('.session-favicon').forEach(img => {
      img.addEventListener('error', () => {
        img.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2218%22 font-size=%2218%22>💬</text></svg>';
      });
    });
  }
  
  /**
   * Render individual session card
   */
  renderSessionCard(session) {
    const messageCount = session.chatHistory?.length || 0;
    const timestamp = this.formatTime(session.lastActive);
    const favicon = this.getFavicon(session.url);
    const summary = this.getSessionSummary(session);
    
    // Get title - handle different session structures
    const title = session.metadata?.title || session.title || 'Untitled Session';
    
    return `
      <div class="session-item">
        <div class="session-card" data-session-id="${session.sessionId}">
          <div class="session-icon">
            <img src="${favicon}" alt="" class="session-favicon">
          </div>
          <div class="session-info">
            <div class="session-title">${this.escapeHTML(title)}</div>
            <div class="session-url">${this.getShortURL(session.url)}</div>
            <div class="session-summary">${summary}</div>
          </div>
          <div class="session-meta">
            <div class="session-count">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2"/>
              </svg>
              ${messageCount}
            </div>
            <div class="session-time">${timestamp}</div>
          </div>
        </div>
        <button class="session-delete-btn" data-session-id="${session.sessionId}" title="Delete conversation">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M3 6H5H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;
  }
  
  /**
   * Render SERP sessions list
   */
  renderSerpSessions() {
    // Hide loading
    const loading = this.elements.content.querySelector('.history-loading');
    if (loading) {
      loading.remove();
    }
    
    // Show empty state if no sessions
    if (this.filteredSerpSessions.length === 0) {
      this.elements.content.classList.add('hidden');
      this.elements.empty.classList.remove('hidden');
      this.elements.empty.innerHTML = `
        <div class="empty-icon">🔍</div>
        <h3>No search analyses yet</h3>
        <p>Analyze Google search results to build your history</p>
      `;
      return;
    }
    
    this.elements.content.classList.remove('hidden');
    this.elements.empty.classList.add('hidden');
    
    // Group sessions by date
    const grouped = this.groupSerpByDate(this.filteredSerpSessions);
    
    // Render grouped sessions
    let html = '';
    for (const [group, sessions] of Object.entries(grouped)) {
      html += `
        <div class="history-group">
          <div class="group-header">${group}</div>
          <div class="group-items">
            ${sessions.map(session => this.renderSerpCard(session)).join('')}
          </div>
        </div>
      `;
    }
    
    this.elements.content.innerHTML = html;
  }
  
  /**
   * Render SERP session card
   */
  renderSerpCard(session) {
    const timestamp = this.formatTime(session.timestamp);
    const hasChat = session.chatSessionId !== null;
    
    return `
      <div class="serp-item">
        <div class="serp-card" data-session-id="${session.sessionId}">
          <div class="serp-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
              <path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="serp-info">
            <div class="serp-query">"${this.escapeHTML(session.searchQuery)}"</div>
            <div class="serp-meta">
              <span>${session.resultCount} results</span>
              <span>•</span>
              <span>${timestamp}</span>
              ${hasChat ? '<span>•</span><span class="serp-chat-badge">💬 Chat</span>' : ''}
            </div>
          </div>
        </div>
        <div class="serp-actions">
          <button class="serp-action-btn view-btn" data-session-id="${session.sessionId}" data-action="view" title="View Analysis">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>
          <button class="serp-action-btn chat-btn" data-session-id="${session.sessionId}" data-action="chat" title="Chat with Results">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>
          <button class="serp-action-btn delete-btn" data-session-id="${session.sessionId}" data-action="delete" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 6H5H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }
  
  /**
   * Group SERP sessions by date
   */
  groupSerpByDate(sessions) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    
    const grouped = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Older': []
    };
    
    sessions.forEach(session => {
      const diff = now - session.timestamp;
      
      if (diff < oneDay) {
        grouped['Today'].push(session);
      } else if (diff < 2 * oneDay) {
        grouped['Yesterday'].push(session);
      } else if (diff < oneWeek) {
        grouped['This Week'].push(session);
      } else {
        grouped['Older'].push(session);
      }
    });
    
    // Remove empty groups
    Object.keys(grouped).forEach(key => {
      if (grouped[key].length === 0) {
        delete grouped[key];
      }
    });
    
    return grouped;
  }
  
  /**
   * Render research sessions list
   */
  renderResearchSessions() {
    // Hide loading
    const loading = this.elements.content.querySelector('.history-loading');
    if (loading) {
      loading.remove();
    }
    
    // Show empty state if no sessions
    if (this.filteredResearchSessions.length === 0) {
      this.elements.content.classList.add('hidden');
      this.elements.empty.classList.remove('hidden');
      this.elements.empty.innerHTML = `
        <div class="empty-icon">🔬</div>
        <h3>No research sessions yet</h3>
        <p>Open a new tab and start researching!</p>
      `;
      return;
    }
    
    this.elements.content.classList.remove('hidden');
    this.elements.empty.classList.add('hidden');
    
    // Group sessions by date
    const grouped = this.groupResearchByDate(this.filteredResearchSessions);
    
    // Render grouped sessions
    let html = '';
    for (const [group, sessions] of Object.entries(grouped)) {
      html += `
        <div class="history-group">
          <div class="group-header">${group}</div>
          <div class="group-items">
            ${sessions.map(session => this.renderResearchCard(session)).join('')}
          </div>
        </div>
      `;
    }
    
    this.elements.content.innerHTML = html;
  }
  
  /**
   * Render research session card
   */
  renderResearchCard(entry) {
    const timestamp = this.formatTime(entry.timestamp);
    
    return `
      <div class="serp-item research-item">
        <div class="serp-card research-card" data-entry-id="${entry.id}">
          <div class="serp-icon research-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="serp-info research-info">
            <div class="serp-query research-query">"${this.escapeHTML(entry.query)}"</div>
            <div class="serp-meta research-meta">
              <span>${entry.sourcesCount} sources analyzed</span>
              <span>•</span>
              <span>${timestamp}</span>
            </div>
          </div>
        </div>
        <div class="serp-actions research-actions">
          <button class="serp-action-btn view-btn" data-entry-id="${entry.id}" data-action="view" title="View Research">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>
          <button class="serp-action-btn chat-btn" data-entry-id="${entry.id}" data-action="chat" title="Chat with Results">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>
          <button class="serp-action-btn delete-btn" data-entry-id="${entry.id}" data-action="delete" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 6H5H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }
  
  /**
   * Group research sessions by date
   */
  groupResearchByDate(sessions) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    
    const grouped = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Older': []
    };
    
    sessions.forEach(session => {
      const diff = now - session.timestamp;
      
      if (diff < oneDay) {
        grouped['Today'].push(session);
      } else if (diff < 2 * oneDay) {
        grouped['Yesterday'].push(session);
      } else if (diff < oneWeek) {
        grouped['This Week'].push(session);
      } else {
        grouped['Older'].push(session);
      }
    });
    
    // Remove empty groups
    Object.keys(grouped).forEach(key => {
      if (grouped[key].length === 0) {
        delete grouped[key];
      }
    });
    
    return grouped;
  }
  
  /**
   * Group sessions by date
   */
  groupByDate(sessions) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    
    const grouped = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Older': []
    };
    
    sessions.forEach(session => {
      const diff = now - session.lastActive;
      
      if (diff < oneDay) {
        grouped['Today'].push(session);
      } else if (diff < 2 * oneDay) {
        grouped['Yesterday'].push(session);
      } else if (diff < oneWeek) {
        grouped['This Week'].push(session);
      } else {
        grouped['Older'].push(session);
      }
    });
    
    // Remove empty groups
    Object.keys(grouped).forEach(key => {
      if (grouped[key].length === 0) {
        delete grouped[key];
      }
    });
    
    return grouped;
  }
  
  /**
   * Get session summary (what user did)
   */
  getSessionSummary(session) {
    const parts = [];
    
    // Add summary if available
    if (session.content && session.content.summary) {
      parts.push('📄 Summarized');
    }
    
    // Add chat info
    if (session.chatHistory && session.chatHistory.length > 0) {
      const userQuestions = session.chatHistory.filter(msg => msg.role === 'user');
      if (userQuestions.length > 0) {
        // Show first question or question count
        if (userQuestions.length === 1) {
          parts.push(`💬 ${this.escapeHTML(userQuestions[0].content.substring(0, 60) + (userQuestions[0].content.length > 60 ? '...' : ''))}`);
        } else {
          parts.push(`💬 Asked ${userQuestions.length} questions`);
        }
      }
    }
    
    // Add conversation summary if available
    if (session.chatHistorySummary) {
      parts.push(this.escapeHTML(session.chatHistorySummary.substring(0, 80) + (session.chatHistorySummary.length > 80 ? '...' : '')));
    }
    
    // Fallback
    if (parts.length === 0) {
      return session.chatHistory && session.chatHistory.length > 0 
        ? `${session.chatHistory.length} messages` 
        : 'No activity';
    }
    
    return parts.join(' • ');
  }
  
  /**
   * Handle session click
   */
  handleSessionClick(sessionId) {
    // console.log('[HistoryView] Session clicked:', sessionId);
    
    if (this.callbacks.onSessionClick) {
      this.callbacks.onSessionClick(sessionId);
    }
  }
  
  /**
   * Format timestamp
   */
  formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
  }
  
  /**
   * Get favicon URL
   */
  getFavicon(url) {
    // Handle missing or invalid URLs
    if (!url) {
      return 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2218%22 font-size=%2218%22>💬</text></svg>';
    }
    
    // Handle special session types (SERP, research, etc.)
    if (url.startsWith('serp-analysis') || url.startsWith('research-mode') || url === 'multi-page-chat') {
      return 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2218%22 font-size=%2218%22>💬</text></svg>';
    }
    
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch {
      return 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2218%22 font-size=%2218%22>💬</text></svg>';
    }
  }
  
  /**
   * Get short URL
   */
  getShortURL(url) {
    // Handle missing or invalid URLs
    if (!url) {
      return 'No URL';
    }
    
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname.substring(0, 30) + (urlObj.pathname.length > 30 ? '...' : '');
    } catch {
      return url.substring(0, 40) + (url.length > 40 ? '...' : '');
    }
  }
  
  /**
   * Show error
   */
  showError(message) {
    this.elements.content.innerHTML = `
      <div class="history-error">
        <div class="error-icon">⚠️</div>
        <p>${this.escapeHTML(message)}</p>
        <button class="secondary-btn history-retry-btn">Retry</button>
      </div>
    `;
    
    // Attach retry event listener
    const retryBtn = this.elements.content.querySelector('.history-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.loadSessions();
      });
    }
  }
  
  /**
   * Handle SERP action (view, chat, delete)
   */
  handleSerpAction(sessionId, action) {
    // console.log('[HistoryView] SERP action:', action, sessionId);
    
    if (action === 'view' && this.callbacks.onViewSerpSession) {
      this.callbacks.onViewSerpSession(sessionId);
    } else if (action === 'chat' && this.callbacks.onChatWithSerpSession) {
      this.callbacks.onChatWithSerpSession(sessionId);
    } else if (action === 'delete') {
      this.handleDeleteSerpSession(sessionId);
    }
  }
  
  /**
   * Handle delete SERP session
   */
  async handleDeleteSerpSession(sessionId) {
    const session = this.serpSessions.find(s => s.sessionId === sessionId);
    if (!session) return;
    
    const confirmed = confirm(`Delete search analysis for "${session.searchQuery}"?\n\nThis cannot be undone.`);
    if (!confirmed) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_SERP_SESSION',
        data: { sessionId }
      });
      
      if (response && response.success) {
        // Remove from local arrays
        this.serpSessions = this.serpSessions.filter(s => s.sessionId !== sessionId);
        this.filteredSerpSessions = this.filteredSerpSessions.filter(s => s.sessionId !== sessionId);
        
        // Re-render
        this.renderSerpSessions();
        
        // console.log('[HistoryView] ✅ SERP session deleted:', sessionId);
      } else {
        alert('Failed to delete search analysis. Please try again.');
      }
    } catch (error) {
      console.error('[HistoryView] Failed to delete SERP session:', error);
      alert('Failed to delete search analysis. Please try again.');
    }
  }
  
  /**
   * Handle research action (view, chat, delete)
   */
  handleResearchAction(entryId, action) {
    // console.log('[HistoryView] Research action:', action, entryId);
    
    if (action === 'view' && this.callbacks.onViewResearchEntry) {
      this.callbacks.onViewResearchEntry(entryId);
    } else if (action === 'chat' && this.callbacks.onChatWithResearchEntry) {
      this.callbacks.onChatWithResearchEntry(entryId);
    } else if (action === 'delete') {
      this.handleDeleteResearchEntry(entryId);
    }
  }
  
  /**
   * Handle delete research entry
   */
  async handleDeleteResearchEntry(entryId) {
    const entry = this.researchSessions.find(e => e.id === entryId);
    if (!entry) return;
    
    const confirmed = confirm(`Delete research session "${entry.query}"?\n\nThis cannot be undone.`);
    if (!confirmed) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_RESEARCH_ENTRY',
        data: { entryId }
      });
      
      if (response && response.success) {
        // Remove from local arrays
        this.researchSessions = this.researchSessions.filter(e => e.id !== entryId);
        this.filteredResearchSessions = this.filteredResearchSessions.filter(e => e.id !== entryId);
        
        // Re-render
        this.renderResearchSessions();
        
        // console.log('[HistoryView] ✅ Research entry deleted:', entryId);
      } else {
        alert('Failed to delete research session. Please try again.');
      }
    } catch (error) {
      console.error('[HistoryView] Failed to delete research entry:', error);
      alert('Failed to delete research session. Please try again.');
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
}

