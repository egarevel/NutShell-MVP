/**
 * Q&A Worker - Question Answering with BM25 RAG
 * Uses BM25 retrieval + Chrome AI Language Model
 */

import { BM25Retriever } from '../lib/retrieval.js';

let retriever = null;
let aiSession = null;
let conversationHistory = [];
let currentPageUrl = null;
let currentPageTitle = null;
let multiPageContext = null;  // Stores context from multiple pages
let previousConversationSummary = null;  // Flow summary from previous page
let sessionMessagesAppended = []; // Track what we've already appended to session

// Token limits for Chrome AI (conservative estimate)
const MAX_TOTAL_TOKENS = 3500; // Leave buffer for safety
const CHARS_PER_TOKEN = 4; // Rough estimate: 1 token ≈ 4 chars

/**
 * Estimate token count from text
 * @param {string} text - Text to estimate
 * @returns {number} Estimated tokens
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Calculate available tokens for context
 * @param {string} systemPrompt - System prompt text
 * @param {Array} conversationHistory - Chat history
 * @param {string} question - User question
 * @param {Array} mentionedTabs - Mentioned tabs data
 * @returns {number} Available tokens for webpage context
 */
function calculateAvailableTokens(systemPrompt, conversationHistory, question, mentionedTabs = []) {
  let usedTokens = 0;
  
  // System prompt
  usedTokens += estimateTokens(systemPrompt);
  
  // Conversation history
  conversationHistory.forEach(msg => {
    usedTokens += estimateTokens(msg.content);
  });
  
  // Current question
  usedTokens += estimateTokens(question);
  
  // Mentioned tabs context
  mentionedTabs.forEach(tab => {
    if (tab.chatSummary) {
      usedTokens += estimateTokens(tab.chatSummary);
    }
    usedTokens += estimateTokens(tab.pageTitle) + 50; // Header overhead
  });
  
  // Instructions and formatting (estimated overhead)
  usedTokens += 200;
  
  // Reserved for answer (need space for AI response)
  usedTokens += 500;
  
  const available = MAX_TOTAL_TOKENS - usedTokens;
  console.log(`[QnAWorker] Token budget: ${usedTokens}/${MAX_TOTAL_TOKENS} used, ${available} available for context`);
  
  return Math.max(available, 500); // Minimum 500 tokens for context
}

/**
 * Initialize worker
 */
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;
  
  // console.log('[QnAWorker] Received message:', type);
  
  try {
    switch (type) {
      case 'INIT':
        await handleInit(data);
        break;
      case 'ASK':
        await handleAsk(data);
        break;
      case 'RESET':
        handleReset();
        break;
      default:
        console.warn('[QnAWorker] Unknown message type:', type);
    }
  } catch (error) {
    console.error('[QnAWorker] Error:', error);
    postMessage({
      type: 'ERROR',
      error: error.message
    });
  }
});

/**
 * Initialize with sections and optional conversation context
 */
