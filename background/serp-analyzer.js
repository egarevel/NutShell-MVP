/**
 * SERP Analyzer Background Service
 * Orchestrates background tab processing, content extraction, and analysis
 */

import * as storage from '../lib/storage.js';

class SerpAnalyzer {
  constructor() {
    this.activeAnalysis = null;
    this.cacheInitialized = false;
    this.CACHE_FILE = 'serp-cache.json';
    this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours (instead of 1 hour)
  }

  /**
   * Initialize cache from OPFS
   */
  async initializeCache() {
    if (this.cacheInitialized) return;
    
    try {
      // console.log('[SERP Analyzer] Initializing cache from OPFS...');
      const cacheData = await storage.read(this.CACHE_FILE);
      
      if (cacheData) {
        // console.log('[SERP Analyzer] ✅ Loaded cache from OPFS:', Object.keys(cacheData).length, 'entries');
      } else {
        // console.log('[SERP Analyzer] No existing cache found, starting fresh');
      }
      
      this.cacheInitialized = true;
    } catch (error) {
      console.error('[SERP Analyzer] Failed to initialize cache:', error);
      this.cacheInitialized = true; // Continue anyway
    }
  }

  /**
   * Get cached result for URL
   */
  async getCachedResult(url) {
    await this.initializeCache();
    
    try {
      const cache = await storage.read(this.CACHE_FILE) || {};
      const cached = cache[url];
      
      if (cached && Date.now() - cached.cachedAt < this.CACHE_DURATION) {
        // console.log('[SERP Analyzer] ✅ Cache hit for:', url, '(age:', this.getCacheAge(cached.cachedAt), ')');
        return {
          ...cached.data,
          fromCache: true,
          cachedAt: cached.cachedAt,
          cacheAge: this.getCacheAge(cached.cachedAt)
        };
      }
      
      if (cached) {
        // console.log('[SERP Analyzer] Cache expired for:', url);
      }
      
      return null;
    } catch (error) {
      console.error('[SERP Analyzer] Cache read error:', error);
      return null;
    }
  }

  /**
   * Save result to cache
   */
  async saveCachedResult(url, data) {
    try {
      const cache = await storage.read(this.CACHE_FILE) || {};
      
      cache[url] = {
        data: data,
        cachedAt: Date.now()
      };
      
      await storage.write(this.CACHE_FILE, cache);
      // console.log('[SERP Analyzer] ✅ Saved to cache:', url);
    } catch (error) {
      console.error('[SERP Analyzer] Cache write error:', error);
    }
  }

  /**
   * Get cache age in human-readable format
   */
  getCacheAge(timestamp) {
    const ageMs = Date.now() - timestamp;
    const ageMinutes = Math.floor(ageMs / (1000 * 60));
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    
    if (ageDays > 0) return `${ageDays}d ago`;
    if (ageHours > 0) return `${ageHours}h ago`;
    if (ageMinutes > 0) return `${ageMinutes}m ago`;
    return 'just now';
  }

