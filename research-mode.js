/**
 * Research Mode - Autonomous AI Research
 * Main orchestrator for the research workflow
 */

// console.log('[Research Mode] Initializing...');

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
  currentResearch: null,
  researchHistory: [],
  isResearching: false,
  analyzedSources: [],
  comprehensiveAnswer: '',
  resumableSession: null
};

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
  // Search State
  searchState: document.getElementById('searchState'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  searchSubmitBtn: document.getElementById('searchSubmitBtn'),
  analysisButtons: document.querySelectorAll('.analysis-btn'),
  customBtn: document.getElementById('customBtn'),
  customCountWrapper: document.getElementById('customCountWrapper'),
  customCount: document.getElementById('customCount'),
  resumeOption: document.getElementById('resumeOption'),
  resumeQuery: document.getElementById('resumeQuery'),
  resumeBtn: document.getElementById('resumeBtn'),
  dismissResumeBtn: document.getElementById('dismissResumeBtn'),
  
  // Research State
  researchState: document.getElementById('researchState'),
  currentQuery: document.getElementById('currentQuery'),
  backToSearchBtn: document.getElementById('backToSearchBtn'),
  newResearchBtn: document.getElementById('newResearchBtn'),
  
  // Progress
  progressSection: document.getElementById('progressSection'),
  progressTitle: document.getElementById('progressTitle'),
  progressSubtitle: document.getElementById('progressSubtitle'),
  progressBar: document.getElementById('progressBar'),
  sourcesGrid: document.getElementById('sourcesGrid'),
  
  // Answer
  answerSection: document.getElementById('answerSection'),
  answerContent: document.getElementById('answerContent'),
  sourcesCount: document.getElementById('sourcesCount'),
  copyAnswerBtn: document.getElementById('copyAnswerBtn'),
  exportAnswerBtn: document.getElementById('exportAnswerBtn'),
  viewSourcesBtn: document.getElementById('viewSourcesBtn'),
  chatWithResultsBtn: document.getElementById('chatWithResultsBtn'),
  
  // Detailed Sources
  detailedSourcesSection: document.getElementById('detailedSourcesSection'),
  detailedSourcesList: document.getElementById('detailedSourcesList'),
  sortSelect: document.getElementById('sortSelect'),
  
  // Header Actions
  historyBtn: document.getElementById('historyBtn'),
  settingsBtn: document.getElementById('settingsBtn')
};

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  // console.log('[Research Mode] Setting up event listeners');
  setupEventListeners();
  
  // Check for resumable research session
  await checkForResumableSession();
  
  // console.log('[Research Mode] Ready!');
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Search Form
  elements.searchForm.addEventListener('submit', handleSearchSubmit);
  
  // Enable/disable send button based on input
  elements.searchInput.addEventListener('input', () => {
    const hasText = elements.searchInput.value.trim().length > 0;
    elements.searchSubmitBtn.disabled = !hasText;
  });
  
  // Initial state - disable if empty
  elements.searchSubmitBtn.disabled = elements.searchInput.value.trim().length === 0;
  
  // Analysis Buttons
  elements.analysisButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons
      elements.analysisButtons.forEach(b => b.classList.remove('active'));
      // Add active class to clicked button
      btn.classList.add('active');
      
      // Handle custom button
      if (btn.dataset.count === 'custom') {
        elements.customCountWrapper.classList.remove('hidden');
      } else {
        elements.customCountWrapper.classList.add('hidden');
      }
    });
  });
  
  // Resume Option
  elements.resumeBtn?.addEventListener('click', handleResumeResearch);
  elements.dismissResumeBtn?.addEventListener('click', () => {
    elements.resumeOption.classList.add('hidden');
    state.resumableSession = null;
    localStorage.removeItem('nutshell_resumable_research');
  });
  
  // Research Controls
  elements.backToSearchBtn?.addEventListener('click', handleBackToSearch);
  elements.newResearchBtn?.addEventListener('click', handleBackToSearch);
  
  // Answer Actions
  elements.copyAnswerBtn?.addEventListener('click', handleCopyAnswer);
  elements.exportAnswerBtn?.addEventListener('click', handleExportAnswer);
  elements.viewSourcesBtn?.addEventListener('click', handleViewSources);
  elements.chatWithResultsBtn?.addEventListener('click', handleChatWithResults);
  
  // Sort
  elements.sortSelect?.addEventListener('change', handleSortChange);
  
  // Header Actions
  elements.historyBtn?.addEventListener('click', handleShowHistory);
  elements.settingsBtn?.addEventListener('click', handleShowSettings);
}