async function handleInit(data) {
  const { sections, pageUrl, pageTitle, multiPageContext: mpContext, conversationSummary, chatHistory } = data;
  
  // console.log('[QnAWorker] Initializing with', sections.length, 'sections');
  if (conversationSummary) {
    // console.log('[QnAWorker] Conversation flow context:', conversationSummary);
  }
  currentPageUrl = pageUrl || 'unknown';
  currentPageTitle = pageTitle || 'Current Page';
  multiPageContext = mpContext;
  previousConversationSummary = conversationSummary;  // Store for AI context
  
  // Reset session tracking when initializing new page
  sessionMessagesAppended = [];
  
  // Destroy old AI session to start fresh
  if (aiSession) {
    try {
      await aiSession.destroy();
    } catch (e) {
      // Ignore
    }
    aiSession = null;
  }
  
  // Prepare all sections with page source info
  const allSections = [];
  
  // Add current page sections
  sections.forEach(section => {
    allSections.push({
      ...section,
      pageUrl: currentPageUrl,
      pageTitle: currentPageTitle,
      isCurrentPage: true
    });
  });
  
  // Add recent pages' sections if multi-page context available
  if (multiPageContext && multiPageContext.recentPages) {
    // console.log('[QnAWorker] Adding', multiPageContext.recentPages.length, 'recent pages to context');
    
    multiPageContext.recentPages.forEach((page, pageIndex) => {
      if (page.sections && page.sections.length > 0) {
        page.sections.forEach(section => {
          allSections.push({
            ...section,
            pageUrl: page.url,
            pageTitle: page.title,
            isCurrentPage: false,
            pageIndex: pageIndex + 1 // 1-indexed for UI
          });
        });
      }
    });
  }
  
  // console.log('[QnAWorker] Total sections across all pages:', allSections.length);
  
  // Create BM25 retriever with all sections
  retriever = new BM25Retriever(allSections);
  // console.log('[QnAWorker] ✅ BM25 retriever ready (multi-page context:', multiPageContext ? 'enabled' : 'disabled', ')');
  
  // Check if AI session is available (using global LanguageModel)
  const hasAI = typeof LanguageModel !== 'undefined';
  
  if (hasAI) {
    try {
      const availability = await LanguageModel.availability();
      if (availability !== 'unavailable') {
        // Build system prompt with optional conversation context
        let systemPrompt = `You are Nutshell, an offline AI assistant that answers from the current webpage content and our conversation history.

CRITICAL RULES:
1. You are OFFLINE - answer from provided webpage content AND our conversation history
2. If asked about previous questions or our conversation, USE THE CONVERSATION HISTORY
3. If asked about webpage content, USE THE PROVIDED WEBPAGE SECTIONS
4. Answer DIRECTLY - NO meta-commentary like "Based on the text", "Section 1 says"
5. Be CONCISE - 1-2 short paragraphs (unless user asks to elaborate)
6. If information isn't available in either source, say: "I don't have that information in our conversation or the current webpage."
7. Write naturally as if YOU know the answer
8. DO NOT mention section numbers in the answer

GOOD Answer Format:
"Artificial intelligence (AI) is the capability of machines to perform tasks requiring human intelligence, such as learning, reasoning, and problem-solving. It enables systems to perceive, understand, and act on information."

BAD Answer Format:
"Based on the provided text, Section 1 indicates that AI refers to... The text also mentions... Section 2 describes..."

CONVERSATION CONTEXT:
- You have access to our full conversation history through session.append()
- When user asks "what was my first question" or "what did we discuss", refer to the conversation history
- The conversation history is automatically available to you`;

        systemPrompt += `\n\nWrite naturally and directly.`;
        
        aiSession = await LanguageModel.create({
          systemPrompt: systemPrompt,
          outputLanguage: 'en'
        });
        
        // If we have conversation summary from previous page, append it as assistant message
        if (previousConversationSummary && previousConversationSummary.trim().length > 0) {
          await aiSession.append({
            role: 'assistant',
            content: `[Previous page conversation summary]\n${previousConversationSummary}`
          });
          sessionMessagesAppended.push({
            role: 'assistant',
            content: previousConversationSummary,
            type: 'summary'
          });
          // console.log('[QnAWorker] ✅ Appended previous conversation summary to session');
        }
        
        // ✅ Load chat history into session if resuming from history
        if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
          // console.log('[QnAWorker] Loading', chatHistory.length, 'messages from history');
          
          for (const msg of chatHistory) {
            // Only append user and nutshell messages (skip system, navigation, etc.)
            if (msg.role === 'user' || msg.role === 'nutshell') {
              try {
                // ✅ Ensure content is a string, not an object
                let messageContent = msg.content;
                
                // If content is an object, try to extract text
                if (typeof messageContent === 'object' && messageContent !== null) {
                  if (messageContent.text) {
                    messageContent = messageContent.text;
                  } else if (messageContent.content) {
                    messageContent = messageContent.content;
                  } else {
                    messageContent = JSON.stringify(messageContent);
                  }
                }
                
                // Ensure it's a string
                messageContent = String(messageContent);
                const appendRole = msg.role === 'user' ? 'user' : 'assistant';
                
                await aiSession.append({
                  role: appendRole,
                  content: messageContent
                });
                
                sessionMessagesAppended.push({
                  role: appendRole,
                  content: messageContent,
                  type: 'history'
                });
              } catch (appendError) {
                console.warn('[QnAWorker] Failed to append message:', appendError);
              }
            }
          }
        }
        
        // console.log('[QnAWorker] ✅ AI session created with proper session management');
      }
    } catch (error) {
      console.warn('[QnAWorker] Could not create AI session:', error);
      aiSession = null;
    }
  }
  
  // console.log('[QnAWorker] ✅ Initialized (AI available:', !!aiSession, ')');
  
  postMessage({
    type: 'READY'
  });
}