  /**
   * Ensure result has full extracted content (auto re-extract if needed)
   * This handles cache migration for old entries without extractedContent
   */
  async ensureFullContent(result) {
    // Check if already has extracted content in correct format WITH actual content
    if (result.extractedContent && 
        result.extractedContent.sections && 
        result.extractedContent.sections.length > 0) {
      
      // CRITICAL: Verify sections actually have content
      const sectionsWithContent = result.extractedContent.sections.filter(
        s => s.content && s.content.trim().length > 0
      );
      
      if (sectionsWithContent.length > 0) {
        // console.log('[SERP Analyzer] ✓ Full content already available for:', result.url);
        return result;
      } else {
        console.warn('[SERP Analyzer] ⚠️ extractedContent exists but sections are EMPTY - forcing re-extraction');
        // Fall through to re-extraction
      }
    }

    // Check if has old format (sections at top level) - migrate it
    if (result.sections && result.sections.length > 0) {
      // console.log('[SERP Analyzer] 🔄 Migrating old cache format for:', result.url);
      
      // Check if sections actually have content
      const sectionsWithContent = result.sections.filter(s => s.content && s.content.trim().length > 0);
      // console.log('[SERP Analyzer] 📊 Sections analysis:', {
      //   total: result.sections.length,
      //   withContent: sectionsWithContent.length,
      //   firstSectionSample: result.sections[0] ? {
      //     heading: result.sections[0].heading,
      //     hasContent: !!result.sections[0].content,
      //     contentLength: result.sections[0].content?.length || 0,
      //     contentPreview: result.sections[0].content?.substring(0, 100) || 'EMPTY'
      //   } : null
      // });
      
      // If sections have no content, we MUST re-extract
      if (sectionsWithContent.length === 0) {
        console.warn('[SERP Analyzer] ⚠️ Old cache has NO content - forcing re-extraction');
        // Don't return here, fall through to re-extraction below
      } else {
        // Migration can proceed
        const fullText = result.sections
          .map(section => `${section.heading ? section.heading + ' ' : ''}${section.content || ''}`)
          .join(' ');
        
        result.extractedContent = {
          sections: result.sections,
          fullText: fullText,
          metadata: {
            sectionCount: result.sections.length,
            totalWords: fullText.split(/\s+/).filter(w => w.length > 0).length,
            hasHeadings: result.sections.some(s => s.heading && s.heading.trim().length > 0)
          }
        };
        
        // console.log('[SERP Analyzer] ✅ Migrated:', {
        //   sections: result.extractedContent.sections.length,
        //   words: result.extractedContent.metadata.totalWords
        // });
        
        // Update cache with migrated structure
        await this.updateCachedResult(result.url, result);
        
        return result;
      }
    }

    // No content available - need to re-extract
    // console.log('[SERP Analyzer] ⟳ Re-extracting full content for:', result.url);

    try {
      // Open page in background
      const tab = await chrome.tabs.create({
        url: result.url,
        active: false
      });

      const tabId = tab.id;
      // console.log('[SERP Analyzer] Opened tab for re-extraction:', tabId);

      // Wait for page to load
      const loaded = await this.waitForPageLoad(tabId, 15000);

      if (!loaded) {
        throw new Error('Page load timeout during re-extraction');
      }

      // Extract content
      const extractedData = await this.extractPageContent(tabId);

      if (!extractedData || !extractedData.sections || extractedData.sections.length === 0) {
        throw new Error('No content extracted during re-extraction');
      }

      // Build full text
      const fullText = extractedData.sections
        .map(section => `${section.heading ? section.heading + ' ' : ''}${section.content}`)
        .join(' ');

      // Create extracted content structure
      result.extractedContent = {
        sections: extractedData.sections,
        fullText: fullText,
        metadata: {
          sectionCount: extractedData.sections.length,
          totalWords: fullText.split(/\s+/).filter(w => w.length > 0).length,
          hasHeadings: extractedData.sections.some(s => s.heading && s.heading.trim().length > 0)
        }
      };

      // Also update sections field for consistency
      result.sections = extractedData.sections;

      // console.log('[SERP Analyzer] ✅ Content re-extracted:', {
      //   sections: result.extractedContent.sections.length,
      //   words: result.extractedContent.metadata.totalWords
      // });

      // Update cache with new extracted content
      await this.updateCachedResult(result.url, result);

      // Close tab
      await chrome.tabs.remove(tabId);
      // console.log('[SERP Analyzer] Closed re-extraction tab');

      return result;

    } catch (error) {
      console.error('[SERP Analyzer] ❌ Re-extraction failed for:', result.url, error);
      
      // Fallback: Create minimal extractedContent from existing sections if available
      if (result.sections && result.sections.length > 0) {
        // console.log('[SERP Analyzer] ⚠️ Using existing sections as fallback');
        const fullText = result.sections
          .map(section => `${section.heading ? section.heading + ' ' : ''}${section.content}`)
          .join(' ');
        
        result.extractedContent = {
          sections: result.sections,
          fullText: fullText,
          metadata: {
            sectionCount: result.sections.length,
            totalWords: fullText.split(/\s+/).filter(w => w.length > 0).length,
            hasHeadings: result.sections.some(s => s.heading && s.heading.trim().length > 0)
          }
        };
      }
      
      return result;
    }
  }

