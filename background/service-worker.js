/**
 * Service Worker - Main background script
 * Handles messages, navigation, and coordinates all features
 */

import * as sessionManager from './session-manager.js';
import { serpAnalyzer } from './serp-analyzer.js';
import * as storage from '../lib/storage.js';
import { uuid, timestamp } from '../lib/utils.js';
import { BM25Retriever } from '../lib/retrieval.js';

// Token limits for Chrome AI (conservative estimate)
const MAX_TOTAL_TOKENS = 3500; // Leave buffer for safety
const CHARS_PER_TOKEN = 4; // Rough estimate: 1 token ≈ 4 chars

/**
 * Estimate token count from text
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Calculate available tokens for context
 */
function calculateAvailableTokens(systemPrompt, chatHistory, question, mentionedTabsCount = 0) {
  let usedTokens = 0;
  
  // System prompt
  usedTokens += estimateTokens(systemPrompt);
  
  // Chat history (only last 6 messages that are included in system prompt)
  const recentMessages = chatHistory.slice(-6);
  recentMessages.forEach(msg => {
    usedTokens += estimateTokens(msg.content);
  });
  
  // Current question
  usedTokens += estimateTokens(question);
  
  // Mentioned tabs overhead (approximate)
  usedTokens += mentionedTabsCount * 100;
  
  // Instructions and formatting overhead
  usedTokens += 200;
  
  // Reserved for answer
  usedTokens += 500;
  
  const available = MAX_TOTAL_TOKENS - usedTokens;
  console.log(`[SW] Token budget: ${usedTokens}/${MAX_TOTAL_TOKENS} used, ${available} available for context`);
  
  return Math.max(available, 500);
}

// State
const state = {
  initialized: false,
  activeSessions: new Map(), // tabId -> sessionId
  ports: new Map(), // tabId -> port
  tabInfo: new Map() // tabId -> { title, url, lastActive }
};

/**
 * Initialize service worker
 */
async function initialize() {
  if (state.initialized) return;
  
  try {
    await sessionManager.initialize();
    state.initialized = true;
  } catch (error) {
    console.error('[SW] Initialization failed:', error);
  }
}

/**
 * Message handler
 */
