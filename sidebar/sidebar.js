/**
 * Sidebar Main Controller - MVP
 * Coordinates views and handles communication with background
 */

import { ChatView } from './views/chat-view.js';
import { HistoryView } from './views/history-view.js';
import { SerpView } from './views/serp-view.js';

// State
const state = {
  currentView: 'home',
  sessionId: null,
  tabId: null,
  currentUrl: null,
  sections: null,
  summary: null,
  isLoading: false,
  
  // Workers
  summarizerWorker: null,
  qnaWorker: null,
  
  // Summary state tracking
  isSummarizing: false,
  summaryTabId: null,  // Track which tab is being summarized
  
  // Views
  chatView: null,
  historyView: null,
  serpView: null,
  
  // Q&A state
  qnaReady: false,
  pendingQuestionTabId: null,  // Track which tab asked the current question
  
  // SERP analysis state
  isGoogleSerp: false,
  searchQuery: null,
  serpResults: null
};

// Tab-specific state cache (preserves state when switching tabs)
const tabStateCache = new Map();

// Activity tracker (tracks last activity time per tab)
const tabActivityTracker = new Map();

// Elements
const elements = {
  homeView: document.getElementById('homeView'),
  summaryView: document.getElementById('summaryView'),
  chatView: document.getElementById('chatView'),
  historyView: document.getElementById('historyView'),
  serpView: document.getElementById('serpView'),
  loadingView: document.getElementById('loadingView'),
  errorView: document.getElementById('errorView'),
  
  // Buttons
  summarizeBtn: document.getElementById('summarizeBtn'),
  askBtn: document.getElementById('askBtn'),
  viewSummaryBtn: document.getElementById('viewSummaryBtn'),
  historyBtn: document.getElementById('historyBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  themeBtn: document.getElementById('themeBtn'),
  backToHomeBtn: document.getElementById('backToHomeBtn'),
  chatFromSummaryBtn: document.getElementById('chatFromSummaryBtn'),
  continueChatBtn: document.getElementById('continueChatBtn'),
  retryBtn: document.getElementById('retryBtn'),
  dismissErrorBtn: document.getElementById('dismissErrorBtn'),
  
  // Settings elements
  settingsView: document.getElementById('settingsView'),
  settingsBackBtn: document.getElementById('settingsBackBtn'),
  enableRecapCheckbox: document.getElementById('enableRecapCheckbox'),
  recapTimerInput: document.getElementById('recapTimerInput'),
  openCacheViewerBtn: document.getElementById('openCacheViewerBtn'),
  
  // SERP elements
  serpAnalysisSection: document.getElementById('serpAnalysisSection'),
  serpCountInput: document.getElementById('serpCountInput'),
  analyzeSerpBtn: document.getElementById('analyzeSerpBtn'),
  
  // Content areas
  summaryContent: document.getElementById('summaryContent'),
  previousSessionNotice: document.getElementById('previousSessionNotice'),
  
  // Loading/Error
  loadingText: document.querySelector('.loading-text'),
  loadingSubtext: document.querySelector('.loading-subtext'),
  errorMessage: document.querySelector('.error-message')
};

/**
 * Load theme from storage
 */
async function loadTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    const theme = result.theme || 'light';
    
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    
    // console.log('[Sidebar] Theme loaded:', theme);
  } catch (error) {
    console.error('[Sidebar] Failed to load theme:', error);
  }
}

/**
 * Toggle theme (dark/light mode)
 */
async function toggleTheme() {
  try {
    const isDark = document.body.classList.toggle('dark-mode');
    const theme = isDark ? 'dark' : 'light';
    
    // Save to storage
    await chrome.storage.local.set({ theme });
    
    // console.log('[Sidebar] Theme toggled to:', theme);
  } catch (error) {
    console.error('[Sidebar] Failed to toggle theme:', error);
  }
}

/**
 * Check if current page is Google SERP
 */
async function checkGoogleSerp() {
  try {
    // console.log('[Sidebar] checkGoogleSerp called | URL:', state.currentUrl);
    
    // First, check if the URL is a Google search page
    if (!state.currentUrl || !state.currentUrl.includes('google.com/search')) {
      // console.log('[Sidebar] Not a Google search URL');
      state.isGoogleSerp = false;
      if (elements.serpAnalysisSection) {
        elements.serpAnalysisSection.classList.add('hidden');
      }
      
      // Check if it's a Chrome internal page or invalid URL
      const isInternalPage = !state.currentUrl || 
        state.currentUrl.startsWith('chrome://') || 
        state.currentUrl.startsWith('chrome-extension://') ||
        state.currentUrl.startsWith('about:') ||
        state.currentUrl === 'about:blank' ||
        state.currentUrl.startsWith('edge://') ||
        state.currentUrl.startsWith('brave://');
      
      // Show quick actions only for regular web pages
      const quickActions = document.getElementById('quickActions');
      if (quickActions) {
        if (isInternalPage) {
          quickActions.classList.add('hidden');
        } else {
          quickActions.classList.remove('hidden');
        }
      }
      return;
    }
    
    // console.log('[Sidebar] ✅ Google search URL detected, checking content script...');
    // console.log('[Sidebar] TabId:', state.tabId);
    
    // Get tab info to ensure it's fully loaded
    const tab = await chrome.tabs.get(state.tabId);
    // console.log('[Sidebar] Tab status:', tab.status);
    
    // If tab is still loading, wait for it
    if (tab.status === 'loading') {
      // console.log('[Sidebar] Tab is loading, waiting...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    let response;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      // console.log(`[Sidebar] Attempt ${attempts}/${maxAttempts} to contact content script`);
      
      try {
        // Try to send message to content script
        response = await chrome.tabs.sendMessage(state.tabId, {
          type: 'CHECK_GOOGLE_SERP'
        });
        // console.log('[Sidebar] ✅ Content script responded:', response);
        break; // Success!
      } catch (error) {
        // console.log(`[Sidebar] Attempt ${attempts} failed:`, error.message);
        
        // Content script not loaded, try to inject it
        if (error.message.includes('Receiving end does not exist')) {
          // console.log('[Sidebar] Content script not loaded, injecting...');
          
          try {
            await chrome.scripting.executeScript({
              target: { tabId: state.tabId },
              files: ['content/google-serp-extractor.js']
            });
            // console.log('[Sidebar] ✅ Content script injected');
            
            // Wait for script to initialize
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (injectError) {
            console.error('[Sidebar] Failed to inject SERP content script:', injectError);
            if (attempts === maxAttempts) {
              throw injectError;
            }
          }
        } else {
          // Different error, throw immediately
          throw error;
        }
      }
    }
    
    state.isGoogleSerp = response?.isGoogleSerp || false;
    state.searchQuery = response?.searchQuery || null;
    
    /*console.log('[Sidebar] 🔍 Google SERP check result:', {
      isGoogleSerp: state.isGoogleSerp,
      searchQuery: state.searchQuery
    });*/
    
    // Show/hide SERP analysis section and quick actions
    const quickActions = document.getElementById('quickActions');
    
    if (state.isGoogleSerp && elements.serpAnalysisSection) {
      elements.serpAnalysisSection.classList.remove('hidden');
      // console.log('[Sidebar] ✅ SERP analysis section shown');
      
      // Hide quick actions on Google SERP (no summarize/ask for search pages)
      if (quickActions) {
        quickActions.classList.add('hidden');
        // console.log('[Sidebar] ⚠️ Quick actions hidden (Google SERP)');
      }
    } else {
      if (elements.serpAnalysisSection) {
        elements.serpAnalysisSection.classList.add('hidden');
        // console.log('[Sidebar] ❌ SERP analysis section hidden');
      }
      
      // Show quick actions on regular pages
      if (quickActions) {
        quickActions.classList.remove('hidden');
        // console.log('[Sidebar] ✅ Quick actions shown (not SERP)');
      }
    }
  } catch (error) {
    console.error('[Sidebar] checkGoogleSerp error:', error);
    
    // CRITICAL: Even if content script fails, if URL is Google search, show SERP section
    if (state.currentUrl && state.currentUrl.includes('google.com/search')) {
      // console.log('[Sidebar] ⚠️ Content script failed BUT URL is Google search - showing SERP section anyway');
      state.isGoogleSerp = true;
      
      if (elements.serpAnalysisSection) {
        elements.serpAnalysisSection.classList.remove('hidden');
        // console.log('[Sidebar] ✅ SERP analysis section shown (fallback)');
      }
      
      // Hide quick actions
      const quickActions = document.getElementById('quickActions');
      if (quickActions) {
        quickActions.classList.add('hidden');
      }
    } else {
      // console.log('[Sidebar] Treating as non-SERP page due to error');
      state.isGoogleSerp = false;
      if (elements.serpAnalysisSection) {
        elements.serpAnalysisSection.classList.add('hidden');
      }
      // Show quick actions on error (treat as regular page)
      const quickActions = document.getElementById('quickActions');
      if (quickActions) {
        quickActions.classList.remove('hidden');
      }
    }
  }
}

/**
 * Handle SERP analysis button click
 */
async function handleAnalyzeSerp() {
  // console.log('[Sidebar] Analyze SERP clicked');
  
  try {
    // Get count from input
    const count = parseInt(elements.serpCountInput.value) || 3;
    
    // Validate count
    if (count < 1 || count > 10) {
      showError('Invalid Count', 'Please enter a number between 1 and 10.');
      return;
    }
    
    showLoading('Extracting search results...', 'Please wait...');
    
    // Extract SERP URLs
    const extractResponse = await chrome.tabs.sendMessage(state.tabId, {
      type: 'EXTRACT_SERP_URLS',
      data: { maxResults: count }
    });
    
    // console.log('[Sidebar] Extract response:', extractResponse);
    
    if (!extractResponse || !extractResponse.success) {
      throw new Error('Failed to extract search results. Try reloading the Google search page.');
    }
    
    if (!extractResponse.results || extractResponse.results.length === 0) {
      throw new Error(`No search results found. The page returned ${extractResponse.count || 0} results. Try reloading the page or checking the browser console for details.`);
    }
    
    // console.log('[Sidebar] Extracted', extractResponse.results.length, 'SERP URLs');
    // console.log('[Sidebar] Results:', extractResponse.results);
    
    // Show extracted URLs in loading view
    showLoadingWithUrls('Starting analysis...', extractResponse.results);
    
    // Start analysis in background
    const analysisResponse = await chrome.runtime.sendMessage({
      type: 'START_SERP_ANALYSIS',
      data: {
        urls: extractResponse.results,
        searchQuery: extractResponse.searchQuery,
        tabId: state.tabId
      }
    });
    
    hideLoading();
    
    if (!analysisResponse || !analysisResponse.success) {
      throw new Error(analysisResponse?.error || 'Analysis failed');
    }
    
    // console.log('[Sidebar] Analysis complete:', analysisResponse.results.length, 'results');
    
    // Show SERP view with results
    state.serpResults = analysisResponse.results;
    state.searchQuery = extractResponse.searchQuery;
    showSerpView();
    
  } catch (error) {
    console.error('[Sidebar] SERP analysis failed:', error);
    hideLoading();
    showError('Analysis Failed', error.message);
  }
}

/**
 * Show SERP view with results
 */
function showSerpView() {
  // console.log('[Sidebar] Showing SERP view');
  
  // Initialize SERP view if not already done
  if (!state.serpView) {
    state.serpView = new SerpView(elements.serpView, {
      onBack: async () => {
        showView('home');
        await checkGoogleSerp();
      },
      onAskQuestion: handleSerpAskQuestion,
      onOpenUrl: handleSerpOpenUrl,
      onReAnalyze: handleAnalyzeSerp,
      onCompare: handleSerpCompare,
      onRefresh: handleSerpRefresh,
      onDiveDeeper: handleDiveDeeper
    });
  }
  
  // Set query and results
  state.serpView.setQuery(state.searchQuery);
  state.serpView.setResults(state.serpResults);
  
  // Show view
  showView('serp');
}

/**
 * Handle asking question about a SERP result
 */
async function handleSerpAskQuestion(result) {
  // console.log('[Sidebar] Ask question about SERP result:', result.url);
  
  // Set sections from this result
  state.sections = result.sections;
  
  // Save to session
  if (state.sessionId) {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SECTIONS',
      data: {
        sessionId: state.sessionId,
        sections: state.sections,
        statistics: {
          sections: state.sections.length,
          words: state.sections.reduce((sum, s) => sum + (s.text.split(/\s+/).length), 0)
        }
      }
    });
  }
  
  // Initialize Q&A
  await initializeQnA();
  
  // Initialize chat view
  if (!state.chatView) {
    state.chatView = new ChatView(elements.chatView, {
      onSendMessage: handleChatQuestion,
      onBack: () => showView('serp'),
      onCitationClick: handleCitationClick,
      onNewChat: handleNewChat,
      onClear: handleNewChat,
      onShowRecap: handleShowRecap
    });
  }
  
  // Show chat
  showView('chat');
}

/**
 * Handle opening SERP result URL
 */
function handleSerpOpenUrl(url) {
  // console.log('[Sidebar] Opening URL:', url);
  chrome.tabs.create({ url, active: true });
}

/**
 * Handle SERP comparison request
 * Uses multi-page worker for BM25 retrieval + AI
 */
async function handleSerpCompare(question, results, searchQuery) {
  // console.log('[Sidebar] Comparing SERP results with question:', question);
  
  // Show loading state
  state.serpView.showCompareLoading();
  
  // Set up streaming handler
  state.isComparing = true;
  state.compareStartTime = Date.now();
  
  try {
    // Step 1: Prepare results (ensure full content) via service worker
    const response = await chrome.runtime.sendMessage({
      type: 'COMPARE_SERP_RESULTS',
      data: {
        results: results,
        question: question,
        searchQuery: searchQuery,
        tabId: state.tabId
      }
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to prepare results');
    }
    
    const preparedResults = response.preparedResults;
    // console.log('[Sidebar] Results prepared, starting comparison with', preparedResults.length, 'pages');
    
    // Step 2: Create worker (Workers ARE available in sidebar context!)
    const worker = new Worker(
      chrome.runtime.getURL('workers/multi-page-qna-worker.js'),
      { type: 'module' }
    );
    
    // console.log('[Sidebar] Worker created, initializing...');
    
    // Step 3: Prepare pages data
    const pages = preparedResults.map(r => ({
      url: r.url,
      title: r.title,
      extractedContent: r.extractedContent
    }));
    
    // Step 4: Initialize worker
    const initRequestId = `init_${Date.now()}`;
    worker.postMessage({
      type: 'INITIALIZE',
      data: { pages },
      requestId: initRequestId
    });
    
    // Wait for initialization
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout'));
      }, 10000);
      
      const handleMessage = (event) => {
        if (event.data.type === 'INITIALIZED' && event.data.requestId === initRequestId) {
          clearTimeout(timeout);
          worker.removeEventListener('message', handleMessage);
          resolve();
        }
      };
      
      worker.addEventListener('message', handleMessage);
    });
    
    // console.log('[Sidebar] ✅ Worker initialized');
    
    // Step 5: Ask question with streaming
    const askRequestId = `ask_${Date.now()}`;
    worker.postMessage({
      type: 'ASK_QUESTION_STREAMING',
      data: { question },
      requestId: askRequestId
    });
    
    // Handle streaming response
    await new Promise((resolve, reject) => {
      let fullAnswer = '';
      
      const handleMessage = (event) => {
        const { type, requestId: msgRequestId } = event.data;
        
        if (msgRequestId !== askRequestId) return;
        
        if (type === 'ANSWER_CHUNK') {
          fullAnswer = event.data.chunk;
          // Display streaming chunk
          state.serpView.displayComparison(fullAnswer, false); // false = streaming
        }
        else if (type === 'ANSWER_COMPLETE') {
          worker.removeEventListener('message', handleMessage);
          worker.terminate();
          // console.log('[Sidebar] ✅ Comparison complete');
          
          // Display final formatted result
          state.serpView.displayComparison(event.data.answer, true); // true = complete
          resolve();
        }
        else if (type === 'ERROR') {
          worker.removeEventListener('message', handleMessage);
          worker.terminate();
          reject(new Error(event.data.error));
        }
      };
      
      worker.addEventListener('message', handleMessage);
      
      // Timeout
      setTimeout(() => {
        worker.terminate();
        reject(new Error('Comparison timeout'));
      }, 30000);
    });
    
    state.isComparing = false;
    // console.log('[Sidebar] Comparison displayed successfully');
    
  } catch (error) {
    state.isComparing = false;
    console.error('[Sidebar] Comparison error:', error);
    state.serpView.showCompareError('Comparison failed: ' + error.message);
  }
}

/**
 * Handle "Dive Deeper" - Create multi-page chat session
 */
async function handleDiveDeeper(data) {
  // console.log('[Sidebar] 🚀 Dive Deeper clicked:', data);
  
  try {
    // Create multi-page chat session
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_MULTI_PAGE_CHAT',
      data: {
        tabId: state.tabId,
        pages: data.results,
        searchQuery: data.searchQuery,
        initialQuestion: data.question,
        initialAnswer: data.answer
      }
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to create multi-page chat');
    }
    
    // console.log('[Sidebar] ✅ Multi-page chat session created:', response.sessionId);
    
    // Update state with new session
    state.sessionId = response.sessionId;
    state.session = response.session;
    
    // Initialize chat view if not already done
    if (!state.chatView) {
      state.chatView = new ChatView(elements.chatView, {
        onSendMessage: handleChatQuestion,
        onBack: async () => {
          // Check if we have a valid summary with content
          if (state.summary && state.summary.sectionSummaries && state.summary.sectionSummaries.length > 0) {
            showView('summary');
          } else {
            showView('home');
            // Refresh home view UI
            await refreshPreviousSessionNotice();
            updateViewSummaryButton();
            await checkGoogleSerp();
          }
        },
        onCitationClick: handleCitationClick,
        onNewChat: handleNewChat,
        onClearChat: handleNewChat,
        onShowRecap: handleShowRecap
      });
    }
    
    // Enable multi-page mode
    const pageCount = response.session.content.pages.length;
    state.chatView.setMultiPageMode(pageCount);
    
    // Load existing chat history
    if (response.session.chatHistory && response.session.chatHistory.length > 0) {
      state.chatView.loadHistory(response.session.chatHistory);
    }
    
    // Show chat view
    showView('chat');
    
    // console.log('[Sidebar] Switched to multi-page chat view');
    
  } catch (error) {
    console.error('[Sidebar] Failed to create multi-page chat:', error);
    showError('Multi-Page Chat Error', error.message || 'Failed to create multi-page chat session');
  }
}

