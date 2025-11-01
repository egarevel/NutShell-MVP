/**
 * Multi-Page Q&A Worker
 * Handles question answering across multiple pages using BM25 retrieval + AI
 */

import { MultiPageBM25 } from '../lib/multi-page-bm25.js';

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
function calculateAvailableTokens(systemPrompt, conversationHistory, question) {
  let usedTokens = 0;
  
  // System prompt
  usedTokens += estimateTokens(systemPrompt);
  
  // Conversation history
  conversationHistory.forEach(msg => {
    usedTokens += estimateTokens(msg.content);
  });
  
  // Current question
  usedTokens += estimateTokens(question);
  
  // Instructions and formatting overhead
  usedTokens += 250;
  
  // Reserved for answer
  usedTokens += 500;
  
  const available = MAX_TOTAL_TOKENS - usedTokens;
  console.log(`[Multi-Page QnA] Token budget: ${usedTokens}/${MAX_TOTAL_TOKENS} used, ${available} available for context`);
  
  return Math.max(available, 500);
}

class MultiPageQnAWorker {
  constructor() {
    this.bm25 = null;
    this.pages = [];
    this.isInitialized = false;
    this.aiSession = null; // Persistent AI session
    this.sessionMessagesAppended = []; // Track appended messages
  }

  /**
   * Initialize with multiple pages
   * @param {Array} pages - Array of {url, title, extractedContent}
   */
  async initialize(pages) {
    // console.log('[Multi-Page QnA] 🚀 Initializing with', pages.length, 'pages');

    this.pages = pages;
    this.bm25 = new MultiPageBM25();
    
    // Reset session tracking
    this.sessionMessagesAppended = [];
    
    // Destroy old session if exists
    if (this.aiSession) {
      try {
        await this.aiSession.destroy();
      } catch (e) {
        // Ignore
      }
      this.aiSession = null;
    }

    // Index all pages
    pages.forEach((page, index) => {
      const docId = `page_${index}`;
      
      // console.log(`[Multi-Page QnA] 📄 Page ${index}:`, {
      //   url: page.url,
      //   title: page.title,
      //   hasExtractedContent: !!page.extractedContent,
      //   hasSections: !!(page.extractedContent?.sections)
      // });
      
      if (!page.extractedContent || !page.extractedContent.sections) {
        console.warn('[Multi-Page QnA] ⚠️ Page missing extractedContent:', page.url);
        return;
      }

      const sections = page.extractedContent.sections;
      // console.log(`[Multi-Page QnA] 📄 Page ${index} sections:`, sections.length);
      
      // Log first section as sample
      // if (sections.length > 0) {
      //   const sample = sections[0];
      //   console.log(`[Multi-Page QnA] 📄 First section sample:`, {
      //     heading: sample.heading,
      //     contentLength: sample.content?.length || 0,
      //     contentPreview: sample.content ? sample.content.substring(0, 100) : 'NO CONTENT'
      //   });
      // }

      this.bm25.addDocument(
        docId,
        page.url,
        page.title,
        sections
      );
    });

    const stats = this.bm25.getStats();
    // console.log('[Multi-Page QnA] ✅ Initialized with stats:', stats);
    // console.log('[Multi-Page QnA] Total sections:', stats.totalSections, 'Unique terms:', stats.uniqueTerms);

    // Create persistent AI session
    await this.initializeAISession();

    this.isInitialized = true;
  }