  /**
   * Update specific fields in cached result
   */
  async updateCachedResult(url, updatedData) {
    try {
      const cache = await storage.read(this.CACHE_FILE) || {};
      
      if (cache[url]) {
        // Merge updated data with existing cache entry
        cache[url].data = {
          ...cache[url].data,
          ...updatedData
        };
        
        await storage.write(this.CACHE_FILE, cache);
        // console.log('[SERP Analyzer] ✅ Updated cache for:', url);
      }
    } catch (error) {
      console.error('[SERP Analyzer] Failed to update cache:', error);
    }
  }

  /**
   * Start SERP analysis (with parallel processing)
   * @param {Array} urls - Array of {url, title, snippet, position}
   * @param {string} searchQuery - Original search query
   * @param {number} tabId - Google search tab ID
   * @returns {Promise<Array>} Analysis results
   */
  async analyzeSearchResults(urls, searchQuery, tabId) {
    // console.log('[SERP Analyzer] Starting PARALLEL analysis for', urls.length, 'URLs');
    // console.log('[SERP Analyzer] Search query:', searchQuery);

    const results = [];
    const PARALLEL_LIMIT = 3; // Process 3 tabs simultaneously

    this.activeAnalysis = {
      total: urls.length,
      processed: 0,
      cancelled: false
    };

    // Process URLs in batches of 3
    for (let i = 0; i < urls.length; i += PARALLEL_LIMIT) {
      // Check if cancelled
      if (this.activeAnalysis.cancelled) {
        // console.log('[SERP Analyzer] Analysis cancelled');
        break;
      }

      const batch = urls.slice(i, i + PARALLEL_LIMIT);
      // console.log(`[SERP Analyzer] 🚀 Processing batch ${Math.floor(i / PARALLEL_LIMIT) + 1}: ${batch.length} URLs in parallel`);

      // Create promises for parallel processing
      const batchPromises = batch.map(async (urlData) => {
        try {
          // Send progress update
          this.sendProgress(tabId, {
            status: 'analyzing',
            current: this.activeAnalysis.processed + 1,
            total: urls.length,
            currentUrl: urlData.url,
            currentTitle: urlData.title
          });

          // Check cache first (OPFS persistent cache)
          const cachedResult = await this.getCachedResult(urlData.url);
          if (cachedResult) {
            // console.log('[SERP Analyzer] 📦 Using cached result for:', urlData.url, '(', cachedResult.cacheAge, ')');
            this.activeAnalysis.processed++;
            return cachedResult;
          }

          // Analyze this URL (live)
          // console.log('[SERP Analyzer] 🔴 LIVE analysis for:', urlData.url);
          const analysisResult = await this.analyzeSinglePage(urlData, searchQuery);
          
          this.activeAnalysis.processed++;

          if (analysisResult) {
            // Add metadata
            analysisResult.fromCache = false;
            analysisResult.cachedAt = Date.now();
            analysisResult.cacheAge = 'just now';
            
            // Save to cache (OPFS)
            await this.saveCachedResult(urlData.url, analysisResult);
            
            return analysisResult;
          }

          return null;

        } catch (error) {
          console.error('[SERP Analyzer] Failed to analyze:', urlData.url, error);
          this.activeAnalysis.processed++;
          
          // Return error result
          return {
            url: urlData.url,
            title: urlData.title,
            snippet: urlData.snippet,
            position: urlData.position,
            error: true,
            errorMessage: error.message || 'Failed to analyze page',
            relevanceScore: 0,
            summary: 'Could not analyze this page.',
            sections: [],
            fromCache: false
          };
        }
      });

      // Wait for all URLs in this batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect successful results
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      });