/**
 * Handle SERP result refresh (force reload from live page)
 */
async function handleSerpRefresh(result, index) {
  // console.log('[Sidebar] Refreshing SERP result:', result.url);
  
  // Show loading
  state.serpView.showLoading('Refreshing from live page...');
  
  try {
    // Send force refresh request to service worker
    const response = await chrome.runtime.sendMessage({
      type: 'FORCE_REFRESH_SERP_RESULT',
      data: {
        urlData: {
          url: result.url,
          title: result.title,
          snippet: result.snippet,
          position: result.position
        },
        searchQuery: state.searchQuery
      }
    });
    
    if (response.success) {
      // Update the result in state
      state.serpResults[index] = response.result;
      
      // Re-render results
      state.serpView.setResults(state.serpResults);
      state.serpView.hideLoading();
      
      // console.log('[Sidebar] Result refreshed successfully');
    } else {
      // Show error
      state.serpView.hideLoading();
      state.serpView.showError(response.error || 'Failed to refresh result');
      console.error('[Sidebar] Refresh failed:', response.error);
    }
  } catch (error) {
    console.error('[Sidebar] Refresh error:', error);
    state.serpView.hideLoading();
    state.serpView.showError('An error occurred while refreshing');
  }
}

/**
 * Initialize sidebar
 */
async function initialize() {
  // console.log('[Sidebar] Initializing...');
  
  try {
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tabId = tab.id;
    state.currentUrl = tab.url;
    
    // console.log('[Sidebar] Tab:', state.tabId, state.currentUrl);
    
    // Setup event listeners
    setupEventListeners();
    
  // Initialize workers
  initializeWorkers();
  
  // Check for pending research session (from research mode)
  const pendingResearch = await chrome.storage.session.get('nutshell_pending_research_session');
  if (pendingResearch.nutshell_pending_research_session) {
    const { sessionId, timestamp } = pendingResearch.nutshell_pending_research_session;
    
    // Only use if less than 10 seconds old
    if (Date.now() - timestamp < 10000) {
      console.log('[Sidebar] Loading pending research session:', sessionId);
      
      // Clear the pending session
      await chrome.storage.session.remove('nutshell_pending_research_session');
      
      // Load the specific session
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SPECIFIC_SESSION',
        data: { sessionId }
      });
      
      if (response && response.success && response.session) {
        state.sessionId = sessionId; // ✅ FIX: Use state.sessionId, not state.currentSessionId
        state.session = response.session;
        
        // Associate session with current tab in service worker
        await chrome.runtime.sendMessage({
          type: 'ASSOCIATE_SESSION_WITH_TAB',
          data: {
            sessionId: sessionId,
            tabId: state.tabId
          }
        });
        
        // Initialize chat view
        if (!state.chatView) {
          state.chatView = new ChatView(elements.chatView, {
            onSendMessage: handleChatQuestion,
            onBack: async () => {
              showView('home');
              await refreshPreviousSessionNotice();
              updateViewSummaryButton();
              await checkGoogleSerp();
            },
            onCitationClick: handleCitationClick,
            onNewChat: handleNewChat,
            onClearChat: handleNewChat,
            onShowRecap: handleShowRecap
          });
        }
        
        // Enable multi-page mode
        const pageCount = response.session.content.pages.length;
        state.chatView.setMultiPageMode(pageCount);
        
        // Load chat history
        if (response.session.chatHistory && response.session.chatHistory.length > 0) {
          state.chatView.messages = JSON.parse(JSON.stringify(response.session.chatHistory));
          state.chatView.elements.messages.innerHTML = '';
          state.chatView.renderAllMessages();
        }
        
        // Setup tab listeners
        setupTabListeners();
        
        // Show chat view
        showView('chat');
        
        console.log('[Sidebar] ✅ Research mode session loaded and associated with tab');
        return; // Skip normal session loading
      } else {
        console.warn('[Sidebar] Failed to load research session, falling back to normal flow');
      }
    } else {
      // Remove stale session
      await chrome.storage.session.remove('nutshell_pending_research_session');
    }
  }
  
  // ✅ CRITICAL: Ensure home UI is normal BEFORE getting session
  // This restores the View Summary button if it was removed by showInternalPageMessage()
  ensureHomeUIIsNormal();
  
  // Normal session loading
  await getSession();
    
    // Listen for tab changes and navigation
    setupTabListeners();
    
    // Check if Google SERP
    await checkGoogleSerp();
    
    // ✅ CRITICAL: Update View Summary button after everything is initialized
    // This ensures the button is updated even if it wasn't ready during getSession()
    setTimeout(() => {
      console.log('[Sidebar] Post-initialization View Summary button update');
      updateViewSummaryButton();
    }, 100);
    
    // console.log('[Sidebar] ✅ Initialization complete');
    // console.log('[Sidebar] Current state:', {
    //   sessionId: state.sessionId,
    //   tabId: state.tabId,
    //   url: state.currentUrl,
    //   isGoogleSerp: state.isGoogleSerp
    // });
  } catch (error) {
    console.error('[Sidebar] Initialization failed:', error);
    showError('Initialization failed', error.message + '. Please try reloading the extension.');
  }
}

/**
 * Setup listeners for tab changes and navigation
 */
function setupTabListeners() {
  // Listen for tab activation (user switches tabs)
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    // console.log('[Sidebar] Tab activated:', activeInfo.tabId);
    
    // Only reload if switching to a different tab
    if (state.tabId !== activeInfo.tabId) {
      // console.log('[Sidebar] Switching from tab', state.tabId, 'to', activeInfo.tabId);
      await reloadForTab(activeInfo.tabId);
    }
  });
  
  // Listen for tab updates (navigation, URL changes)
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only handle updates for the current tab
    if (tabId !== state.tabId) return;
    
    // CRITICAL: Only handle navigation ONCE per URL change
    // Wait for 'complete' status to ensure page is fully loaded before extraction
    if (changeInfo.status === 'complete' && tab.url !== state.currentUrl) {
      // console.log('[Sidebar] Navigation complete:', state.currentUrl, '→', tab.url);
      await handleNavigation(tab);
    }
  });
  
  // console.log('[Sidebar] ✅ Tab listeners setup complete');
}

/**
 * Reload sidebar state for a different tab
 */
async function reloadForTab(tabId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || tab.id !== tabId) {
      // console.log('[Sidebar] Tab no longer active, skipping reload');
      return;
    }
    
    // console.log('[Sidebar] Reloading for tab:', tab.id, tab.url);
    
    // Save current tab's state before switching
    if (state.tabId) {
      saveTabState(state.tabId);
    }
    
    // DON'T clear pendingQuestionTabId here!
    // We need to keep it so responses go to the correct tab
    
    // Completely destroy current chat view to prevent state pollution
    if (state.chatView) {
      // Remove all event listeners by clearing container
      elements.chatView.innerHTML = '';
      state.chatView = null;
    }
    
    // Update tab info
    state.tabId = tab.id;
    state.currentUrl = tab.url;
    
    // console.log('[Sidebar] 📍 Updated state | tabId:', state.tabId, '| URL:', state.currentUrl);
    
    // Try to restore cached state for this tab
    const cachedState = tabStateCache.get(tabId);
    if (cachedState) {
      // console.log('[Sidebar] 📦 Found cached state | view:', cachedState.currentView, '| sessionId:', cachedState.sessionId, '| url:', cachedState.url);
      await restoreTabState(cachedState);
    } else {
      // console.log('[Sidebar] ❌ No cached state for tab:', tabId, '- creating fresh session');
      // No cached state, clear and get new session
      clearState();
      
      // Check if this is an internal page BEFORE getting session
      const isInternalPage = !tab.url || 
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:') ||
        tab.url === 'about:blank' ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('brave://');
      
      if (isInternalPage) {
        console.log('[Sidebar] Internal page detected:', tab.url);
        showInternalPageMessage();
      } else {
        await getSession();
        
        // ✅ After getting session, update View Summary button in case we restored summary
        updateViewSummaryButton();
      }
    }
    
    // Check if current page is Google SERP (for SERP analysis section)
    await checkGoogleSerp();
    
    // Check if session recap should be shown
    await checkSessionRecap();
    
    // console.log('[Sidebar] ✅ Reloaded for tab:', tabId);
  } catch (error) {
    console.error('[Sidebar] Failed to reload for tab:', error);
  }
}

/**
 * Handle navigation to a new page
 */
async function handleNavigation(tab) {
  try {
    // console.log('[Sidebar] Handling navigation to:', tab.url);
    
    // Update activity tracker
    updateTabActivity();
    
    const oldUrl = state.currentUrl;
    const wasInChat = state.currentView === 'chat';
    
    // Create conversation summary if we have chat history
    let conversationSummary = null;
    if (wasInChat && state.chatView && state.chatView.messages.length > 0) {
      // Show loading indicator while generating summary
      showLoading('Summarizing conversation...');
      
      try {
        conversationSummary = await generateConversationSummary(state.chatView.messages);
      } catch (error) {
        console.warn('[Sidebar] Failed to generate AI summary, using simple fallback:', error);
        // Fallback: Extract first few words from each question
        const userQuestions = state.chatView.messages
          .filter(msg => msg.role === 'user')
          .map(msg => {
            // Get first 4 words from each question
            const words = msg.content.split(/\s+/).slice(0, 4).join(' ');
            return words.replace(/[?.,!]/g, '');
          });
        
        if (userQuestions.length > 0) {
          conversationSummary = userQuestions.join(' → ').substring(0, 80);
        }
      } finally {
        hideLoading();
      }
      
      // Save conversation summary to session
      if (conversationSummary && state.sessionId) {
        chrome.runtime.sendMessage({
          type: 'SAVE_CONVERSATION_SUMMARY',
          data: {
            sessionId: state.sessionId,
            summary: conversationSummary
          }
        }).catch(err => console.warn('[Sidebar] Failed to save conversation summary:', err));
      }
    }
    
    // Track navigation (save current page to history) - AWAIT THIS!
    if (state.sessionId && oldUrl && state.sections && state.sections.length > 0) {
      try {
        const trackResult = await chrome.runtime.sendMessage({
          type: 'TRACK_NAVIGATION',
          data: {
            sessionId: state.sessionId,
            url: tab.url,
            title: tab.title,
            chatSummary: conversationSummary
          }
        });
        // console.log('[Sidebar] ✅ Navigation tracked - pages in context:', trackResult.recentPagesCount + 1);
      } catch (error) {
        console.warn('[Sidebar] Failed to track navigation:', error);
      }
    }
    
    // Clear old content
    state.sections = null;
    state.summary = null;
    state.qnaReady = false;
    
    // Clear SERP state when navigating (fix for issue #2)
    state.isGoogleSerp = false;
    state.searchQuery = null;
    state.serpResults = null;
    
    // Hide View Summary button and SERP section (fix for issues #1 and #2)
    updateViewSummaryButton();
    if (elements.serpAnalysisSection) {
      elements.serpAnalysisSection.classList.add('hidden');
    }
    
    // Update current URL
    state.currentUrl = tab.url;
    
    // Get or create new session for this URL
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SESSION',
      data: {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        previousUrl: oldUrl
      }
    });
    
    if (response && response.success) {
      state.sessionId = response.sessionId;
      
      // If navigating from internal page, restore normal home UI
      if (oldUrl && (oldUrl.startsWith('chrome://') || oldUrl.startsWith('about:') || oldUrl === 'about:blank')) {
        // console.log('[Sidebar] Restoring normal UI after leaving internal page');
        restoreNormalHomeUI();
        // Check for previous session
        if (response.previousSession) {
          showPreviousSessionNotice(response.previousSession);
        }
        // CRITICAL: Check SERP status and update button visibility
        await checkGoogleSerp();
      }
      
      // If user was in chat, show navigation notice and stay in chat
      if (wasInChat && state.chatView) {
        // Add navigation message to chat with conversation summary
        state.chatView.addNavigationMessage(oldUrl, tab.url, tab.title, conversationSummary);
        
        // Auto-extract new page content in background
        // console.log('[Sidebar] Auto-extracting new page content after navigation...');
        
        try {
          let extractResult;
          
          try {
            // Try to extract from content script
            extractResult = await chrome.tabs.sendMessage(tab.id, {
              type: 'EXTRACT_CONTENT',
              data: {}
            });
          } catch (error) {
            if (error.message.includes('Receiving end does not exist')) {
              // console.log('[Sidebar] Content script not loaded on new page, injecting...');
              
              // Inject content script
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/content-script.js']
              });
              
              // Wait for script to initialize
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Retry extraction
              extractResult = await chrome.tabs.sendMessage(tab.id, {
                type: 'EXTRACT_CONTENT',
                data: {}
              });
            } else {
              throw error;
            }
          }
          
          if (extractResult && extractResult.success && extractResult.sections) {
            state.sections = extractResult.sections;
            // console.log('[Sidebar] ✅ Auto-extracted', state.sections.length, 'sections');
            
            // Save sections to session
            await chrome.runtime.sendMessage({
              type: 'SAVE_SECTIONS',
              data: {
                sessionId: state.sessionId,
                sections: state.sections,
                statistics: extractResult.statistics
              }
            });
            
            // Re-initialize Q&A with ONLY new page content + conversation summary
            // DON'T include old pages' sections - only the conversation flow summary
            await initializeQnA(conversationSummary);
            
            state.chatView.addSystemMessage('✅ Ready to answer your questions.');
          } else {
            throw new Error('Extraction returned no sections');
          }
        } catch (error) {
          console.error('[Sidebar] Auto-extraction failed:', error);
          state.chatView.addSystemMessage('⚠️ Could not auto-extract new page. Please reload the page (F5) and try again.');
        }
      } else {
        // Not in chat, check if we have previous content
        if (response.session && response.session.content && response.session.content.summary) {
          // console.log('[Sidebar] Loading existing summary for new page');
          displaySummary(response.session.content.summary, response.session.content.statistics);
        } else {
          showView('home');
        }
      }
    }
    
    // console.log('[Sidebar] ✅ Navigation handled');
  } catch (error) {
    console.error('[Sidebar] Failed to handle navigation:', error);
  }
  
  // CRITICAL: Check if current page is Google SERP (for SERP analysis section)
  // This runs regardless of success/failure to ensure UI is always correct
  await checkGoogleSerp();
}

/**
 * Save current tab state to cache
 */
function saveTabState(tabId) {
  // console.log('[Sidebar] Saving state for tab:', tabId);
  
  // Get chat messages count
  const chatMessagesCount = state.chatView ? state.chatView.messages.length : 0;
  
  // Check if there's a streaming message in progress
  let streamingMessage = null;
  if (state.chatView && state.chatView.streamingMessageId) {
    const streamingEl = state.chatView.elements.messages.querySelector(`[data-message-id="${state.chatView.streamingMessageId}"]`);
    if (streamingEl) {
      const contentEl = streamingEl.querySelector('.message-text');
      if (contentEl) {
        streamingMessage = {
          id: state.chatView.streamingMessageId,
          content: contentEl.textContent,
          role: 'assistant'
        };
        // console.log('[Sidebar] 💾 Saving streaming message in progress:', streamingMessage.content.substring(0, 50) + '...');
      }
    }
  }
  
  const tabState = {
    currentView: state.currentView,
    sessionId: state.sessionId,
    session: state.session, // Save the session object (for multi-page chat detection)
    url: state.currentUrl,
    sections: state.sections,
    summary: state.summary,
    qnaReady: state.qnaReady,
    // Save chat messages if chat view exists (create a copy to avoid reference issues)
    chatMessages: state.chatView ? JSON.parse(JSON.stringify(state.chatView.messages)) : [],
    // Save streaming message if in progress
    streamingMessage: streamingMessage,
    // Save summary state (prevents overlapping summaries)
    isSummarizing: state.isSummarizing && state.summaryTabId === tabId,  // Only if summarizing THIS tab
    // Save SERP analysis state
    isGoogleSerp: state.isGoogleSerp,
    searchQuery: state.searchQuery,
    serpResults: state.serpResults
  };
  
  tabStateCache.set(tabId, tabState);
  // console.log('[Sidebar] ✅ State saved for tab:', tabId, '| view:', tabState.currentView, '| messages:', chatMessagesCount, '| sections:', state.sections?.length || 0, '| serpResults:', state.serpResults?.length || 0);
}

/**
 * Restore tab state from cache
 */