  /**
   * Initialize AI session (called during initialize)
   */
  async initializeAISession() {
    if (typeof LanguageModel === 'undefined') {
      console.warn('[Multi-Page QnA] ⚠️ LanguageModel API not available');
      return;
    }

    try {
      const availability = await LanguageModel.availability();
      if (availability === 'unavailable') {
        console.warn('[Multi-Page QnA] ⚠️ AI unavailable');
        return;
      }

      const systemPrompt = `You are Nutshell, an offline AI assistant that answers ONLY from provided webpage sources.

CRITICAL RULES:
1. You are OFFLINE - answer ONLY from provided sources
2. Answer DIRECTLY and naturally - cite sources by domain name (e.g., "According to example.com, ...")
3. Be CONCISE - 1-2 short paragraphs (unless user asks to elaborate)
4. DO NOT use external knowledge or training data
5. If sources lack information, say: "The provided sources don't contain that information."
6. Write naturally as if YOU know the answer, while citing sources

GOOD Answer Format:
"According to example.com, artificial intelligence (AI) is the capability of machines to perform tasks requiring human intelligence. Wikipedia.org notes that it enables systems to perceive, understand, and act on information."

BAD Answer Format:
"Based on the provided sources, Source 1 indicates that AI refers to... The text also mentions... Source 2 describes..."

Answer STRICTLY from the sources below.`;

      this.aiSession = await LanguageModel.create({
        systemPrompt: systemPrompt
      });

      // console.log('[Multi-Page QnA] ✅ AI session created');
    } catch (error) {
      console.warn('[Multi-Page QnA] Failed to create AI session:', error);
      this.aiSession = null;
    }
  }

