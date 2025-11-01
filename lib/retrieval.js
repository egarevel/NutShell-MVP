/**
 * Retrieval System - BM25 for RAG
 * Universal implementation that works across any content type
 */

/**
 * BM25 Retriever Class
 * Implements standard BM25 with intelligent heading-based boosting
 */
export class BM25Retriever {
  constructor(sections) {
    this.sections = sections || [];
    this.k1 = 1.5; // Term frequency saturation parameter
    this.b = 0.75; // Length normalization parameter
    this.index = null;
    this.avgDocLength = 0;
    
    if (sections.length > 0) {
      this.buildIndex();
    }
  }
  
  /**
   * Tokenize text into terms
   */
  tokenize(text) {
    if (!text) return [];
    
    // Basic stopwords (very common words that don't help with relevance)
    const stopwords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ') // Keep hyphens for compound words
      .split(/\s+/)
      .filter(term => {
        // Keep terms that are:
        // - Not stopwords, OR
        // - Longer than 2 characters (like "ai", "ml"), OR
        // - All caps acronyms
        return term.length > 0 && (!stopwords.has(term) || term.length === 2 || term === term.toUpperCase());
      });
  }
  
  /**
   * Build inverted index and calculate IDF
   */
  buildIndex() {
    // console.log('[Retrieval] Building BM25 index for', this.sections.length, 'sections');
    
    // Tokenize all documents
    // Strategy: Boost headings by including them multiple times in the token pool
    const tokenizedDocs = this.sections.map((section, idx) => {
      const heading = section.heading || '';
      const text = section.text || '';
      
      // Repeat heading tokens to give them more weight (3x)
      // This naturally boosts sections where query matches the heading
      // If heading is empty, headingTokens will be empty array (no boost)
      const headingTokens = this.tokenize(heading);
      const textTokens = this.tokenize(text);
      const combinedTokens = [
        ...headingTokens,
        ...headingTokens,
        ...headingTokens,
        ...textTokens
      ];
      
      // Ensure we have at least some tokens (from text if not from heading)
      if (combinedTokens.length === 0) {
        console.warn(`[Retrieval] Section ${idx} has no tokens (empty heading and text):`, section.id);
      }
      
      return {
        id: section.id,
        tokens: combinedTokens,
        length: Math.max(combinedTokens.length, 1), // Ensure length is at least 1 to avoid division by zero
        heading,
        headingTokens,
        position: idx
      };
    });
    
    // Calculate average document length
    const totalLength = tokenizedDocs.reduce((sum, doc) => sum + doc.length, 0);
    this.avgDocLength = totalLength / tokenizedDocs.length;
    
    // Build inverted index: term -> list of (docId, frequency)
    const index = {};
    tokenizedDocs.forEach((doc, docIdx) => {
      const termFreq = {};
      
      // Count term frequencies in this document
      doc.tokens.forEach(term => {
        termFreq[term] = (termFreq[term] || 0) + 1;
      });
      
      // Add to inverted index
      Object.keys(termFreq).forEach(term => {
        if (!index[term]) {
          index[term] = [];
        }
        index[term].push({
          docIdx,
          docId: doc.id,
          tf: termFreq[term],
          docLength: doc.length,
          heading: doc.heading,
          headingTokens: doc.headingTokens,
          position: doc.position
        });
      });
    });
    
    // Calculate IDF for each term
    const N = this.sections.length;
    Object.keys(index).forEach(term => {
      const df = index[term].length; // Document frequency
      index[term].idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    });
    
    this.index = index;
    this.tokenizedDocs = tokenizedDocs;
    // console.log('[Retrieval] Index built with', Object.keys(index).length, 'unique terms');
  }
  
  /**
   * Calculate BM25 score for a document given query terms
   */
  calculateBM25(queryTerms, docIdx, docLength, termFreqs) {
    let score = 0;
    
    queryTerms.forEach(term => {
      const termData = this.index[term];
      if (!termData) return; // Term not in index
      
      const idf = termData.idf;
      const tf = termFreqs[term] || 0;
      
      if (tf > 0) {
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
        score += idf * (numerator / denominator);
      }
    });
    
    return score;
  }
  
  /**
   * Calculate similarity between query and heading
   * Returns a score between 0 and 1
   * Handles empty/missing headings gracefully
   */
  calculateHeadingSimilarity(queryTerms, headingTokens, heading) {
    // Handle empty heading case
    if (!heading || heading.trim().length === 0) {
      return 0;
    }
    
    if (queryTerms.length === 0 || headingTokens.length === 0) {
      return 0;
    }
    
    // Count matching tokens
    const matches = queryTerms.filter(term => headingTokens.includes(term)).length;
    const overlap = matches / queryTerms.length;
    
    // Bonus for exact phrase match
    const queryPhrase = queryTerms.join(' ');
    const headingLower = heading.toLowerCase();
    const exactMatch = headingLower.includes(queryPhrase) || queryPhrase.includes(headingLower);
    
    return exactMatch ? 1.0 : overlap;
  }
  