async function restoreTabState(cachedState) {
  console.log('[Sidebar] Restoring state for tab:', state.tabId, '| URL:', state.currentUrl, '| view:', cachedState.currentView);
  
  state.sessionId = cachedState.sessionId;
  state.session = cachedState.session; // Restore session object (for multi-page chat)
  state.sections = cachedState.sections;
  state.summary = cachedState.summary;
  state.qnaReady = cachedState.qnaReady;
  
  // Restore summary state if this tab was being summarized
  if (cachedState.isSummarizing) {
    state.isSummarizing = true;
    state.summaryTabId = state.tabId;
    console.log('[Sidebar] Restoring in-progress summary for tab:', state.tabId);
  }
  
  // ✅ Check if this is an internal page FIRST
  const isInternalPage = !state.currentUrl || 
    state.currentUrl.startsWith('chrome://') || 
    state.currentUrl.startsWith('chrome-extension://') ||
    state.currentUrl.startsWith('about:') ||
    state.currentUrl === 'about:blank' ||
    state.currentUrl.startsWith('edge://') ||
    state.currentUrl.startsWith('brave://');
  
  if (isInternalPage) {
    console.log('[Sidebar] Restoring internal page, showing message');
    showInternalPageMessage();
    return; // Don't restore other views for internal pages
  }
  
  // Restore view
  if (cachedState.currentView === 'home') {
    // ✅ EXPLICIT: Home view restoration
    console.log('[Sidebar] Restoring home view for tab:', state.tabId, '| hasSummary:', !!state.summary, '| sectionCount:', state.summary?.sectionSummaries?.length || 0);
    ensureHomeUIIsNormal();
    showView('home');
    // CRITICAL: Always refresh notice to show correct data for THIS tab
    // The sidebar DOM is shared across tabs, so we must update it every time
    await refreshPreviousSessionNotice();
  } else if (cachedState.currentView === 'summary' && cachedState.summary) {
    // Restore saved summary view
    if (cachedState.summary.sectionSummaries && cachedState.summary.sectionSummaries.length > 0) {
      // Convert back to sections format for display
      const sections = cachedState.summary.sectionSummaries.map(s => ({
        id: s.id,
        heading: s.heading,
        originalText: ''
      }));
      displaySectionsForSummary(sections);
      
      // Immediately populate with saved summaries
      cachedState.summary.sectionSummaries.forEach((summaryData, index) => {
        updateSectionSummary({
          ...summaryData,
          sectionIndex: index,
          totalSections: cachedState.summary.sectionSummaries.length
        });
      });
      
      // Update button after restoring summaries
      updateViewSummaryButton();
      showView('summary');
    } else {
      // No valid summaries, go to home
      // console.log('[Sidebar] No valid summaries in cache, showing home');
      showView('home');
    }
  } else if (cachedState.currentView === 'chat' && (cachedState.sections || (cachedState.session && cachedState.session.type === 'multiPageChat'))) {
    // ALWAYS create a COMPLETELY FRESH chat view for each tab
    // This ensures complete tab isolation and no DOM pollution
    // Restore chat for both regular (with sections) and multi-page chat sessions
    
    // Clear the container first to remove any existing DOM
    elements.chatView.innerHTML = '';
    
    state.chatView = new ChatView(elements.chatView, {
      onSendMessage: handleChatQuestion,
      onBack: async () => {
        // Check if we have a valid summary with content
        if (state.summary && state.summary.sectionSummaries && state.summary.sectionSummaries.length > 0) {
          showView('summary');
        } else {
          showView('home');
          // Refresh home view UI
          await refreshPreviousSessionNotice();
          updateViewSummaryButton();
          await checkGoogleSerp();
        }
      },
      onCitationClick: handleCitationClick,
      onNewChat: handleNewChat,
      onClear: () => {
        state.qnaReady = false;
        initializeQnA();
      },
      onShowRecap: handleShowRecap
    });
    
    // Reset waiting state (critical for send button to work)
    state.chatView.isWaiting = false;
    state.chatView.elements.sendBtn.disabled = true; // Will be enabled when user types
    
    // CRITICAL: Check if this is a multi-page chat session FIRST
    // Must set multi-page mode BEFORE rendering messages
    if (state.session && state.session.type === 'multiPageChat') {
      // Enable multi-page mode indicator
      const pageCount = state.session.content?.pages?.length || 0;
      // console.log('[Sidebar] Restoring multi-page chat with', pageCount, 'pages');
      state.chatView.setMultiPageMode(pageCount);
    }
    
    // Restore chat messages (create a COPY to avoid reference issues)
    if (cachedState.chatMessages && cachedState.chatMessages.length > 0) {
      // console.log('[Sidebar] Restoring', cachedState.chatMessages.length, 'messages for this tab');
      
      // Deep copy messages to avoid cache pollution
      state.chatView.messages = JSON.parse(JSON.stringify(cachedState.chatMessages));
      
      // Completely re-render from scratch
      const welcome = state.chatView.elements.messages.querySelector('.chat-welcome');
      if (welcome) {
        welcome.remove();
      }
      state.chatView.elements.messages.innerHTML = '';
      state.chatView.renderAllMessages();
    }
    
    // Restore streaming message if it was in progress (AFTER rendering regular messages)
    if (cachedState.streamingMessage) {
      // console.log('[Sidebar] 📥 Restoring streaming message:', cachedState.streamingMessage.content.substring(0, 50) + '...');
      
      // Set the streaming message ID
      state.chatView.streamingMessageId = cachedState.streamingMessage.id || `msg_${Date.now()}`;
      
      // Recreate the streaming message element
      const messageEl = document.createElement('div');
      messageEl.className = 'message message-assistant';
      messageEl.dataset.messageId = state.chatView.streamingMessageId;
      messageEl.innerHTML = `
        <div class="message-avatar">
          <img src="../assets/logo.png" alt="NutShell" class="assistant-logo">
        </div>
        <div class="message-content">
          <div class="message-text">${state.chatView.escapeHTML(cachedState.streamingMessage.content)}</div>
        </div>
      `;
      
      state.chatView.elements.messages.appendChild(messageEl);
      state.chatView.scrollToBottom();
      
      // Keep the waiting state so user knows it's still processing
      state.chatView.isWaiting = true;
      state.chatView.elements.sendBtn.disabled = true;
    }
    
    // Check if there's a pending answer from streaming that completed while tab was inactive
    if (cachedState.pendingAnswer) {
      console.log('[Sidebar] 📥 Restoring pending answer from background streaming:', cachedState.pendingAnswer.answer?.length, 'chars');
      
      // Add the completed answer to the chat
      state.chatView.finalizeStreamingResponse(cachedState.pendingAnswer.answer, {
        citations: cachedState.pendingAnswer.citations,
        responseTime: cachedState.pendingAnswer.responseTime
      });
      
      // Clear the pending answer from cache
      delete cachedState.pendingAnswer;
      tabStateCache.set(state.tabId, cachedState);
    }
    
    // If NOT multi-page chat, re-initialize Q&A for regular single-page chat
    if (!state.session || state.session.type !== 'multiPageChat') {
      // Regular single-page chat - re-initialize Q&A
      if (state.sections && state.sections.length > 0) {
        // console.log('[Sidebar] Re-initializing Q&A for tab with', state.sections.length, 'sections');
        state.qnaReady = false; // Force re-init
        initializeQnA();
      }
    }
    
    showView('chat');
  } else if (cachedState.currentView === 'history') {
    // Restore history view
    if (!state.historyView) {
      state.historyView = new HistoryView(elements.historyView, {
        onBack: () => {
          if (state.summary) {
            showView('summary');
          } else if (state.sections && state.chatView) {
            showView('chat');
          } else {
            showView('home');
          }
        },
        onSessionClick: handleHistorySessionClick
      });
    }
    state.historyView.loadSessions();
    showView('history');
  } else if (cachedState.currentView === 'serp' && cachedState.serpResults) {
    // Restore SERP analysis view
    // console.log('[Sidebar] Restoring SERP view with', cachedState.serpResults.length, 'results');
    state.isGoogleSerp = cachedState.isGoogleSerp || false;
    state.searchQuery = cachedState.searchQuery || '';
    state.serpResults = cachedState.serpResults || [];
    
    // Show SERP view with restored results
    showSerpView();
    if (state.serpResults.length > 0) {
      state.serpView.setResults(state.serpResults);
    }
  } else {
    // Home view (or any other view) - always ensure home HTML is correct
    // console.log('[Sidebar] Restoring home view for tab:', state.tabId, 'URL:', state.currentUrl);
    ensureHomeUIIsNormal();
    showView('home');
    // ✅ CRITICAL: Always refresh notice to show correct data for THIS tab
    // The sidebar DOM is shared across tabs, so we must update it every time
    await refreshPreviousSessionNotice();
  }
  
  // ✅ ALWAYS update View Summary button at the end (after DOM is fully restored)
  updateViewSummaryButton();
  console.log('[Sidebar] ✅ Final updateViewSummaryButton() called after full restore');
  
  // CRITICAL: Check Google SERP status to show/hide SERP analysis section
  await checkGoogleSerp();
  
  console.log('[Sidebar] ✅ Tab state fully restored | view:', state.currentView, '| hasSummary:', !!state.summary);
}

/**
 * Clear current state (for tab switch or navigation)
 */
function clearState() {
  // console.log('[Sidebar] Clearing state');
  
  // Clear content
  state.sections = null;
  state.summary = null;
  state.qnaReady = false;
  
  // Clear SERP state (fix for issue #2)
  state.isGoogleSerp = false;
  state.searchQuery = null;
  state.serpResults = null;
  
  // Clear chat view
  if (state.chatView) {
    state.chatView.clear();
  }
  
  // Ensure home view has correct HTML
  ensureHomeUIIsNormal();
  
  // Update View Summary button (should hide since summary is null)
  updateViewSummaryButton();
  
  // Hide SERP analysis section (fix for issue #2)
  if (elements.serpAnalysisSection) {
    elements.serpAnalysisSection.classList.add('hidden');
  }
  
  // Show home view
  showView('home');
}

/**
 * Initialize workers
 */
function initializeWorkers() {
  // Create summarizer worker
  state.summarizerWorker = new Worker(
    chrome.runtime.getURL('workers/summarizer-worker.js'),
    { type: 'module' }
  );
  
  state.summarizerWorker.addEventListener('message', handleSummarizerMessage);
  state.summarizerWorker.addEventListener('error', (error) => {
    console.error('[Sidebar] Summarizer worker error:', error);
  });
  
  // Create Q&A worker
  state.qnaWorker = new Worker(
    chrome.runtime.getURL('workers/qna-worker.js'),
    { type: 'module' }
  );
  
  state.qnaWorker.addEventListener('message', handleQnAMessage);
  state.qnaWorker.addEventListener('error', (error) => {
    console.error('[Sidebar] Q&A worker error:', error);
  });
  
  // console.log('[Sidebar] Workers initialized');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Button clicks
  elements.summarizeBtn.addEventListener('click', handleSummarize);
  elements.askBtn.addEventListener('click', handleAskQuestion);
  elements.viewSummaryBtn.addEventListener('click', handleViewSummary);
  elements.historyBtn.addEventListener('click', handleShowHistory);
  elements.settingsBtn.addEventListener('click', handleShowSettings);
  elements.themeBtn.addEventListener('click', toggleTheme);
  elements.backToHomeBtn.addEventListener('click', async () => {
    showView('home');
    updateViewSummaryButton();
    await checkGoogleSerp();
  });
  elements.chatFromSummaryBtn.addEventListener('click', handleAskQuestion); // Use same handler
  elements.continueChatBtn.addEventListener('click', handleContinueChat);
  elements.retryBtn.addEventListener('click', handleRetry);
  elements.dismissErrorBtn.addEventListener('click', hideError);
  
  // Settings listeners
  if (elements.settingsBackBtn) {
    elements.settingsBackBtn.addEventListener('click', async () => {
      showView('home');
      // Refresh home view UI
      await refreshPreviousSessionNotice();
      updateViewSummaryButton();
      await checkGoogleSerp();
    });
  }
  if (elements.enableRecapCheckbox) {
    elements.enableRecapCheckbox.addEventListener('change', handleSettingsChange);
  }
  if (elements.recapTimerInput) {
    elements.recapTimerInput.addEventListener('change', handleSettingsChange);
  }
  if (elements.openCacheViewerBtn) {
    elements.openCacheViewerBtn.addEventListener('click', handleOpenCacheViewer);
  }
  
  // SERP analysis listener
  if (elements.analyzeSerpBtn) {
    elements.analyzeSerpBtn.addEventListener('click', handleAnalyzeSerp);
  }
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
  
  // Load and apply theme
  loadTheme();
  
  // console.log('[Sidebar] ✅ Event listeners setup');
}

/**
 * Get or create session for current tab
 */
async function getSession() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // console.log('[Sidebar] Requesting session for tab:', tab.id);
    
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SESSION',
      data: {
        tabId: tab.id,
        url: tab.url,
        title: tab.title
      }
    });
    
    // console.log('[Sidebar] GET_SESSION response:', response);
    
    if (!response) {
      throw new Error('No response from service worker. Extension may need to be reloaded.');
    }
    
    if (response.success) {
      state.sessionId = response.sessionId;
      state.session = response.session; // Always update current session object
      
      // Check if there's a previous session
      if (response.previousSession) {
        // console.log('[Sidebar] Previous session found:', response.previousSession);
        showPreviousSessionNotice(response.previousSession);
      } else {
        // console.log('[Sidebar] No previous session found, hiding notice');
        // Explicitly hide notice if no previous session
        const noticeElement = document.getElementById('previousSessionNotice');
        if (noticeElement) {
          noticeElement.classList.add('hidden');
        }
      }
      
      // Check if session has content
      if (response.session && response.session.content && response.session.content.sectionSummaries) {
        console.log('[Sidebar] Loading existing summary with', response.session.content.sectionSummaries.length, 'sections');
        state.summary = {
          sectionSummaries: response.session.content.sectionSummaries,
          statistics: response.session.content.statistics
        };
        console.log('[Sidebar] State.summary set:', state.summary);
        updateViewSummaryButton();
      } else {
        console.log('[Sidebar] No summary in session:', {
          hasSession: !!response.session,
          hasContent: !!response.session?.content,
          hasSectionSummaries: !!response.session?.content?.sectionSummaries,
          length: response.session?.content?.sectionSummaries?.length
        });
      }
      
      // console.log('[Sidebar] ✅ Session ready:', state.sessionId);
    } else if (response.isInternalPage) {
      // Show friendly message for internal pages
      // console.log('[Sidebar] Internal page detected');
      showInternalPageMessage();
    } else {
      throw new Error(response.error || 'Failed to get session');
    }
  } catch (error) {
    console.error('[Sidebar] ❌ Failed to get session:', error);
    showError('Failed to initialize session', error.message + '\n\nTry reloading the extension.');
    throw error; // Re-throw so initialize() can catch it
  }
}

/**
 * Refresh previous session notice (check for updates)
 */
async function refreshPreviousSessionNotice() {
  // console.log('[Sidebar] refreshPreviousSessionNotice called | tab:', state.tabId, '| URL:', state.currentUrl, '| session:', state.sessionId);
  
  // ✅ CRITICAL: Only require URL, not sessionId
  // We need to check for previous sessions even if there's no active session (sessionId is null)
  if (!state.currentUrl) {
    // console.log('[Sidebar] No URL to check for previous sessions');
    return;
  }
  
  try {
    // Get updated session info
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SESSION',
      data: {
        tabId: state.tabId,
        url: state.currentUrl,
        title: document.title
      }
    });
    
    // console.log('[Sidebar] GET_SESSION response:', response?.success ? 'success' : 'failed', 
    //             '| hasPreviousSession:', !!response?.previousSession,
    //             '| previousSessionId:', response?.previousSession?.sessionId);
    
    if (response && response.success && response.previousSession) {
      // console.log('[Sidebar] Refreshing previous session notice for tab:', state.tabId);
      showPreviousSessionNotice(response.previousSession);
    } else {
      // console.log('[Sidebar] No previous session found, hiding notice');
      // Hide notice if no previous session (use fresh element reference)
      const noticeElement = document.getElementById('previousSessionNotice');
      if (noticeElement) {
        noticeElement.classList.add('hidden');
      }
    }
  } catch (error) {
    console.warn('[Sidebar] Failed to refresh previous session notice:', error);
  }
}

/**
 * Show previous session notice
 */
function showPreviousSessionNotice(previousSession) {
  const { title, messageCount, lastActive, chatHistorySummary, navigationHistory, chatHistory, recentPages, currentUrl } = previousSession;
  
  // ✅ CRITICAL: Get fresh element reference (in case HTML was replaced)
  const noticeElement = document.getElementById('previousSessionNotice');
  if (!noticeElement) {
    console.warn('[Sidebar] previousSessionNotice element not found in DOM!');
    return;
  }
  
  noticeElement.classList.remove('hidden');
  
  // Helper to normalize URLs
  const normalizeUrl = (url) => url ? url.split('#')[0].split('?')[0] : '';
  const currentNormalized = normalizeUrl(state.currentUrl);
  
  let summaryText = null;
  let pageSpecificMessageCount = messageCount; // Default to total
  
  // FIRST: Try to find chat history for THIS SPECIFIC PAGE from chatHistory
  // This is the most accurate source since it shows what was actually asked on this page
  if (chatHistory && chatHistory.length > 0) {
    // Filter ALL messages (user + assistant) for this page
    const pageMessages = chatHistory.filter(msg => 
      msg.pageUrl && normalizeUrl(msg.pageUrl) === currentNormalized
    );
    
    if (pageMessages.length > 0) {
      pageSpecificMessageCount = pageMessages.length;
      const userQuestions = pageMessages.filter(msg => msg.role === 'user');
      
      if (userQuestions.length === 1) {
        summaryText = `Asked: ${userQuestions[0].content.substring(0, 80)}${userQuestions[0].content.length > 80 ? '...' : ''}`;
      } else if (userQuestions.length > 1) {
        // Show first question as preview
        summaryText = `Asked ${userQuestions.length} questions: ${userQuestions[0].content.substring(0, 50)}${userQuestions[0].content.length > 50 ? '...' : ''}`;
      }
      
      // console.log('[Sidebar] Found', userQuestions.length, 'questions on this page');
    }
  }
  
  // SECOND: Try to find from recentPages (pages navigated away from)
  // This only works if you navigated away from this page before
  if (!summaryText && recentPages && recentPages.length > 0) {
    const pageEntry = recentPages.find(page => normalizeUrl(page.url) === currentNormalized);
    
    if (pageEntry && pageEntry.chatSummary) {
      summaryText = pageEntry.chatSummary;
      // console.log('[Sidebar] Using page-specific summary from recentPages:', summaryText);
    }
  }
  
  // THIRD: Fallback to full session summary
  if (!summaryText) {
    summaryText = chatHistorySummary;
  }
  
  // FOURTH: Final fallback
  if (!summaryText) {
    summaryText = `Previous chat on this page`;
  }
  
  // ✅ Use fresh element reference for all queries
  const summaryEl = noticeElement.querySelector('.notice-summary');
  const messageCountEl = noticeElement.querySelector('.message-count');
  const timestampEl = noticeElement.querySelector('.timestamp');
  
  if (summaryEl) summaryEl.textContent = summaryText;
  if (messageCountEl) {
    messageCountEl.textContent = `${pageSpecificMessageCount} message${pageSpecificMessageCount !== 1 ? 's' : ''} on this page`;
  }
  if (timestampEl) {
    const timeAgo = formatTimeAgo(lastActive);
    timestampEl.textContent = timeAgo;
  }
  
  // Store previous session ID for continue button (also get fresh reference)
  const continueChatBtn = document.getElementById('continueChatBtn');
  if (continueChatBtn) {
    continueChatBtn.dataset.sessionId = previousSession.sessionId;
  }
  
  // console.log('[Sidebar] ✅ Previous session notice updated:', summaryText);
}

