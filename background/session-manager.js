/**
 * Session Manager - UUID-based session storage
 * Core of multi-page chat and page-associated history
 */

import * as storage from '../lib/storage.js';
import { uuid, timestamp, normalizeURL } from '../lib/utils.js';

// Registry file
const REGISTRY_FILE = 'registry.json';

// In-memory cache
let registry = null;

/**
 * Initialize session manager
 */
export async function initialize() {
  try {
    await storage.initialize();
    registry = await loadRegistry();
    // console.log('[SessionManager] Initialized with', Object.keys(registry.sessions).length, 'sessions');
    return true;
  } catch (error) {
    console.error('[SessionManager] Initialization failed:', error);
    throw error;
  }
}

/**
 * Load registry from storage
 */
async function loadRegistry() {
  try {
    const data = await storage.read(REGISTRY_FILE);
    if (data) {
      // ✅ Ensure all required properties exist (backwards compatibility)
      return {
        sessions: data.sessions || {},
        tabToSession: data.tabToSession || {},
        urlToSessions: data.urlToSessions || {}
      };
    }
  } catch (error) {
    console.warn('[SessionManager] Failed to load registry:', error);
  }
  
  // Return empty registry
  return {
    sessions: {},
    tabToSession: {},
    urlToSessions: {}
  };
}

/**
 * Save registry to storage
 */
async function saveRegistry() {
  try {
    await storage.write(REGISTRY_FILE, registry);
    return true;
  } catch (error) {
    console.error('[SessionManager] Failed to save registry:', error);
    return false;
  }
}

/**
 * Create new session
 */
export async function createSession(tabId, url, title) {
  try {
    const sessionId = uuid();
    const now = timestamp();
    const normalizedURL = normalizeURL(url);
    
    const session = {
      sessionId,
      tabId,
      url: normalizedURL,
      currentUrl: normalizedURL,
      
      content: {
        sections: [],
        summary: null,
        statistics: {}
      },
      
      chatHistory: [],
      chatHistorySummary: null,
      
      navigationHistory: [{
        url: normalizedURL,
        title,
        timestamp: now,
        sectionsCount: 0
      }],
      
      recentPages: [],
      
      metadata: {
        title,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        pageCount: 1,
        isActive: true
      },
      
      isActive: true,
      lastActive: now
    };
    
    // Save session
    await storage.write(`session_${sessionId}.json`, session);
    
    // Update registry
    registry.sessions[sessionId] = {
      sessionId,
      url: normalizedURL,
      title,
      isActive: true,
      currentTabId: tabId,
      createdAt: now,
      lastActive: now,
      messageCount: 0,
      pageCount: 1
    };
    
    registry.tabToSession[tabId] = sessionId;
    
    if (!registry.urlToSessions[normalizedURL]) {
      registry.urlToSessions[normalizedURL] = [];
    }
    registry.urlToSessions[normalizedURL].push(sessionId);
    
    await saveRegistry();
    
    // console.log('[SessionManager] Created session:', sessionId);
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to create session:', error);
    throw error;
  }
}

/**
 * Create a multi-page chat session from SERP analysis
 * @param {number} tabId - Current tab ID
 * @param {Array} pages - Array of {url, title, extractedContent, summary}
 * @param {string} searchQuery - Original search query
 * @param {string} initialQuestion - Initial comparison question
 * @param {string} initialAnswer - Initial comparison answer
 * @returns {Promise<Object>} - Created session
 */