  /**
   * Answer a question using BM25 retrieval + AI
   * @param {string} question - User's question
   * @returns {Promise<Object>} - {answer, sources, retrievedSections}
   */
  async answerQuestion(question) {
    if (!this.isInitialized) {
      throw new Error('Worker not initialized. Call initialize() first.');
    }

    // console.log('[Multi-Page QnA] 📝 Question:', question);

    try {
      // Step 1: BM25 retrieval across all pages
      const retrievedSections = this.bm25.search(question, 5);

      // console.log('[Multi-Page QnA] 📚 Retrieved', retrievedSections.length, 'sections:');
      // retrievedSections.forEach((s, i) => {
      //   console.log(`  ${i + 1}. ${s.domain} | ${s.heading || 'No heading'} | Score: ${s.score}`, {
      //     hasContent: !!s.content,
      //     contentLength: s.content?.length || 0,
      //     contentPreview: s.content ? s.content.substring(0, 50) + '...' : 'NO CONTENT'
      //   });
      // });

      if (retrievedSections.length === 0) {
        return {
          answer: "I couldn't find relevant information in the analyzed pages to answer this question.",
          sources: [],
          retrievedSections: []
        };
      }

      // Step 2: Build context with URL citations and dynamic sizing
      // Use actual system prompt for accurate token estimation
      const systemPromptText = `You are Nutshell, an offline AI assistant that answers ONLY from provided webpage sources.

CRITICAL RULES:
1. You are OFFLINE - answer ONLY from provided sources
2. Answer DIRECTLY and naturally - cite sources by domain name
3. Be CONCISE - 1-2 short paragraphs (unless user asks to elaborate)
4. DO NOT use external knowledge or training data
5. If sources lack information, say: "The provided sources don't contain that information."
6. Write naturally as if YOU know the answer, while citing sources

Answer STRICTLY from the sources below.`;

      const availableTokens = calculateAvailableTokens(
        systemPromptText,
        this.sessionMessagesAppended,
        question
      );
      const availableChars = availableTokens * CHARS_PER_TOKEN;
      
      // Distribute chars across sections
      const numSections = retrievedSections.length;
      const charsPerSection = Math.floor(availableChars / numSections) - 100; // Overhead
      const maxCharsPerSection = Math.max(charsPerSection, 400);
      
      console.log(`[Multi-Page QnA] Context budget: ${availableChars} chars for ${numSections} sections = ${maxCharsPerSection} chars/section`);
      
      const context = retrievedSections.map((section, idx) => {
        const heading = section.heading ? `## ${section.heading}\n` : '';
        let content = section.content;
        
        // Adaptive truncation
        if (content.length > maxCharsPerSection) {
          let truncated = content.substring(0, maxCharsPerSection);
          const lastSentence = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('?'),
            truncated.lastIndexOf('!')
          );
          
          if (lastSentence > maxCharsPerSection * 0.7) {
            truncated = content.substring(0, lastSentence + 1);
          }
          
          content = truncated + (truncated.length < section.content.length ? '...' : '');
        }
        
        return `[Source: ${section.domain}]\n${heading}${content}`;
      }).join('\n\n---\n\n');

      // Step 3: Prepare AI prompt
      const fullPrompt = `===== SOURCES =====
${context}
===== END OF SOURCES =====

Question: ${question}

Answer (cite domain names):`;

      console.log('[Multi-Page QnA] 🤖 Getting answer with AI (non-streaming)...');

      // Step 4: Check if AI session is available
      if (!this.aiSession) {
        console.warn('[Multi-Page QnA] ⚠️ AI session not available, using fallback');
        return this.createFallbackAnswer(question, retrievedSections);
      }

      // Step 5: Generate answer with persistent AI session (with retry on overflow)
      let answer;
      try {
        answer = await this.aiSession.prompt(fullPrompt);
        console.log('[Multi-Page QnA] ✅ Answer received:', answer.length, 'chars');
      } catch (promptError) {
        console.error('[Multi-Page QnA] Prompt failed:', promptError);
        
        // Check if error is due to input being too long
        const errorMessage = promptError.message || String(promptError);
        if (errorMessage.toLowerCase().includes('too long') || 
            errorMessage.toLowerCase().includes('too large') ||
            errorMessage.toLowerCase().includes('exceeds') ||
            errorMessage.toLowerCase().includes('limit')) {
          
          console.warn('[Multi-Page QnA] ⚠️ Input too long, retrying with reduced context...');
          
          // Retry with aggressive truncation
          const reducedContext = retrievedSections.map((section) => {
            const heading = section.heading ? `## ${section.heading}\n` : '';
            const content = section.content.length > 400
              ? section.content.substring(0, 400) + '...'
              : section.content;
            return `[Source: ${section.domain}]\n${heading}${content}`;
          }).join('\n\n---\n\n');
          
          const retryPrompt = `===== SOURCES =====
${reducedContext}
===== END OF SOURCES =====

Question: ${question}

Answer concisely using the sources above:`;
          
          try {
            answer = await this.aiSession.prompt(retryPrompt);
            console.log('[Multi-Page QnA] ✅ Answer received (retry):', answer.length, 'chars');
          } catch (retryError) {
            console.error('[Multi-Page QnA] Retry failed:', retryError);
            throw new Error('Content too long for AI to process. Try asking a more specific question.');
          }
        } else {
          throw promptError;
        }
      }
      
      // ✅ Append Q&A to session for conversation context
      try {
        await this.aiSession.append({
          role: 'user',
          content: question
        });
        await this.aiSession.append({
          role: 'assistant',
          content: answer
        });
        this.sessionMessagesAppended.push(
          { role: 'user', content: question },
          { role: 'assistant', content: answer }
        );
        console.log('[Multi-Page QnA] ✅ Appended Q&A to session. Total messages:', this.sessionMessagesAppended.length);
      } catch (appendError) {
        console.warn('[Multi-Page QnA] Failed to append to session:', appendError);
      }

      console.log('[Multi-Page QnA] ✅ Answer complete');

      // Step 6: Extract unique source URLs
      const sources = [...new Set(retrievedSections.map(s => s.url))];

      return {
        answer: answer,
        sources: sources,
        retrievedSections: retrievedSections.map(s => ({
          domain: s.domain,
          heading: s.heading,
          score: s.score,
          url: s.url
        }))
      };

    } catch (error) {
      console.error('[Multi-Page QnA] ❌ Error answering question:', error);
      throw error;
    }
  }

  /**
   * Answer a question with streaming response
   * @param {string} question - User's question
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<Object>} - {answer, sources, retrievedSections}
   */
  async answerQuestionStreaming(question, onChunk) {
    if (!this.isInitialized) {
      throw new Error('Worker not initialized. Call initialize() first.');
    }

    // console.log('[Multi-Page QnA] Question:', question);

    try {
      // ✅ Context-aware retrieval: Enhance query with conversation context
      let searchQuery = question;
      const questionLower = question.toLowerCase();
      
      // Check if question is short and vague
      const isShortQuestion = question.split(' ').length <= 8;
      const isVagueQuestion = 
        questionLower.includes('it') ||
        questionLower.includes('this') ||
        questionLower.includes('that') ||
        questionLower.startsWith('what') && question.split(' ').length <= 5 ||
        questionLower.startsWith('tell me more') ||
        questionLower.startsWith('explain') && question.split(' ').length <= 3;
      
      // If short/vague, extract context from recent conversation
      if ((isShortQuestion || isVagueQuestion) && this.sessionMessagesAppended.length > 0) {
        const recentUserMessages = this.sessionMessagesAppended
          .filter(msg => msg.role === 'user')
          .slice(-3)
          .map(msg => msg.content);
        
        if (recentUserMessages.length > 0) {
          const contextWords = [];
          
          recentUserMessages.forEach(msg => {
            // Extract capitalized words (likely proper nouns)
            const capitalizedWords = msg.match(/\b[A-Z][a-z]+\b/g) || [];
            contextWords.push(...capitalizedWords);
            
            // Extract quoted terms
            const quotedTerms = msg.match(/"([^"]+)"/g) || [];
            contextWords.push(...quotedTerms.map(q => q.replace(/"/g, '')));
            
            // Extract words after "about", "explain", "regarding"
            const aboutMatch = msg.match(/(?:about|explain|regarding)\s+([A-Za-z0-9\s]+?)(?:\?|$|\.)/i);
            if (aboutMatch) {
              contextWords.push(aboutMatch[1].trim());
            }
          });
          
          if (contextWords.length > 0) {
            const uniqueContext = [...new Set(contextWords)]
              .filter(word => word.length > 2)
              .slice(0, 3);
            
            if (uniqueContext.length > 0) {
              searchQuery = `${uniqueContext.join(' ')} ${question}`;
              // console.log('[Multi-Page QnA] Enhanced query:', searchQuery);
            }
          }
        }
      }
      
      // Step 1: BM25 retrieval with enhanced query
      const retrievedSections = this.bm25.search(searchQuery, 5);

      // console.log('[Multi-Page QnA] 📚 Retrieved (streaming)', retrievedSections.length, 'sections');
      // retrievedSections.forEach((s, i) => {
      //   console.log(`  ${i + 1}. ${s.domain} | ${s.heading || 'No heading'}`, {
      //     hasContent: !!s.content,
      //     contentLength: s.content?.length || 0
      //   });
      // });

      if (retrievedSections.length === 0) {
        const fallbackAnswer = "I couldn't find relevant information in the analyzed pages to answer this question.";
        if (onChunk) onChunk(fallbackAnswer);
        return {
          answer: fallbackAnswer,
          sources: [],
          retrievedSections: []
        };
      }

      // Step 2: Build context with dynamic sizing
      // Use actual system prompt for accurate token estimation
      const systemPromptText = `You are Nutshell, an offline AI assistant that answers ONLY from provided webpage sources.

CRITICAL RULES:
1. You are OFFLINE - answer ONLY from provided sources
2. Answer DIRECTLY and naturally - cite sources by domain name (e.g., "According to example.com, ...")
3. Be CONCISE - 1-2 short paragraphs (unless user asks to elaborate)
4. DO NOT use external knowledge or training data
5. If sources lack information, say: "The provided sources don't contain that information."
6. Write naturally as if YOU know the answer, while citing sources

Answer STRICTLY from the sources below.`;

      const availableTokens = calculateAvailableTokens(
        systemPromptText,
        this.sessionMessagesAppended,
        question
      );
      const availableChars = availableTokens * CHARS_PER_TOKEN;
      
      // Distribute chars across sections
      const numSections = retrievedSections.length;
      const charsPerSection = Math.floor(availableChars / numSections) - 100;
      const maxCharsPerSection = Math.max(charsPerSection, 400);
      
      console.log(`[Multi-Page QnA] Context budget: ${availableChars} chars for ${numSections} sections = ${maxCharsPerSection} chars/section`);
      
      const context = retrievedSections.map((section) => {
        const heading = section.heading ? `## ${section.heading}\n` : '';
        let content = section.content;
        
        // Adaptive truncation
        if (content.length > maxCharsPerSection) {
          let truncated = content.substring(0, maxCharsPerSection);
          const lastSentence = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('?'),
            truncated.lastIndexOf('!')
          );
          
          if (lastSentence > maxCharsPerSection * 0.7) {
            truncated = content.substring(0, lastSentence + 1);
          }
          
          content = truncated + (truncated.length < section.content.length ? '...' : '');
        }
        
        return `[Source: ${section.domain}]\n${heading}${content}`;
      }).join('\n\n---\n\n');

      // Step 3: Prepare prompt
      const systemPromptInstruction = `You are Nutshell, an offline AI assistant that answers ONLY from provided webpage sources.

CRITICAL RULES:
1. You are OFFLINE - answer ONLY from provided sources
2. Answer DIRECTLY and naturally - cite sources by domain name (e.g., "According to example.com, ...")
3. Be CONCISE - 1-2 short paragraphs (unless user asks to elaborate)
4. DO NOT use external knowledge or training data
5. If sources lack information, say: "The provided sources don't contain that information."
6. Write naturally as if YOU know the answer, while citing sources

GOOD Answer Format:
"According to example.com, artificial intelligence (AI) is the capability of machines to perform tasks requiring human intelligence. Wikipedia.org notes that it enables systems to perceive, understand, and act on information."

BAD Answer Format:
"Based on the provided sources, Source 1 indicates that AI refers to... The text also mentions... Source 2 describes..."

Answer STRICTLY from the sources below.`;

      const fullPrompt = `===== SOURCES =====
${context}
===== END OF SOURCES =====

Question: ${question}

Answer (cite domain names):`;

      // Step 4: Check if AI session is available
      if (!this.aiSession) {
        console.warn('[Multi-Page QnA] ⚠️ AI session not available (streaming)');
        const fallback = this.createFallbackAnswer(question, retrievedSections);
        if (onChunk) onChunk(fallback.answer);
        return fallback;
      }

      console.log('[Multi-Page QnA] 🤖 Getting answer with AI (streaming mode)...');

      // Step 5: Stream the answer word-by-word (with retry on overflow)
      let fullAnswer = '';
      let chunkCount = 0;
      
      try {
        const stream = await this.aiSession.promptStreaming(fullPrompt);
        
        for await (const chunk of stream) {
          // Chrome AI returns only the NEW text (delta), so we need to accumulate
          fullAnswer += chunk;
          chunkCount++;
          
          // Send accumulated answer via callback
          if (onChunk) {
            onChunk(fullAnswer);
          }
        }
      } catch (streamError) {
        console.error('[Multi-Page QnA] Streaming failed:', streamError);
        
        // Check if error is due to input being too long
        const errorMessage = streamError.message || String(streamError);
        if (errorMessage.toLowerCase().includes('too long') || 
            errorMessage.toLowerCase().includes('too large') ||
            errorMessage.toLowerCase().includes('exceeds') ||
            errorMessage.toLowerCase().includes('limit')) {
          
          console.warn('[Multi-Page QnA] ⚠️ Input too long, retrying with reduced context (non-streaming)...');
          
          // Retry with aggressive truncation (non-streaming)
          const reducedContext = retrievedSections.map((section) => {
            const heading = section.heading ? `## ${section.heading}\n` : '';
            const content = section.content.length > 400
              ? section.content.substring(0, 400) + '...'
              : section.content;
            return `[Source: ${section.domain}]\n${heading}${content}`;
          }).join('\n\n---\n\n');
          
          const retryPrompt = `===== SOURCES =====
${reducedContext}
===== END OF SOURCES =====

Question: ${question}

Answer concisely using the sources above:`;
          
          try {
            fullAnswer = await this.aiSession.prompt(retryPrompt);
            console.log('[Multi-Page QnA] ✅ Answer received (non-streaming retry):', fullAnswer.length, 'chars');
            
            // Send the full answer at once
            if (onChunk) {
              onChunk(fullAnswer);
            }
          } catch (retryError) {
            console.error('[Multi-Page QnA] Retry failed:', retryError);
            throw new Error('Content too long for AI to process. Try asking a more specific question.');
          }
        } else {
          throw streamError;
        }
      }
      
      // Continue with normal flow after successful streaming or retry
      console.log('[Multi-Page QnA] ✅ Answer received:', fullAnswer.length, 'chars');
      
      // ✅ Append Q&A to session for conversation context
      try {
        await this.aiSession.append({
          role: 'user',
          content: question
        });
        await this.aiSession.append({
          role: 'assistant',
          content: fullAnswer.trim()
        });
        this.sessionMessagesAppended.push(
          { role: 'user', content: question },
          { role: 'assistant', content: fullAnswer.trim() }
        );
        console.log('[Multi-Page QnA] ✅ Appended Q&A to session. Total messages:', this.sessionMessagesAppended.length);
      } catch (appendError) {
        console.warn('[Multi-Page QnA] Failed to append Q&A to session:', appendError);
      }
      
      console.log('[Multi-Page QnA] ✅ Answer complete');

      const sources = [...new Set(retrievedSections.map(s => s.url))];

      return {
        answer: fullAnswer.trim(),
        sources: sources,
        retrievedSections: retrievedSections.map(s => ({
          sectionId: s.id || `section_${Date.now()}_${Math.random()}`,
          heading: s.heading,
          domain: s.domain,
          score: s.score,
          url: s.url,
          pageTitle: s.pageTitle || s.domain
        }))
      };

    } catch (error) {
      console.error('[Multi-Page QnA] ❌ Error in streaming:', error);
      throw error;
    }
  }

  /**
   * Create fallback answer when AI is not available
   * @param {string} question - User's question
   * @param {Array} sections - Retrieved sections
   * @returns {Object} - {answer, sources, retrievedSections}
   */
  createFallbackAnswer(question, sections) {
    let answer = `**Found relevant information from ${sections.length} sources:**\n\n`;

    sections.forEach((section, idx) => {
      answer += `**${idx + 1}. ${section.domain}**`;
      if (section.heading) {
        answer += ` - ${section.heading}`;
      }
      
      // Defensive: ensure content exists before calling substring
      const content = section.content || '';
      if (content) {
        answer += `\n${content.substring(0, 200)}${content.length > 200 ? '...' : ''}\n\n`;
      } else {
        answer += `\n*No content available*\n\n`;
      }
    });

    answer += `\n💡 *AI comparison is not available. Enable Chrome AI for intelligent answers.*`;

    const sources = [...new Set(sections.map(s => s.url))];

    return {
      answer: answer,
      sources: sources,
      retrievedSections: sections.map(s => ({
        sectionId: s.id || `section_${Date.now()}_${Math.random()}`,
        heading: s.heading,
        domain: s.domain,
        score: s.score,
        url: s.url,
        pageTitle: s.pageTitle || s.domain
      }))
    };
  }
}