/**
 * Handle continue chat
 */
async function handleContinueChat() {
  const previousSessionId = elements.continueChatBtn.dataset.sessionId;
  
  if (!previousSessionId) return;
  
  // console.log('[Sidebar] Continuing chat from home page:', previousSessionId);
  
  // Use the same logic as history session click
  await handleHistorySessionClick(previousSessionId);
  
  // Hide the notice
  elements.previousSessionNotice.classList.add('hidden');
}

/**
 * Handle ask question button
 */
async function handleAskQuestion() {
  console.log('[Sidebar] Ask question clicked - creating NEW chat session');
  
  try {
    showLoading('Starting new chat...', 'Preparing Q&A');
    
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // ✅ ALWAYS create a NEW session when "Ask a Question" is clicked
    const sessionResponse = await chrome.runtime.sendMessage({
      type: 'GET_SESSION',
      data: {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        forceNew: true  // Force new session creation
      }
    });
    
    if (!sessionResponse.success) {
      throw new Error(sessionResponse.error || 'Failed to create session');
    }
    
    // Update state with new session
    state.sessionId = sessionResponse.sessionId;
    state.session = sessionResponse.session;
    console.log('[Sidebar] ✅ New session created:', state.sessionId);
    
    // Check if we have sections, if not, extract them first
    if (!state.sections || state.sections.length === 0) {
      console.log('[Sidebar] No sections available, extracting content first...');
      
      let extractResult;
      try {
        extractResult = await chrome.tabs.sendMessage(tab.id, {
          type: 'EXTRACT_CONTENT',
          data: {}
        });
      } catch (error) {
        if (error.message.includes('Receiving end does not exist')) {
          console.log('[Sidebar] Content script not loaded, attempting to inject...');
          
          // Try to inject content script programmatically
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/content-script.js']
          });
          
          // Wait a bit for script to initialize
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Retry extraction
          extractResult = await chrome.tabs.sendMessage(tab.id, {
            type: 'EXTRACT_CONTENT',
            data: {}
          });
        } else {
          throw error;
        }
      }
      
      if (!extractResult || !extractResult.success) {
        throw new Error(extractResult?.error || 'Failed to extract content');
      }
      
      if (!extractResult.sections || extractResult.sections.length === 0) {
        throw new Error('No content found on this page. Try a different page.');
      }
      
      state.sections = extractResult.sections;
      
      console.log('[Sidebar] Extracted', state.sections.length, 'sections for Q&A');
      
      // Save sections to session
      await chrome.runtime.sendMessage({
        type: 'SAVE_SECTIONS',
        data: {
          sessionId: state.sessionId,
          sections: state.sections,
          statistics: extractResult.statistics
        }
      });
    } else {
      // We have sections, just save them to the new session
      await chrome.runtime.sendMessage({
        type: 'SAVE_SECTIONS',
        data: {
          sessionId: state.sessionId,
          sections: state.sections,
          statistics: {}
        }
      });
    }
    
    hideLoading();
    
  } catch (error) {
    console.error('[Sidebar] Failed to start new chat:', error);
    hideLoading();
    showError('Failed to Start Chat', error.message);
    return;
  }
  
  // Initialize chat view if needed
  if (!state.chatView) {
    state.chatView = new ChatView(elements.chatView, {
      onSendMessage: handleChatQuestion,
      onBack: async () => {
        // Check if we have a valid summary with content
        if (state.summary && state.summary.sectionSummaries && state.summary.sectionSummaries.length > 0) {
          showView('summary');
        } else {
          showView('home');
          // Refresh home view UI
          await refreshPreviousSessionNotice();
          updateViewSummaryButton();
          await checkGoogleSerp();
        }
      },
      onCitationClick: handleCitationClick,
      onNewChat: handleNewChat,
      onClear: () => {
        state.qnaReady = false;
        // Re-initialize Q&A worker
        initializeQnA();
      },
      onShowRecap: handleShowRecap
    });
  }
  
  // Clear any existing chat messages (fresh start)
  state.chatView.clearMessages();
  
  // Initialize Q&A if not ready
  if (!state.qnaReady && state.sections) {
    initializeQnA();
  }
  
  showView('chat');
}

/**
 * Handle new chat button (create fresh conversation)
 */
async function handleNewChat() {
  // console.log('[Sidebar] New chat clicked');
  
  if (!confirm('Start a new conversation? Current chat will be saved to history.')) {
    return;
  }
  
  try {
    showLoading('Starting new chat...', 'Creating new conversation');
    
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Create a new session
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SESSION',
      data: {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        forceNew: true  // Force creation of new session
      }
    });
    
    if (response && response.success) {
      // Update state with new session
      state.sessionId = response.sessionId;
      
      // Keep existing sections if available, otherwise extract
      const hasExistingSections = state.sections && state.sections.length > 0;
      
      if (!hasExistingSections) {
        // Extract content for new chat
        try {
          const extractResult = await chrome.tabs.sendMessage(tab.id, {
            type: 'EXTRACT_CONTENT',
            data: {}
          });
          
          if (extractResult && extractResult.success && extractResult.sections) {
            state.sections = extractResult.sections;
            // console.log('[Sidebar] ✅ Extracted', state.sections.length, 'sections for new chat');
            
            // Save sections to new session
            await chrome.runtime.sendMessage({
              type: 'SAVE_SECTIONS',
              data: {
                sessionId: state.sessionId,
                sections: state.sections,
                statistics: extractResult.statistics
              }
            });
          } else {
            throw new Error('No content extracted');
          }
        } catch (extractError) {
          console.error('[Sidebar] Failed to extract content for new chat:', extractError);
          throw new Error('Could not extract page content. Please refresh the page and try again.');
        }
      } else {
        // console.log('[Sidebar] Using existing', state.sections.length, 'sections for new chat');
        
        // Save existing sections to new session
        await chrome.runtime.sendMessage({
          type: 'SAVE_SECTIONS',
          data: {
            sessionId: state.sessionId,
            sections: state.sections,
            statistics: { sections: state.sections.length }
          }
        });
      }
      
      state.summary = null;
      state.qnaReady = false;
      
      // Clear tab cache for this tab
      if (tabStateCache.has(state.tabId)) {
        tabStateCache.delete(state.tabId);
      }
      
      // Reinitialize chat view with fresh state
      elements.chatView.innerHTML = '';
      state.chatView = new ChatView(elements.chatView, {
        onSendMessage: handleChatQuestion,
        onBack: async () => {
          // Check if we have a valid summary with content
          if (state.summary && state.summary.sectionSummaries && state.summary.sectionSummaries.length > 0) {
            showView('summary');
          } else {
            showView('home');
            // Refresh home view UI
            await refreshPreviousSessionNotice();
            updateViewSummaryButton();
            await checkGoogleSerp();
          }
        },
        onCitationClick: handleCitationClick,
        onNewChat: handleNewChat,
        onClear: () => {
          state.qnaReady = false;
          initializeQnA();
        },
        onShowRecap: handleShowRecap
      });
      
      // Initialize Q&A with sections
      if (state.sections && state.sections.length > 0) {
        await initializeQnA();
        // console.log('[Sidebar] ✅ Q&A initialized for new chat');
      }
      
      hideLoading();
      // console.log('[Sidebar] ✅ New chat started with session:', state.sessionId);
      
      // Show a welcome message
      state.chatView.addSystemMessage('🎉 New conversation started! Ask me anything about this page.');
    } else {
      throw new Error('Failed to create new session');
    }
  } catch (error) {
    console.error('[Sidebar] Failed to start new chat:', error);
    hideLoading();
    showError('Failed to Start New Chat', error.message);
  }
}

/**
 * Handle session recap - called when user clicks recap badge
 */
async function handleShowRecap() {
  // console.log('[Sidebar] Generating session recap...');
  
  try {
    // Get session data
    const session = state.session;
    if (!session) {
      throw new Error('No active session');
    }
    
    // Build timeline from navigation history
    const timeline = [];
    const questionCounts = {};
    
    if (session.content && session.content.pages) {
      for (let i = 0; i < session.content.pages.length; i++) {
        const page = session.content.pages[i];
        timeline.push({
          title: page.title || 'Unknown Page',
          url: page.url,
          timestamp: page.visitedAt,
          isCurrent: (i === session.content.pages.length - 1)
        });
        
        // Count questions for this page
        const pageQuestions = state.chatView.messages.filter(msg => 
          msg.role === 'user' && msg.pageUrl === page.url
        );
        questionCounts[page.url] = pageQuestions.length;
      }
    }
    
    // Calculate inactive time based on last message in chat history
    let inactiveMinutes = 0;
    if (session.chatHistory && session.chatHistory.length > 0) {
      const lastMessage = session.chatHistory[session.chatHistory.length - 1];
      if (lastMessage && lastMessage.timestamp) {
        const inactiveMs = Date.now() - lastMessage.timestamp;
        inactiveMinutes = Math.floor(inactiveMs / (1000 * 60));
        console.log('[Sidebar] Calculated inactivity from last message:', inactiveMinutes, 'minutes');
      }
    }
    
    // Prepare data for recap modal
    const recapData = {
      inactiveMinutes,
      timeline,
      questionCounts
    };
    
    // Update modal with data (summary will be generated)
    if (state.chatView) {
      state.chatView.updateRecapContent(recapData);
    }
    
    // Generate comprehensive session overview using AI
    await generateSessionOverview();
    
  } catch (error) {
    console.error('[Sidebar] Failed to generate session recap:', error);
    showError('Failed to Load Session Recap', error.message);
  }
}

/**
 * Generate comprehensive session overview summary
 * This is different from conversation flow summary - it's a detailed overview
 */
async function generateSessionOverview() {
  try {
    // console.log('[Sidebar] Generating session overview with AI...');
    
    // Get chat messages
    const messages = state.chatView.messages || [];
    if (messages.length === 0) {
      // No messages, show simple summary
      if (state.chatView) {
        state.chatView.updateRecapSummary('No conversation yet in this session.');
      }
      return;
    }
    
    // Build conversation text from LAST 4 messages only (2 Q&A pairs max)
    // This keeps the recap focused on recent activity
    const recentMessages = messages.slice(-4);
    let conversationText = '';
    
    for (const msg of recentMessages) {
      if (msg.role === 'user' && msg.content) {
        conversationText += `Q: ${msg.content}\n`;
      } else if (msg.role === 'assistant' && msg.content) {
        // Limit answer length for context
        const shortAnswer = msg.content.length > 150 ? msg.content.substring(0, 150) : msg.content;
        conversationText += `A: ${shortAnswer}...\n\n`;
      }
    }
    
    // If no conversation text was built, show simple summary
    if (conversationText.trim() === '') {
      if (state.chatView) {
        state.chatView.updateRecapSummary('No conversation yet in this session.');
      }
      return;
    }
    
    // Check if LanguageModel API is available
    if (typeof LanguageModel === 'undefined') {
      throw new Error('LanguageModel API not available');
    }
    
    // Create AI session for overview generation
    const systemPrompt = `You are a helpful session recap assistant. Your task is to create a brief "at a glance" summary of this chat session.

GOAL: Quickly remind the user what they wanted and what was discussed recently.

RULES:
- Write ONLY 1-2 short sentences (max 30 words total)
- Focus on: What the user wanted + what was discussed in the last 1-2 messages
- Be extremely concise - this is a quick glance, not a detailed recap
- Use plain conversational language
- NO markdown formatting, just plain text
- Example: "You asked about X and learned that Y."`;

    const aiSession = await LanguageModel.create({
      systemPrompt,
      temperature: 0.3,
      topK: 3
    });
    
    const prompt = `Create a brief at-a-glance recap (1-2 sentences max) for this conversation. Focus on what the user wanted and the last couple of messages:\n\n${conversationText}\n\nRecap:`;
    
    // Stream the response
    const stream = await aiSession.promptStreaming(prompt);
    
    let fullSummary = '';
    for await (const chunk of stream) {
      fullSummary += chunk; // CRITICAL: Append chunks
      
      // Update UI with streaming text
      if (state.chatView) {
        state.chatView.updateRecapSummary(fullSummary);
      }
    }
    
    // console.log('[Sidebar] ✅ Session overview generated');
    
  } catch (error) {
    console.error('[Sidebar] Failed to generate session overview:', error);
    
    // Fallback: Show simple summary
    const messageCount = state.chatView?.messages?.length || 0;
    const fallbackSummary = messageCount > 0 
      ? `You were exploring topics on this page. ${messageCount} messages in conversation.`
      : 'You had a browsing session on this page.';
    
    if (state.chatView) {
      state.chatView.updateRecapSummary(fallbackSummary);
    }
  }
}

/**
 * Handle show history button
 */
function handleShowHistory() {
  // console.log('[Sidebar] History clicked');
  
  // Initialize history view if needed
  if (!state.historyView) {
    state.historyView = new HistoryView(elements.historyView, {
      onBack: async () => {
        // Go back to current view based on state
        if (state.summary) {
          showView('summary');
        } else if (state.sections && state.chatView) {
          showView('chat');
        } else {
          showView('home');
          await checkGoogleSerp();
        }
      },
      onSessionClick: handleHistorySessionClick,
      onViewSerpSession: handleViewSerpSession,
      onChatWithSerpSession: handleChatWithSerpSession,
      onViewResearchEntry: handleViewResearchEntry,
      onChatWithResearchEntry: handleChatWithResearchEntry
    });
  }
  
  // Load all types of sessions and show view
  state.historyView.loadSessions();
  state.historyView.loadSerpSessions();
  state.historyView.loadResearchSessions(); // NEW: Load research history
  showView('history');
}

/**
 * Handle history session click (resume conversation)
 */
async function handleHistorySessionClick(sessionId) {
  // console.log('[Sidebar] Resuming session:', sessionId);
  
  try {
    showLoading('Loading conversation...', 'Preparing chat history');
    
    // Load the session
    const response = await chrome.runtime.sendMessage({
      type: 'CONTINUE_SESSION',
      data: {
        sessionId,
        tabId: state.tabId
      }
    });
    
    if (response && response.success && response.session) {
      const session = response.session;
      
      // Update state
      state.sessionId = sessionId;
      state.sections = session.content.sections || null;
      state.summary = session.content.summary || null;
      
      // Get current page info
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tab.url;
      
      // Check if current page matches session page
      const sessionUrl = session.url || session.currentUrl;
      const urlsMatch = currentUrl === sessionUrl || currentUrl.split('#')[0] === sessionUrl.split('#')[0];
      
      // console.log('[Sidebar] URL match:', urlsMatch, '| Current:', currentUrl, '| Session:', sessionUrl);
      
      // If URLs don't match OR no sections, extract content from current page
      if (!urlsMatch || !state.sections || state.sections.length === 0) {
        // console.log('[Sidebar] Page mismatch or no content - extracting from current page');
        
        try {
          const extractResult = await chrome.tabs.sendMessage(tab.id, {
            type: 'EXTRACT_CONTENT',
            data: {}
          });
          
          if (extractResult && extractResult.success && extractResult.sections) {
            state.sections = extractResult.sections;
            // console.log('[Sidebar] ✅ Extracted', state.sections.length, 'sections from current page');
            
            // Save sections to session
            await chrome.runtime.sendMessage({
              type: 'SAVE_SECTIONS',
              data: {
                sessionId: state.sessionId,
                sections: state.sections,
                statistics: extractResult.statistics
              }
            });
          }
        } catch (extractError) {
          console.warn('[Sidebar] Auto-extraction failed:', extractError);
          // Continue anyway - user can manually extract later
        }
      }
      
      // Reinitialize chat view with history
      elements.chatView.innerHTML = '';
      state.chatView = new ChatView(elements.chatView, {
        onSendMessage: handleChatQuestion,
        onBack: async () => {
          // Check if we have a valid summary with content
          if (state.summary && state.summary.sectionSummaries && state.summary.sectionSummaries.length > 0) {
            showView('summary');
          } else {
            showView('home');
            // Refresh home view UI
            await refreshPreviousSessionNotice();
            updateViewSummaryButton();
            await checkGoogleSerp();
          }
        },
        onCitationClick: handleCitationClick,
        onNewChat: handleNewChat,
        onClear: () => {
          state.qnaReady = false;
          initializeQnA();
        },
        onShowRecap: handleShowRecap
      });
      
      // Reset waiting state
      state.chatView.isWaiting = false;
      state.chatView.elements.sendBtn.disabled = true;
      
      // CRITICAL: Check if this is a multi-page chat session FIRST
      // Must set multi-page mode BEFORE rendering messages
      state.session = session; // Save session to state
      if (session.type === 'multiPageChat') {
        const pageCount = session.content?.pages?.length || 0;
        // console.log('[Sidebar] History: Restoring multi-page chat with', pageCount, 'pages');
        state.chatView.setMultiPageMode(pageCount);
      }
      
      // Load chat history
      if (session.chatHistory && session.chatHistory.length > 0) {
        state.chatView.messages = JSON.parse(JSON.stringify(session.chatHistory));
        state.chatView.elements.messages.innerHTML = '';
        state.chatView.renderAllMessages();
        
        // 🆕 Show session recap if there was significant inactivity
        const lastMessage = session.chatHistory[session.chatHistory.length - 1];
        if (lastMessage && lastMessage.timestamp) {
          const now = Date.now();
          const inactiveMs = now - lastMessage.timestamp;
          const inactiveMinutes = inactiveMs / (1000 * 60);
          
          // Show recap if inactive for more than 5 minutes
          if (inactiveMinutes >= 5) {
            console.log('[Sidebar] Showing session recap - inactive for', Math.floor(inactiveMinutes), 'minutes');
            state.chatView.showRecapBadge(inactiveMinutes);
          }
        }
      }
      
      // CRITICAL: Always re-initialize Q&A with current content
      // (Only for regular chat, not multi-page)
      if (session.type !== 'multiPageChat') {
        if (state.sections && state.sections.length > 0) {
          // console.log('[Sidebar] Re-initializing Q&A with', state.sections.length, 'sections');
          state.qnaReady = false;
          await initializeQnA();
        } else {
          console.warn('[Sidebar] No sections available - user needs to extract content');
        }
      }
      
      // Hide loading and show chat view
      hideLoading();
      showView('chat');
      
      // console.log('[Sidebar] ✅ Session resumed:', sessionId, '| Q&A ready:', state.qnaReady);
    } else {
      hideLoading();
      throw new Error('Failed to load session');
    }
  } catch (error) {
    console.error('[Sidebar] Failed to resume session:', error);
    hideLoading();
    showError('Failed to Resume Chat', 'Could not load the conversation. Please try again.');
  }
}