export async function createMultiPageSession(tabId, pages, searchQuery, initialQuestion, initialAnswer) {
  try {
    const sessionId = uuid();
    const now = timestamp();
    
    // console.log('[SessionManager] Creating multi-page session with', pages.length, 'pages');
    
    // Prepare multi-page content
    const multiPageContent = pages.map((page, index) => ({
      url: normalizeURL(page.url),
      title: page.title,
      extractedContent: page.extractedContent,
      summary: page.summary,
      pageNumber: index + 1
    }));
    
    const session = {
      sessionId,
      tabId,
      url: 'multipage://serp-analysis', // Special URL for multi-page sessions
      currentUrl: 'multipage://serp-analysis',
      type: 'multiPageChat', // NEW: Session type
      
      content: {
        sections: [], // Not used for multi-page
        summary: null,
        statistics: {},
        pages: multiPageContent // NEW: Multi-page content
      },
      
      chatHistory: [
        // Pre-populate with the initial Q&A
        {
          role: 'user',
          content: initialQuestion,
          timestamp: now,
          pageUrl: 'multipage://serp-analysis'
        },
        {
          role: 'assistant',
          content: initialAnswer,
          timestamp: now,
          pageUrl: 'multipage://serp-analysis',
          metadata: {
            fromComparison: true
          }
        }
      ],
      chatHistorySummary: null,
      
      navigationHistory: [{
        url: 'multipage://serp-analysis',
        title: `Multi-Page Chat: ${searchQuery}`,
        timestamp: now,
        sectionsCount: pages.length
      }],
      
      recentPages: [], // Not used for multi-page
      
      metadata: {
        title: `Multi-Page Chat: ${searchQuery}`,
        searchQuery: searchQuery, // NEW: Store search query
        pageCount: pages.length,
        createdAt: now,
        updatedAt: now,
        messageCount: 2, // Initial Q&A counts as 2 messages
        isActive: true
      },
      
      isActive: true,
      lastActive: now
    };
    
    // Save session
    await storage.write(`session_${sessionId}.json`, session);
    
    // Update registry
    registry.sessions[sessionId] = {
      sessionId,
      url: 'multipage://serp-analysis',
      title: `Multi-Page Chat: ${searchQuery}`,
      isActive: true,
      currentTabId: tabId,
      createdAt: now,
      lastActive: now,
      messageCount: 2,
      pageCount: pages.length,
      type: 'multiPageChat'
    };
    
    registry.tabToSession[tabId] = sessionId;
    
    await saveRegistry();
    
    // console.log('[SessionManager] ✅ Created multi-page session:', sessionId);
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to create multi-page session:', error);
    throw error;
  }
}

/**
 * Read session
 */
export async function readSession(sessionId) {
  try {
    console.log('[SessionManager] Reading session:', sessionId);
    const session = await storage.read(`session_${sessionId}.json`);
    console.log('[SessionManager] Session read:', session ? 'SUCCESS' : 'NULL');
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to read session:', sessionId, error);
    console.error('[SessionManager] Error details:', error.message);
    return null;
  }
}

/**
 * Update session
 */
export async function updateSession(sessionId, updates) {
  try {
    const session = await readSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // Merge updates
    Object.assign(session, updates);
    session.metadata.updatedAt = timestamp();
    session.lastActive = timestamp();
    
    // Save
    await storage.write(`session_${sessionId}.json`, session);
    
    // Update registry
    if (registry.sessions[sessionId]) {
      registry.sessions[sessionId].lastActive = session.lastActive;
      if (updates.chatHistory) {
        registry.sessions[sessionId].messageCount = updates.chatHistory.length;
      }
      await saveRegistry();
    }
    
    // console.log('[SessionManager] Updated session:', sessionId);
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to update session:', error);
    throw error;
  }
}

/**
 * Find session by tab ID
 */
export function findSessionByTabId(tabId) {
  if (!registry || !registry.tabToSession) return null;
  return registry.tabToSession[tabId] || null;
}

/**
 * Find sessions by URL
 */
export function findSessionsByURL(url) {
  if (!registry || !registry.urlToSessions) return [];
  const normalizedURL = normalizeURL(url);
  return registry.urlToSessions[normalizedURL] || [];
}

/**
 * Get most recent session for URL
 */
export async function getMostRecentSessionForURL(url) {
  const sessionIds = findSessionsByURL(url);
  if (sessionIds.length === 0) return null;
  
  // Get all sessions and find most recent WITH CHAT HISTORY
  let mostRecent = null;
  let mostRecentTime = 0;
  
  for (const sessionId of sessionIds) {
    const session = await readSession(sessionId);
    // ✅ Only consider sessions that have chat history
    if (session && session.chatHistory && session.chatHistory.length > 0 && session.lastActive > mostRecentTime) {
      mostRecent = session;
      mostRecentTime = session.lastActive;
    }
  }
  
  return mostRecent;
}