      // console.log(`[SERP Analyzer] ✅ Batch complete. Total results so far: ${results.length}/${urls.length}`);
    }

    this.activeAnalysis = null;

    // console.log('[SERP Analyzer] 🎉 All analysis complete. Results:', results.length);
    return results;
  }

  /**
   * Analyze a single page
   */
  async analyzeSinglePage(urlData, searchQuery) {
    // console.log('[SERP Analyzer] Analyzing:', urlData.url);

    let tabId = null;

    try {
      // 1. Open tab in background
      const tab = await chrome.tabs.create({
        url: urlData.url,
        active: false // Open in background
      });

      tabId = tab.id;
      // console.log('[SERP Analyzer] Opened tab:', tabId);

      // 2. Wait for page to load (with timeout)
      const loaded = await this.waitForPageLoad(tabId, 15000); // 15 second timeout

      if (!loaded) {
        throw new Error('Page load timeout');
      }

      // 3. Extract content from the page
      const extractedData = await this.extractPageContent(tabId);

      if (!extractedData || !extractedData.sections || extractedData.sections.length === 0) {
        throw new Error('No content extracted from page');
      }

      // console.log('[SERP Analyzer] Extracted', extractedData.sections.length, 'sections');

      // 4. Generate summary (with query context for relevance)
      const summary = await this.generateSummary(extractedData.sections, searchQuery);

      // 5. Calculate relevance score
      const relevanceScore = this.calculateRelevance(extractedData.sections, searchQuery, summary);

      // console.log('[SERP Analyzer] Relevance score:', relevanceScore);

      // 6. Build full text from sections for BM25
      const fullText = extractedData.sections
        .map(section => `${section.heading ? section.heading + ' ' : ''}${section.content}`)
        .join(' ');

      // 7. Prepare extracted content for multi-page chat
      const extractedContent = {
        sections: extractedData.sections,
        fullText: fullText,
        metadata: {
          sectionCount: extractedData.sections.length,
          totalWords: fullText.split(/\s+/).filter(w => w.length > 0).length,
          hasHeadings: extractedData.sections.some(s => s.heading && s.heading.trim().length > 0)
        }
      };

      // console.log('[SERP Analyzer] ✅ Extracted content prepared:', {
      //   sections: extractedContent.sections.length,
      //   words: extractedContent.metadata.totalWords,
      //   hasHeadings: extractedContent.metadata.hasHeadings
      // });

      return {
        url: urlData.url,
        title: extractedData.title || urlData.title,
        snippet: urlData.snippet,
        position: urlData.position,
        summary: summary,
        sections: extractedData.sections, // Keep for backward compatibility
        relevanceScore: relevanceScore,
        timestamp: Date.now(),
        error: false,
        extractedContent: extractedContent // NEW: Full content for multi-page chat
      };

    } catch (error) {
      console.error('[SERP Analyzer] Error analyzing page:', error);
      throw error;

    } finally {
      // Always close the tab
      if (tabId) {
        try {
          await chrome.tabs.remove(tabId);
          // console.log('[SERP Analyzer] Closed tab:', tabId);
        } catch (e) {
          console.error('[SERP Analyzer] Failed to close tab:', e);
        }
      }
    }
  }

  /**
   * Wait for page to finish loading
   */
  async waitForPageLoad(tabId, timeout = 15000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeout);

      const listener = (updatedTabId, changeInfo, tab) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          cleanup();
          resolve(true);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  /**
   * Extract content from a tab
   */
  async extractPageContent(tabId) {
    try {
      // Inject content script if needed
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/content-script.js']
      });

      // Wait a bit for injection
      await new Promise(resolve => setTimeout(resolve, 500));

      // Request content extraction
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'EXTRACT_CONTENT'
      });

      // CRITICAL FIX: Content script returns sections with .text field
      // but the rest of the code expects .content field
      // Transform text → content for consistency
      if (response && response.sections) {
        response.sections = response.sections.map(section => ({
          ...section,
          content: section.text || section.content || '', // Use text if available, fallback to content or empty
          text: section.text // Keep original for backward compatibility
        }));
      }

      return response;

    } catch (error) {
      console.error('[SERP Analyzer] Failed to extract content:', error);
      throw error;
    }
  }

  /**
   * Generate summary using Chrome Summarizer API
   */
  async generateSummary(sections, searchQuery = null) {
    try {
      // console.log('[SERP Analyzer] Starting summarization for', sections.length, 'sections');
      
      // Check if Summarizer API is available (same check as summarizer-worker.js)
      if (!('Summarizer' in self)) {
        console.warn('[SERP Analyzer] ⚠️ Chrome Summarizer API not available, using fallback');
        return this.createFallbackSummary(sections);
      }

      // Combine section text (limit to avoid quota)
      const combinedText = sections
        .slice(0, 10) // First 10 sections
        .map(s => `${s.heading}: ${s.text}`)
        .join('\n\n')
        .slice(0, 4000); // Limit to 4000 chars

      // console.log('[SERP Analyzer] Combined text length:', combinedText.length, 'chars');
      // console.log('[SERP Analyzer] Text preview:', combinedText.substring(0, 200) + '...');

      // Create summarizer options
      const summarizerOptions = {
        type: 'key-points',  // Using 'key-points' instead of 'tl;dr' (matches summarizer-worker.js line 99)
        format: 'plain-text',
        length: 'long'
      };

      // 🎯 Add query as shared context for query-aware summarization
      if (searchQuery && searchQuery.trim().length > 0) {
        summarizerOptions.sharedContext = `The user is researching: "${searchQuery}". Focus the summary on information relevant to answering this query.`;
        // console.log('[SERP Analyzer] Using query-aware summarization with context:', searchQuery);
      }

      // Create summarizer (using global Summarizer API, same as summarizer-worker.js)
      // console.log('[SERP Analyzer] Creating summarizer...');
      const summarizer = await Summarizer.create(summarizerOptions);

      // Generate summary
      // console.log('[SERP Analyzer] Generating summary...');
      const summary = await summarizer.summarize(combinedText);
      
      await summarizer.destroy();

      // console.log('[SERP Analyzer] ✅ Summary generated:', summary.substring(0, 150) + '...');
      return summary || this.createFallbackSummary(sections);

    } catch (error) {
      console.error('[SERP Analyzer] ❌ Summarization failed:', error);
      console.error('[SERP Analyzer] Error stack:', error.stack);
      return this.createFallbackSummary(sections);
    }
  }

  /**
   * Create fallback summary when AI is not available
   */
  createFallbackSummary(sections) {
    // console.log('[SERP Analyzer] 📝 Creating fallback summary from', sections?.length, 'sections');
    
    if (!sections || sections.length === 0) {
      return 'No content available.';
    }

    // Strategy: Create an intelligent summary by:
    // 1. Prioritize intro/overview sections
    // 2. Take key points from multiple sections
    // 3. Avoid duplication
    
    const summaryParts = [];
    let totalChars = 0;
    const maxChars = 800; // Target summary length
    
    // First, try to find an introduction or overview section
    const introSection = sections.find(s => 
      s.heading && (
        s.heading.toLowerCase().includes('introduction') ||
        s.heading.toLowerCase().includes('overview') ||
        s.heading.toLowerCase().includes('about')
      )
    );
    
    if (introSection && introSection.text) {
      const excerpt = this.extractKeyExcerpt(introSection.text, 300);
      summaryParts.push(excerpt);
      totalChars += excerpt.length;
      // console.log('[SERP Analyzer] Added intro section:', introSection.heading);
    }
    
    // Add content from other important sections
    for (const section of sections) {
      if (totalChars >= maxChars) break;
      
      // Skip if this is the intro we already added
      if (introSection && section === introSection) continue;
      
      // Skip very short sections (likely navigation/metadata)
      if (!section.text || section.text.length < 50) continue;
      
      // Calculate remaining space
      const remaining = maxChars - totalChars;
      if (remaining < 100) break; // Not enough space
      
      // Extract a meaningful excerpt
      const excerpt = this.extractKeyExcerpt(section.text, remaining);
      
      if (excerpt.length > 20) { // Only add if we got something meaningful
        summaryParts.push(excerpt);
        totalChars += excerpt.length;
        // console.log('[SERP Analyzer] Added section:', section.heading, '(', excerpt.length, 'chars)');
      }
      
      // Stop if we have enough content from 3-4 sections
      if (summaryParts.length >= 4) break;
    }
    
    const finalSummary = summaryParts.join(' ');
    // console.log('[SERP Analyzer] Fallback summary created:', finalSummary.length, 'chars from', summaryParts.length, 'sections');
    
    return finalSummary || 'Unable to generate summary from page content.';
  }
  
  /**
   * Extract a key excerpt from text (first complete sentences up to maxLength)
   */
  extractKeyExcerpt(text, maxLength) {
    if (!text) return '';
    
    // Clean up text
    text = text.trim().replace(/\s+/g, ' ');
    
    if (text.length <= maxLength) {
      return text;
    }
    
    // Try to break at sentence boundaries
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let excerpt = '';
    
    for (const sentence of sentences) {
      if (excerpt.length + sentence.length > maxLength) {
        break;
      }
      excerpt += sentence;
    }
    
    // If no complete sentences fit, just truncate
    if (excerpt.length === 0) {
      excerpt = text.substring(0, maxLength - 3) + '...';
    }
    
    return excerpt.trim();
  }

  /**
   * Calculate relevance score using BM25-like algorithm
   */
  calculateRelevance(sections, searchQuery, summary) {
    try {
      const queryTokens = this.tokenize(searchQuery.toLowerCase());
      
      // Combine all text
      const allText = [
        summary,
        ...sections.map(s => `${s.heading} ${s.text}`)
      ].join(' ').toLowerCase();

      const docTokens = this.tokenize(allText);

      // Calculate term frequency
      const termFreq = new Map();
      for (const token of docTokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
      }

      // Calculate score
      let score = 0;
      let matchedTerms = 0;

      for (const token of queryTokens) {
        const freq = termFreq.get(token) || 0;
        if (freq > 0) {
          matchedTerms++;
          // TF-IDF style scoring
          score += Math.log(1 + freq);
        }
      }

      // Normalize to 0-100 scale
      const matchRatio = matchedTerms / queryTokens.length;
      const normalizedScore = Math.min(100, (matchRatio * 50) + (score * 10));

      return Math.round(normalizedScore);

    } catch (error) {
      console.error('[SERP Analyzer] Relevance calculation failed:', error);
      return 50; // Default middle score
    }
  }

  /**
   * Simple tokenizer
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  /**
   * Send progress update to sidebar
   */
  sendProgress(tabId, progressData) {
    try {
      chrome.runtime.sendMessage({
        type: 'SERP_ANALYSIS_PROGRESS',
        data: progressData,
        tabId: tabId
      });
    } catch (error) {
      console.error('[SERP Analyzer] Failed to send progress:', error);
    }
  }

  /**
   * Cancel active analysis
   */
  cancelAnalysis() {
    if (this.activeAnalysis) {
      this.activeAnalysis.cancelled = true;
      // console.log('[SERP Analyzer] Analysis cancelled by user');
      return true;
    }
    return false;
  }

  /**
   * Clear entire cache (OPFS)
   */
  async clearCache() {
    try {
      await storage.deleteFile(this.CACHE_FILE);
      // console.log('[SERP Analyzer] ✅ Cache cleared from OPFS');
    } catch (error) {
      console.error('[SERP Analyzer] Failed to clear cache:', error);
    }
  }

  /**
   * Force refresh a single URL (bypass cache)
   */
  async forceRefreshUrl(urlData, searchQuery) {
    // console.log('[SERP Analyzer] 🔄 Force refreshing:', urlData.url);
    
    try {
      // Analyze page (bypass cache)
      const analysisResult = await this.analyzeSinglePage(urlData, searchQuery);
      
      if (analysisResult) {
        // Add metadata
        analysisResult.fromCache = false;
        analysisResult.cachedAt = Date.now();
        analysisResult.cacheAge = 'just now';
        
        // Update cache
        await this.saveCachedResult(urlData.url, analysisResult);
        
        // console.log('[SERP Analyzer] ✅ Force refresh complete for:', urlData.url);
        return analysisResult;
      }
      
      throw new Error('Failed to analyze page');
    } catch (error) {
      console.error('[SERP Analyzer] Force refresh failed:', error);
      throw error;
    }
  }

  /**
   * Compare results - Prepare data for comparison
   * NOTE: Worker creation must happen in sidebar context (not service worker)
   * This method just ensures all results have full content
   * @param {Array} results - Array of analysis results
   * @returns {Promise<Array>} Results with full content
   */
  async prepareResultsForComparison(results) {
    // console.log('[SERP Analyzer] Preparing', results.length, 'results for comparison');
    
    try {
      // Ensure all results have full content (auto re-extract if needed)
      // console.log('[SERP Analyzer] Ensuring all results have full content...');
      const resultsWithContent = await Promise.all(
        results.map(result => this.ensureFullContent(result))
      );
      
      // console.log('[SERP Analyzer] ✅ All results have full content');
      return resultsWithContent;
      
    } catch (error) {
      console.error('[SERP Analyzer] Failed to prepare results:', error);
      throw error;
    }
  }

  /**
   * Create fallback comparison when AI is not available
   */
  createFallbackComparison(results, question) {
    // console.log('[SERP Analyzer] 📝 Creating fallback comparison');
    
    let comparison = `**Comparison Results**\n\n`;
    comparison += `Question: *${question}*\n\n`;
    comparison += `Here's what each source says:\n\n`;
    
    results.forEach((result, index) => {
      const title = result.title || 'Untitled Page';
      const summary = result.summary || 'No content available.';
      
      // Extract domain name
      let domain = result.url;
      try {
        const urlObj = new URL(result.url);
        domain = urlObj.hostname.replace('www.', '');
      } catch (e) {
        domain = `Source ${index + 1}`;
      }
      
      comparison += `**${domain}**\n`;
      comparison += `${title}\n`;
      comparison += `${summary.substring(0, 300)}${summary.length > 300 ? '...' : ''}\n\n`;
    });
    
    comparison += `\n💡 *Note: AI comparison is not available. The above shows summaries from each source. Enable Chrome AI to get intelligent comparisons.*`;
    
    return comparison;
  }

  /**
   * Clear ALL SERP cache (for debugging/fixing corrupt cache)
   * Use this when cached data is corrupt or has wrong format
   */
  async clearAllCache() {
    try {
      // console.log('[SERP Analyzer] 🗑️ Clearing ALL SERP cache...');
      await storage.write(this.CACHE_FILE, {});
      // console.log('[SERP Analyzer] ✅ All cache cleared - next analysis will be fresh');
      return true;
    } catch (error) {
      console.error('[SERP Analyzer] Failed to clear all cache:', error);
      return false;
    }
  }
}

// Create singleton instance
export const serpAnalyzer = new SerpAnalyzer();