/**
 * Handle view SERP session - Restore SERP analysis from history
 */
async function handleViewSerpSession(sessionId) {
  // console.log('[Sidebar] View SERP session:', sessionId);
  
  try {
    showLoading('Loading Analysis...', 'Restoring SERP session');
    
    // Get SERP session data
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SERP_SESSION',
      data: { sessionId }
    });
    
    if (response && response.success && response.session) {
      const session = response.session;
      
      // console.log('[Sidebar] Loaded SERP session:', session.searchQuery, '| Results:', session.results.length);
      
      // Restore SERP view state
      state.isGoogleSerp = true;
      state.searchQuery = session.searchQuery;
      state.serpResults = session.results;
      state.serpSessionId = sessionId; // Track which session is being viewed
      
      // Initialize SERP view if needed
      if (!state.serpView) {
        const { SerpView } = await import('./views/serp-view.js');
        state.serpView = new SerpView(elements.serpView, {
          onDiveDeeper: handleDiveDeeper
        });
      }
      
      // Display results in SERP view
      state.serpView.setQuery(session.searchQuery);
      state.serpView.setResults(session.results);
      
      // If comparison was done, restore it
      if (session.comparisonDone && session.comparisonResult) {
        // console.log('[Sidebar] Restoring comparison result');
        state.serpView.displayComparison(session.comparisonResult, true);
        
        // Show Dive Deeper button
        if (state.serpView.elements.diveDeeperBtn) {
          state.serpView.elements.diveDeeperBtn.classList.remove('hidden');
        }
      }
      
      // Hide loading and show SERP view
      hideLoading();
      showView('serp');
      
      // console.log('[Sidebar] ✅ SERP session restored:', sessionId);
    } else {
      hideLoading();
      throw new Error('Failed to load SERP session');
    }
  } catch (error) {
    console.error('[Sidebar] Failed to view SERP session:', error);
    hideLoading();
    showError('Failed to Load Analysis', 'Could not restore the search analysis. Please try again.');
  }
}

/**
 * Handle chat with SERP session - Start multi-page chat from history
 */
async function handleChatWithSerpSession(sessionId) {
  // console.log('[Sidebar] Chat with SERP session:', sessionId);
  
  try {
    showLoading('Preparing Chat...', 'Loading analyzed pages');
    
    // Get SERP session data
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SERP_SESSION',
      data: { sessionId }
    });
    
    if (response && response.success && response.session) {
      const session = response.session;
      
      // console.log('[Sidebar] Loaded SERP session:', session.searchQuery, '| Results:', session.results.length);
      
      // Check if results have extracted content
      const resultsWithContent = session.results.filter(r => r.extractedContent && r.extractedContent.sections);
      
      if (resultsWithContent.length === 0) {
        hideLoading();
        showError('No Content Available', 'The analyzed pages do not have extracted content. Please re-analyze the search results.');
        return;
      }
      
      // console.log('[Sidebar] Starting multi-page chat with', resultsWithContent.length, 'pages');
      
      // Prepare pages for multi-page chat
      const pages = resultsWithContent.map(result => ({
        url: result.url,
        title: result.title,
        extractedContent: result.extractedContent
      }));
      
      // Create multi-page chat session
      // If comparison was done, include it as initial Q&A
      let initialQuestion = null;
      let initialAnswer = null;
      
      if (session.comparisonDone && session.comparisonQuestion && session.comparisonResult) {
        initialQuestion = session.comparisonQuestion;
        initialAnswer = session.comparisonResult;
      }
      
      const chatResponse = await chrome.runtime.sendMessage({
        type: 'CREATE_MULTI_PAGE_CHAT',
        data: {
          tabId: state.tabId,
          pages: pages,
          searchQuery: session.searchQuery,
          initialQuestion: initialQuestion,
          initialAnswer: initialAnswer
        }
      });
      
      if (chatResponse && chatResponse.success && chatResponse.session) {
        const chatSession = chatResponse.session;
        
        // Link SERP session to chat session
        await chrome.runtime.sendMessage({
          type: 'LINK_SERP_TO_CHAT',
          data: {
            serpSessionId: sessionId,
            chatSessionId: chatSession.sessionId
          }
        });
        
        // console.log('[Sidebar] Multi-page chat created:', chatSession.sessionId);
        
        // Update state
        state.sessionId = chatSession.sessionId;
        state.session = chatSession;
        state.serpSessionId = sessionId; // Remember which SERP session this came from
        
        // Initialize chat view
        elements.chatView.innerHTML = '';
        const { ChatView } = await import('./views/chat-view.js');
        state.chatView = new ChatView(elements.chatView, {
          onSendMessage: handleChatQuestion,
          onBack: async () => {
            // Go back to history view
            handleShowHistory();
          },
          onCitationClick: handleCitationClick,
          onNewChat: handleNewChat,
          onClear: () => {
            // Cannot clear multi-page chat
          },
          onShowRecap: handleShowRecap
        });
        
        // Set multi-page mode
        state.chatView.setMultiPageMode(pages.length);
        
        // Load chat history (includes initial Q&A if comparison was done)
        if (chatSession.chatHistory && chatSession.chatHistory.length > 0) {
          state.chatView.messages = JSON.parse(JSON.stringify(chatSession.chatHistory));
          state.chatView.elements.messages.innerHTML = '';
          state.chatView.renderAllMessages();
        }
        
        // Enable send button
        state.chatView.elements.sendBtn.disabled = false;
        
        // Hide loading and show chat
        hideLoading();
        showView('chat');
        
        // console.log('[Sidebar] ✅ Multi-page chat started from history:', sessionId);
      } else {
        hideLoading();
        throw new Error('Failed to create multi-page chat');
      }
    } else {
      hideLoading();
      throw new Error('Failed to load SERP session');
    }
  } catch (error) {
    console.error('[Sidebar] Failed to start chat from SERP session:', error);
    hideLoading();
    showError('Failed to Start Chat', 'Could not create multi-page chat. Please try again.');
  }
}

/**
 * Handle view research entry - Display research results and answer
 */
async function handleViewResearchEntry(entryId) {
  // console.log('[Sidebar] View research entry:', entryId);
  
  try {
    showLoading('Loading Research...', 'Restoring research session');
    
    // Get research entry data
    const response = await chrome.runtime.sendMessage({
      type: 'GET_RESEARCH_ENTRY',
      data: { entryId }
    });
    
    if (response && response.success && response.entry) {
      const entry = response.entry;
      
      // console.log('[Sidebar] Loaded research entry:', entry.query, '| Sources:', entry.sourcesCount);
      
      // Display in a research results view (reuse SERP view structure)
      state.isGoogleSerp = true;
      state.searchQuery = entry.query;
      state.serpResults = entry.sources || [];
      
      // Initialize SERP view if needed
      if (!state.serpView) {
        const { SerpView } = await import('./views/serp-view.js');
        state.serpView = new SerpView(elements.serpView, {
          onBack: () => showView('history'),
          onAskQuestion: handleSerpAskQuestion,
          onOpenUrl: handleSerpOpenUrl,
          onReAnalyze: handleAnalyzeSerp,
          onCompare: handleSerpCompare,
          onRefresh: handleSerpRefresh,
          onDiveDeeper: handleDiveDeeper
        });
      }
      
      // Display results (Research Mode - hide relevance)
      state.serpView.setQuery(entry.query);
      state.serpView.setResults(entry.sources, true); // true = Research Mode
      
      // Display the comprehensive answer
      if (entry.answer) {
        state.serpView.displayComparison(entry.answer, true);
        
        // Show Dive Deeper button
        if (state.serpView.elements.diveDeeperBtn) {
          state.serpView.elements.diveDeeperBtn.classList.remove('hidden');
        }
      }
      
      // Hide loading and show SERP view
      hideLoading();
      showView('serp');
      
      // console.log('[Sidebar] ✅ Research entry displayed:', entryId);
    } else {
      hideLoading();
      throw new Error('Failed to load research entry');
    }
  } catch (error) {
    console.error('[Sidebar] Failed to view research entry:', error);
    hideLoading();
    showError('Failed to Load Research', 'Could not restore the research session. Please try again.');
  }
}

/**
 * Handle chat with research entry - Start multi-page chat from research history
 */
async function handleChatWithResearchEntry(entryId) {
  // console.log('[Sidebar] Chat with research entry:', entryId);
  
  try {
    showLoading('Preparing Chat...', 'Loading analyzed sources');
    
    // Get research entry data
    const response = await chrome.runtime.sendMessage({
      type: 'GET_RESEARCH_ENTRY',
      data: { entryId }
    });
    
    if (response && response.success && response.entry) {
      const entry = response.entry;
      
      // console.log('[Sidebar] Loaded research entry:', entry.query, '| Sources:', entry.sourcesCount);
      
      // Check if sources have extracted content
      const sourcesWithContent = entry.sources.filter(s => s.extractedContent && s.extractedContent.sections);
      
      if (sourcesWithContent.length === 0) {
        hideLoading();
        showError('No Content Available', 'The analyzed sources do not have extracted content. Please re-run the research.');
        return;
      }
      
      // console.log('[Sidebar] Starting multi-page chat with', sourcesWithContent.length, 'sources');
      
      // Prepare pages for multi-page chat
      const pages = sourcesWithContent.map(source => ({
        url: source.url,
        title: source.title,
        extractedContent: source.extractedContent
      }));
      
      // Create multi-page chat session with initial Q&A from research
      const chatResponse = await chrome.runtime.sendMessage({
        type: 'CREATE_MULTI_PAGE_CHAT',
        data: {
          tabId: state.tabId,
          pages: pages,
          searchQuery: entry.query,
          initialQuestion: entry.query,
          initialAnswer: entry.answer
        }
      });
      
      if (chatResponse && chatResponse.success && chatResponse.session) {
        const chatSession = chatResponse.session;
        
        // Update state
        state.sessionId = chatSession.sessionId;
        state.session = chatSession;
        
        // Clear and reinitialize chat view
        elements.chatView.innerHTML = '';
        const { ChatView } = await import('./views/chat-view.js');
        state.chatView = new ChatView(elements.chatView, {
          onSendMessage: handleChatQuestion,
          onBack: () => showView('history'),
          onCitationClick: handleCitationClick,
          onNewChat: handleNewChat,
          onClear: () => {
            // Cannot clear multi-page chat
          },
          onShowRecap: handleShowRecap
        });
        
        // Set multi-page mode
        state.chatView.setMultiPageMode(pages.length);
        
        // Load chat history (includes initial Q&A from research)
        if (chatSession.chatHistory && chatSession.chatHistory.length > 0) {
          state.chatView.messages = JSON.parse(JSON.stringify(chatSession.chatHistory));
          state.chatView.elements.messages.innerHTML = '';
          state.chatView.renderAllMessages();
        }
        
        // Enable send button
        state.chatView.elements.sendBtn.disabled = false;
        
        // Hide loading and show chat
        hideLoading();
        showView('chat');
        
        // console.log('[Sidebar] ✅ Multi-page chat started from research:', entryId);
      } else {
        hideLoading();
        throw new Error('Failed to create multi-page chat');
      }
    } else {
      hideLoading();
      throw new Error('Failed to load research entry');
    }
  } catch (error) {
    console.error('[Sidebar] Failed to start chat from research entry:', error);
    hideLoading();
    showError('Failed to Start Chat', 'Could not create multi-page chat. Please try again.');
  }
}

/**
 * Show settings view
 */
async function handleShowSettings() {
  // console.log('[Sidebar] Settings clicked');
  
  // Load current settings
  await loadSettings();
  
  // Show settings view
  showView('settings');
}

/**
 * Handle open cache viewer button click
 */
function handleOpenCacheViewer() {
  // Open cache viewer in a new tab
  chrome.tabs.create({
    url: chrome.runtime.getURL('cache.html')
  });
}

/**
 * Handle settings change
 */
async function handleSettingsChange() {
  const settings = {
    enableRecap: elements.enableRecapCheckbox.checked,
    recapTimerMinutes: parseInt(elements.recapTimerInput.value, 10) || 5
  };
  
  // Validate timer
  if (settings.recapTimerMinutes < 1) settings.recapTimerMinutes = 1;
  if (settings.recapTimerMinutes > 60) settings.recapTimerMinutes = 60;
  elements.recapTimerInput.value = settings.recapTimerMinutes;
  
  // Save to chrome.storage.local
  try {
    await chrome.storage.local.set({ nutshellSettings: settings });
    // console.log('[Sidebar] Settings saved:', settings);
  } catch (error) {
    console.error('[Sidebar] Failed to save settings:', error);
  }
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get('nutshellSettings');
    const settings = result.nutshellSettings || {
      enableRecap: true,
      recapTimerMinutes: 5
    };
    
    // Apply to UI
    if (elements.enableRecapCheckbox) {
      elements.enableRecapCheckbox.checked = settings.enableRecap;
    }
    if (elements.recapTimerInput) {
      elements.recapTimerInput.value = settings.recapTimerMinutes;
    }
    
    // console.log('[Sidebar] Settings loaded:', settings);
    return settings;
  } catch (error) {
    console.error('[Sidebar] Failed to load settings:', error);
    return { enableRecap: true, recapTimerMinutes: 5 };
  }
}

/**
 * Update activity timestamp for current tab
 */
function updateTabActivity() {
  if (state.tabId) {
    tabActivityTracker.set(state.tabId, Date.now());
    // console.log('[Sidebar] Activity updated for tab:', state.tabId);
  }
}

/**
 * Check if session recap should be shown
 */
async function checkSessionRecap() {
  try {
    // Get settings
    const settings = await loadSettings();
    
    if (!settings.enableRecap) {
      // console.log('[Sidebar] Session recap disabled in settings');
      return false;
    }
    
    // Check if tab has chat history
    if (!state.chatView || !state.chatView.messages || state.chatView.messages.length === 0) {
      // console.log('[Sidebar] No chat history - skip recap');
      return false;
    }
    
    // Check last activity time
    const lastActivity = tabActivityTracker.get(state.tabId);
    if (!lastActivity) {
      // console.log('[Sidebar] No previous activity recorded');
      return false;
    }
    
    const inactivityMs = Date.now() - lastActivity;
    const thresholdMs = settings.recapTimerMinutes * 60 * 1000;
    
    if (inactivityMs >= thresholdMs) {
      const inactiveMinutes = Math.floor(inactivityMs / 1000 / 60);
      // console.log(`[Sidebar] ✅ Recap triggered: ${inactiveMinutes}min inactive (threshold: ${settings.recapTimerMinutes}min)`);
      
      // Show recap badge
      if (state.chatView) {
        state.chatView.showRecapBadge(inactiveMinutes);
      }
      
      return true;
    }
    
    // console.log(`[Sidebar] Not enough inactivity: ${Math.floor(inactivityMs / 1000 / 60)}min < ${settings.recapTimerMinutes}min`);
    return false;
  } catch (error) {
    console.error('[Sidebar] Failed to check session recap:', error);
    return false;
  }
}

/**
 * Initialize Q&A worker with sections
 * Uses BM25 retrieval for fast, accurate question answering
 * 
 * @param {string} conversationSummary - Optional flow summary from previous page chat
 */