/**
 * Associate session with tab
 */
export async function associateSessionWithTab(sessionId, tabId) {
  try {
    const session = await readSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    session.tabId = tabId;
    session.isActive = true;
    session.lastActive = timestamp();
    
    await storage.write(`session_${sessionId}.json`, session);
    
    // Update registry
    registry.tabToSession[tabId] = sessionId;
    if (registry.sessions[sessionId]) {
      registry.sessions[sessionId].isActive = true;
      registry.sessions[sessionId].currentTabId = tabId;
      registry.sessions[sessionId].lastActive = session.lastActive;
    }
    await saveRegistry();
    
    // console.log('[SessionManager] Associated session', sessionId, 'with tab', tabId);
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to associate session:', error);
    throw error;
  }
}

/**
 * Add chat message to session
 */
export async function addChatMessage(sessionId, role, content, metadata = {}) {
  try {
    const session = await readSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    const message = {
      role,
      content,
      timestamp: timestamp(),
      pageUrl: session.currentUrl,
      metadata
    };
    
    session.chatHistory.push(message);
    
    // Ensure metadata exists (for research mode sessions created without metadata)
    if (!session.metadata) {
      session.metadata = {
        title: session.title || 'Untitled Session',
        createdAt: session.createdAt || timestamp(),
        updatedAt: timestamp()
      };
    }
    
    session.metadata.messageCount = session.chatHistory.length;
    session.metadata.updatedAt = timestamp();
    session.lastActive = timestamp();
    
    await storage.write(`session_${sessionId}.json`, session);
    
    // Update registry
    if (registry.sessions[sessionId]) {
      registry.sessions[sessionId].messageCount = session.chatHistory.length;
      registry.sessions[sessionId].lastActive = session.lastActive;
      await saveRegistry();
    }
    
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to add chat message:', error);
    throw error;
  }
}

/**
 * Update session content (sections, summary)
 */
export async function updateSessionContent(sessionId, content) {
  try {
    const session = await readSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // Merge content
    session.content = {
      ...session.content,
      ...content
    };
    
    session.metadata.updatedAt = timestamp();
    await storage.write(`session_${sessionId}.json`, session);
    
    // console.log('[SessionManager] Updated session content:', sessionId);
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to update session content:', error);
    throw error;
  }
}

/**
 * Delete session
 */
export async function deleteSession(sessionId) {
  try {
    // Delete file
    await storage.deleteFile(`session_${sessionId}.json`);
    
    // Update registry
    if (registry.sessions[sessionId]) {
      const url = registry.sessions[sessionId].url;
      const tabId = registry.sessions[sessionId].currentTabId;
      
      delete registry.sessions[sessionId];
      
      if (tabId && registry.tabToSession[tabId] === sessionId) {
        delete registry.tabToSession[tabId];
      }
      
      if (url && registry.urlToSessions[url]) {
        registry.urlToSessions[url] = registry.urlToSessions[url].filter(id => id !== sessionId);
        if (registry.urlToSessions[url].length === 0) {
          delete registry.urlToSessions[url];
        }
      }
      
      await saveRegistry();
    }
    
    // console.log('[SessionManager] Deleted session:', sessionId);
    return true;
  } catch (error) {
    console.error('[SessionManager] Failed to delete session:', error);
    return false;
  }
}

/**
 * Track page navigation (add to navigation history)
 */
