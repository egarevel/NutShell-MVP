/**
 * Multi-Page BM25 Retrieval System
 * Implements BM25 algorithm for retrieving relevant sections across multiple documents
 * Each section is tracked with its source URL for citations
 */

export class MultiPageBM25 {
  constructor() {
    this.documents = []; // Array of { id, url, title, sections }
    this.invertedIndex = new Map(); // term -> [{ docId, sectionIdx, freq }]
    this.docLengths = new Map(); // sectionId -> length in tokens
    this.avgDocLength = 0;
    this.totalSections = 0;
    
    // BM25 parameters
    this.k1 = 1.5; // Term frequency saturation parameter
    this.b = 0.75; // Length normalization parameter
  }

  /**
   * Add a document to the index
   * @param {string} docId - Unique document identifier
   * @param {string} url - Source URL for citations
   * @param {string} title - Page title
   * @param {Array} sections - Array of {heading, content}
   */
  addDocument(docId, url, title, sections) {
    // console.log(`[Multi-Page BM25] Indexing document: ${docId} (${sections.length} sections)`);
    
    this.documents.push({ 
      id: docId, 
      url, 
      title,
      sections 
    });

    // Index each section separately
    sections.forEach((section, sectionIdx) => {
      // Use '::' as separator to avoid conflicts with docId that might contain '_'
      const sectionId = `${docId}::${sectionIdx}`;
      const text = `${section.heading || ''} ${section.content}`.toLowerCase();
      const tokens = this.tokenize(text);
      
      // Store section length
      this.docLengths.set(sectionId, tokens.length);
      this.totalSections++;

      // Build term frequency map for this section
      const termFreq = new Map();
      tokens.forEach(token => {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
      });

      // Add to inverted index
      termFreq.forEach((freq, term) => {
        if (!this.invertedIndex.has(term)) {
          this.invertedIndex.set(term, []);
        }
        this.invertedIndex.get(term).push({
          docId,
          sectionIdx,
          freq
        });
      });
    });

    // Update average document length
    this.calculateAvgDocLength();
    
    // console.log(`[Multi-Page BM25] ✅ Indexed ${docId}: ${sections.length} sections, ${this.invertedIndex.size} unique terms`);
  }

  /**
   * Calculate average document length across all sections
   */
  calculateAvgDocLength() {
    if (this.docLengths.size === 0) {
      this.avgDocLength = 0;
      return;
    }

    let totalLength = 0;
    this.docLengths.forEach(length => {
      totalLength += length;
    });
    
    this.avgDocLength = totalLength / this.docLengths.size;
  }

  /**
   * Search across all documents
   * @param {string} query - Search query
   * @param {number} topK - Number of top results to return
   * @returns {Array} - Array of {content, heading, score, url, docId, domain}
   */
  search(query, topK = 5) {
    // console.log(`[Multi-Page BM25] Searching for: "${query}"`);
    
    const queryTokens = this.tokenize(query.toLowerCase());
    // console.log(`[Multi-Page BM25] Query tokens:`, queryTokens);
    
    const scores = new Map(); // sectionId -> score

    // Calculate BM25 score for each section
    queryTokens.forEach(queryTerm => {
      if (!this.invertedIndex.has(queryTerm)) {
        return; // Term not in any document
      }

      const postings = this.invertedIndex.get(queryTerm);
      const idf = this.calculateIDF(postings.length);

      postings.forEach(posting => {
        // Use '::' separator to match indexing format
        const sectionId = `${posting.docId}::${posting.sectionIdx}`;
        const docLength = this.docLengths.get(sectionId) || 1;
        const termFreq = posting.freq;

        // BM25 formula
        const numerator = termFreq * (this.k1 + 1);
        const denominator = termFreq + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
        const score = idf * (numerator / denominator);

        scores.set(sectionId, (scores.get(sectionId) || 0) + score);
      });
    });

    // console.log(`[Multi-Page BM25] Scored ${scores.size} sections`);

    // Get top K results with metadata
    const results = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by score descending
      .slice(0, topK)
      .map(([sectionId, score]) => {
        // Split by '::' separator
        const [docId, sectionIdx] = sectionId.split('::');
        const doc = this.documents.find(d => d.id === docId);
        
        // Defensive check: ensure doc exists
        if (!doc) {
          console.error(`[Multi-Page BM25] ❌ Document not found: ${docId}`);
          return null;
        }
        
        const section = doc.sections[parseInt(sectionIdx)];
        
        // Defensive check: ensure section exists
        if (!section) {
          console.error(`[Multi-Page BM25] ❌ Section not found: ${docId}::${sectionIdx}`);
          return null;
        }
        
        // Extract domain from URL for cleaner citations
        let domain = doc.url;
        try {
          const urlObj = new URL(doc.url);
          domain = urlObj.hostname.replace('www.', '');
        } catch (e) {
          // Keep full URL if parsing fails
        }

        return {
          content: section.content || '',  // Defensive: default to empty string
          heading: section.heading || '',
          score: score.toFixed(4),
          url: doc.url,
          docId: docId,
          domain: domain,
          pageTitle: doc.title
        };
      })
      .filter(r => r !== null);  // Remove null entries

    // console.log(`[Multi-Page BM25] ✅ Returning top ${results.length} results:`);
    results.forEach((r, i) => {
      // console.log(`  ${i + 1}. ${r.domain} (${r.heading || 'No heading'}) - Score: ${r.score}`);
    });

    return results;
  }

  /**
   * Calculate Inverse Document Frequency (IDF)
   * @param {number} docFreq - Number of documents containing the term
   * @returns {number} - IDF value
   */
  calculateIDF(docFreq) {
    // IDF formula: log((N - df + 0.5) / (df + 0.5) + 1)
    // Where N is total number of sections, df is document frequency
    const N = this.totalSections;
    return Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
  }

  /**
   * Tokenize text into terms
   * @param {string} text - Text to tokenize
   * @returns {Array} - Array of tokens
   */
  tokenize(text) {
    // Lowercase, split on non-word characters, filter empty and stop words
    const tokens = text
      .toLowerCase()
      .split(/\W+/)
      .filter(token => token.length > 0 && !this.isStopWord(token));
    
    return tokens;
  }

  /**
   * Check if word is a stop word (common words to ignore)
   * @param {string} word - Word to check
   * @returns {boolean}
   */
  isStopWord(word) {
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
      'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how'
    ]);
    
    return stopWords.has(word);
  }

  /**
   * Get statistics about the index
   * @returns {Object} - Index statistics
   */
  getStats() {
    return {
      totalDocuments: this.documents.length,
      totalSections: this.totalSections,
      uniqueTerms: this.invertedIndex.size,
      avgDocLength: this.avgDocLength.toFixed(2)
    };
  }

  /**
   * Clear all indexed data
   */
  clear() {
    this.documents = [];
    this.invertedIndex.clear();
    this.docLengths.clear();
    this.avgDocLength = 0;
    this.totalSections = 0;
    // console.log('[Multi-Page BM25] Index cleared');
  }
}