async function initializeQnA(conversationSummary = null) {
  if (!state.sections || state.sections.length === 0) {
    console.warn('[Sidebar] No sections available for Q&A');
    return;
  }
  
  // console.log('[Sidebar] Initializing Q&A with', state.sections.length, 'sections');
  if (conversationSummary) {
    // console.log('[Sidebar] Including conversation flow summary for context');
  }
  
  // Get current page URL
  let pageUrl = 'unknown';
  let pageTitle = 'Unknown Page';
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      pageUrl = tabs[0].url;
      pageTitle = tabs[0].title;
    }
  } catch (error) {
    console.warn('[Sidebar] Could not get page URL:', error);
  }
  
  // CRITICAL: Only use multi-page context if this is a multi-page chat session
  // For single-page chat after navigation, use ONLY current page + conversation summary
  let multiPageContext = null;
  if (state.session && state.session.type === 'multiPageChat') {
    // Multi-page chat: include all pages' sections
    if (state.sessionId) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_MULTIPAGE_CONTEXT',
          data: { sessionId: state.sessionId }
        });
        
        if (response && response.success) {
          multiPageContext = response.context;
          // console.log('[Sidebar] Multi-page chat: using', multiPageContext.totalPages, 'pages');
        }
      } catch (error) {
        console.warn('[Sidebar] Failed to get multi-page context:', error);
      }
    }
  } else {
    // Single-page chat: use ONLY current page, NO old sections
    // console.log('[Sidebar] Single-page chat: using ONLY current page sections');
  }
  
  // Get chat history if resuming from history
  let chatHistory = null;
  if (state.chatView && state.chatView.messages && state.chatView.messages.length > 0) {
    // Filter to only user and nutshell messages (exclude system, navigation)
    chatHistory = state.chatView.messages.filter(msg => 
      msg.role === 'user' || msg.role === 'nutshell'
    );
    console.log('[Sidebar] Passing', chatHistory.length, 'messages to Q&A worker for session loading');
    console.log('[Sidebar] First message sample:', chatHistory[0]);
  }
  
  // Send to worker for BM25 retrieval
  state.qnaWorker.postMessage({
    type: 'INIT',
    data: {
      sections: state.sections,
      pageUrl: pageUrl,
      pageTitle: pageTitle,
      multiPageContext: multiPageContext,
      conversationSummary: conversationSummary, // Pass flow summary for AI context
      chatHistory: chatHistory // ✅ NEW: Pass chat history to load into session
    }
  });
}

/**
 * Handle chat question
 */
async function handleChatQuestion(question, mentions = []) {
  // console.log('[Sidebar] Chat question:', question, 'Mentions:', mentions);
  
  // Update activity tracker
  updateTabActivity();
  
  // Fetch context from mentioned tabs
  let mentionedTabsContext = [];
  if (mentions && mentions.length > 0) {
    for (const mention of mentions) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CONTEXT',
          data: { tabId: mention.tabId }
        });
        
        if (response.success) {
          let sections = response.sections || [];
          
          // ✅ If sections are empty, fetch fresh content from the tab
          if (sections.length === 0) {
            console.log('[Sidebar] No sections from session for tab', mention.tabId, '- extracting fresh content...');
            try {
              const extractResult = await chrome.tabs.sendMessage(mention.tabId, {
                type: 'EXTRACT_CONTENT',
                data: {}
              });
              
              if (extractResult && extractResult.success && extractResult.sections) {
                sections = extractResult.sections;
                console.log('[Sidebar] ✅ Extracted', sections.length, 'sections from mentioned tab:', mention.domain);
              }
            } catch (extractError) {
              console.warn('[Sidebar] Failed to extract content from mentioned tab:', mention.tabId, extractError);
            }
          }
          
          mentionedTabsContext.push({
            tabId: mention.tabId,
            title: mention.fullTitle || mention.title,
            domain: mention.domain,
            chatSummary: response.chatSummary,
            sections: sections,  // Use fresh sections if available
            pageTitle: response.pageTitle,
            url: response.url
          });
        }
      } catch (error) {
        console.error('[Sidebar] Failed to fetch context for tab:', mention.tabId, error);
      }
    }
  }
  
  // Check if this is a multi-page chat session
  // NOTE: @mentions now use single-page chat with cross-tab context (not multi-page)
  const shouldUseMultiPageChat = (state.session && state.session.type === 'multiPageChat');
  
  if (shouldUseMultiPageChat) {
    console.log('[Sidebar] Using multi-page chat');
    
    // If not already a multi-page session, convert it
    if (!state.session || state.session.type !== 'multiPageChat') {
      console.log('[Sidebar] Converting to multi-page chat session due to @mentions');
      
      try {
        // ✅ Fetch fresh content from current tab
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('[Sidebar] Fetching fresh content from current tab:', currentTab.id);
        
        let currentPageSections = state.sections || [];
        
        // If sections are empty, try to extract them now
        if (currentPageSections.length === 0) {
          console.log('[Sidebar] No sections in state, extracting from current page...');
          try {
            const extractResult = await chrome.tabs.sendMessage(currentTab.id, {
              type: 'EXTRACT_CONTENT',
              data: {}
            });
            
            if (extractResult && extractResult.success && extractResult.sections) {
              currentPageSections = extractResult.sections;
              state.sections = currentPageSections;
              console.log('[Sidebar] ✅ Extracted', currentPageSections.length, 'sections from current page');
            }
          } catch (extractError) {
            console.warn('[Sidebar] Failed to extract current page content:', extractError);
          }
        }
        
        // Prepare current page data with proper extractedContent format
        const extractedContent = currentPageSections.map(section => ({
          id: section.id,
          heading: section.heading,
          text: section.text,
          level: section.level || 2
        }));
        
        console.log('[Sidebar] Current page extractedContent:', extractedContent.length, 'sections');
        
        const currentPageData = {
          url: state.currentUrl,
          title: document.title,
          extractedContent: extractedContent
        };
        
        // Create multi-page chat session with current page
        const response = await chrome.runtime.sendMessage({
          type: 'CREATE_MULTI_PAGE_CHAT',
          data: {
            tabId: state.tabId,
            pages: [currentPageData],  // Start with current page
            searchQuery: '',  // No search query for @mention conversion
            initialQuestion: null,
            initialAnswer: null
          }
        });
        
        if (response.success) {
          state.sessionId = response.sessionId;
          state.session = response.session;
          console.log('[Sidebar] ✅ Converted to multi-page chat:', state.sessionId);
        } else {
          throw new Error(response.error || 'Failed to create multi-page chat session');
        }
      } catch (error) {
        console.error('[Sidebar] Failed to convert to multi-page chat:', error);
        state.chatView.showError('Failed to initialize multi-page chat: ' + error.message);
        return;
      }
    }
    
    try {
      // Add user message to session via service worker
      const response = await chrome.runtime.sendMessage({
        type: 'SEND_MULTI_PAGE_MESSAGE',
        data: {
          sessionId: state.sessionId,
          question: question,
          tabId: state.tabId
        }
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to prepare message');
      }
      
      const session = response.session;
      // console.log('[Sidebar] Session ready, creating worker for Q&A');
      
      // Create worker (Workers ARE available in sidebar!)
      const worker = new Worker(
        chrome.runtime.getURL('workers/multi-page-qna-worker.js'),
        { type: 'module' }
      );
      
      // Prepare pages data from session
      const pages = session.content.pages.map(p => ({
        url: p.url,
        title: p.title,
        extractedContent: p.extractedContent
      }));
      
      // Add mentioned tabs' content to pages if not already included
      if (mentionedTabsContext && mentionedTabsContext.length > 0) {
        for (const mentionedTab of mentionedTabsContext) {
          // Check if this page is already in the pages array
          const alreadyIncluded = pages.some(p => p.url === mentionedTab.url);
          
          if (!alreadyIncluded && mentionedTab.sections) {
            // Convert sections to extractedContent format
            const extractedContent = mentionedTab.sections.map(section => ({
              id: section.id,
              heading: section.heading,
              text: section.text,
              level: section.level || 2
            }));
            
            pages.push({
              url: mentionedTab.url,
              title: mentionedTab.pageTitle || mentionedTab.title,
              extractedContent: extractedContent
            });
            
            console.log('[Sidebar] Added mentioned tab to pages:', mentionedTab.title);
          }
        }
      }
      
      // Initialize worker
      const initRequestId = `init_${Date.now()}`;
      worker.postMessage({
        type: 'INITIALIZE',
        data: { pages },
        requestId: initRequestId
      });
      
      // Wait for initialization
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, 10000);
        
        const handleMessage = (event) => {
          if (event.data.type === 'INITIALIZED' && event.data.requestId === initRequestId) {
            clearTimeout(timeout);
            worker.removeEventListener('message', handleMessage);
            resolve();
          }
        };
        
        worker.addEventListener('message', handleMessage);
      });
      
      // console.log('[Sidebar] ✅ Worker initialized for follow-up');
      
      // Ask question with streaming
      const askRequestId = `ask_${Date.now()}`;
      
      // Store the tab ID that asked this question for tab isolation
      const questionTabId = state.tabId;
      
      // NOTE: Don't add thinking message here! It's already added by chat-view.js sendMessage()
      // Adding it again would create duplicate thinking messages
      
      worker.postMessage({
        type: 'ASK_QUESTION_STREAMING',
        data: { question },
        requestId: askRequestId
      });
      
      // Handle streaming response
      await new Promise((resolve, reject) => {
        let fullAnswer = '';
        let isFirstChunk = true;
        
        const handleMessage = (event) => {
          const { type, requestId: msgRequestId } = event.data;
          
          if (msgRequestId !== askRequestId) return;
          
          // ✅ TAB ISOLATION: Only update UI if we're still on the same tab
          const isCurrentTab = (state.tabId === questionTabId);
          
          if (type === 'ANSWER_CHUNK') {
            fullAnswer = event.data.chunk;
            
            if (isCurrentTab) {
              // On first chunk, start streaming response (removes thinking message)
              if (isFirstChunk && state.chatView) {
                state.chatView.startStreamingResponse([]);
                isFirstChunk = false;
              }
              
              // Display streaming chunk (use updateStreamingResponse for consistency)
              if (state.chatView) {
                state.chatView.updateStreamingResponse(fullAnswer);
              }
            } else {
              // Different tab - save to cache for that tab
              const targetTabCache = tabStateCache.get(questionTabId) || {};
              targetTabCache.streamingAnswer = fullAnswer;
              tabStateCache.set(questionTabId, targetTabCache);
            }
          }
          else if (type === 'ANSWER_COMPLETE') {
            worker.removeEventListener('message', handleMessage);
            worker.terminate();
            
            console.log('[Sidebar] ✅ Multi-page answer complete, isCurrentTab:', isCurrentTab);
            
            if (isCurrentTab) {
              // Finalize streaming message with citations
              if (state.chatView) {
                state.chatView.finalizeStreamingResponse(event.data.answer, {
                  citations: event.data.retrievedSections || [],
                  responseTime: 0
                });
              }
            } else {
              // Different tab - save to cache
              console.log('[Sidebar] Saving answer to cache for tab:', questionTabId);
              const targetTabCache = tabStateCache.get(questionTabId) || {};
              targetTabCache.pendingAnswer = {
                answer: event.data.answer,
                citations: event.data.retrievedSections || [],
                responseTime: 0
              };
              delete targetTabCache.streamingAnswer;
              tabStateCache.set(questionTabId, targetTabCache);
            }
            
            // Save answer to session (only if session exists)
            if (state.sessionId) {
              chrome.runtime.sendMessage({
                type: 'SAVE_CHAT_MESSAGE',
                data: {
                  sessionId: state.sessionId,
                  role: 'assistant',
                  content: event.data.answer,
                  metadata: {
                    sources: event.data.sources,
                    retrievedSections: event.data.retrievedSections
                  }
                }
              }).catch(err => console.warn('[Sidebar] Failed to save answer:', err));
            }
            
            resolve();
          }
          else if (type === 'ERROR') {
            worker.removeEventListener('message', handleMessage);
            worker.terminate();
            reject(new Error(event.data.error));
          }
        };
        
        worker.addEventListener('message', handleMessage);
        
        // Timeout
        setTimeout(() => {
          worker.terminate();
          reject(new Error('Answer timeout'));
        }, 30000);
      });
      
    } catch (error) {
      console.error('[Sidebar] Multi-page message failed:', error);
      state.chatView.showError('Failed to get answer: ' + error.message);
      state.chatView.isWaiting = false;
    }
    
    return;
  }
  
  // Regular single-page Q&A via service worker (runs in background, not affected by tab switches!)
  
  // Ensure we have sections first (before checking session)
  if (!state.sections || state.sections.length === 0) {
    state.chatView.showError('No content extracted yet. Please click "Ask a Question" button first to extract content.');
    return;
  }
  
  // Ensure we have a session
  if (!state.sessionId) {
    console.warn('[Sidebar] No session ID, creating new session...');
    try {
      // Force create a new session (don't just check for previous ones)
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SESSION',
        data: {
          tabId: state.tabId,
          url: state.currentUrl,
          title: document.title,
          forceNew: true // Force new session creation
        }
      });
      
      if (response.success && response.sessionId) {
        state.sessionId = response.sessionId;
        state.session = response.session;
        console.log('[Sidebar] ✅ Session created:', state.sessionId);
      } else {
        throw new Error('Failed to create session');
      }
    } catch (error) {
      console.error('[Sidebar] Failed to create session:', error);
      state.chatView.showError('Failed to initialize session. Please refresh the page.');
      return;
    }
  }
  
  // Ensure sections are saved to session (always check, even if session already existed)
  if (state.sections && state.sections.length > 0) {
    console.log('[Sidebar] Ensuring sections are saved to session...');
    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SECTIONS',
        data: {
          sessionId: state.sessionId,
          sections: state.sections,
          statistics: {
            totalSections: state.sections.length,
            totalWords: state.sections.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0)
          }
        }
      });
      console.log('[Sidebar] ✅ Sections saved to session');
    } catch (error) {
      console.error('[Sidebar] Failed to save sections:', error);
      state.chatView.showError('Failed to save content. Please try again.');
      return;
    }
  }
  
  // Track which tab asked this question
  state.pendingQuestionTabId = state.tabId;
  console.log('[Sidebar] Sending question to service worker for tab:', state.tabId);
  
  try {
    // Remember which tab asked this question
    const questionTabId = state.tabId;
    
    // Send question to service worker (which will process Q&A directly)
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_CHAT',
      data: {
        sessionId: state.sessionId,
        question: question,
        tabId: questionTabId,
        mentions: mentionedTabsContext
      }
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to send question');
    }
    
    console.log('[Sidebar] ✅ Answer received from service worker:', response.answer?.length, 'chars');
    
    // NOTE: Don't call addResponse() here! The answer is already displayed via the streaming handlers
    // (CHAT_STREAM_END -> finalizeStreamingResponse()). Calling addResponse() would duplicate the message.
    
    // Check if we're still on the same tab
    if (state.tabId === questionTabId) {
      // Answer already displayed via streaming handlers - no action needed
      console.log('[Sidebar] Answer already displayed via streaming handlers');
    } else {
      // We switched tabs - save answer to the original tab's cache
      console.log('[Sidebar] Tab switched during Q&A. Saving answer to tab cache:', questionTabId);
      const originTabCache = tabStateCache.get(questionTabId);
      if (originTabCache) {
        // Ensure chatMessages array exists
        if (!originTabCache.chatMessages) {
          originTabCache.chatMessages = [];
        }
        
        // Add answer to origin tab's cached messages
        const answerMessage = {
          role: 'assistant',
          content: response.answer,
          metadata: {
            citations: response.citations,
            responseTime: response.responseTime
          },
          timestamp: Date.now()
        };
        
        originTabCache.chatMessages.push(answerMessage);
        console.log('[Sidebar] Answer saved to tab cache. Will display when user returns to tab:', questionTabId);
      }
    }
  } catch (error) {
    console.error('[Sidebar] Failed to send question:', error);
    if (state.chatView) {
      state.chatView.showError('Failed to get answer: ' + error.message);
    }
  }
}

/**
 * Handle citation click
 */
async function handleCitationClick(sectionId) {
  // console.log('[Sidebar] Citation clicked:', sectionId);
  
  // Find the section
  const section = state.sections.find(s => s.id === sectionId);
  if (!section) {
    console.warn('[Sidebar] Section not found:', sectionId);
    return;
  }
  
  try {
    // Try to send message to content script
    await chrome.tabs.sendMessage(state.tabId, {
      type: 'HIGHLIGHT_SECTION',
      data: {
        sectionId,
        heading: section.heading
      }
    });
    // console.log('[Sidebar] ✅ Highlight request sent');
  } catch (error) {
    // If content script not loaded, inject it and retry
    if (error.message.includes('Receiving end does not exist')) {
      // console.log('[Sidebar] Content script not loaded, injecting...');
      
      try {
        // Inject content script
        await chrome.scripting.executeScript({
          target: { tabId: state.tabId },
          files: ['content/content-script.js']
        });
        
        // Wait for script to initialize
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Retry highlight
        await chrome.tabs.sendMessage(state.tabId, {
          type: 'HIGHLIGHT_SECTION',
          data: {
            sectionId,
            heading: section.heading
          }
        });
        
        // console.log('[Sidebar] ✅ Content script injected and highlight request sent');
      } catch (retryError) {
        console.error('[Sidebar] Failed to inject content script or highlight:', retryError);
      }
    } else {
      console.error('[Sidebar] Failed to highlight section:', error);
    }
  }
}

/**
 * Handle summarizer worker messages
 */
function handleSummarizerMessage(event) {
  const { type, ...data } = event.data;
  
  // ✅ Ignore messages if they're for a different tab
  // This prevents overlapping summaries when switching tabs during summarization
  if (state.isSummarizing && state.summaryTabId && state.summaryTabId !== state.tabId) {
    console.log('[Sidebar] Ignoring summary message for different tab:', state.summaryTabId, '(current:', state.tabId, ')');
    return;
  }
  
  switch (type) {
    case 'SECTIONS_LOADED':
      displaySectionsForSummary(data.sections);
      break;
      
    case 'SECTION_SUMMARY_CHUNK':
      updateSectionSummaryStreaming(data);
      break;
      
    case 'SECTION_SUMMARY':
      updateSectionSummary(data);
      break;
      
    case 'COMPLETE':
      handleSummaryComplete(data);
      // Clear summarizing state
      state.isSummarizing = false;
      state.summaryTabId = null;
      console.log('[Sidebar] ✅ Summary complete');
      // Force update button after DOM is fully rendered
      setTimeout(() => updateViewSummaryButton(), 100);
      break;
      
    case 'ERROR':
      console.error('[Sidebar] Summarization error:', data.error);
      state.isSummarizing = false;
      state.summaryTabId = null;
      hideLoading();
      showError('Summarization Failed', data.error);
      break;
  }
}