export async function trackPageNavigation(sessionId, url, title, chatSummary = null) {
  try {
    const session = await readSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    const normalizedURL = normalizeURL(url);
    const now = timestamp();
    
    // Save current page to recentPages with its content and chat
    if (session.content.sections.length > 0) {
      const pageContext = {
        url: session.currentUrl,
        title: session.metadata.title,
        timestamp: session.metadata.updatedAt,
        sections: session.content.sections,
        chatSummary: chatSummary || session.chatHistorySummary,
        sectionsCount: session.content.sections.length
      };
      
      // Add to recentPages (keep last 5)
      session.recentPages.unshift(pageContext);
      if (session.recentPages.length > 5) {
        session.recentPages = session.recentPages.slice(0, 5);
      }
      
      // console.log('[SessionManager] Saved page context:', session.currentUrl, 'with', pageContext.sectionsCount, 'sections');
    }
    
    // Add navigation entry
    session.navigationHistory.push({
      url: normalizedURL,
      title,
      timestamp: now,
      sectionsCount: 0 // Will be updated when content is extracted
    });
    
    // Keep last 10 navigation entries
    if (session.navigationHistory.length > 10) {
      session.navigationHistory = session.navigationHistory.slice(-10);
    }
    
    // Update current URL
    session.currentUrl = normalizedURL;
    session.metadata.title = title;
    session.metadata.updatedAt = now;
    
    // Clear chat summary for new page
    session.chatHistorySummary = null;
    
    // Save session
    await storage.write(`session_${sessionId}.json`, session);
    
    // console.log('[SessionManager] Tracked navigation:', title, '(', session.recentPages.length, 'pages in context)');
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to track navigation:', error);
    throw error;
  }
}

/**
 * Get multi-page context for Q&A
 */
export async function getMultiPageContext(sessionId) {
  try {
    const session = await readSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    const context = {
      currentPage: {
        url: session.currentUrl,
        title: session.metadata.title,
        sections: session.content.sections
      },
      recentPages: session.recentPages,
      totalPages: session.recentPages.length + 1
    };
    
    // console.log('[SessionManager] Multi-page context:', context.totalPages, 'pages available');
    return context;
  } catch (error) {
    console.error('[SessionManager] Failed to get multi-page context:', error);
    return null;
  }
}

/**
 * Save conversation summary
 */
export async function saveConversationSummary(sessionId, summary) {
  try {
    const session = await readSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    session.chatHistorySummary = summary;
    session.metadata.updatedAt = timestamp();
    
    await storage.write(`session_${sessionId}.json`, session);
    
    // console.log('[SessionManager] Saved conversation summary');
    return true;
  } catch (error) {
    console.error('[SessionManager] Failed to save conversation summary:', error);
    return false;
  }
}

/**
 * Get all sessions (for history view)
 */
export async function getAllSessions() {
  try {
    const sessions = [];
    
    // Get all session IDs from registry
    for (const sessionId of Object.keys(registry.sessions)) {
      try {
        const session = await readSession(sessionId);
        if (session && session.chatHistory && session.chatHistory.length > 0) {
          sessions.push(session);
        }
      } catch (error) {
        console.warn('[SessionManager] Failed to load session:', sessionId, error);
      }
    }
    
    // Sort by last active (most recent first)
    sessions.sort((a, b) => b.lastActive - a.lastActive);
    
    // console.log('[SessionManager] Retrieved', sessions.length, 'sessions');
    return sessions;
  } catch (error) {
    console.error('[SessionManager] Failed to get all sessions:', error);
    return [];
  }
}

/**
 * Create a SERP analysis session
 * @param {Object} analysisData - SERP analysis data
 * @returns {Object} Created session
 */
export async function createSerpSession(analysisData) {
  try {
    const sessionId = uuid();
    const now = timestamp();
    
    const serpSession = {
      sessionId,
      type: 'serpAnalysis', // Session type
      searchQuery: analysisData.searchQuery,
      searchUrl: analysisData.searchUrl,
      timestamp: now,
      resultCount: analysisData.results.length,
      results: analysisData.results.map(result => ({
        url: result.url,
        title: result.title,
        snippet: result.snippet || '',
        position: result.position,
        summary: result.summary || '',
        relevanceScore: result.relevance || 0,
        extractedContent: result.extractedContent || null,
        cachedAt: result.cachedAt || now
      })),
      comparisonDone: false,
      comparisonQuestion: null,
      comparisonResult: null,
      chatSessionId: null, // Link to multi-page chat if created
      metadata: {
        createdAt: now,
        lastViewed: now
      }
    };
    
    // Save session file
    await storage.write(`serp_session_${sessionId}.json`, serpSession);
    
    // Update registry
    if (!registry.serpSessions) {
      registry.serpSessions = {};
    }
    
    registry.serpSessions[sessionId] = {
      searchQuery: analysisData.searchQuery,
      resultCount: analysisData.results.length,
      timestamp: now,
      chatSessionId: null
    };
    
    await saveRegistry();
    
    // console.log('[SessionManager] Created SERP session:', sessionId, `"${analysisData.searchQuery}"`);
    return serpSession;
  } catch (error) {
    console.error('[SessionManager] Failed to create SERP session:', error);
    throw error;
  }
}