/**
 * Handle question
 */
async function handleAsk(data) {
  const { question, mentionedTabs = [] } = data;
  
  if (!retriever) {
    throw new Error('Retriever not initialized. Call INIT first.');
  }
  
  // console.log('[QnAWorker] Processing question:', question);
  // console.log('[QnAWorker] Mentioned tabs:', mentionedTabs.length);
  
  const questionLower = question.toLowerCase();
  
  // ✅ CRITICAL: Detect conversation-related questions
  const isConversationQuestion = 
    questionLower.includes('first question') ||
    questionLower.includes('previous question') ||
    questionLower.includes('earlier') ||
    questionLower.includes('what did i ask') ||
    questionLower.includes('what did we discuss') ||
    questionLower.includes('our conversation') ||
    questionLower.includes('chat history');
  
  // If it's a conversation question, skip retrieval and ask AI directly
  if (isConversationQuestion && aiSession) {
    // console.log('[QnAWorker] Conversation question detected');
    
    postMessage({
      type: 'PROGRESS',
      status: 'Checking conversation history...'
    });
    
    const startTime = Date.now();
    let answer = '';
    
    try {
      // Ask AI directly without webpage context - it will use session.append() history
      const prompt = `Question: ${question}\n\nInstructions: Answer this question using ONLY our conversation history. Do not reference the webpage content.`;
      
      const stream = aiSession.promptStreaming(prompt);
      
      for await (const chunk of stream) {
        answer += chunk;
        postMessage({
          type: 'ANSWER_CHUNK',
          chunk: answer,
          isComplete: false
        });
      }
      
      const responseTime = Date.now() - startTime;
      
      // Append Q&A to session
      await aiSession.append({ role: 'user', content: question });
      await aiSession.append({ role: 'assistant', content: answer.trim() });
      
      postMessage({
        type: 'ANSWER',
        answer: answer.trim(),
        citations: [],
        confidence: 'high',
        responseTime
      });
      
      return;
    } catch (error) {
      console.error('[QnAWorker] Failed to answer conversation question:', error);
      // Fall through to normal retrieval
    }
  }
  
  // Step 0: Add mentioned tabs' sections to retriever (temporarily)
  let tempRetriever = retriever;
  if (mentionedTabs.length > 0) {
    console.log('[QnAWorker] 🔗 Cross-tab chat detected:', mentionedTabs.length, 'mentioned tabs');
    
    // Create a temporary retriever with current + mentioned tabs' sections
    const currentSections = retriever.sections || [];
    const allSections = [...currentSections]; // Current page sections
    
    console.log('[QnAWorker] Current page sections:', currentSections.length);
    
    mentionedTabs.forEach((tab, idx) => {
      console.log(`[QnAWorker] Tab ${idx + 1}:`, tab.pageTitle, '- Sections:', tab.sections?.length || 0);
      
      if (tab.sections && tab.sections.length > 0) {
        tab.sections.forEach(section => {
          allSections.push({
            ...section,
            pageUrl: tab.url,
            pageTitle: tab.pageTitle,
            isCurrentPage: false,
            isMentionedTab: true,
            mentionedTabDomain: tab.domain
          });
        });
      }
    });
    
    console.log('[QnAWorker] Total sections (current + mentioned):', allSections.length);
    
    // Create new retriever with all sections
    tempRetriever = new BM25Retriever(allSections);
    
    console.log('[QnAWorker] ✅ Temporary retriever created with', allSections.length, 'sections');
  }
  
  // Step 1: Retrieve relevant sections
  postMessage({
    type: 'PROGRESS',
    status: mentionedTabs.length > 0 
      ? `Searching across ${mentionedTabs.length + 1} tabs...` 
      : 'Finding relevant sections...'
  });
  
  // ✅ CRITICAL: Enhance search query with conversation context
  let searchQuery = question;
  
  // Check if question is short and vague (e.g., "What's the speed?", "Tell me more")
  const isShortQuestion = question.split(' ').length <= 8;
  const isVagueQuestion = 
    questionLower.includes('it') ||
    questionLower.includes('this') ||
    questionLower.includes('that') ||
    questionLower.includes('the') && !questionLower.includes('what is the') ||
    questionLower.startsWith('what') && question.split(' ').length <= 5 ||
    questionLower.startsWith('tell me more') ||
    questionLower.startsWith('explain') && question.split(' ').length <= 3;
  
  // If short/vague question, add context from recent conversation
  if ((isShortQuestion || isVagueQuestion) && sessionMessagesAppended.length > 0) {
    // Get the last user message to extract key nouns/topics
    const recentUserMessages = sessionMessagesAppended
      .filter(msg => msg.role === 'user')
      .slice(-3)  // Last 3 user messages
      .map(msg => msg.content);
    
    if (recentUserMessages.length > 0) {
      // Extract capitalized words and nouns from recent messages (likely proper nouns/topics)
      const contextWords = [];
      
      recentUserMessages.forEach(msg => {
        // Extract capitalized words (likely proper nouns)
        const capitalizedWords = msg.match(/\b[A-Z][a-z]+\b/g) || [];
        contextWords.push(...capitalizedWords);
        
        // Extract quoted terms
        const quotedTerms = msg.match(/"([^"]+)"/g) || [];
        contextWords.push(...quotedTerms.map(q => q.replace(/"/g, '')));
        
        // Extract words after "about", "explain", "tell me about"
        const aboutMatch = msg.match(/(?:about|explain|regarding)\s+([A-Za-z0-9\s]+?)(?:\?|$|\.)/i);
        if (aboutMatch) {
          contextWords.push(aboutMatch[1].trim());
        }
      });
      
      // Add unique context words to search query (limit to avoid noise)
      if (contextWords.length > 0) {
        const uniqueContext = [...new Set(contextWords)]
          .filter(word => word.length > 2)  // Filter out short words
          .slice(0, 3);  // Limit to top 3 context words
        
        if (uniqueContext.length > 0) {
          searchQuery = `${uniqueContext.join(' ')} ${question}`;
          // console.log(`[QnAWorker] Enhanced query: "${question}" → "${searchQuery}"`);
        }
      }
    }
  }
  
  // If asking "What is X?" - search for just X (stopwords removed anyway)
  if (questionLower.startsWith('what is') || questionLower.startsWith('what are')) {
    // Extract the main term after "what is/are"
    const mainTerm = question.replace(/what\s+(is|are)\s+/i, '').replace(/\?/g, '').trim();
    if (mainTerm) {
      searchQuery = mainTerm; // Search for just the term
      // console.log(`[QnAWorker] 🔍 Simplified query: "${question}" → "${searchQuery}"`);
    }
  }
  
  // Use BM25 retrieval (with mentioned tabs if any)
  // console.log('[QnAWorker] 🔍 Using BM25 retrieval');
  const results = tempRetriever.search(searchQuery, 3);
  
  if (results.length === 0) {
    postMessage({
      type: 'ANSWER',
      answer: "I couldn't find relevant information in this page to answer your question. Could you rephrase or ask about a different topic?",
      citations: [],
      confidence: 'low'
    });
    return;
  }
  
  // Step 2: Build context from retrieved sections with dynamic sizing
  // console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  // console.log('[QnAWorker] 📚 RETRIEVED SECTIONS:');
  results.forEach((result, idx) => {
    // console.log(`  ${idx + 1}. "${result.section.heading}" (score: ${result.score.toFixed(2)})`);
    // console.log(`     Text preview: ${result.section.text.substring(0, 100)}...`);
  });
  // console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Get the actual system prompt for accurate token estimation
  const systemPrompt = `You are Nutshell, an offline AI assistant that answers from the current webpage content and our conversation history.

CRITICAL RULES:
1. You are OFFLINE - answer from provided webpage content AND our conversation history
2. If asked about previous questions or our conversation, USE THE CONVERSATION HISTORY
3. If asked about webpage content, USE THE PROVIDED WEBPAGE SECTIONS
4. Answer DIRECTLY - NO meta-commentary like "Based on the text", "Section 1 says"
5. Be CONCISE - 1-2 short paragraphs (unless user asks to elaborate)
6. If information isn't available in either source, say: "I don't have that information in our conversation or the current webpage."
7. Write naturally as if YOU know the answer
8. DO NOT mention section numbers in the answer

CONVERSATION CONTEXT:
- You have access to our full conversation history through session.append()
- When user asks "what was my first question" or "what did we discuss", refer to the conversation history
- The conversation history is automatically available to you

Write naturally and directly.`;

  const availableTokens = calculateAvailableTokens(
    systemPrompt,
    sessionMessagesAppended,
    question,
    mentionedTabs
  );
  const availableChars = availableTokens * CHARS_PER_TOKEN;
  
  // Distribute available chars across sections
  const numSections = results.length;
  const charsPerSection = Math.floor(availableChars / numSections) - 50; // 50 char overhead per section
  const maxCharsPerSection = Math.max(charsPerSection, 300); // Minimum 300 chars per section
  
  console.log(`[QnAWorker] Context budget: ${availableChars} chars for ${numSections} sections = ${maxCharsPerSection} chars/section`);
  
  const context = results.map((result, idx) => {
    const section = result.section;
    
    // Adaptive truncation based on available space
    let text = section.text;
    if (text.length > maxCharsPerSection) {
      // Smart truncation: Try to end at sentence boundary
      let truncated = text.substring(0, maxCharsPerSection);
      const lastPeriod = truncated.lastIndexOf('.');
      const lastQuestion = truncated.lastIndexOf('?');
      const lastExclaim = truncated.lastIndexOf('!');
      const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);
      
      if (lastSentence > maxCharsPerSection * 0.7) {
        // Good sentence boundary found
        truncated = text.substring(0, lastSentence + 1);
      }
      
      text = truncated + (truncated.length < section.text.length ? '...' : '');
    }
    
    return `[Section ${idx + 1}: "${section.heading}"]\n${text}`;
  }).join('\n\n');
  
  // Step 3: Build prompt
  postMessage({
    type: 'PROGRESS',
    status: 'Generating answer...'
  });
  
  let answer;
  let responseTime = 0;
  
  // Step 4: Get answer from AI (or provide fallback)
  if (aiSession) {
    // Build prompt with context and question
    // ✅ CRITICAL: Include instruction to use BOTH conversation history AND webpage content
    let prompt = `Current webpage content (use this to answer the question):\n\n${context}\n\n`;
    
    // Add mentioned tabs' chat summaries if available
    if (mentionedTabs.length > 0) {
      prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `CONTEXT FROM MENTIONED TABS:\n\n`;
      
      mentionedTabs.forEach((tab, idx) => {
        prompt += `Tab ${idx + 1}: ${tab.pageTitle} (${tab.domain})\n`;
        if (tab.chatSummary) {
          prompt += `Recent conversation:\n${tab.chatSummary}\n\n`;
        } else {
          prompt += `(No conversation history)\n\n`;
        }
      });
      
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    
    prompt += `Question: ${question}\n\n`;
    
    // Add specific instruction based on question type
    const questionLower = question.toLowerCase();
    const hasMentions = mentionedTabs.length > 0;
    
    if (questionLower.includes('what is') || questionLower.includes('what are')) {
      prompt += `Instructions: Answer using the webpage content above${hasMentions ? ' and the mentioned tabs\' context' : ''}. If the question refers to our previous conversation, use that context too. Be concise (1-2 paragraphs).\n\n`;
    } else if (questionLower.includes('elaborate') || questionLower.includes('detail') || questionLower.includes('explain more')) {
      prompt += `Instructions: Provide a detailed explanation using the webpage content above${hasMentions ? ', the mentioned tabs\' context,' : ''} and our conversation history. You can use multiple paragraphs.\n\n`;
    } else if (questionLower.includes('previous') || questionLower.includes('first') || questionLower.includes('earlier') || questionLower.includes('asked')) {
      prompt += `Instructions: This question is about our conversation history. Answer based on what we discussed earlier in this chat.\n\n`;
    } else if (questionLower.includes('compare') && hasMentions) {
      prompt += `Instructions: Compare the information from the current page and the mentioned tabs. Clearly cite which tab each piece of information comes from. Be comprehensive.\n\n`;
    } else {
      prompt += `Instructions: Answer using the webpage content above${hasMentions ? ' and the mentioned tabs\' context' : ''}. If relevant, reference our previous conversation. Be concise (1-2 paragraphs).\n\n`;
    }
    
    // Log the prompt for debugging
    // console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    // console.log('[QnAWorker] 📝 PROMPT SENT TO AI:');
    // console.log(prompt.substring(0, 500) + '...');
    // console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const startTime = Date.now();
    
    // Use non-streaming for reliability (prevents abort issues when switching tabs)
    console.log('[QnAWorker] 🚀 Getting answer (non-streaming)...');
    
    try {
      answer = await aiSession.prompt(prompt);
      responseTime = Date.now() - startTime;
      
      console.log('[QnAWorker] ✅ Answer received:', answer.length, 'chars in', responseTime, 'ms');
      
      // Append to session
      await aiSession.append({
        role: 'user',
        content: question
      });
      await aiSession.append({
        role: 'assistant',
        content: answer.trim()
      });
      sessionMessagesAppended.push(
        { role: 'user', content: question },
        { role: 'assistant', content: answer.trim() }
      );
      // console.log('[QnAWorker] ✅ Appended Q&A to session. Total messages:', sessionMessagesAppended.length);
    } catch (promptError) {
      console.error('[QnAWorker] Prompt failed:', promptError);
      
      // Check if error is due to input being too long
      const errorMessage = promptError.message || String(promptError);
      if (errorMessage.toLowerCase().includes('too long') || 
          errorMessage.toLowerCase().includes('too large') ||
          errorMessage.toLowerCase().includes('exceeds') ||
          errorMessage.toLowerCase().includes('limit')) {
        
        console.warn('[QnAWorker] ⚠️ Input too long error detected. Retrying with reduced context...');
        
        // Retry with much more aggressive truncation
        const reducedContext = results.map((result, idx) => {
          const section = result.section;
          // Use only first 400 chars per section
          const text = section.text.length > 400
            ? section.text.substring(0, 400) + '...'
            : section.text;
          return `[Section ${idx + 1}: "${section.heading}"]\n${text}`;
        }).join('\n\n');
        
        // Rebuild prompt with reduced context
        let retryPrompt = `Current webpage content:\n\n${reducedContext}\n\n`;
        retryPrompt += `Question: ${question}\n\nInstructions: Answer concisely using the content above.\n\n`;
        
        try {
          console.log('[QnAWorker] 🔄 Retrying with reduced context...');
          answer = await aiSession.prompt(retryPrompt);
          responseTime = Date.now() - startTime;
          
          console.log('[QnAWorker] ✅ Answer received (retry):', answer.length, 'chars');
          
          // Append to session
          await aiSession.append({ role: 'user', content: question });
          await aiSession.append({ role: 'assistant', content: answer.trim() });
          sessionMessagesAppended.push(
            { role: 'user', content: question },
            { role: 'assistant', content: answer.trim() }
          );
        } catch (retryError) {
          console.error('[QnAWorker] Retry also failed:', retryError);
          throw new Error('Content too long for AI to process. Try asking a more specific question.');
        }
      } else {
        throw promptError;
      }
    }
  } else {
    // Fallback: Show relevant sections without AI
    const fallbackAnswer = `🔍 **Found ${results.length} relevant section(s):**\n\n` +
      results.map((result, idx) => {
        const section = result.section;
        const preview = section.text.substring(0, 300) + (section.text.length > 300 ? '...' : '');
        return `**${idx + 1}. ${section.heading}**\n${preview}`;
      }).join('\n\n') +
      `\n\n💡 *Note: AI answer generation is not available. The relevant sections are shown above. Click the citations below to see the full content.*`;
    
    answer = fallbackAnswer;
    responseTime = 0;
  }
  
  // Step 5: Extract citations (with page source info for multi-page context and mentioned tabs)
  const citations = results.map(result => ({
    sectionId: result.section.id,
    heading: result.section.heading,
    snippet: result.section.text.substring(0, 150) + '...',
    relevanceScore: result.score,
    pageTitle: result.section.pageTitle || 'Current Page',
    pageUrl: result.section.pageUrl || currentPageUrl,
    isCurrentPage: result.section.isCurrentPage !== false, // Default to true if not specified
    isMentionedTab: result.section.isMentionedTab || false,
    mentionedTabDomain: result.section.mentionedTabDomain || null
  }));
  
  // console.log('[QnAWorker] Answer generated in', responseTime, 'ms');
  
  // Send response
  postMessage({
    type: 'ANSWER',
    answer: answer.trim(),
    citations,
    confidence: results.length >= 2 ? 'high' : 'medium',
    responseTime
  });
  
  // Store in conversation history
  conversationHistory.push({
    question,
    answer: answer.trim(),
    citations,
    timestamp: Date.now()
  });
}

/**
 * Reset conversation
 */
function handleReset() {
  // console.log('[QnAWorker] Resetting conversation');
  conversationHistory = [];
  sessionMessagesAppended = [];
  
  if (aiSession) {
    try {
      aiSession.destroy();
    } catch (e) {
      // Ignore
    }
  }
  
  // Create new session (using global LanguageModel)
  if (typeof LanguageModel !== 'undefined') {
    // Build system prompt
    let systemPrompt = `You are Nutshell, an offline AI assistant that answers ONLY from the current webpage content.

CRITICAL RULES:
1. You are OFFLINE - answer ONLY from provided webpage content
2. Answer DIRECTLY and naturally
3. Be CONCISE - 1-2 short paragraphs
4. If information isn't available, say so clearly
5. DO NOT use external knowledge`;

    systemPrompt += `\n\nWrite naturally and directly.`;
    
    LanguageModel.create({
      systemPrompt: systemPrompt,
      outputLanguage: 'en'
    }).then(async (session) => {
      aiSession = session;
      
      // If we have conversation summary from previous page, append it
      if (previousConversationSummary && previousConversationSummary.trim().length > 0) {
        try {
          await aiSession.append({
            role: 'assistant',
            content: `[Previous page conversation summary]\n${previousConversationSummary}`
          });
          sessionMessagesAppended.push({
            role: 'assistant',
            content: previousConversationSummary,
            type: 'summary'
          });
          // console.log('[QnAWorker] ✅ Appended previous conversation summary to new session');
        } catch (appendError) {
          console.warn('[QnAWorker] Failed to append summary to new session:', appendError);
        }
      }
      
      postMessage({ type: 'READY' });
    }).catch(error => {
      console.warn('[QnAWorker] Failed to create new session:', error);
      aiSession = null;
      postMessage({ type: 'READY' });
    });
  } else {
    postMessage({ type: 'READY' });
  }
}

// console.log('[QnAWorker] 🚀 Worker initialized');