async function handleMessage(message, sender, sendResponse) {
  const { type, data } = message;
  
  try {
    switch (type) {
      case 'GET_SESSION':
        return await handleGetSession(data.tabId, data.url, data.title, data.forceNew);
      
      case 'GET_SPECIFIC_SESSION':
        return await handleGetSpecificSession(data.sessionId);
      
      case 'ASSOCIATE_SESSION_WITH_TAB':
        return await handleAssociateSessionWithTab(data.sessionId, data.tabId);
        
      case 'SAVE_SECTIONS':
        return await handleSaveSections(data.sessionId, data.sections, data.statistics);
        
      case 'SEND_CHAT':
        return await handleSendChat(data);
      
      case 'GET_AVAILABLE_TABS':
        return await handleGetAvailableTabs(data.currentTabId);
      
      case 'GET_TAB_CONTEXT':
        return await handleGetTabContext(data.tabId);
        
      case 'REQUEST_SUMMARY':
        return await handleRequestSummary(data.sessionId);
        
      case 'PAGE_NAVIGATION':
        return await handlePageNavigation(data.tabId, data.url, data.title);
        
      case 'CONTINUE_SESSION':
        return await handleContinueSession(data.sessionId, data.tabId);
        
      case 'SAVE_SUMMARY':
        return await handleSaveSummary(data.sessionId, data.summary, data.sectionSummaries, data.statistics);
        
      case 'SAVE_CHAT_MESSAGE':
        return await handleSaveChatMessage(data.sessionId, data.role, data.content, data.metadata);
        
      case 'TRACK_NAVIGATION':
        return await handleTrackNavigation(data.sessionId, data.url, data.title, data.chatSummary);
        
      case 'GET_MULTIPAGE_CONTEXT':
        return await handleGetMultiPageContext(data.sessionId);
        
      case 'SAVE_CONVERSATION_SUMMARY':
        return await handleSaveConversationSummary(data.sessionId, data.summary);
        
      case 'GET_ALL_SESSIONS':
        return await handleGetAllSessions();
      
      case 'DELETE_SESSION':
        return await handleDeleteSession(data.sessionId);
      
      case 'GET_SERP_SESSIONS':
        return await handleGetSerpSessions();
      
      case 'GET_SERP_SESSION':
        return await handleGetSerpSession(data.sessionId);
      
      case 'DELETE_SERP_SESSION':
        return await handleDeleteSerpSession(data.sessionId);
      
      case 'LINK_SERP_TO_CHAT':
        return await handleLinkSerpToChat(data.serpSessionId, data.chatSessionId);
      
      case 'START_SERP_ANALYSIS':
        return await handleStartSerpAnalysis(data.urls, data.searchQuery, data.tabId);
      
      case 'CANCEL_SERP_ANALYSIS':
        return await handleCancelSerpAnalysis();
      
      case 'CLEAR_SERP_CACHE':
        return await handleClearSerpCache();
      
      case 'COMPARE_SERP_RESULTS':
        return await handleCompareSerpResults(data.results, data.question, data.searchQuery, data.tabId);
      
      case 'CREATE_MULTI_PAGE_CHAT':
        return await handleCreateMultiPageChat(data.tabId, data.pages, data.searchQuery, data.initialQuestion, data.initialAnswer);
      
      case 'SEND_MULTI_PAGE_MESSAGE':
        return await handleSendMultiPageMessage(data.sessionId, data.question, data.tabId);
      
      case 'FORCE_REFRESH_SERP_RESULT':
        return await handleForceRefreshSerpResult(data.urlData, data.searchQuery);
      
      case 'RESEARCH_MODE_SEARCH':
        return await handleResearchModeSearch(data.query, data.count);
      
      case 'RESEARCH_MODE_ANALYZE':
        return await handleResearchModeAnalyze(data.url, data.query);
      
      case 'RESEARCH_MODE_GENERATE_ANSWER':
        return await handleResearchModeGenerateAnswer(data.query, data.sources);
      
      case 'RESEARCH_MODE_CREATE_CHAT':
        return await handleResearchModeCreateChat(data.query, data.sources, data.answer);
      
      case 'RESEARCH_MODE_SAVE_HISTORY':
        return await handleResearchModeSaveHistory(data);
      
      case 'GET_RESEARCH_HISTORY':
        return await handleGetResearchHistory();
      
      case 'GET_RESEARCH_ENTRY':
        return await handleGetResearchEntry(data.entryId);
      
      case 'DELETE_RESEARCH_ENTRY':
        return await handleDeleteResearchEntry(data.entryId);
        
      default:
        console.warn('[SW] Unknown message type:', type);
        return { success: false, error: 'Unknown message type' };
    }
  } catch (error) {
    console.error('[SW] Message handler error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get specific session by ID (for research mode)
 */
async function handleGetSpecificSession(sessionId) {
  try {
    const session = await sessionManager.readSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: 'Session not found'
      };
    }
    
    return {
      success: true,
      sessionId,
      session
    };
  } catch (error) {
    console.error('[SW] Get specific session failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Associate session with tab (for research mode)
 */
async function handleAssociateSessionWithTab(sessionId, tabId) {
  try {
    // Update active sessions mapping
    state.activeSessions.set(tabId, sessionId);
    
    // Update session manager's tab mapping
    sessionManager.associateSessionWithTab(sessionId, tabId);
    
    console.log('[SW] ✅ Associated session', sessionId, 'with tab', tabId);
    
    return { success: true };
  } catch (error) {
    console.error('[SW] Associate session with tab failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get or create session for tab
 */
async function handleGetSession(tabId, url, title, forceNew = false) {
  try {
    // console.log('[SW] Getting session for tab:', tabId, url, '| forceNew:', forceNew);
    
    // Validate URL - skip Chrome internal pages and invalid URLs
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
        url.startsWith('about:') || url.startsWith('edge://') || url === 'about:blank') {
      // console.log('[SW] ⚠️ Skipping session for internal/invalid URL:', url);
      return {
        success: false,
        error: 'Cannot create session for this page type',
        isInternalPage: true
      };
    }
    
    // If forceNew, skip existing session checks and create new
    if (forceNew) {
      // console.log('[SW] Force creating new session');
      const newSession = await sessionManager.createSession(tabId, url, title);
      state.activeSessions.set(tabId, newSession.sessionId);
      
      // console.log('[SW] ✅ Created new session:', newSession.sessionId);
      return {
        success: true,
        sessionId: newSession.sessionId,
        session: newSession
      };
    }
    
    // Check if tab already has a session
    let sessionId = sessionManager.findSessionByTabId(tabId);
    
    if (sessionId) {
      const session = await sessionManager.readSession(sessionId);
      // console.log('[SW] Found existing session:', sessionId);
      
      // ALSO check for previous sessions (for "Continue chat" feature)
      // This allows showing previous conversation notice even when tab has active session
      const previousSession = await sessionManager.getMostRecentSessionForURL(url);
      
      const response = {
        success: true,
        sessionId,
        session
      };
      
      // ✅ Include previousSession if it has chat history OR summary
      // This can be the current session itself (to show "Previous conversation found")
      // OR a different older session
      const hasChatHistory = previousSession && previousSession.chatHistory && previousSession.chatHistory.length > 0;
      const hasSummary = previousSession && previousSession.content && previousSession.content.sectionSummaries && previousSession.content.sectionSummaries.length > 0;
      
      if (hasChatHistory || hasSummary) {
        // console.log('[SW] Including previous session:', previousSession.sessionId, '| hasChat:', hasChatHistory, '| hasSummary:', hasSummary);
        response.previousSession = {
          sessionId: previousSession.sessionId,
          title: previousSession.metadata.title,
          messageCount: previousSession.chatHistory?.length || 0,
          lastActive: previousSession.lastActive,
          chatHistorySummary: previousSession.chatHistorySummary,
          chatHistory: previousSession.chatHistory,
          navigationHistory: previousSession.navigationHistory,
          recentPages: previousSession.recentPages || [],
          currentUrl: previousSession.currentUrl || url
        };
      } else {
        // console.log('[SW] No previous session with content found');
      }
      
      return response;
    }
    
    // Check if URL has previous sessions (for "Continue chat" feature or existing summary)
    const previousSession = await sessionManager.getMostRecentSessionForURL(url);
    
    // Include previous session if it has chat history OR summaries
    const hasChatHistory = previousSession && previousSession.chatHistory && previousSession.chatHistory.length > 0;
    const hasSummary = previousSession && previousSession.content && previousSession.content.sectionSummaries && previousSession.content.sectionSummaries.length > 0;
    
    if (hasChatHistory || hasSummary) {
      console.log('[SW] Found previous session for URL:', previousSession.sessionId, '| hasChat:', hasChatHistory, '| hasSummary:', hasSummary);
      console.log('[SW] Previous session content:', {
        hasSectionSummaries: !!previousSession.content?.sectionSummaries,
        summariesCount: previousSession.content?.sectionSummaries?.length || 0
      });
      
      // Instead of creating a new session, reactivate the previous one
      sessionManager.associateSessionWithTab(previousSession.sessionId, tabId);
      state.activeSessions.set(tabId, previousSession.sessionId);
      
      return {
        success: true,
        sessionId: previousSession.sessionId,
        session: previousSession,
        previousSession: {
          sessionId: previousSession.sessionId,
          title: previousSession.metadata.title,
          messageCount: previousSession.chatHistory?.length || 0,
          lastActive: previousSession.lastActive,
          chatHistorySummary: previousSession.chatHistorySummary,
          chatHistory: previousSession.chatHistory,
          navigationHistory: previousSession.navigationHistory,
          recentPages: previousSession.recentPages || [],
          currentUrl: previousSession.currentUrl || url
        }
      };
    }
    
    // Create new session only if no previous session with content exists
    const newSession = await sessionManager.createSession(tabId, url, title);
    state.activeSessions.set(tabId, newSession.sessionId);
    
    // console.log('[SW] Created new session:', newSession.sessionId);
    return {
      success: true,
      sessionId: newSession.sessionId,
      session: newSession
    };
  } catch (error) {
    console.error('[SW] Failed to get session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save extracted sections to session
 */
async function handleSaveSections(sessionId, sections, statistics) {
  try {
    // Check if sessionId is valid
    if (!sessionId) {
      // Silent fail - this is expected during initial page load before session is created
      return { success: false, error: 'Session ID is required' };
    }
    
    await sessionManager.updateSessionContent(sessionId, {
      sections,
      statistics
    });
    
    // console.log('[SW] Saved', sections.length, 'sections to session:', sessionId);
    return { success: true };
  } catch (error) {
    console.error('[SW] Failed to save sections:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle chat message - Q&A directly in service worker (no Web Worker needed)
 */
async function handleSendChat(data) {
  const { sessionId, question, tabId, mentions = [] } = data;
  
  try {
    console.log('[SW] 💬 Handling chat:', { sessionId, question: question.substring(0, 50), tabId, mentionsCount: mentions.length });
    
    const startTime = Date.now();
    
    // Add user message
    await sessionManager.addChatMessage(sessionId, 'user', question);
    
    // Load session data
    const session = await sessionManager.readSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Get sections - handle both single-page and multi-page sessions
    let sections = [];
    let currentPageTitle = '';
    let currentPageUrl = '';
    
    if (session.content && session.content.pages && session.content.pages.length > 0) {
      // Multi-page session
      const currentPage = session.content.pages[session.content.pages.length - 1];
      sections = currentPage?.sections || [];
      currentPageTitle = currentPage?.title || '';
      currentPageUrl = currentPage?.url || '';
    } else if (session.content && session.content.sections) {
      // Single-page session
      sections = session.content.sections || [];
      currentPageTitle = session.metadata?.title || '';
      currentPageUrl = session.url || '';
    }
    
    if (!sections || sections.length === 0) {
      throw new Error('No content available for Q&A. Please wait for the page to be analyzed.');
    }
    
    // Get conversation history
    const chatHistory = session.chatHistory || [];
    
    // Get previous conversation summary (if exists)
    const previousConversationSummary = session.content.conversationSummary || '';
    
    // ✅ Add mentioned tabs' sections if @mentions are used
    let allSections = [...sections];
    let mentionedTabsInfo = [];
    
    if (mentions && mentions.length > 0) {
      console.log('[SW] 📎 Fetching content from', mentions.length, 'mentioned tabs...');
      
      for (const mention of mentions) {
        try {
          const contextResponse = await handleGetTabContext(mention.tabId);
          if (contextResponse.success && contextResponse.sections && contextResponse.sections.length > 0) {
            // Tag sections with source tab info
            const taggedSections = contextResponse.sections.map(section => ({
              ...section,
              _sourceTab: mention.domain,
              _sourceTitle: contextResponse.pageTitle,
              _sourceUrl: contextResponse.url
            }));
            
            allSections = allSections.concat(taggedSections);
            mentionedTabsInfo.push({
              domain: mention.domain,
              title: contextResponse.pageTitle,
              url: contextResponse.url,
              sectionsCount: contextResponse.sections.length
            });
            
            console.log('[SW] ✅ Added', contextResponse.sections.length, 'sections from', mention.domain);
          }
        } catch (error) {
          console.warn('[SW] Failed to get context from mentioned tab:', mention.domain, error);
        }
      }
    }
    
    console.log('[SW] 📊 Q&A context:', {
      currentPageSections: sections.length,
      mentionedTabsSections: allSections.length - sections.length,
      totalSections: allSections.length,
      chatHistory: chatHistory.length,
      hasPreviousSummary: !!previousConversationSummary,
      mentions: mentions.length
    });
    
    // Step 1: Initialize BM25 retriever with all sections (current + mentioned tabs)
    const retriever = new BM25Retriever(allSections);
    
    // Step 2: Build context-aware search query
    let searchQuery = question;
    
    // Extract context from recent conversation (last 3 user messages)
    const recentUserMessages = chatHistory
      .filter(msg => msg.role === 'user')
      .slice(-3)
      .map(msg => msg.content);
    
    if (recentUserMessages.length > 0) {
      // Extract capitalized words, quoted terms, and phrases after keywords
      const contextTerms = [];
      for (const msg of recentUserMessages) {
        // Capitalized words (likely proper nouns/products)
        const capitalizedWords = msg.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
        contextTerms.push(...capitalizedWords);
        
        // Quoted terms
        const quotedTerms = msg.match(/"([^"]+)"/g) || [];
        contextTerms.push(...quotedTerms.map(t => t.replace(/"/g, '')));
        
        // Terms after "about", "explain", "regarding"
        const aboutMatch = msg.match(/(?:about|explain|regarding)\s+([^?.!]+)/i);
        if (aboutMatch) {
          contextTerms.push(aboutMatch[1].trim());
        }
      }
      
      // Prepend context terms to search query
      if (contextTerms.length > 0) {
        searchQuery = contextTerms.join(' ') + ' ' + question;
      }
    }
    
    // Step 3: Retrieve relevant sections using BM25
    const results = retriever.search(searchQuery, 3);
    
    if (results.length === 0) {
      throw new Error('No relevant content found for this question');
    }
    
    console.log('[SW] 🔍 Retrieved sections:', results.map(r => ({
      heading: r.section.heading,
      score: r.score.toFixed(2)
    })));
    
    // Step 4: Build AI prompt
    let systemPrompt = `You are Nutshell, an offline AI assistant that answers questions based ONLY on the webpage content provided.

CRITICAL RULES:
1. Answer ONLY using the webpage content provided below
2. DO NOT use external knowledge or make assumptions
3. If the answer is not in the provided content, say "I don't have that information in the provided pages"
4. Be concise and direct (1-2 paragraphs unless asked to elaborate)
5. Cite sources using [Source: heading] format`;
    
    // Add cross-tab context info if mentions are used
    if (mentionedTabsInfo.length > 0) {
      systemPrompt += `\n\nCROSS-TAB CONTEXT:`;
      systemPrompt += `\nYou have access to content from multiple tabs:`;
      systemPrompt += `\n- Current page: ${currentPageTitle}`;
      for (const tabInfo of mentionedTabsInfo) {
        systemPrompt += `\n- ${tabInfo.domain}: ${tabInfo.title}`;
      }
      systemPrompt += `\n\nWhen comparing or referencing content from different tabs, clearly indicate which tab/page you're referring to.`;
    }
    
    // Add previous conversation summary if exists
    if (previousConversationSummary && previousConversationSummary.trim().length > 0) {
      systemPrompt += `\n\nPREVIOUS PAGE CONVERSATION SUMMARY:\n${previousConversationSummary}`;
    }
    
    // Add recent conversation history (last 3 exchanges from current page)
    const currentPageMessages = chatHistory.filter(msg => {
      // Only include messages from current page (after last navigation)
      return true; // For now, include all
    }).slice(-6); // Last 3 user + 3 assistant messages
    
    if (currentPageMessages.length > 0) {
      systemPrompt += `\n\nRECENT CONVERSATION:`;
      for (const msg of currentPageMessages) {
        systemPrompt += `\n${msg.role === 'user' ? 'User' : 'Nutshell'}: ${msg.content}`;
      }
    }
    
    // Calculate available tokens for webpage content (dynamic sizing)
    const availableTokens = calculateAvailableTokens(
      systemPrompt,
      chatHistory,
      question,
      mentionedTabsInfo.length
    );
    const availableChars = availableTokens * CHARS_PER_TOKEN;
    
    // Distribute available space across retrieved sections
    const numSections = results.length;
    const charsPerSection = Math.floor(availableChars / numSections) - 100; // 100 char overhead per section
    const maxCharsPerSection = Math.max(charsPerSection, 400); // Minimum 400 chars per section
    
    console.log(`[SW] Context budget: ${availableChars} chars for ${numSections} sections = ${maxCharsPerSection} chars/section`);
    
    // Build user prompt with context (with dynamic truncation)
    let userPrompt = `WEBPAGE CONTENT:\n\n`;
    for (const result of results) {
      const sourcePrefix = result.section._sourceTab ? `[${result.section._sourceTab}] ` : '';
      let text = result.section.text;
      
      // Adaptive truncation based on available space
      if (text.length > maxCharsPerSection) {
        let truncated = text.substring(0, maxCharsPerSection);
        
        // Try to end at sentence boundary
        const lastSentence = Math.max(
          truncated.lastIndexOf('.'),
          truncated.lastIndexOf('?'),
          truncated.lastIndexOf('!')
        );
        
        if (lastSentence > maxCharsPerSection * 0.7) {
          truncated = text.substring(0, lastSentence + 1);
        }
        
        text = truncated + (truncated.length < result.section.text.length ? '...' : '');
      }
      
      userPrompt += `[Source: ${sourcePrefix}${result.section.heading}]\n${text}\n\n`;
    }
    
    userPrompt += `Question: ${question}\n\n`;
    
    // Add specific instruction based on question type
    const questionLower = question.toLowerCase();
    if (questionLower.includes('what is') || questionLower.includes('what are')) {
      userPrompt += `Instructions: Answer using the webpage content above. Be concise (1-2 paragraphs).\n\n`;
    } else if (questionLower.includes('elaborate') || questionLower.includes('detail') || questionLower.includes('explain more')) {
      userPrompt += `Instructions: Provide a detailed explanation using the webpage content above. You can use multiple paragraphs.\n\n`;
    } else if (questionLower.includes('previous') || questionLower.includes('first') || questionLower.includes('earlier') || questionLower.includes('asked')) {
      userPrompt += `Instructions: This question is about our conversation history. Answer based on what we discussed earlier in this chat.\n\n`;
    } else {
      userPrompt += `Instructions: Answer using the webpage content above. Be concise (1-2 paragraphs).\n\n`;
    }
    
    // Step 5: Call AI (streaming)
    console.log('[SW] 🤖 Calling AI with streaming...');
    
    // Check if LanguageModel is available (in service workers, use LanguageModel directly)
    if (typeof LanguageModel === 'undefined') {
      throw new Error('Chrome AI not available. Please ensure you have Chrome 127+ with AI features enabled.');
    }
    
    let aiSession;
    try {
      // In service workers, use LanguageModel.create() directly
      aiSession = await LanguageModel.create({
        systemPrompt: systemPrompt
      });
    } catch (error) {
      throw new Error('AI not available: ' + error.message);
    }
    
    // Step 6: Extract citations (before streaming)
    const citations = results.map(result => ({
      sectionId: result.section.id,
      heading: result.section.heading,
      snippet: result.section.text.substring(0, 150) + '...',
      relevanceScore: result.score,
      pageTitle: result.section._sourceTitle || currentPageTitle || 'Current Page',
      pageUrl: result.section._sourceUrl || currentPageUrl || '',
      isCurrentPage: !result.section._sourceTab, // False if from mentioned tab
      sourceTab: result.section._sourceTab || null // Domain of mentioned tab
    }));
    
    // Send initial response with citations (so UI can show them immediately)
    broadcastToTab(tabId, {
      type: 'CHAT_STREAM_START',
      data: { citations }
    });
    
    // Stream the answer
    let fullAnswer = '';
    let chunkCount = 0;
    
    try {
      const stream = await aiSession.promptStreaming(userPrompt);
      
      for await (const chunk of stream) {
        // Chrome AI returns only the NEW text (delta), so we need to accumulate
        fullAnswer += chunk;
        chunkCount++;
        
        // Broadcast accumulated answer to the sidebar
        broadcastToTab(tabId, {
          type: 'CHAT_STREAM_CHUNK',
          data: { chunk: fullAnswer }
        });
      }
    } catch (streamError) {
      console.warn('[SW] Streaming error:', streamError.message);
      
      // Check if error is due to input being too long
      const errorMessage = streamError.message || String(streamError);
      if (errorMessage.toLowerCase().includes('too large') || 
          errorMessage.toLowerCase().includes('too long') ||
          errorMessage.toLowerCase().includes('exceeds') ||
          errorMessage.toLowerCase().includes('quota')) {
        
        console.warn('[SW] ⚠️ Input too large error detected. Retrying with reduced context...');
        
        // Retry with aggressive truncation (400 chars per section max)
        let retryPrompt = `WEBPAGE CONTENT:\n\n`;
        for (const result of results) {
          const sourcePrefix = result.section._sourceTab ? `[${result.section._sourceTab}] ` : '';
          let text = result.section.text;
          
          // Much more aggressive truncation for retry
          if (text.length > 400) {
            text = text.substring(0, 400) + '...';
          }
          
          retryPrompt += `[Source: ${sourcePrefix}${result.section.heading}]\n${text}\n\n`;
        }
        retryPrompt += `Question: ${question}\n\nInstructions: Answer concisely using the webpage content above.\n\n`;
        
        try {
          console.log('[SW] 🔄 Retrying with reduced context (non-streaming)...');
          fullAnswer = await aiSession.prompt(retryPrompt);
          console.log('[SW] ✅ Answer received (retry):', fullAnswer.length, 'chars');
        } catch (retryError) {
          console.error('[SW] Retry also failed:', retryError);
          throw new Error('Content too long for AI to process. Try asking a more specific question or clearing the chat history.');
        }
      } else if (fullAnswer.length === 0) {
        // For other errors, fallback to non-streaming with same prompt
        console.log('[SW] Falling back to non-streaming...');
        fullAnswer = await aiSession.prompt(userPrompt);
      }
    }
    
    const responseTime = Date.now() - startTime;
    console.log('[SW] ✅ Streaming complete:', fullAnswer.length, 'chars,', chunkCount, 'chunks in', responseTime, 'ms');
    
    // ✅ Save mentioned tabs' sections to session for future questions
    if (mentionedTabsInfo.length > 0 && session.type !== 'multiPageChat') {
      // Add mentioned tabs' sections to the session so they're available for future questions
      const currentSections = session.content.sections || [];
      const mentionedSections = allSections.filter(s => s._sourceTab); // Only mentioned tabs' sections
      
      // Check if we already have these sections (avoid duplicates)
      const existingSourceTabs = new Set(
        currentSections.filter(s => s._sourceTab).map(s => s._sourceTab)
      );
      
      const newSections = mentionedSections.filter(s => !existingSourceTabs.has(s._sourceTab));
      
      if (newSections.length > 0) {
        const updatedSections = [...currentSections, ...newSections];
        await sessionManager.updateSessionContent(sessionId, { sections: updatedSections });
        console.log('[SW] ✅ Saved', newSections.length, 'sections from mentioned tabs to session');
      }
    }
    
    // Save assistant message
    await sessionManager.addChatMessage(sessionId, 'assistant', fullAnswer, {
      citations,
      responseTime
    });
    
    // Send completion notification
    broadcastToTab(tabId, {
      type: 'CHAT_STREAM_END',
      data: { answer: fullAnswer, citations, responseTime }
    });
    
    return { success: true, answer: fullAnswer, citations };
  } catch (error) {
    console.error('[SW] Failed to handle chat:', error);
    
    // Notify sidebar of error
    broadcastToTab(tabId, {
      type: 'CHAT_ERROR',
      data: { error: error.message }
    });
    
    return { success: false, error: error.message };
  }
}

/**
 * Get available tabs for @mention
 */
async function handleGetAvailableTabs(currentTabId) {
  try {
    // Get all tabs
    const allTabs = await chrome.tabs.query({});
    
    // Filter and format tabs
    const availableTabs = allTabs
      .filter(tab => 
        tab.id !== currentTabId && // Exclude current tab
        tab.url && 
        !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://') &&
        !tab.url.startsWith('about:')
      )
      .map(tab => {
        // Truncate title to 20 characters
        const title = tab.title || 'Untitled';
        const shortTitle = title.length > 20 ? title.substring(0, 20) + '...' : title;
        
        // Get domain
        let domain = '';
        try {
          domain = new URL(tab.url).hostname.replace('www.', '');
        } catch (e) {
          domain = tab.url;
        }
        
        return {
          tabId: tab.id,
          title: shortTitle,
          fullTitle: title,
          url: tab.url,
          domain: domain,
          hasSession: state.activeSessions.has(tab.id)
        };
      })
      .sort((a, b) => {
        // Sort by: has session first, then by last active
        if (a.hasSession && !b.hasSession) return -1;
        if (!a.hasSession && b.hasSession) return 1;
        
        const aInfo = state.tabInfo.get(a.tabId);
        const bInfo = state.tabInfo.get(b.tabId);
        if (aInfo && bInfo) {
          return bInfo.lastActive - aInfo.lastActive;
        }
        return 0;
      });
    
    return { success: true, tabs: availableTabs };
  } catch (error) {
    console.error('[SW] Failed to get available tabs:', error);
    return { success: false, error: error.message, tabs: [] };
  }
}

/**
 * Get tab context (chat summary + sections) for cross-tab chat
 */
async function handleGetTabContext(tabId) {
  try {
    // Get session for this tab
    const sessionId = state.activeSessions.get(tabId);
    if (!sessionId) {
      return { 
        success: false, 
        error: 'No active session for this tab',
        chatSummary: null,
        sections: []
      };
    }
    
    // Load session data
    const session = await sessionManager.readSession(sessionId);
    if (!session) {
      return { 
        success: false, 
        error: 'Session not found',
        chatSummary: null,
        sections: []
      };
    }
    
    // Get chat summary (last 5 messages or conversation summary)
    let chatSummary = '';
    if (session.chatHistory && session.chatHistory.length > 0) {
      const recentMessages = session.chatHistory.slice(-5);
      chatSummary = recentMessages.map(msg => {
        const role = msg.role === 'user' ? 'User' : 'NutShell';
        const content = typeof msg.content === 'string' ? msg.content : msg.content.text || '';
        return `${role}: ${content}`;
      }).join('\n');
    }
    
    // If there's a conversation summary, prepend it
    if (session.conversationSummary) {
      chatSummary = `Previous conversation: ${session.conversationSummary}\n\n${chatSummary}`;
    }
    
    // Get sections (handle both single-page and multi-page sessions)
    let sections = [];
    if (session.type === 'multiPageChat' && session.content && session.content.pages) {
      // Multi-page session - get sections from all pages
      for (const page of session.content.pages) {
        if (page.extractedContent) {
          sections = sections.concat(page.extractedContent);
        }
      }
    } else if (session.content && session.content.sections) {
      // Single-page session
      sections = session.content.sections;
    }
    
    return { 
      success: true, 
      chatSummary,
      sections,
      pageTitle: session.metadata?.title || session.pageTitle || 'Untitled',
      url: session.url || ''
    };
  } catch (error) {
    console.error('[SW] Failed to get tab context:', error);
    return { 
      success: false, 
      error: error.message,
      chatSummary: null,
      sections: []
    };
  }
}

/**
 * Handle on-demand summary request
 */
async function handleRequestSummary(sessionId) {
  try {
    // TODO: Implement summarization worker
    // console.log('[SW] Summary requested for session:', sessionId);
    return { success: true, status: 'pending' };
  } catch (error) {
    console.error('[SW] Failed to request summary:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle continue session (resume previous chat)
 */
async function handleContinueSession(sessionId, tabId) {
  try {
    // console.log('[SW] Continuing session:', sessionId, 'for tab:', tabId);
    
    const session = await sessionManager.associateSessionWithTab(sessionId, tabId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    
    state.activeSessions.set(tabId, sessionId);
    
    // console.log('[SW] Session continued successfully');
    return {
      success: true,
      session
    };
  } catch (error) {
    console.error('[SW] Failed to continue session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle page navigation within session
 */
async function handlePageNavigation(tabId, url, title) {
  try {
    const sessionId = sessionManager.findSessionByTabId(tabId);
    
    if (!sessionId) {
      // console.log('[SW] No session for navigation, will create new one');
      return { success: true };
    }
    
    const session = await sessionManager.readSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    
    // Add to navigation history
    session.navigationHistory.push({
      url,
      title,
      timestamp: Date.now(),
      sectionsCount: 0
    });
    
    session.currentUrl = url;
    session.metadata.pageCount = session.navigationHistory.length;
    
    await sessionManager.updateSession(sessionId, session);
    
    // console.log('[SW] Page navigation recorded:', url);
    return { success: true };
  } catch (error) {
    console.error('[SW] Failed to handle navigation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle save summary
 */
async function handleSaveSummary(sessionId, summary, sectionSummaries, statistics) {
  try {
    await sessionManager.updateSessionContent(sessionId, {
      summary,
      sectionSummaries,
      statistics
    });
    
    // console.log('[SW] Summary saved to session:', sessionId);
    return { success: true };
  } catch (error) {
    console.error('[SW] Failed to save summary:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle save chat message
 */
async function handleSaveChatMessage(sessionId, role, content, metadata) {
  try {
    // Check if sessionId is valid
    if (!sessionId) {
      // Silent fail - this is expected during initial page load before session is created
      return { success: false, error: 'Session ID is required' };
    }
    
    await sessionManager.addChatMessage(sessionId, role, content, metadata);
    
    // console.log('[SW] Chat message saved to session:', sessionId);
    return { success: true };
  } catch (error) {
    console.error('[SW] Failed to save chat message:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Broadcast message to specific tab only
 */
function broadcastToTab(tabId, message) {
  try {
    // Add tabId to message so sidebar can filter
    chrome.runtime.sendMessage({
      ...message,
      targetTabId: tabId
    });
  } catch (error) {
    console.error('[SW] Failed to broadcast to tab:', error);
  }
}

/**
 * Setup message listeners
 */
function setupListeners() {
  // Message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse)
      .then(result => {
        // console.log('[SW] Sending response:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('[SW] Message handler error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  });
  
  // Port connection for sidebar
  chrome.runtime.onConnect.addListener((port) => {
    // console.log('[SW] Port connected:', port.name);
    
    const tabId = parseInt(port.name.split('-')[1]);
    if (tabId) {
      state.ports.set(tabId, port);
      
      port.onDisconnect.addListener(() => {
        // console.log('[SW] Port disconnected for tab:', tabId);
        state.ports.delete(tabId);
      });
    }
  });
  
  // Tab removal - deactivate session and remove from tab info
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const sessionId = state.activeSessions.get(tabId);
    if (sessionId) {
      // console.log('[SW] Tab closed, deactivating session:', sessionId);
      state.activeSessions.delete(tabId);
      // Session remains in storage for "Continue chat" feature
    }
    // Remove from tab tracking
    state.tabInfo.delete(tabId);
  });
  
  // Tab updated - track title and URL changes
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.title || changeInfo.url) {
      state.tabInfo.set(tabId, {
        title: tab.title || 'Untitled',
        url: tab.url || '',
        lastActive: Date.now()
      });
    }
  });
  
  // Tab activated - update last active time
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    const info = state.tabInfo.get(tabId);
    if (info) {
      info.lastActive = Date.now();
    }
  });
  
  // Side panel action
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[SW] Failed to set panel behavior:', error));
}

/**
 * Setup navigation listeners
 */
function setupNavigationListeners() {
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId !== 0) return; // Only main frame
    
    const { tabId, url } = details;
    
    // Skip chrome:// pages
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return;
    }
    
    // console.log('[SW] Navigation completed:', tabId, url);
    
    // Wait a bit for page to load
    setTimeout(async () => {
      try {
        // Get page title
        const tab = await chrome.tabs.get(tabId);
        const title = tab.title || 'Unknown Page';
        
        // Check if this is a new page in existing session
        const sessionId = sessionManager.findSessionByTabId(tabId);
        if (sessionId) {
          await handlePageNavigation(tabId, url, title);
        }
        
        // Request content extraction
        chrome.tabs.sendMessage(tabId, {
          type: 'EXTRACT_CONTENT',
          data: {}
        }).catch(error => {
          // console.log('[SW] Content script not ready yet:', error.message);
        });
        
      } catch (error) {
        console.error('[SW] Navigation handling error:', error);
      }
    }, 1000);
  });
}

/**
 * Handle track navigation (save current page to history)
 */
async function handleTrackNavigation(sessionId, url, title, chatSummary) {
  try {
    const session = await sessionManager.trackPageNavigation(sessionId, url, title, chatSummary);
    
    // console.log('[SW] Navigation tracked:', title);
    return { 
      success: true,
      recentPagesCount: session.recentPages.length
    };
  } catch (error) {
    console.error('[SW] Failed to track navigation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get multi-page context
 */
async function handleGetMultiPageContext(sessionId) {
  try {
    const context = await sessionManager.getMultiPageContext(sessionId);
    
    if (!context) {
      throw new Error('Failed to get multi-page context');
    }
    
    // console.log('[SW] Retrieved multi-page context:', context.totalPages, 'pages');
    return {
      success: true,
      context
    };
  } catch (error) {
    console.error('[SW] Failed to get multi-page context:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle save conversation summary
 */
async function handleSaveConversationSummary(sessionId, summary) {
  try {
    await sessionManager.saveConversationSummary(sessionId, summary);
    
    // console.log('[SW] Conversation summary saved');
    return { success: true };
  } catch (error) {
    console.error('[SW] Failed to save conversation summary:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get all sessions for history view
 */
async function handleGetAllSessions() {
  try {
    const sessions = await sessionManager.getAllSessions();
    
    // console.log('[SW] Retrieved', sessions.length, 'sessions for history');
    return {
      success: true,
      sessions
    };
  } catch (error) {
    console.error('[SW] Failed to get all sessions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a session
 */
async function handleDeleteSession(sessionId) {
  try {
    // console.log('[SW] Deleting session:', sessionId);
    
    const deleted = await sessionManager.deleteSession(sessionId);
    
    if (deleted) {
      // console.log('[SW] ✅ Session deleted:', sessionId);
      return {
        success: true,
        sessionId
      };
    } else {
      throw new Error('Failed to delete session');
    }
  } catch (error) {
    console.error('[SW] Failed to delete session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all SERP sessions
 */
async function handleGetSerpSessions() {
  try {
    // console.log('[SW] Getting all SERP sessions');
    
    const sessions = await sessionManager.getSerpSessions();
    
    // console.log('[SW] ✅ Retrieved', sessions.length, 'SERP sessions');
    return {
      success: true,
      sessions
    };
  } catch (error) {
    console.error('[SW] Failed to get SERP sessions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get a specific SERP session
 */
async function handleGetSerpSession(sessionId) {
  try {
    // console.log('[SW] Getting SERP session:', sessionId);
    
    const session = await sessionManager.getSerpSession(sessionId);
    
    if (session) {
      // console.log('[SW] ✅ Retrieved SERP session:', sessionId);
      return {
        success: true,
        session
      };
    } else {
      throw new Error('SERP session not found');
    }
  } catch (error) {
    console.error('[SW] Failed to get SERP session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete SERP session
 */
async function handleDeleteSerpSession(sessionId) {
  try {
    // console.log('[SW] Deleting SERP session:', sessionId);
    
    const deleted = await sessionManager.deleteSerpSession(sessionId);
    
    if (deleted) {
      // console.log('[SW] ✅ SERP session deleted:', sessionId);
      return {
        success: true,
        sessionId
      };
    } else {
      throw new Error('Failed to delete SERP session');
    }
  } catch (error) {
    console.error('[SW] Failed to delete SERP session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Link SERP session to chat session
 */
async function handleLinkSerpToChat(serpSessionId, chatSessionId) {
  try {
    // console.log('[SW] Linking SERP to chat:', serpSessionId, '→', chatSessionId);
    
    await sessionManager.linkSerpToChat(serpSessionId, chatSessionId);
    
    // console.log('[SW] ✅ Linked SERP to chat');
    return {
      success: true,
      serpSessionId,
      chatSessionId
    };
  } catch (error) {
    console.error('[SW] Failed to link SERP to chat:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Start SERP analysis
 */
async function handleStartSerpAnalysis(urls, searchQuery, tabId) {
  try {
    // console.log('[SW] Starting SERP analysis for', urls.length, 'URLs');
    
    const results = await serpAnalyzer.analyzeSearchResults(urls, searchQuery, tabId);
    
    // console.log('[SW] ✅ SERP analysis complete:', results.length, 'results');
    
    // Auto-save SERP session
    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      const serpSession = await sessionManager.createSerpSession({
        searchQuery,
        searchUrl,
        results
      });
      // console.log('[SW] 💾 Auto-saved SERP session:', serpSession.sessionId);
      
      return {
        success: true,
        results: results,
        count: results.length,
        serpSessionId: serpSession.sessionId // Include session ID in response
      };
    } catch (saveError) {
      console.error('[SW] Failed to save SERP session:', saveError);
      // Continue even if save fails
      return {
        success: true,
        results: results,
        count: results.length
      };
    }
  } catch (error) {
    console.error('[SW] SERP analysis failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancel SERP analysis
 */
async function handleCancelSerpAnalysis() {
  try {
    const cancelled = serpAnalyzer.cancelAnalysis();
    // console.log('[SW] SERP analysis cancelled:', cancelled);
    
    return {
      success: true,
      cancelled: cancelled
    };
  } catch (error) {
    console.error('[SW] Failed to cancel SERP analysis:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clear SERP cache
 */
async function handleClearSerpCache() {
  try {
    serpAnalyzer.clearCache();
    // console.log('[SW] SERP cache cleared');
    
    return {
      success: true
    };
  } catch (error) {
    console.error('[SW] Failed to clear SERP cache:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Prepare SERP results for comparison (ensure full content)
 * NOTE: Actual comparison happens in sidebar where Workers are available
 */
async function handleCompareSerpResults(results, question, searchQuery, tabId) {
  try {
    // console.log('[SW] Preparing', results.length, 'SERP results for comparison');
    
    // Just ensure all results have full content
    const preparedResults = await serpAnalyzer.prepareResultsForComparison(results);
    
    // console.log('[SW] ✅ Results prepared with full content');
    
    // Return prepared results - sidebar will handle the actual comparison
    return {
      success: true,
      preparedResults: preparedResults,
      question: question,
      searchQuery: searchQuery
    };
  } catch (error) {
    console.error('[SW] SERP result preparation failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle creating multi-page chat session
 */
async function handleCreateMultiPageChat(tabId, pages, searchQuery, initialQuestion, initialAnswer) {
  try {
    // console.log('[SW] 🚀 Creating multi-page chat:', {
    //   tabId,
    //   pages: pages.length,
    //   searchQuery,
    //   question: initialQuestion
    // });
    
    // Ensure all pages have extractedContent
    const validPages = pages.filter(p => p.extractedContent);
    
    if (validPages.length === 0) {
      throw new Error('No pages with extracted content available');
    }
    
    // console.log('[SW] Valid pages with content:', validPages.length);
    
    // Create multi-page session
    const session = await sessionManager.createMultiPageSession(
      tabId,
      validPages,
      searchQuery,
      initialQuestion,
      initialAnswer
    );
    
    // console.log('[SW] ✅ Multi-page chat session created:', session.sessionId);
    
    return {
      success: true,
      session: session,
      sessionId: session.sessionId
    };
  } catch (error) {
    console.error('[SW] Failed to create multi-page chat:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle multi-page chat message
 */
async function handleSendMultiPageMessage(sessionId, question, tabId) {
  try {
    console.log('[SW] 📝 Multi-page message:', { sessionId, question, tabId });
    
    // Read session
    console.log('[SW] Attempting to read session:', sessionId);
    const session = await sessionManager.readSession(sessionId);
    console.log('[SW] Session read result:', session ? 'found' : 'NOT FOUND');
    if (!session) {
      throw new Error('Session not found');
    }
    
    if (session.type !== 'multiPageChat') {
      throw new Error('Not a multi-page chat session');
    }
    
    // console.log('[SW] Session loaded, pages:', session.content.pages.length);
    
    // Add user message
    await sessionManager.addChatMessage(sessionId, 'user', question);
    
    // FIXED: Can't create Worker in service worker (MV3 limitation)
    // Return session data - sidebar will create worker and handle Q&A
    // console.log('[SW] Returning session for sidebar to handle worker');
    return {
      success: true,
      session: session
    };
    
  } catch (error) {
    console.error('[SW] Multi-page message failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Force refresh a single SERP result (bypass cache)
 */
async function handleForceRefreshSerpResult(urlData, searchQuery) {
  try {
    // console.log('[SW] Force refreshing SERP result:', urlData.url);
    
    const result = await serpAnalyzer.forceRefreshUrl(urlData, searchQuery);
    
    // console.log('[SW] ✅ Force refresh complete');
    
    return {
      success: true,
      result: result
    };
  } catch (error) {
    console.error('[SW] Force refresh failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ============================================
 * RESEARCH MODE HANDLERS
 * ============================================
 */

/**
 * Research Mode: Perform Google Search
 */
async function handleResearchModeSearch(query, count) {
  try {
    // console.log('[SW] 🔍 Research Mode Search:', query, `(top ${count})`);
    
    // Use existing SERP extractor logic
    // Create a temporary tab to extract search results
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    // Open search page in background
    const tab = await chrome.tabs.create({ url: searchUrl, active: false });
    // console.log('[SW] Opened search tab:', tab.id);
    
    // Wait for page to load completely
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[SW] ⚠️ Search timed out after 15 seconds');
        chrome.tabs.remove(tab.id).catch(() => {});
        resolve({ success: false, error: 'Search timed out. Please try again.' });
      }, 15000);
      
      // Listen for tab to complete loading
      const updateHandler = async (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          // console.log('[SW] Page load complete, requesting SERP extraction...');
          chrome.tabs.onUpdated.removeListener(updateHandler);
          
          // Give content script a moment to initialize
          await new Promise(r => setTimeout(r, 1000));
          
          try {
            // Explicitly request SERP extraction
            const response = await chrome.tabs.sendMessage(tab.id, {
              type: 'EXTRACT_SERP_URLS',
              data: { maxResults: count }
            });
            
            clearTimeout(timeout);
            
            if (response && response.success && response.results) {
              // console.log('[SW] ✅ SERP extraction successful:', response.results.length, 'URLs');
              
              // Close the temporary tab
              chrome.tabs.remove(tab.id).catch(err => {
                console.warn('[SW] Could not close tab:', err);
              });
              
              // Format results to match expected structure
              const formattedResults = response.results.map((result, index) => ({
                url: result.url,
                title: result.title || '',
                snippet: result.snippet || '',
                position: index + 1
              }));
              
              resolve({ success: true, results: formattedResults });
            } else {
              throw new Error(response?.error || 'No results found');
            }
          } catch (error) {
            clearTimeout(timeout);
            console.error('[SW] ❌ SERP extraction failed:', error);
            chrome.tabs.remove(tab.id).catch(() => {});
            resolve({ success: false, error: `Failed to extract search results: ${error.message}` });
          }
        }
      };
      
      chrome.tabs.onUpdated.addListener(updateHandler);
    });
  } catch (error) {
    console.error('[SW] Research Mode Search failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Research Mode: Analyze a single page
 */
async function handleResearchModeAnalyze(url, query) {
  try {
    // console.log('[SW] 📖 Research Mode Analyze:', url);
    
    // Use existing SERP analyzer logic
    const urlData = { url: url };
    const result = await serpAnalyzer.analyzeSinglePage(urlData, query);
    
    if (!result || result.error) {
      throw new Error(result?.error || 'Analysis failed');
    }
    
    // console.log('[SW] ✅ Analysis complete for:', url);
    
    return {
      success: true,
      summary: result.summary,
      extractedContent: result.extractedContent,
      relevance: result.relevance
    };
  } catch (error) {
    console.error('[SW] Research Mode Analyze failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Research Mode: Generate comprehensive answer
 */
async function handleResearchModeGenerateAnswer(query, sources) {
  try {
    // console.log('[SW] 💡 Research Mode Generate Answer');
    
    // Check if AI is available
    if (typeof LanguageModel === 'undefined') {
      throw new Error('LanguageModel API not available. Please ensure Chrome AI is enabled.');
    }
    
    // Prepare source data for AI
    const sourceTexts = sources.map((source, index) => {
      const domain = new URL(source.url).hostname.replace('www.', '');
      return `\n\n===== SOURCE ${index + 1}: ${source.title} (${domain}) =====\n${source.summary}`;
    }).join('\n');
    
    const systemPrompt = `You are a research assistant. Your task is to synthesize information from multiple sources to provide a comprehensive, accurate answer.

CRITICAL RULES:
1. ONLY use information from the provided sources below
2. DO NOT use your general knowledge or information not in the sources
3. ALWAYS cite sources using [source N] notation (e.g., "According to [source 1]...")
4. Use [source N] after EVERY fact or claim you make
5. If sources conflict, mention both perspectives with their citations
6. If information is not in the sources, explicitly state "The provided sources don't mention..."
7. Provide a structured, clear answer with:
   - Key findings summary
   - Detailed explanation
   - Source-specific insights
   - Conclusion/recommendation if applicable

Format your response using:
- **Bold** for key points
- *Italic* for emphasis
- ## for main headings
- ### for subheadings
- - for bullet points
- Clear paragraphs for readability

CITATION FORMAT: Always use [source 1], [source 2], etc. These will become clickable links.`;
    
    const prompt = `Question: ${query}

Here are the sources to use:
${sourceTexts}

Provide a comprehensive answer based ONLY on these sources. Remember to cite sources by their domain name.`;
    
    // Use Language Model API
    const ai = await LanguageModel.create({
      systemPrompt: systemPrompt
    });
    
    const response = await ai.prompt(prompt);
    
    // console.log('[SW] ✅ Answer generated');
    
    return {
      success: true,
      answer: response
    };
  } catch (error) {
    console.error('[SW] Research Mode Generate Answer failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Research Mode: Create multi-page chat from research
 */
async function handleResearchModeCreateChat(query, sources, answer) {
  try {
    // console.log('[SW] 💬 Research Mode Create Chat');
    
    // Prepare pages from sources (only those with extractedContent)
    const pages = sources
      .filter(s => s.extractedContent && s.extractedContent.sections)
      .map(s => ({
        url: s.url,
        title: s.title,
        extractedContent: s.extractedContent
      }));
    
    if (pages.length === 0) {
      throw new Error('No content available for chat');
    }
    
    // Create multi-page chat session (reuse existing function logic)
    const sessionId = uuid();
    const now = timestamp();
    
    const session = {
      sessionId: sessionId,
      type: 'multiPageChat',
      createdAt: now,
      lastAccessed: now,
      content: {
        pages: pages,
        searchQuery: query
      },
      chatHistory: [
        { role: 'user', content: query, timestamp: now },
        { role: 'assistant', content: answer, timestamp: now }
      ]
    };
    
    // Save session using storage
    await storage.write(`session_${sessionId}.json`, session);
    
    // Update registry
    const registry = await loadRegistry();
    if (!registry.sessions) {
      registry.sessions = {};
    }
    registry.sessions[sessionId] = {
      type: 'multiPageChat',
      createdAt: now,
      pageCount: pages.length,
      searchQuery: query
    };
    await saveRegistry(registry);
    
    // console.log('[SW] ✅ Chat session created:', sessionId);
    
    return {
      success: true,
      sessionId: sessionId,
      session: session
    };
  } catch (error) {
    console.error('[SW] Research Mode Create Chat failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Research Mode: Save to history
 */
async function handleResearchModeSaveHistory(entry) {
  try {
    // console.log('[SW] 💾 Research Mode Save History:', entry.query);
    
    // Use OPFS to save research history
    const filename = `research_${entry.id}.json`;
    await storage.write(filename, entry);
    
    // Update registry
    const registry = await loadRegistry();
    if (!registry.researchHistory) {
      registry.researchHistory = {};
    }
    
    registry.researchHistory[entry.id] = {
      query: entry.query,
      timestamp: entry.timestamp,
      sourcesCount: entry.sourcesCount
    };
    
    await saveRegistry(registry);
    
    // console.log('[SW] ✅ Research history saved:', entry.id);
    
    return { success: true, entryId: entry.id };
  } catch (error) {
    console.error('[SW] Research Mode Save History failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Load registry
 */
async function loadRegistry() {
  try {
    const data = await storage.read('registry.json');
    return data || { sessions: {}, serpSessions: {}, researchHistory: {} };
  } catch (error) {
    return { sessions: {}, serpSessions: {}, researchHistory: {} };
  }
}

/**
 * Save registry
 */
async function saveRegistry(registry) {
  await storage.write('registry.json', registry);
}

/**
 * Get all research history entries
 */
async function handleGetResearchHistory() {
  try {
    const registry = await loadRegistry();
    const researchHistory = registry.researchHistory || {};
    
    const entries = Object.entries(researchHistory).map(([id, meta]) => ({
      id: id,
      ...meta
    }));
    
    // Sort by timestamp (newest first)
    entries.sort((a, b) => b.timestamp - a.timestamp);
    
    // console.log('[SW] ✅ Loaded research history:', entries.length, 'entries');
    
    return { success: true, entries: entries };
  } catch (error) {
    console.error('[SW] Get Research History failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get a specific research entry
 */
async function handleGetResearchEntry(entryId) {
  try {
    const filename = `research_${entryId}.json`;
    const entry = await storage.read(filename);
    
    if (!entry) {
      throw new Error('Research entry not found');
    }
    
    // console.log('[SW] ✅ Loaded research entry:', entryId);
    
    return { success: true, entry: entry };
  } catch (error) {
    console.error('[SW] Get Research Entry failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a research entry
 */
async function handleDeleteResearchEntry(entryId) {
  try {
    const filename = `research_${entryId}.json`;
    await storage.delete(filename);
    
    // Update registry
    const registry = await loadRegistry();
    if (registry.researchHistory && registry.researchHistory[entryId]) {
      delete registry.researchHistory[entryId];
      await saveRegistry(registry);
    }
    
    // console.log('[SW] ✅ Deleted research entry:', entryId);
    
    return { success: true };
  } catch (error) {
    console.error('[SW] Delete Research Entry failed:', error);
    return { success: false, error: error.message };
  }
}

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  // console.log('[SW] Extension installed/updated');
  await initialize();
});

// Setup listeners immediately
setupListeners();
setupNavigationListeners();

// Initialize
initialize();

// console.log('[SW] 🚀 Service worker loaded');

// Console helper for debugging
self.clearSerpCache = async () => {
  const result = await serpAnalyzer.clearAllCache();
  // console.log('[SW] 🗑️ Clear SERP cache:', result ? 'SUCCESS ✅' : 'FAILED ❌');
  // console.log('[SW] 💡 Now reload the page and analyze again for fresh extraction');
  return result;
};
// console.log('[SW] 💡 Debug helper available: clearSerpCache()');