/**
 * Get all SERP analysis sessions
 * @returns {Array} Array of SERP sessions
 */
export async function getSerpSessions() {
  try {
    const sessions = [];
    
    // Ensure serpSessions exists in registry
    if (!registry.serpSessions) {
      registry.serpSessions = {};
      await saveRegistry();
    }
    
    // Get all SERP session IDs from registry
    for (const sessionId of Object.keys(registry.serpSessions)) {
      try {
        const session = await storage.read(`serp_session_${sessionId}.json`);
        if (session) {
          sessions.push(session);
        }
      } catch (error) {
        console.warn('[SessionManager] Failed to load SERP session:', sessionId, error);
      }
    }
    
    // Sort by timestamp (most recent first)
    sessions.sort((a, b) => b.timestamp - a.timestamp);
    
    // console.log('[SessionManager] Retrieved', sessions.length, 'SERP sessions');
    return sessions;
  } catch (error) {
    console.error('[SessionManager] Failed to get SERP sessions:', error);
    return [];
  }
}

/**
 * Get a specific SERP session
 * @param {string} sessionId - SERP session ID
 * @returns {Object|null} SERP session or null
 */
export async function getSerpSession(sessionId) {
  try {
    const session = await storage.read(`serp_session_${sessionId}.json`);
    if (session) {
      // Update last viewed
      session.metadata.lastViewed = timestamp();
      await storage.write(`serp_session_${sessionId}.json`, session);
    }
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to get SERP session:', sessionId, error);
    return null;
  }
}

/**
 * Update SERP session with comparison data
 * @param {string} sessionId - SERP session ID
 * @param {string} question - Comparison question
 * @param {string} result - Comparison result
 */
export async function updateSerpComparison(sessionId, question, result) {
  try {
    const session = await getSerpSession(sessionId);
    if (!session) {
      throw new Error('SERP session not found');
    }
    
    session.comparisonDone = true;
    session.comparisonQuestion = question;
    session.comparisonResult = result;
    session.metadata.lastViewed = timestamp();
    
    await storage.write(`serp_session_${sessionId}.json`, session);
    // console.log('[SessionManager] Updated SERP comparison:', sessionId);
    return session;
  } catch (error) {
    console.error('[SessionManager] Failed to update SERP comparison:', error);
    throw error;
  }
}

/**
 * Link SERP session to chat session
 * @param {string} serpSessionId - SERP session ID
 * @param {string} chatSessionId - Chat session ID
 */
export async function linkSerpToChat(serpSessionId, chatSessionId) {
  try {
    const session = await getSerpSession(serpSessionId);
    if (!session) {
      throw new Error('SERP session not found');
    }
    
    session.chatSessionId = chatSessionId;
    await storage.write(`serp_session_${serpSessionId}.json`, session);
    
    // Update registry
    if (registry.serpSessions[serpSessionId]) {
      registry.serpSessions[serpSessionId].chatSessionId = chatSessionId;
      await saveRegistry();
    }
    
    // console.log('[SessionManager] Linked SERP to chat:', serpSessionId, '→', chatSessionId);
  } catch (error) {
    console.error('[SessionManager] Failed to link SERP to chat:', error);
    throw error;
  }
}

/**
 * Delete SERP session
 * @param {string} sessionId - SERP session ID
 */
export async function deleteSerpSession(sessionId) {
  try {
    // Delete session file
    await storage.remove(`serp_session_${sessionId}.json`);
    
    // Remove from registry
    if (registry.serpSessions && registry.serpSessions[sessionId]) {
      delete registry.serpSessions[sessionId];
      await saveRegistry();
    }
    
    // console.log('[SessionManager] Deleted SERP session:', sessionId);
    return true;
  } catch (error) {
    console.error('[SessionManager] Failed to delete SERP session:', error);
    throw error;
  }
}