// ============================================
// SEARCH HANDLING
// ============================================

async function handleSearchSubmit(e) {
  e.preventDefault();
  
  const query = elements.searchInput.value.trim();
  if (!query) return;
  
  // Get results count from active button
  const activeBtn = document.querySelector('.analysis-btn.active');
  let resultsCount = 5; // default
  
  if (activeBtn) {
    const count = activeBtn.dataset.count;
    if (count === 'custom') {
      resultsCount = parseInt(elements.customCount.value) || 10;
      // Clamp between 1 and 20
      resultsCount = Math.max(1, Math.min(20, resultsCount));
    } else {
      resultsCount = parseInt(count) || 5;
    }
  }
  
  // console.log('[Research Mode] Starting research:', query, `(top ${resultsCount})`);
  
  // Start research
  await startResearch(query, resultsCount);
}

async function startResearch(query, resultsCount) {
  // Update state
  state.isResearching = true;
  state.currentResearch = {
    query: query,
    resultsCount: resultsCount,
    startTime: Date.now(),
    status: 'searching',
    results: []
  };
  
  // Save resumable session
  saveResumableSession();
  
  // Switch to research view
  showResearchView(query);
  
  // Start research pipeline
  try {
    await runResearchPipeline(query, resultsCount);
  } catch (error) {
    console.error('[Research Mode] Research failed:', error);
    showError('Research failed. Please try again.');
  }
}

async function runResearchPipeline(query, resultsCount) {
  // Phase 1: Search Google
  updateProgress('🔍 Searching Google...', '', 10);
  await sleep(500);
  
  const searchResults = await performGoogleSearch(query, resultsCount);
  if (!searchResults || searchResults.length === 0) {
    throw new Error('No search results found');
  }
  
  updateProgress(`✅ Found ${searchResults.length} results`, '', 20);
  await sleep(300);
  
  // Phase 2: Analyze Pages
  updateProgress('📖 Analyzing pages...', `0/${searchResults.length} complete`, 25);
  showSourcesGrid(searchResults);
  
  const analyzedResults = await analyzePages(searchResults, (progress) => {
    const percentage = 25 + (progress * 50); // 25% to 75%
    updateProgress(
      '📖 Analyzing pages...',
      `${Math.floor(progress * searchResults.length)}/${searchResults.length} complete`,
      percentage
    );
  });
  
  state.analyzedSources = analyzedResults;
  updateProgress('✅ Analysis complete', `${analyzedResults.length} sources analyzed`, 75);
  await sleep(500);
  
  // Phase 3: Generate Comprehensive Answer
  updateProgress('💡 Generating comprehensive answer...', 'Using AI to synthesize findings', 80);
  await sleep(300);
  
  const answer = await generateComprehensiveAnswer(query, analyzedResults);
  state.comprehensiveAnswer = answer;
  
  updateProgress('✅ Research complete!', '', 100);
  await sleep(500);
  
  // Show answer
  showAnswer(answer, analyzedResults);
  
  // Save to history
  await saveResearchToHistory();
  
  // Clear resumable session
  clearResumableSession();
  
  state.isResearching = false;
}

// ============================================
// GOOGLE SEARCH
// ============================================