/**
 * Handle Q&A worker messages
 */
function handleQnAMessage(event) {
  const { type, ...data } = event.data;
  
  // console.log('[Sidebar] Q&A message:', type);
  
  // Check if response is for a different tab (not currently active)
  const isForDifferentTab = type !== 'READY' && 
                            state.pendingQuestionTabId !== null && 
                            state.pendingQuestionTabId !== state.tabId;
  
  if (isForDifferentTab) {
    // console.log('[Sidebar] ⚠️ Response for tab', state.pendingQuestionTabId, 'but currently in tab', state.tabId);
    
    // Handle ANSWER_CHUNK for different tab - save streaming message to cache
    if (type === 'ANSWER_CHUNK') {
      const originTabCache = tabStateCache.get(state.pendingQuestionTabId);
      if (originTabCache) {
        // Store the streaming message in cache so it can be displayed when user returns
        if (!originTabCache.streamingMessage) {
          originTabCache.streamingMessage = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: data.chunk,
            isStreaming: true
          };
        } else {
          // Update existing streaming message
          originTabCache.streamingMessage.content = data.chunk;
        }
        
        tabStateCache.set(state.pendingQuestionTabId, originTabCache);
        // console.log('[Sidebar] 📝 Streaming chunk saved to tab', state.pendingQuestionTabId, 'cache');
      }
      
      // Don't display - user is on different tab
      return;
    }
    
    // Handle ANSWER for different tab - save to that tab's cache AND session
    if (type === 'ANSWER') {
      const originTabCache = tabStateCache.get(state.pendingQuestionTabId);
      if (originTabCache) {
        // Ensure chatMessages array exists
        if (!originTabCache.chatMessages) {
          originTabCache.chatMessages = [];
        }
        
        // Add answer to origin tab's cached messages
        const answerMessage = {
          role: 'assistant',
          content: data.answer,
          metadata: {
            citations: data.citations,
            responseTime: data.responseTime
          }
        };
        
        originTabCache.chatMessages.push(answerMessage);
        
        // Clear streaming message (answer is complete)
        delete originTabCache.streamingMessage;
        
        // Update cache
        tabStateCache.set(state.pendingQuestionTabId, originTabCache);
        // console.log('[Sidebar] ✅ Answer saved to tab', state.pendingQuestionTabId, 'cache (total messages:', originTabCache.chatMessages.length, ')');
        
        // Also save to session (using origin tab's session ID)
        if (originTabCache.sessionId) {
          chrome.runtime.sendMessage({
            type: 'SAVE_CHAT_MESSAGE',
            data: {
              sessionId: originTabCache.sessionId,
              role: 'assistant',
              content: data.answer,
              metadata: {
                citations: data.citations,
                responseTime: data.responseTime
              }
            }
          }).catch(error => {
            console.error('[Sidebar] Failed to save background answer to session:', error);
          });
        }
      }
      
      // Clear pending question
      state.pendingQuestionTabId = null;
    }
    
    // Ignore other updates for different tab (don't display)
    return;
  }
  
  // Response is for current tab - handle normally
  switch (type) {
    case 'READY':
      state.qnaReady = true;
      // console.log('[Sidebar] Q&A ready');
      break;
      
    case 'PROGRESS':
      if (state.chatView) {
        state.chatView.updateThinkingStatus(data.status);
      }
      break;
      
    case 'ANSWER_CHUNK':
      // Handle streaming response (don't log every chunk, it's too noisy)
      if (state.chatView) {
        state.chatView.updateStreamingResponse(data.chunk);
      }
      break;
      
    case 'ANSWER':
      // Clear pending question tab ID (response complete)
      state.pendingQuestionTabId = null;
      
      if (state.chatView) {
        state.chatView.addResponse(data.answer, {
          citations: data.citations,
          responseTime: data.responseTime
        });
        
        // Save to session (only if session exists)
        if (state.sessionId) {
          chrome.runtime.sendMessage({
            type: 'SAVE_CHAT_MESSAGE',
            data: {
              sessionId: state.sessionId,
              role: 'assistant',
              content: data.answer,
              metadata: {
                citations: data.citations,
                responseTime: data.responseTime
              }
            }
          });
        }
      }
      break;
      
    case 'ERROR':
      // Clear pending question tab ID (response complete)
      state.pendingQuestionTabId = null;
      
      if (state.chatView) {
        state.chatView.showError(data.error);
      }
      break;
  }
}

/**
 * Update loading progress
 */
function updateLoadingProgress(status, progress) {
  elements.loadingText.textContent = status;
  elements.loadingSubtext.textContent = progress ? `${progress}%` : '';
}

/**
 * Handle summary completion
 */
/**
 * Display sections list for summary (called first, before summaries)
 */
function displaySectionsForSummary(sections) {
  hideLoading();
  showView('summary');
  
  // Create sections container
  const summaryView = document.getElementById('summaryView');
  summaryView.innerHTML = `
    <div class="summary-header">
      <button class="icon-btn" id="summaryBackBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <h2>Page Summary</h2>
    </div>
    <div class="summary-content" id="summaryContent">
      <div class="summary-sections" id="summarySections">
        ${sections.map(section => `
          <div class="summary-section" data-section-id="${section.id}">
            <h3 class="section-heading">${escapeHTML(section.heading)}</h3>
            <div class="section-summary-content">
              <div class="summary-loading">Summarizing...</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  // Add back button listener
  document.getElementById('summaryBackBtn').addEventListener('click', () => {
    showView('home');
  });
}

/**
 * Format summary text with markdown-like syntax
 */
function formatSummaryText(text) {
  if (!text) return '';
  
  try {
    // Escape HTML first
    let formatted = escapeHTML(text);
    
    // Convert markdown-like syntax to HTML (order matters!)
    
    // 1. Convert bold before italic (to avoid conflicts)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); // **bold**
    
    // 2. Process lists line by line to avoid regex issues
    const lines = formatted.split('\n');
    const processedLines = [];
    let inList = false;
    let listType = null; // 'ul' or 'ol'
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Check for unordered list item (* or -)
      if (/^[\*\-]\s+(.+)$/.test(trimmedLine)) {
        const content = trimmedLine.replace(/^[\*\-]\s+/, '');
        if (!inList || listType !== 'ul') {
          if (inList) processedLines.push(`</${listType}>`);
          processedLines.push('<ul>');
          listType = 'ul';
          inList = true;
        }
        processedLines.push(`<li>${content}</li>`);
      }
      // Check for ordered list item (1. 2. etc)
      else if (/^\d+\.\s+(.+)$/.test(trimmedLine)) {
        const content = trimmedLine.replace(/^\d+\.\s+/, '');
        if (!inList || listType !== 'ol') {
          if (inList) processedLines.push(`</${listType}>`);
          processedLines.push('<ol>');
          listType = 'ol';
          inList = true;
        }
        processedLines.push(`<li>${content}</li>`);
      }
      // Regular line
      else {
        if (inList) {
          processedLines.push(`</${listType}>`);
          inList = false;
          listType = null;
        }
        if (trimmedLine) {
          processedLines.push(line);
        }
      }
    }
    
    // Close any open list
    if (inList) {
      processedLines.push(`</${listType}>`);
    }
    
    formatted = processedLines.join('\n');
    
    // 3. Convert remaining italic (after lists to avoid conflicts)
    formatted = formatted.replace(/\*([^*<>]+)\*/g, '<em>$1</em>'); // *italic*
    
    // 4. Convert line breaks (but not within HTML tags)
    formatted = formatted.replace(/\n(?!<)/g, '<br>\n'); // newlines (not before HTML tags)
    
    // Safety check: if formatting somehow produced empty result, return original escaped text
    if (!formatted || formatted.trim().length === 0) {
      return escapeHTML(text);
    }
    
    return formatted;
  } catch (error) {
    // Fallback: return escaped original text
    return escapeHTML(text);
  }
}

/**
 * Update a section with streaming chunks (real-time)
 */
function updateSectionSummaryStreaming(data) {
  const { id, chunk } = data;
  
  const sectionEl = document.querySelector(`[data-section-id="${id}"]`);
  if (!sectionEl) return;
  
  const contentEl = sectionEl.querySelector('.section-summary-content');
  if (!contentEl) return;
  
  // Update with streaming content - format markdown
  const formatted = formatSummaryText(chunk);
  contentEl.innerHTML = `<div class="section-summary">${formatted}</div>`;
  
  // Let user scroll manually - don't force auto-scroll during streaming
}

/**
 * Update a section with its final summary
 */
function updateSectionSummary(data) {
  const { id, summary, failed, error } = data;
  
  const sectionEl = document.querySelector(`[data-section-id="${id}"]`);
  if (!sectionEl) return;
  
  const contentEl = sectionEl.querySelector('.section-summary-content');
  if (!contentEl) return;
  
  if (failed) {
    // Show fallback with warning (fallback is plain text, so just escape it)
    contentEl.innerHTML = `
      <div class="summary-fallback">
        <div class="fallback-warning">Summarization failed${error ? `: ${error}` : ''}. Showing original content:</div>
        <div class="fallback-text">${escapeHTML(summary)}</div>
      </div>
    `;
  } else {
    // Show final successful summary with markdown formatting
    contentEl.innerHTML = `<div class="section-summary">${formatSummaryText(summary)}</div>`;
  }
}

async function handleSummaryComplete(data) {
  // Only save if we actually have summaries
  if (!data.sectionSummaries || data.sectionSummaries.length === 0) {
    state.summary = null;
    updateViewSummaryButton();
    return;
  }
  
  // Save summaries to state and session
  state.summary = {
    sectionSummaries: data.sectionSummaries,
    statistics: data.statistics
  };
  
  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SUMMARY',
      data: {
        sessionId: state.sessionId,
        sectionSummaries: data.sectionSummaries,
        statistics: data.statistics
      }
    });
  } catch (error) {
    console.error('[Sidebar] Failed to save summary:', error);
  }
  
  // Update View Summary button visibility
  updateViewSummaryButton();
}

/**
 * Handle view summary button
 */
function handleViewSummary() {
  // console.log('[Sidebar] View summary button clicked');
  
  if (!state.summary || !state.summary.sectionSummaries) {
    console.warn('[Sidebar] No summary available');
    return;
  }
  
  // Convert saved summaries back to sections format
  const sections = state.summary.sectionSummaries.map(s => ({
    id: s.id,
    heading: s.heading,
    originalText: ''
  }));
  
  displaySectionsForSummary(sections);
  
  // Immediately populate with saved summaries
  state.summary.sectionSummaries.forEach((summaryData, index) => {
    updateSectionSummary({
      ...summaryData,
      sectionIndex: index,
      totalSections: state.summary.sectionSummaries.length
    });
  });
  
  showView('summary');
}

/**
 * Update View Summary button visibility
 */
function updateViewSummaryButton() {
  // ✅ CRITICAL: Get fresh element reference every time!
  // The button can be destroyed and recreated when home UI is restored
  const viewSummaryBtn = document.getElementById('viewSummaryBtn');
  
  if (!viewSummaryBtn) {
    // Button doesn't exist yet (DOM not ready or home view not loaded)
    console.warn('[Sidebar] updateViewSummaryButton: Button not found in DOM');
    return;
  }
  
  const hasSummary = state.summary && 
                     state.summary.sectionSummaries && 
                     Array.isArray(state.summary.sectionSummaries) &&
                     state.summary.sectionSummaries.length > 0;
  
  console.log('[Sidebar] updateViewSummaryButton | hasSummary:', hasSummary, '| sectionCount:', state.summary?.sectionSummaries?.length || 0);
  
  if (hasSummary) {
    viewSummaryBtn.classList.remove('hidden');
    console.log('[Sidebar] ✅ View Summary button shown');
  } else {
    viewSummaryBtn.classList.add('hidden');
    console.log('[Sidebar] ❌ View Summary button hidden');
  }
}

/**
 * Handle summarize button
 */
async function handleSummarize() {
  // console.log('[Sidebar] Summarize button clicked');
  
  try {
    // ✅ Check if already summarizing - terminate old worker to prevent overlapping
    if (state.isSummarizing) {
      console.log('[Sidebar] Already summarizing (tab:', state.summaryTabId, ') - terminating old worker');
      if (state.summarizerWorker) {
        state.summarizerWorker.terminate();
        state.summarizerWorker = null;
      }
      // Reinitialize worker
      state.summarizerWorker = new Worker(
        chrome.runtime.getURL('workers/summarizer-worker.js'),
        { type: 'module' }
      );
      state.summarizerWorker.addEventListener('message', handleSummarizerMessage);
      state.summarizerWorker.addEventListener('error', (error) => {
        console.error('[Sidebar] Summarizer worker error:', error);
      });
    }
    
    // Mark as summarizing for THIS tab
    state.isSummarizing = true;
    state.summaryTabId = state.tabId;
    console.log('[Sidebar] Starting summary for tab:', state.tabId);
    
    // Check if we have a session
    if (!state.sessionId) {
      console.error('[Sidebar] No session ID available');
      state.isSummarizing = false;
      state.summaryTabId = null;
      throw new Error('No active session. Please refresh and try again.');
    }
    
    showLoading('Extracting content...', 'This may take a few seconds');
    
    // Request content extraction
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // console.log('[Sidebar] Sending extraction request to tab:', tab.id);
    
    let extractResult;
    try {
      extractResult = await chrome.tabs.sendMessage(tab.id, {
        type: 'EXTRACT_CONTENT',
        data: {}
      });
    } catch (error) {
      if (error.message.includes('Receiving end does not exist')) {
        // console.log('[Sidebar] Content script not loaded, attempting to inject...');
        
        // Try to inject content script programmatically
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/content-script.js']
          });
          
          // Wait a bit for script to initialize
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // console.log('[Sidebar] Content script injected, retrying extraction...');
          
          // Retry extraction
          extractResult = await chrome.tabs.sendMessage(tab.id, {
            type: 'EXTRACT_CONTENT',
            data: {}
          });
        } catch (injectError) {
          console.error('[Sidebar] Failed to inject content script:', injectError);
          throw new Error('Content script not loaded. Please reload this webpage (F5) and try again.');
        }
      } else {
        throw error;
      }
    }
    
    // console.log('[Sidebar] Extraction result:', extractResult);
    
    if (!extractResult || !extractResult.success) {
      throw new Error(extractResult?.error || 'Failed to extract content');
    }
    
    if (!extractResult.sections || extractResult.sections.length === 0) {
      throw new Error('No content found on this page. Try a different page.');
    }
    
    state.sections = extractResult.sections;
    
    // console.log('[Sidebar] Extracted', state.sections.length, 'sections');
    
    // Save sections to session
    showLoading('Saving content...', `Found ${state.sections.length} sections`);
    
    const saveResult = await chrome.runtime.sendMessage({
      type: 'SAVE_SECTIONS',
      data: {
        sessionId: state.sessionId,
        sections: state.sections,
        statistics: extractResult.statistics
      }
    });
    
    // console.log('[Sidebar] Save result:', saveResult);
    
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to save content');
    }
    
    // Start summarization with worker
    showLoading('Initializing summarizers...', '0%');
    
    state.summarizerWorker.postMessage({
      type: 'SUMMARIZE',
      data: {
        sections: state.sections
      }
    });
    
    // console.log('[Sidebar] Summarization started');
    
    // Also initialize Q&A worker in parallel
    initializeQnA();
    
  } catch (error) {
    console.error('[Sidebar] Summarization failed:', error);
    state.isSummarizing = false;
    state.summaryTabId = null;
    hideLoading();
    showError('Summarization failed', error.message);
  }
}

/**
 * Ensure home UI is in normal state (check and restore if needed)
 */
function ensureHomeUIIsNormal() {
  // Check if the home UI has been modified (e.g., by showInternalPageMessage)
  const summarizeBtn = document.getElementById('summarizeBtn');
  const askBtn = document.getElementById('askBtn');
  
  // If buttons don't exist, the HTML was modified - restore it
  if (!summarizeBtn || !askBtn) {
    // console.log('[Sidebar] Home UI was modified, restoring normal UI');
    restoreNormalHomeUI();
  } else {
    // console.log('[Sidebar] Home UI is normal, checking button visibility');
    // Ensure button visibility is correct based on current URL
    updateQuickActionsVisibility();
  }
}

/**
 * Update quick actions visibility based on current URL
 */
function updateQuickActionsVisibility() {
  const quickActions = document.getElementById('quickActions');
  if (!quickActions) {
    // If quickActions doesn't exist, try to find it by class
    const quickActionsAlt = document.querySelector('.quick-actions');
    if (!quickActionsAlt) return;
  }
  
  const targetElement = document.getElementById('quickActions') || document.querySelector('.quick-actions');
  
  // Check if current URL is a Chrome internal page or invalid
  const isInternalPage = !state.currentUrl || 
    state.currentUrl.startsWith('chrome://') || 
    state.currentUrl.startsWith('chrome-extension://') ||
    state.currentUrl.startsWith('about:') ||
    state.currentUrl === 'about:blank' ||
    state.currentUrl.startsWith('edge://') ||
    state.currentUrl.startsWith('brave://');
  
  // console.log('[Sidebar] updateQuickActionsVisibility | isInternalPage:', isInternalPage, '| URL:', state.currentUrl);
  
  if (isInternalPage) {
    targetElement.classList.add('hidden');
  } else {
    targetElement.classList.remove('hidden');
  }
}

/**
 * Restore normal home UI (when navigating from internal page)
 */