  /**
   * Calculate position score (early sections are more important)
   * Returns a multiplier between 1.0 and 2.0
   */
  calculatePositionScore(position, totalSections) {
    // Gradually decrease boost for later sections
    // First section: 2.0x, gradually down to 1.0x by section 20
    const normalizedPos = Math.min(position / 20, 1.0);
    return 2.0 - normalizedPos;
  }
  
  /**
   * Calculate heading specificity score
   * Shorter, more specific headings get higher scores
   * Returns a multiplier between 1.0 and 2.0
   * Handles empty/generic headings gracefully
   */
  calculateSpecificityScore(heading) {
    if (!heading || heading.trim().length === 0) {
      return 1.0; // Neutral score for missing heading
    }
    
    const wordCount = heading.trim().split(/\s+/).length;
    
    // Check for generic headings (from fallback extraction)
    const genericHeadings = ['content', 'main content', 'additional content', 'page content'];
    if (genericHeadings.includes(heading.toLowerCase())) {
      return 1.0; // Neutral score for generic headings
    }
    
    // Shorter headings (1-3 words) are usually more specific/important
    // Longer headings are usually subsections or details
    if (wordCount <= 3) {
      return 2.0;
    } else if (wordCount <= 5) {
      return 1.5;
    } else {
      return 1.0;
    }
  }
  
  /**
   * Search for relevant sections
   * @param {string} query - Search query
   * @param {number} k - Number of results to return
   * @returns {Array} - Top k sections with scores
   */
  search(query, k = 3) {
    if (!this.index || this.sections.length === 0) {
      console.warn('[Retrieval] Index not built or no sections available');
      return [];
    }
    
    const queryTerms = this.tokenize(query);
    // console.log('[Retrieval] Searching for:', query);
    // console.log('[Retrieval] Query terms:', queryTerms.join(', '));
    
    if (queryTerms.length === 0) {
      return [];
    }
    
    // Find all documents that contain at least one query term
    const relevantDocs = new Map();
    
    queryTerms.forEach(term => {
      const termData = this.index[term];
      if (termData) {
        termData.forEach(posting => {
          if (!relevantDocs.has(posting.docIdx)) {
            relevantDocs.set(posting.docIdx, {
              docIdx: posting.docIdx,
              docId: posting.docId,
              docLength: posting.docLength,
              heading: posting.heading,
              headingTokens: posting.headingTokens,
              position: posting.position,
              termFreqs: {}
            });
          }
          relevantDocs.get(posting.docIdx).termFreqs[term] = posting.tf;
        });
      }
    });
    
    if (relevantDocs.size === 0) {
      // console.log('[Retrieval] No matching documents found');
      return [];
    }
    
    // console.log('[Retrieval] Found', relevantDocs.size, 'candidate documents');
    
    // Calculate final scores using BM25 + intelligent boosting
    const scoredDocs = Array.from(relevantDocs.values()).map(doc => {
      // Base BM25 score (CONTENT is the primary factor)
      let score = this.calculateBM25(queryTerms, doc.docIdx, doc.docLength, doc.termFreqs);
      
      // Calculate boosting factors
      const headingSimilarity = this.calculateHeadingSimilarity(
        queryTerms,
        doc.headingTokens,
        doc.heading
      );
      const positionScore = this.calculatePositionScore(doc.position, this.sections.length);
      const specificityScore = this.calculateSpecificityScore(doc.heading);
      
      // NEW STRATEGY: Content-first, heading as bonus
      // Base score comes from content (BM25), heading provides moderate boost only
      
      // 1. Position matters more than heading (early sections are important)
      score *= positionScore;
      
      // 2. Heading provides a MODERATE boost (not dominant)
      // Max boost is 2.5x for perfect heading match, not 11x
      if (headingSimilarity > 0.8) {
        // Very high similarity: 2.5x boost
        score *= 2.5;
      } else if (headingSimilarity > 0.5) {
        // Good similarity: 1.5-2x boost
        score *= (1.5 + headingSimilarity);
      } else if (headingSimilarity > 0) {
        // Some similarity: 1-1.5x boost
        score *= (1.0 + headingSimilarity * 0.5);
      }
      // If headingSimilarity = 0 (no heading or no match), score unchanged (fair!)
      
      // 3. Specificity is least important (just a small adjustment)
      if (specificityScore > 1.5) {
        score *= 1.2; // Small boost for specific headings
      }
      
      const section = this.sections[doc.docIdx];
      
      return {
        section,
        score,
        headingSimilarity,
        position: doc.position
      };
    });
    
    // Sort by score and return top k
    scoredDocs.sort((a, b) => b.score - a.score);
    const topResults = scoredDocs.slice(0, k);
    
    // console.log('[Retrieval] Top', topResults.length, 'results:');
    topResults.forEach((result, idx) => {
      console.log(
        `  ${idx + 1}. "${result.section.heading}"`,
        `(score: ${result.score.toFixed(2)}, heading sim: ${(result.headingSimilarity * 100).toFixed(0)}%, pos: #${result.position})`
      );
    });
    
    return topResults;
  }
  
  /**
   * Update retriever with new sections
   */
  updateSections(sections) {
    this.sections = sections;
    if (sections.length > 0) {
      this.buildIndex();
    }
  }
}

/**
 * Create a BM25 retriever instance
 */
export function createRetriever(sections) {
  return new BM25Retriever(sections);
}