async function performGoogleSearch(query, count) {
  // console.log('[Research Mode] Performing Google search:', query);
  
  try {
    // Send message to service worker to perform search
    const response = await chrome.runtime.sendMessage({
      type: 'RESEARCH_MODE_SEARCH',
      data: { query, count }
    });
    
    // console.log('[Research Mode] Search response:', response);
    
    if (response && response.success && response.results) {
      // console.log('[Research Mode] ✅ Search complete:', response.results.length, 'results');
      return response.results;
    } else {
      const errorMsg = response?.error || 'Search failed. Please try again.';
      console.error('[Research Mode] ❌ Search failed:', errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('[Research Mode] ❌ Search error:', error);
    throw error;
  }
}

// ============================================
// PAGE ANALYSIS
// ============================================

async function analyzePages(searchResults, onProgress) {
  // console.log('[Research Mode] Analyzing pages:', searchResults.length);
  
  const results = [];
  const concurrency = 3; // Analyze 3 pages at a time
  
  for (let i = 0; i < searchResults.length; i += concurrency) {
    const batch = searchResults.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (result, batchIndex) => {
      const globalIndex = i + batchIndex;
      
      try {
        // Update source card status
        updateSourceCard(globalIndex, 'analyzing');
        
        // Send message to service worker to analyze this page
        const response = await chrome.runtime.sendMessage({
          type: 'RESEARCH_MODE_ANALYZE',
          data: { url: result.url, query: state.currentResearch.query }
        });
        
        if (response && response.success) {
          updateSourceCard(globalIndex, 'complete');
          return {
            ...result,
            summary: response.summary,
            extractedContent: response.extractedContent,
            relevance: response.relevance || 0
          };
        } else {
          updateSourceCard(globalIndex, 'error');
          return {
            ...result,
            summary: result.snippet || 'Could not analyze this page.',
            extractedContent: null,
            relevance: 0,
            error: true
          };
        }
      } catch (error) {
        console.error('[Research Mode] Failed to analyze:', result.url, error);
        updateSourceCard(globalIndex, 'error');
        return {
          ...result,
          summary: result.snippet || 'Error analyzing page.',
          extractedContent: null,
          relevance: 0,
          error: true
        };
      }
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    batchResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    });
    
    // Update progress
    const progress = (i + batch.length) / searchResults.length;
    onProgress(progress);
  }
  
  // console.log('[Research Mode] Analysis complete:', results.length, 'sources');
  return results;
}

// ============================================
// ANSWER GENERATION
// ============================================

async function generateComprehensiveAnswer(query, sources) {
  // console.log('[Research Mode] Generating comprehensive answer');
  
  try {
    // Send message to service worker to generate answer
    const response = await chrome.runtime.sendMessage({
      type: 'RESEARCH_MODE_GENERATE_ANSWER',
      data: { query, sources }
    });
    
    if (response && response.success && response.answer) {
      return response.answer;
    } else {
      throw new Error(response?.error || 'Failed to generate answer');
    }
  } catch (error) {
    console.error('[Research Mode] Answer generation error:', error);
    // Fallback: Create basic answer from summaries
    return createFallbackAnswer(query, sources);
  }
}

function createFallbackAnswer(query, sources) {
  let answer = `Based on ${sources.length} analyzed sources:\n\n`;
  
  sources.slice(0, 5).forEach((source, index) => {
    const domain = new URL(source.url).hostname.replace('www.', '');
    answer += `**${index + 1}. ${source.title}** (${domain})\n${source.summary}\n\n`;
  });
  
  return answer;
}

// ============================================
// UI UPDATES
// ============================================

function showResearchView(query) {
  elements.searchState.classList.add('hidden');
  elements.researchState.classList.remove('hidden');
  elements.currentQuery.textContent = query;
  
  // Reset sections
  elements.progressSection.classList.remove('hidden');
  elements.answerSection.classList.add('hidden');
  elements.detailedSourcesSection.classList.add('hidden');
  elements.sourcesGrid.classList.add('hidden');
  elements.sourcesGrid.innerHTML = '';
}

function updateProgress(title, subtitle, percentage) {
  elements.progressTitle.textContent = title;
  elements.progressSubtitle.textContent = subtitle;
  elements.progressBar.style.width = `${percentage}%`;
}

function showSourcesGrid(searchResults) {
  elements.sourcesGrid.classList.remove('hidden');
  elements.sourcesGrid.innerHTML = '';
  
  searchResults.forEach((result, index) => {
    const domain = new URL(result.url).hostname.replace('www.', '');
    const card = document.createElement('div');
    card.className = 'source-card';
    card.dataset.index = index;
    card.innerHTML = `
      <div class="source-status">
        <div class="source-status-icon"></div>
        <span>Pending</span>
      </div>
      <div class="source-title">${result.title}</div>
      <span class="source-domain">(${domain})</span>
    `;
    elements.sourcesGrid.appendChild(card);
  });
}

function updateSourceCard(index, status) {
  const card = elements.sourcesGrid.querySelector(`[data-index="${index}"]`);
  if (!card) return;
  
  card.className = `source-card ${status}`;
  const statusText = card.querySelector('.source-status span');
  
  if (status === 'analyzing') {
    statusText.textContent = 'Analyzing...';
  } else if (status === 'complete') {
    statusText.textContent = 'Complete';
  } else if (status === 'error') {
    statusText.textContent = 'Error';
  }
}

function showAnswer(answer, sources) {
  elements.progressSection.classList.add('hidden');
  elements.answerSection.classList.remove('hidden');
  
  // Stream the answer
  streamAnswer(answer);
  
  // Update sources count
  elements.sourcesCount.textContent = sources.length;
}

async function streamAnswer(answer) {
  elements.answerContent.textContent = '';
  
  const words = answer.split(' ');
  let currentText = '';
  
  // Stream word by word
  for (let i = 0; i < words.length; i++) {
    currentText += words[i] + ' ';
    elements.answerContent.textContent = currentText;
    
    // Use requestAnimationFrame to prevent tab throttling
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 30);
      });
    });
  }
  
  // Format the final answer with markdown and clickable citations
  elements.answerContent.innerHTML = formatMarkdown(answer);
  
  // Add sources section at the bottom
  addSourcesSection();
}