// Worker instance
const worker = new MultiPageQnAWorker();

// Message handler
self.addEventListener('message', async (event) => {
  const { type, data, requestId } = event.data;

  try {
    if (type === 'INITIALIZE') {
      await worker.initialize(data.pages);
      self.postMessage({ 
        type: 'INITIALIZED', 
        success: true,
        requestId
      });
    }

    else if (type === 'ASK_QUESTION') {
      const result = await worker.answerQuestion(data.question);
      self.postMessage({ 
        type: 'ANSWER',
        question: data.question,
        requestId,
        ...result
      });
    }

    else if (type === 'ASK_QUESTION_STREAMING') {
      console.log('[Multi-Page QnA Worker] 📨 Received ASK_QUESTION_STREAMING');
      
      // Set up streaming callback
      let isFirstChunk = true;
      const onChunk = (chunk) => {
        if (isFirstChunk) {
          console.log('[Multi-Page QnA Worker] 📤 Sending first ANSWER_CHUNK to UI:', chunk.length, 'chars');
          isFirstChunk = false;
        }
        self.postMessage({
          type: 'ANSWER_CHUNK',
          chunk: chunk,
          requestId
        });
      };

      const result = await worker.answerQuestionStreaming(data.question, onChunk);
      
      console.log('[Multi-Page QnA Worker] 📤 Sending ANSWER_COMPLETE');
      
      // Send final complete message
      self.postMessage({
        type: 'ANSWER_COMPLETE',
        requestId,
        ...result
      });
    }

  } catch (error) {
    console.error('[Multi-Page QnA Worker] Error:', error);
    self.postMessage({ 
      type: 'ERROR',
      error: error.message,
      requestId
    });
  }
});

// console.log('[Multi-Page QnA Worker] 🚀 Worker loaded and ready');