function restoreNormalHomeUI() {
  elements.homeView.querySelector('.welcome-container').innerHTML = `
    <div class="welcome-icon">
      <img src="${chrome.runtime.getURL('assets/logo.png')}" alt="NutShell" style="width: 64px; height: 64px; border-radius: 12px;">
    </div>
    <h1>Every Tab = AI Workspace</h1>
    <p style="margin-bottom: var(--spacing-sm);">Get instant summaries and ask questions about any webpage</p>
    <div style="display: flex; gap: var(--spacing-md); justify-content: center; flex-wrap: wrap; margin-bottom: var(--spacing-lg); font-size: var(--font-size-sm); color: var(--on-surface-variant);">
      <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
        <span style="color: var(--primary); font-size: 16px;">🔒</span>
        <span><strong>100% Local</strong></span>
      </div>
      <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
        <span style="color: var(--primary); font-size: 16px;">⚡</span>
        <span><strong>Fast & Private</strong></span>
      </div>
      <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
        <span style="color: var(--primary); font-size: 16px;">✨</span>
        <span><strong>Always Free</strong></span>
      </div>
    </div>
    
    <!-- SERP Analysis Section (shown only on Google search pages) -->
    <div id="serpAnalysisSection" class="serp-analysis-section hidden">
      <div class="serp-section-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <h3>Google Search Detected</h3>
      </div>
      <p class="serp-section-desc">Analyze and compare top search results</p>
      <div class="serp-analyze-controls">
        <label for="serpCountInput">Analyze top</label>
        <input type="number" id="serpCountInput" class="serp-count-input" min="1" max="10" value="3">
        <span>results</span>
        <button class="primary-btn" id="analyzeSerpBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Analyze
        </button>
      </div>
    </div>
    
    <div class="quick-actions" id="quickActions">
      <button class="primary-btn" id="summarizeBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15" stroke="currentColor" stroke-width="2"/>
          <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" stroke-width="2"/>
        </svg>
        Summarize This Page
      </button>
      <button class="secondary-btn" id="askBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 9C10 8.20435 10.3161 7.44129 10.8787 6.87868C11.4413 6.31607 12.2044 6 13 6C13.7956 6 14.5587 6.31607 15.1213 6.87868C15.6839 7.44129 16 8.20435 16 9C16 10.5 13.5 11 13 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="13" cy="15" r="0.5" fill="currentColor" stroke="currentColor"/>
        </svg>
        Ask a Question
      </button>
      <button class="secondary-btn hidden" id="viewSummaryBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15" stroke="currentColor" stroke-width="2"/>
          <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" stroke-width="2"/>
        </svg>
        View Summary
      </button>
    </div>

    <!-- Previous Session Notice -->
    <div id="previousSessionNotice" class="previous-session-notice hidden">
      <div class="notice-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 8V12L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
        </svg>
        <span>Previous conversation found</span>
      </div>
      <div class="notice-content">
        <p class="notice-summary"></p>
        <div class="notice-meta">
          <span class="message-count"></span>
          <span class="timestamp"></span>
        </div>
      </div>
      <button class="continue-chat-btn" id="continueChatBtn">Continue Chat</button>
    </div>
  `;
  
  // Re-attach event listeners
  document.getElementById('summarizeBtn').addEventListener('click', handleSummarize);
  document.getElementById('askBtn').addEventListener('click', handleAskQuestion);
  document.getElementById('viewSummaryBtn').addEventListener('click', handleViewSummary);
  document.getElementById('continueChatBtn').addEventListener('click', handleContinueChat);
  document.getElementById('analyzeSerpBtn').addEventListener('click', handleAnalyzeSerp);
  
  // ✅ CRITICAL: Update element references after HTML replacement
  // The old elements were removed, so we need fresh references
  elements.previousSessionNotice = document.getElementById('previousSessionNotice');
  elements.summarizeBtn = document.getElementById('summarizeBtn');
  elements.askBtn = document.getElementById('askBtn');
  elements.viewSummaryBtn = document.getElementById('viewSummaryBtn');
  elements.continueChatBtn = document.getElementById('continueChatBtn');
  elements.serpAnalysisSection = document.getElementById('serpAnalysisSection');
  elements.analyzeSerpBtn = document.getElementById('analyzeSerpBtn');
  elements.serpCountInput = document.getElementById('serpCountInput');
  
  // Update visibility based on current URL
  updateQuickActionsVisibility();
  
  // Update View Summary button visibility
  updateViewSummaryButton();
  
  // console.log('[Sidebar] Normal home UI restored with fresh element references');
}

/**
 * Show internal page message (for Chrome pages, etc.)
 */
function showInternalPageMessage() {
  elements.homeView.querySelector('.welcome-container').innerHTML = `
    <div class="welcome-icon" style="font-size: 64px;">🔒</div>
    <h1>Can't Summarize This Page</h1>
    <p style="color: var(--on-surface-variant); max-width: 400px; text-align: center; line-height: 1.6;">
      This is a Chrome internal page (like settings, extensions, or new tab). 
      <br><br>
      <strong>Nutshell only works on regular web pages.</strong>
      <br><br>
      Try opening a website like Wikipedia, a news article, or a blog post!
    </p>
    <div style="margin-top: var(--spacing-lg); padding: var(--spacing-md); background: var(--surface-variant); border-radius: var(--border-radius-md); max-width: 400px;">
      <p style="font-size: var(--font-size-sm); color: var(--on-surface-variant); margin: 0;">
        <strong>💡 Tip:</strong> Navigate to any webpage and click the Nutshell icon to get started!
      </p>
    </div>
  `;
  
  showView('home');
  // console.log('[Sidebar] Showing internal page message');
}

/**
 * Display summary
 */
function displaySummary(summaryText, statistics) {
  const card = document.createElement('div');
  card.className = 'summary-card';
  
  // Convert markdown-like formatting to HTML
  let formattedText = escapeHTML(summaryText);
  
  // Bold: **text** -> <strong>text</strong>
  formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Italic: *text* -> <em>text</em>
  formattedText = formattedText.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // Line breaks
  formattedText = formattedText.replace(/\n/g, '<br>');
  
  card.innerHTML = `
    <h3>Summary</h3>
    <p style="white-space: pre-line; line-height: 1.6;">${formattedText}</p>
    ${statistics ? `
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-label">Sections</span>
          <span class="stat-value">${statistics.sections || 0}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Words</span>
          <span class="stat-value">${(statistics.words || 0).toLocaleString()}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Read Time</span>
          <span class="stat-value">${statistics.readingTime || 0} min</span>
        </div>
      </div>
    ` : ''}
  `;
  
  elements.summaryContent.innerHTML = '';
  elements.summaryContent.appendChild(card);
  
  state.summary = summaryText;
  // console.log('[Sidebar] Summary displayed');
}

/**
 * Handle messages from background
 */
function handleBackgroundMessage(message, sender, sendResponse) {
  // console.log('[Sidebar] Message from background:', message.type);
  
  switch (message.type) {
    case 'SUMMARY_READY':
      displaySummary(message.data.summary, message.data.statistics);
      hideLoading();
      showView('summary');
      break;
      
    case 'CHAT_STREAM_START':
      // Streaming started - only show if for current tab
      if (message.targetTabId === state.tabId) {
        console.log('[Sidebar] Stream started for current tab, citations:', message.data.citations?.length);
        if (state.chatView) {
          state.chatView.startStreamingResponse(message.data.citations);
        }
      } else {
        console.log('[Sidebar] Stream started for different tab, ignoring');
      }
      break;
      
    case 'CHAT_STREAM_CHUNK':
      // Streaming chunk received - only update if for current tab
      if (message.targetTabId === state.tabId) {
        if (state.chatView) {
          state.chatView.updateStreamingResponse(message.data.chunk);
        }
      } else {
        // Different tab - save to cache for that tab
        const targetTabCache = tabStateCache.get(message.targetTabId) || {};
        targetTabCache.streamingAnswer = message.data.chunk;
        tabStateCache.set(message.targetTabId, targetTabCache);
      }
      break;
      
    case 'CHAT_STREAM_END':
      // Streaming complete
      if (message.targetTabId === state.tabId) {
        console.log('[Sidebar] Stream complete for current tab:', message.data.answer?.length, 'chars');
        if (state.chatView) {
          state.chatView.finalizeStreamingResponse(message.data.answer, {
            citations: message.data.citations,
            responseTime: message.data.responseTime
          });
        }
      } else {
        console.log('[Sidebar] Stream complete for different tab, saving to cache');
        // Save to cache for that tab
        const targetTabCache = tabStateCache.get(message.targetTabId) || {};
        targetTabCache.pendingAnswer = {
          answer: message.data.answer,
          citations: message.data.citations,
          responseTime: message.data.responseTime
        };
        delete targetTabCache.streamingAnswer; // Clear streaming state
        tabStateCache.set(message.targetTabId, targetTabCache);
      }
      break;
    
    case 'CHAT_RESPONSE':
      // Handle non-streaming chat response (fallback)
      console.log('[Sidebar] Received CHAT_RESPONSE:', {
        tabId: message.data.tabId || message.tabId,
        stateTabId: state.tabId,
        answerLength: message.data.answer?.length
      });
      
      // Only handle if this is for the current tab
      if (state.chatView) {
        state.chatView.addResponse(message.data.answer, {
          citations: message.data.citations,
          responseTime: message.data.responseTime
        });
      }
      break;
    
    case 'CHAT_ERROR':
      // Handle chat error from service worker
      console.error('[Sidebar] Received CHAT_ERROR:', message.data.error);
      
      if (state.chatView) {
        state.chatView.showError('Failed to get answer: ' + message.data.error);
      }
      break;
    
    case 'MULTI_PAGE_ANSWER_CHUNK':
      // Handle streaming multi-page chat answer (only for current tab and session)
      // console.log('[Sidebar] MULTI_PAGE_ANSWER_CHUNK:', {
      //   sessionId: message.sessionId,
      //   stateSessionId: state.sessionId,
      //   tabId: message.tabId,
      //   stateTabId: state.tabId,
      //   chunkLength: message.chunk.length
      // });
      
      if (message.sessionId === state.sessionId && message.tabId === state.tabId && state.chatView) {
        // console.log('[Sidebar] ✅ Appending chunk to chat view');
        state.chatView.appendStreamingChunk(message.chunk);
      } else {
        // console.log('[Sidebar] ⚠️ Multi-page chunk ignored - conditions not met');
      }
      break;
    
    case 'SHOW_HISTORY_TAB':
      // Switch to history view and specific tab (from research mode)
      // console.log('[Sidebar] SHOW_HISTORY_TAB:', message.data);
      handleShowHistory();
      // Wait a bit for history view to initialize, then switch tab
      setTimeout(() => {
        if (state.historyView && message.data?.tab) {
          state.historyView.switchTab(message.data.tab);
        }
      }, 100);
      break;
    
    case 'SWITCH_TO_CHAT_VIEW':
      // Switch to chat view (from research mode)
      // console.log('[Sidebar] SWITCH_TO_CHAT_VIEW:', message.data);
      if (state.chatView) {
        showView('chat');
        // Session should already be loaded by reloadForTab
      }
      break;
      
    default:
      // console.log('[Sidebar] Unknown message type:', message.type);
  }
}

/**
 * Show view
 */
function showView(viewName) {
  // Hide all views
  elements.homeView.classList.remove('active');
  elements.summaryView.classList.remove('active');
  elements.chatView.classList.remove('active');
  elements.historyView.classList.remove('active');
  elements.serpView.classList.remove('active');
  elements.settingsView.classList.remove('active');
  
  // Show requested view
  switch (viewName) {
    case 'home':
      elements.homeView.classList.add('active');
      // Update View Summary button when showing home view
      // Use setTimeout to ensure DOM is fully ready
      setTimeout(() => updateViewSummaryButton(), 0);
      break;
    case 'summary':
      elements.summaryView.classList.add('active');
      break;
    case 'chat':
      elements.chatView.classList.add('active');
      break;
    case 'history':
      elements.historyView.classList.add('active');
      break;
    case 'serp':
      elements.serpView.classList.add('active');
      break;
    case 'settings':
      elements.settingsView.classList.add('active');
      break;
  }
  
  state.currentView = viewName;
  // console.log('[Sidebar] View changed to:', viewName);
}

/**
 * Show loading state
 */
function showLoading(text = 'Loading...', subtext = '') {
  elements.loadingText.textContent = text;
  elements.loadingSubtext.textContent = subtext;
  
  // Clear any URL list
  const existingList = elements.loadingView.querySelector('.loading-url-list');
  if (existingList) {
    existingList.remove();
  }
  
  elements.loadingView.classList.remove('hidden');
  state.isLoading = true;
}

/**
 * Show loading state with URL list
 */
function showLoadingWithUrls(text, urls) {
  elements.loadingText.textContent = text;
  elements.loadingSubtext.textContent = `Analyzing ${urls.length} page${urls.length > 1 ? 's' : ''}...`;
  
  // Remove existing list if any
  const existingList = elements.loadingView.querySelector('.loading-url-list');
  if (existingList) {
    existingList.remove();
  }
  
  // Create URL list
  const urlList = document.createElement('div');
  urlList.className = 'loading-url-list';
  
  urls.forEach((result, index) => {
    const urlItem = document.createElement('div');
    urlItem.className = 'loading-url-item';
    urlItem.innerHTML = `
      <div class="url-number">${index + 1}</div>
      <div class="url-details">
        <div class="url-title">${escapeHTML(result.title)}</div>
        <div class="url-domain">${getDomain(result.url)}</div>
      </div>
      <div class="url-status">
        <div class="status-spinner"></div>
      </div>
    `;
    urlList.appendChild(urlItem);
  });
  
  // Insert after subtext
  const subtext = elements.loadingView.querySelector('.loading-subtext');
  if (subtext && subtext.parentElement) {
    subtext.parentElement.insertBefore(urlList, subtext.nextSibling);
  }
  
  elements.loadingView.classList.remove('hidden');
  state.isLoading = true;
}

/**
 * Hide loading state
 */
function hideLoading() {
  elements.loadingView.classList.add('hidden');
  state.isLoading = false;
  
  // Clean up URL list
  const existingList = elements.loadingView.querySelector('.loading-url-list');
  if (existingList) {
    existingList.remove();
  }
}

/**
 * Show error
 */
function showError(title, message) {
  const errorTitle = document.querySelector('.error-title');
  if (errorTitle) {
    errorTitle.textContent = title || 'Something went wrong';
  }
  elements.errorMessage.textContent = message;
  elements.errorView.classList.remove('hidden');
  // console.log('[Sidebar] Error shown:', title, message);
}

/**
 * Hide error
 */
function hideError() {
  elements.errorView.classList.add('hidden');
}

/**
 * Handle retry
 */
function handleRetry() {
  hideError();
  initialize();
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
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
 * Escape HTML
 */
function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Generate AI FLOW summary of conversation using LanguageModel API
 * Traces the user's exploration journey through questions
 */
async function generateConversationSummary(messages) {
  try {
    // Check if LanguageModel API is available
    if (typeof LanguageModel === 'undefined') {
      throw new Error('LanguageModel API not available');
    }
    
    // Build conversation text - ONLY extract user questions (prevent AI hallucination)
    const userQuestions = messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .join(' → ');
    
    // Check availability
    const availability = await LanguageModel.availability();
    if (availability === 'unavailable') {
      throw new Error('LanguageModel unavailable');
    }
    
    // Create session with simple keyword extraction instructions
    const session = await LanguageModel.create({
      systemPrompt: `You extract topic keywords from questions. Output ONLY plain text.

RULES:
- Extract main topic from each question
- Keep it under 10 words total
- NO markdown, NO analysis, NO invented details
- NO explanations or interpretation
- Just extract and list topics

EXAMPLES:
Input: "What is artificial intelligence? → How does it work?"
Output: "Asked about AI → then how it works"

Input: "What is Python? → What are loops? → How to use functions?"
Output: "Asked about Python → loops → functions"`,
      outputLanguage: 'en'
    });
    
    // Generate flow summary - questions are already connected with arrows
    const prompt = `Extract the main topic from each question. Keep it short (under 10 words total):\n\n${userQuestions}\n\nOutput: "Asked [topic] → [topic] → [topic]"`;
    let summary = await session.prompt(prompt);
    
    // Cleanup
    await session.destroy();
    
    // Strip any markdown formatting that might slip through
    summary = summary
      .replace(/^#+\s*/gm, '')  // Remove headers
      .replace(/\*\*/g, '')      // Remove bold
      .replace(/\*/g, '')        // Remove italic/bullets
      .replace(/^[-•]\s*/gm, '') // Remove list markers
      .replace(/\n+/g, ' ')      // Replace newlines with space
      .trim();
    
    // Limit to first sentence if AI generated multiple
    const firstSentence = summary.split(/[.!?]/)[0].trim();
    let cleanSummary = firstSentence || summary;
    
    // Safety check: If AI output is still too long or looks wrong, use simple fallback
    if (cleanSummary.length > 100 || cleanSummary.includes('##') || cleanSummary.includes('**')) {
      console.warn('[Sidebar] AI summary too verbose, using simple fallback');
      // Simple fallback: just shorten the raw questions
      const topics = messages
        .filter(msg => msg.role === 'user')
        .map(msg => {
          // Extract key topic words (first 3-5 words)
          const words = msg.content.split(/\s+/).slice(0, 4);
          return words.join(' ').replace(/[?.,!]/g, '');
        })
        .join(' → ');
      cleanSummary = topics.substring(0, 80); // Max 80 chars
    }
    
    // console.log('[Sidebar] ✅ Conversation flow summary generated:', cleanSummary);
    return cleanSummary;
    
  } catch (error) {
    console.error('[Sidebar] Failed to generate conversation summary:', error);
    throw error;
  }
}

/**
 * Get domain from URL
 */
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    return url;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// console.log('[Sidebar] 🚀 Script loaded');