function formatMarkdown(text) {
  // Convert markdown to HTML
  let html = text;
  
  // Headings: ### Header, ## Header, # Header
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic: *text* (but not bold)
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  
  // Unordered lists: - item or * item
  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Ordered lists: 1. item
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // Code blocks: `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Citations: [source 1] or [Source 1] → clickable links
  html = html.replace(/\[source (\d+)\]/gi, (match, num) => {
    const sourceIndex = parseInt(num) - 1;
    if (state.sources && state.sources[sourceIndex]) {
      const source = state.sources[sourceIndex];
      const domain = new URL(source.url).hostname.replace('www.', '');
      return `<a href="${source.url}" target="_blank" class="source-citation" data-source="${num}" title="${source.title}">[${domain}]</a>`;
    }
    return match;
  });
  
  // Paragraphs: double line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  
  // Single line breaks
  html = html.replace(/\n/g, '<br>');
  
  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');
  
  return html;
}

function addSourcesSection() {
  if (!state.sources || state.sources.length === 0) return;
  
  const sourcesHtml = `
    <div class="sources-references">
      <h3>Sources</h3>
      <ol class="sources-list">
        ${state.sources.map((source, index) => {
          const domain = new URL(source.url).hostname.replace('www.', '');
          return `
            <li>
              <a href="${source.url}" target="_blank" class="source-link">
                <strong>${source.title}</strong>
                <span class="source-domain">${domain}</span>
              </a>
            </li>
          `;
        }).join('')}
      </ol>
    </div>
  `;
  
  elements.answerContent.insertAdjacentHTML('beforeend', sourcesHtml);
}

function showError(message) {
  updateProgress('❌ Error', message, 0);
  elements.progressBar.style.background = 'var(--error)';
  
  // Show retry button
  const statusContent = document.querySelector('.status-content');
  if (statusContent) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'primary-btn';
    retryBtn.style.marginTop = 'var(--spacing-md)';
    retryBtn.textContent = 'Try Again';
    retryBtn.onclick = () => {
      handleBackToSearch();
    };
    statusContent.appendChild(retryBtn);
  }
}

// ============================================
// ACTIONS
// ============================================

function handleBackToSearch() {
  elements.researchState.classList.add('hidden');
  elements.searchState.classList.remove('hidden');
  elements.searchInput.value = '';
  elements.searchInput.focus();
  
  state.currentResearch = null;
  state.analyzedSources = [];
  state.comprehensiveAnswer = '';
}

async function handleCopyAnswer() {
  try {
    await navigator.clipboard.writeText(state.comprehensiveAnswer);
    // console.log('[Research Mode] Answer copied to clipboard');
    // TODO: Show toast notification
  } catch (error) {
    console.error('[Research Mode] Failed to copy:', error);
  }
}

async function handleExportAnswer() {
  // console.log('[Research Mode] Export answer - TODO');
  // TODO: Implement export (Markdown, PDF, etc.)
}

function handleViewSources() {
  elements.detailedSourcesSection.classList.toggle('hidden');
  
  if (!elements.detailedSourcesSection.classList.contains('hidden')) {
    renderDetailedSources();
  }
}

async function handleChatWithResults() {
  // console.log('[Research Mode] Opening multi-page chat...');
  
  try {
    // Create multi-page chat session with analyzed sources
    const response = await chrome.runtime.sendMessage({
      type: 'RESEARCH_MODE_CREATE_CHAT',
      data: {
        query: state.currentResearch.query,
        sources: state.analyzedSources,
        answer: state.comprehensiveAnswer
      }
    });
    
    if (response && response.success) {
      // console.log('[Research Mode] Chat session created:', response.sessionId);
      
      // Store pending session for sidebar to pick up
      await chrome.storage.session.set({
        'nutshell_pending_research_session': {
          sessionId: response.sessionId,
          timestamp: Date.now()
        }
      });
      
      // Open the sidebar - it will check for pending session on init
      await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
      
    } else {
      throw new Error(response?.error || 'Failed to create chat');
    }
  } catch (error) {
    console.error('[Research Mode] Failed to create chat:', error);
    alert('Failed to open chat. Please try again.');
  }
}

function renderDetailedSources() {
  elements.detailedSourcesList.innerHTML = '';
  
  let sortedSources = [...state.analyzedSources];
  const sortBy = elements.sortSelect.value;
  
  if (sortBy === 'position') {
    sortedSources.sort((a, b) => (a.position || 0) - (b.position || 0));
  } else if (sortBy === 'title') {
    sortedSources.sort((a, b) => a.title.localeCompare(b.title));
  }
  
  sortedSources.forEach((source, index) => {
    const domain = new URL(source.url).hostname.replace('www.', '');
    const card = document.createElement('div');
    card.className = 'detailed-source-card';
    card.innerHTML = `
      <div class="source-header">
        <div class="source-info">
          <h4>${source.title}</h4>
          <a href="${source.url}" target="_blank" class="source-url">${domain}</a>
        </div>
        <div class="source-meta">
          <span>#${source.position || index + 1}</span>
        </div>
      </div>
      <div class="source-summary">${source.summary}</div>
    `;
    elements.detailedSourcesList.appendChild(card);
  });
}

function handleSortChange() {
  renderDetailedSources();
}

async function handleShowHistory() {
  // console.log('[Research Mode] Opening sidebar history');
  
  try {
    // Open the sidebar
    await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
    
    // Send message to sidebar to switch to history view and Research Mode tab
    await chrome.runtime.sendMessage({
      type: 'SHOW_HISTORY_TAB',
      data: { tab: 'research' }
    });
    
    // console.log('[Research Mode] ✅ Sidebar history opened');
  } catch (error) {
    console.error('[Research Mode] Failed to open history:', error);
    alert('Could not open history. Please open the NutShell sidebar manually.');
  }
}

function handleShowSettings() {
  // console.log('[Research Mode] Show settings - TODO');
  // TODO: Open settings page
  alert('Settings page coming soon!');
}

// ============================================
// RESUME FLOW
// ============================================

async function checkForResumableSession() {
  try {
    const saved = localStorage.getItem('nutshell_resumable_research');
    if (!saved) return;
    
    const session = JSON.parse(saved);
    const timeSince = Date.now() - session.startTime;
    
    // Only show resume option if session is less than 1 hour old
    if (timeSince > 60 * 60 * 1000) {
      localStorage.removeItem('nutshell_resumable_research');
      return;
    }
    
    state.resumableSession = session;
    
    // Show resume option
    elements.resumeQuery.textContent = `"${session.query}"`;
    elements.resumeOption.classList.remove('hidden');
    
    // console.log('[Research Mode] Found resumable session:', session.query);
  } catch (error) {
    console.error('[Research Mode] Failed to load resumable session:', error);
    localStorage.removeItem('nutshell_resumable_research');
  }
}

function saveResumableSession() {
  try {
    localStorage.setItem('nutshell_resumable_research', JSON.stringify(state.currentResearch));
  } catch (error) {
    console.error('[Research Mode] Failed to save resumable session:', error);
  }
}

function clearResumableSession() {
  try {
    localStorage.removeItem('nutshell_resumable_research');
  } catch (error) {
    console.error('[Research Mode] Failed to clear resumable session:', error);
  }
}

async function handleResumeResearch() {
  if (!state.resumableSession) return;
  
  // console.log('[Research Mode] Resuming research:', state.resumableSession.query);
  elements.resumeOption.classList.add('hidden');
  
  // Resume from where we left off
  await startResearch(state.resumableSession.query, state.resumableSession.resultsCount);
}

// ============================================
// HISTORY
// ============================================

async function saveResearchToHistory() {
  try {
    const historyEntry = {
      id: Date.now().toString(),
      query: state.currentResearch.query,
      timestamp: Date.now(),
      sourcesCount: state.analyzedSources.length,
      answer: state.comprehensiveAnswer,
      sources: state.analyzedSources
    };
    
    // Send to service worker to save
    const response = await chrome.runtime.sendMessage({
      type: 'RESEARCH_MODE_SAVE_HISTORY',
      data: historyEntry
    });
    
    if (response && response.success) {
      // console.log('[Research Mode] Saved to history:', historyEntry.id);
    } else {
      throw new Error(response?.error || 'Failed to save');
    }
  } catch (error) {
    console.error('[Research Mode] Failed to save to history:', error);
  }
}

// ============================================
// UTILITIES
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// INITIALIZE
// ============================================

document.addEventListener('DOMContentLoaded', init);

