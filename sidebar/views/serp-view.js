/**
 * SERP Analysis View
 * Displays search result analysis and comparison
 */

export class SerpView {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = {
      onBack: callbacks.onBack || (() => {}),
      onAskQuestion: callbacks.onAskQuestion || (() => {}),
      onOpenUrl: callbacks.onOpenUrl || (() => {}),
      onReAnalyze: callbacks.onReAnalyze || (() => {}),
      onCompare: callbacks.onCompare || (() => {}),
      onRefresh: callbacks.onRefresh || (() => {}),
      onDiveDeeper: callbacks.onDiveDeeper || (() => {})
    };
    
    // State for "Dive Deeper" functionality
    this.currentResults = null;
    this.currentSearchQuery = null;
    
    this.results = [];
    this.searchQuery = '';
    this.sortBy = 'relevance'; // relevance, position, title
    this.isResearchMode = false; // Flag to hide relevance in Research Mode
    
    this.render();
    this.setupEventListeners();
  }

  /**
   * Render the SERP view structure
   */
  render() {
    this.container.innerHTML = `
      <div class="serp-container">
        <!-- Header -->
        <div class="serp-header">
          <button class="icon-btn back-btn" id="serpBackBtn" title="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="serp-header-content">
            <h2 class="serp-title">Search Analysis</h2>
            <p class="serp-query" id="serpQuery"></p>
          </div>
        </div>

        <!-- Controls -->
        <div class="serp-controls">
          <div class="serp-sort">
            <label>Sort by:</label>
            <select id="serpSortSelect" class="sort-select">
              <option value="relevance">Relevance</option>
              <option value="position">Position</option>
              <option value="title">Title (A-Z)</option>
            </select>
          </div>
          <button class="secondary-btn" id="serpReAnalyzeBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M21 3v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Re-analyze
          </button>
        </div>

        <!-- Ask Quick Questions Section (Accordion) -->
        <div class="serp-accordion">
          <button class="accordion-header" id="compareAccordionHeader">
            <div class="accordion-header-content">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="accordion-icon">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <h3>Ask Quick Questions</h3>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="accordion-chevron">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="accordion-content" id="compareAccordionContent">
            <div class="serp-compare-section">
              <p class="compare-desc">Ask a question to get quick AI-powered answers across all analyzed sources</p>
              <div class="compare-input-group">
                <input type="text" id="serpCompareInput" class="compare-input" placeholder="e.g., Which is the most affordable option?" />
                <button class="primary-btn" id="serpCompareBtn">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Ask
                </button>
              </div>
              
              <!-- Comparison Result -->
              <div class="compare-result hidden" id="serpCompareResult">
                <div class="compare-result-content" id="serpCompareContent"></div>
                <button class="dive-deeper-btn hidden" id="diveDeeperBtn">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2v12M2 8l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Dive Deeper - Multi-Page Chat
                </button>
              </div>
              
              <!-- Comparison Loading -->
              <div class="compare-loading hidden" id="serpCompareLoading">
                <div class="loading-spinner"></div>
                <span>Analyzing and comparing results...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Results Section (Accordion) -->
        <div class="serp-accordion">
          <button class="accordion-header active" id="resultsAccordionHeader">
            <div class="accordion-header-content">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="accordion-icon">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 12h6M9 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <h3>Analysis Results <span class="result-count" id="resultCount">(0)</span></h3>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="accordion-chevron">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="accordion-content expanded" id="resultsAccordionContent">
            <div class="serp-results" id="serpResults"></div>
          </div>
        </div>

        <!-- Empty state -->
        <div class="serp-empty hidden" id="serpEmpty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" class="empty-icon">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p class="empty-text">No results to display</p>
        </div>

        <!-- Loading state -->
        <div class="serp-loading hidden" id="serpLoading">
          <div class="loading-spinner"></div>
          <p class="loading-text" id="serpLoadingText">Analyzing search results...</p>
        </div>
      </div>
    `;

    // Get elements
    this.elements = {
      backBtn: this.container.querySelector('#serpBackBtn'),
      query: this.container.querySelector('#serpQuery'),
      sortSelect: this.container.querySelector('#serpSortSelect'),
      reAnalyzeBtn: this.container.querySelector('#serpReAnalyzeBtn'),
      results: this.container.querySelector('#serpResults'),
      empty: this.container.querySelector('#serpEmpty'),
      loading: this.container.querySelector('#serpLoading'),
      loadingText: this.container.querySelector('#serpLoadingText'),
      compareInput: this.container.querySelector('#serpCompareInput'),
      compareBtn: this.container.querySelector('#serpCompareBtn'),
      compareResult: this.container.querySelector('#serpCompareResult'),
      compareContent: this.container.querySelector('#serpCompareContent'),
      compareLoading: this.container.querySelector('#serpCompareLoading'),
      diveDeeperBtn: this.container.querySelector('#diveDeeperBtn'),
      // Accordion elements
      compareAccordionHeader: this.container.querySelector('#compareAccordionHeader'),
      compareAccordionContent: this.container.querySelector('#compareAccordionContent'),
      resultsAccordionHeader: this.container.querySelector('#resultsAccordionHeader'),
      resultsAccordionContent: this.container.querySelector('#resultsAccordionContent'),
      resultCount: this.container.querySelector('#resultCount')
    };
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Back button
    this.elements.backBtn.addEventListener('click', () => {
      this.callbacks.onBack();
    });

    // Sort select
    this.elements.sortSelect.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.sortAndRenderResults();
    });

    // Re-analyze button
    this.elements.reAnalyzeBtn.addEventListener('click', () => {
      this.callbacks.onReAnalyze();
    });

    // Compare button
    this.elements.compareBtn.addEventListener('click', () => {
      this.handleCompareClick();
    });

    // Compare input - Enter key
    this.elements.compareInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleCompareClick();
      }
    });

    // Dive Deeper button
    this.elements.diveDeeperBtn.addEventListener('click', () => {
      this.handleDiveDeeper();
    });

    // Accordion toggles
    this.elements.compareAccordionHeader.addEventListener('click', () => {
      this.toggleAccordion('compare');
    });

    this.elements.resultsAccordionHeader.addEventListener('click', () => {
      this.toggleAccordion('results');
    });

    // Event delegation for result clicks
    this.elements.results.addEventListener('click', (e) => {
      const resultCard = e.target.closest('.result-card');
      if (!resultCard) return;

      const url = resultCard.dataset.url;
      if (!url) return;

      // Check if it's the "Open" button
      const openBtn = e.target.closest('.result-open-btn');
      if (openBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.onOpenUrl(url);
        return;
      }

      // Check if it's the "Ask about this" button
      const askBtn = e.target.closest('.result-ask-btn');
      if (askBtn) {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(resultCard.dataset.index);
        this.callbacks.onAskQuestion(this.results[index]);
        return;
      }

      // Check if it's the "Refresh" button
      const refreshBtn = e.target.closest('.result-refresh-btn');
      if (refreshBtn) {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(resultCard.dataset.index);
        this.callbacks.onRefresh(this.results[index], index);
        return;
      }
    });
  }

  /**
   * Toggle accordion section
   */
  toggleAccordion(section) {
    if (section === 'compare') {
      const isExpanded = this.elements.compareAccordionContent.classList.contains('expanded');
      
      if (isExpanded) {
        // Collapse compare
        this.elements.compareAccordionContent.classList.remove('expanded');
        this.elements.compareAccordionHeader.classList.remove('active');
      } else {
        // Expand compare, collapse results
        this.elements.compareAccordionContent.classList.add('expanded');
        this.elements.compareAccordionHeader.classList.add('active');
        this.elements.resultsAccordionContent.classList.remove('expanded');
        this.elements.resultsAccordionHeader.classList.remove('active');
      }
    } else if (section === 'results') {
      const isExpanded = this.elements.resultsAccordionContent.classList.contains('expanded');
      
      if (isExpanded) {
        // Collapse results
        this.elements.resultsAccordionContent.classList.remove('expanded');
        this.elements.resultsAccordionHeader.classList.remove('active');
      } else {
        // Expand results, collapse compare
        this.elements.resultsAccordionContent.classList.add('expanded');
        this.elements.resultsAccordionHeader.classList.add('active');
        this.elements.compareAccordionContent.classList.remove('expanded');
        this.elements.compareAccordionHeader.classList.remove('active');
      }
    }
  }

  /**
   * Set search query
   */
  setQuery(query) {
    this.searchQuery = query;
    this.elements.query.textContent = `"${query}"`;
  }

  /**
   * Set results
   */
  /**
   * Set results
   * @param {Array} results - Array of result objects
   * @param {boolean} isResearchMode - Whether this is Research Mode (hides relevance)
   */
  setResults(results, isResearchMode = false) {
    this.results = results;
    this.isResearchMode = isResearchMode;
    this.elements.resultCount.textContent = `(${results.length})`;
    this.sortAndRenderResults();
  }

  /**
   * Sort and render results
   */
  sortAndRenderResults() {
    // Sort results
    const sorted = [...this.results];

    switch (this.sortBy) {
      case 'relevance':
        sorted.sort((a, b) => b.relevanceScore - a.relevanceScore);
        break;
      case 'position':
        sorted.sort((a, b) => a.position - b.position);
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }

    // Render
    this.renderResults(sorted);
  }

  /**
   * Render results
   */
  renderResults(results) {
    if (!results || results.length === 0) {
      this.showEmpty();
      return;
    }

    this.hideEmpty();
    this.hideLoading();

    this.elements.results.innerHTML = results.map((result, index) => {
      return this.createResultCard(result, index, !this.isResearchMode);
    }).join('');
  }

  /**
   * Create result card HTML
   * @param {Object} result - Result data
   * @param {number} index - Result index
   * @param {boolean} showRelevance - Whether to show relevance score (default: true)
   */
  createResultCard(result, index, showRelevance = true) {
    const relevanceClass = this.getRelevanceClass(result.relevanceScore);
    const relevanceEmoji = this.getRelevanceEmoji(result.relevanceScore);
    const cacheStatus = result.fromCache ? 
      `<span class="cache-badge cache-badge-cached" title="Loaded from cache">📦 Cached ${result.cacheAge}</span>` : 
      `<span class="cache-badge cache-badge-live" title="Freshly analyzed">🔴 Live</span>`;
    
    // Only show relevance if enabled AND it's defined
    const relevanceHtml = (showRelevance && result.relevanceScore !== undefined && result.relevanceScore !== null) ? `
          <div class="result-relevance">
            <span class="relevance-label">Relevance:</span>
            <div class="relevance-bar">
              <div class="relevance-fill ${relevanceClass}" style="width: ${result.relevanceScore}%"></div>
            </div>
            <span class="relevance-score">${relevanceEmoji} ${result.relevanceScore}%</span>
          </div>` : '';
    
    return `
      <div class="result-card ${result.error ? 'result-error' : ''}" data-url="${result.url}" data-index="${index}">
        <!-- Cache Status Badge -->
        <div class="result-cache-status">
          ${cacheStatus}
        </div>
        
        <!-- Rank Badge -->
        <div class="result-rank ${relevanceClass}">
          <span class="rank-number">#${index + 1}</span>
        </div>

        <!-- Content -->
        <div class="result-content">
          <!-- Title -->
          <h3 class="result-title">${this.escapeHtml(result.title)}</h3>
          
          <!-- URL -->
          <a href="${result.url}" class="result-url" target="_blank" rel="noopener noreferrer">
            ${this.getDomain(result.url)}
          </a>

          <!-- Relevance Score -->
          ${relevanceHtml}

          <!-- Summary -->
          ${!result.error ? `
            <div class="result-summary">
              <p class="summary-text">${this.escapeHtml(result.summary)}</p>
            </div>
          ` : `
            <div class="result-error-msg">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              ${this.escapeHtml(result.errorMessage || 'Failed to analyze')}
            </div>
          `}

          <!-- Actions -->
          <div class="result-actions">
            <button class="result-ask-btn" ${result.error ? 'disabled' : ''}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Ask about this
            </button>
            <button class="result-refresh-btn" title="Refresh from live page">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 3v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Refresh
            </button>
            <button class="result-open-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Open
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get relevance class
   */
  getRelevanceClass(score) {
    if (score >= 80) return 'relevance-high';
    if (score >= 60) return 'relevance-medium';
    return 'relevance-low';
  }

  /**
   * Get relevance emoji
   */
  getRelevanceEmoji(score) {
    if (score >= 90) return '🥇';
    if (score >= 80) return '🥈';
    if (score >= 70) return '🥉';
    if (score >= 60) return '⭐';
    return '📄';
  }

  /**
   * Get domain from URL
   */
  getDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (e) {
      return url;
    }
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show loading state
   */
  showLoading(text = 'Analyzing search results...') {
    this.elements.loading.classList.remove('hidden');
    this.elements.results.classList.add('hidden');
    this.elements.empty.classList.add('hidden');
    this.elements.loadingText.textContent = text;
  }

  /**
   * Hide loading state
   */
  hideLoading() {
    this.elements.loading.classList.add('hidden');
    this.elements.results.classList.remove('hidden');
  }

  /**
   * Show empty state
   */
  showEmpty() {
    this.elements.empty.classList.remove('hidden');
    this.elements.results.classList.add('hidden');
    this.elements.loading.classList.add('hidden');
  }

  /**
   * Hide empty state
   */
  hideEmpty() {
    this.elements.empty.classList.add('hidden');
  }

  /**
   * Update progress
   */
  updateProgress(current, total, currentTitle) {
    const text = `Analyzing ${current}/${total}: ${currentTitle}`;
    this.showLoading(text);
  }

  /**
   * Clear view
   */
  clear() {
    this.results = [];
    this.searchQuery = '';
    this.sortBy = 'relevance';
    this.elements.sortSelect.value = 'relevance';
    this.showEmpty();
  }

  /**
   * Handle compare button click
   */
  handleCompareClick() {
    const question = this.elements.compareInput.value.trim();
    
    if (!question) {
      this.elements.compareInput.focus();
      return;
    }
    
    if (this.results.length === 0) {
      alert('No results to compare. Please analyze search results first.');
      return;
    }
    
    // Call the comparison callback
    this.callbacks.onCompare(question, this.results, this.searchQuery);
  }

  /**
   * Show comparison loading
   */
  showCompareLoading() {
    this.elements.compareResult.classList.add('hidden');
    this.elements.compareLoading.classList.remove('hidden');
    this.elements.compareBtn.disabled = true;
    this.elements.diveDeeperBtn.classList.add('hidden'); // Hide Dive Deeper button
    this._hasScrolledToResult = false; // Reset scroll flag for new comparison
    
    // Store results and query for "Dive Deeper"
    this.currentResults = this.results;
    this.currentSearchQuery = this.searchQuery;
    // console.log('[SerpView] Stored results for Dive Deeper:', {
    //   results: this.currentResults?.length,
    //   query: this.currentSearchQuery
    // });
  }

  /**
   * Hide comparison loading
   */
  hideCompareLoading() {
    this.elements.compareLoading.classList.add('hidden');
    this.elements.compareBtn.disabled = false;
  }

  /**
   * Display comparison result (streaming-friendly)
   * @param {string} comparison - The comparison text (can be partial during streaming)
   * @param {boolean} isComplete - Whether this is the final result
   */
  displayComparison(comparison, isComplete = false) {
    // console.log('[SerpView] displayComparison called, isComplete:', isComplete, 'text length:', comparison.length);
    // console.log('[SerpView] compareResult hidden?', this.elements.compareResult.classList.contains('hidden'));
    
    // Show result container (hide loading on first chunk)
    if (this.elements.compareResult.classList.contains('hidden')) {
      // console.log('[SerpView] 🔧 First chunk - removing hidden class from compareResult');
      this.elements.compareResult.classList.remove('hidden');
      this.elements.compareLoading.classList.add('hidden');
      // console.log('[SerpView] ✅ Classes updated - compareResult should now be visible');
    }
    
    // During streaming, show raw text for performance
    // Only format markdown when complete
    if (isComplete) {
      // console.log('[SerpView] Complete - formatting markdown');
      const formattedComparison = this.formatMarkdown(comparison);
      this.elements.compareContent.innerHTML = formattedComparison;
      this.hideCompareLoading(); // Re-enable button
      
      // Show "Dive Deeper" button after comparison completes
      this.elements.diveDeeperBtn.classList.remove('hidden');
      // console.log('[SerpView] ✅ Dive Deeper button shown');
    } else {
      // console.log('[SerpView] Streaming - setting textContent:', comparison.substring(0, 50) + '...');
      this.elements.compareContent.textContent = comparison;
    }
    
    // Auto-scroll to show latest content
    requestAnimationFrame(() => {
      // Scroll the compare result container to bottom
      this.elements.compareResult.scrollTop = this.elements.compareResult.scrollHeight;
      
      // Also scroll into view if needed (first time)
      if (!this._hasScrolledToResult) {
        this.elements.compareResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        this._hasScrolledToResult = true;
      }
    });
  }

  /**
   * Format markdown text to HTML (simple implementation)
   */
  formatMarkdown(text) {
    return text
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Line breaks
      .replace(/\n/g, '<br>');
  }

  /**
   * Handle "Dive Deeper" button click
   * Opens multi-page chat with the comparison question pre-loaded
   */
  handleDiveDeeper() {
    // console.log('[SerpView] Dive Deeper clicked');
    
    // Get the current comparison question
    const question = this.elements.compareInput.value.trim();
    
    if (!question) {
      console.warn('[SerpView] No question to dive deeper with');
      return;
    }
    
    // Get the current comparison answer
    const answer = this.elements.compareContent.textContent || this.elements.compareContent.innerHTML;
    
    if (!this.currentResults || this.currentResults.length === 0) {
      console.warn('[SerpView] No results to chat with');
      return;
    }
    
    // console.log('[SerpView] Starting multi-page chat with:', {
    //   question,
    //   answerLength: answer.length,
    //   pages: this.currentResults.length
    // });
    
    // Call the onDiveDeeper callback
    if (this.callbacks.onDiveDeeper) {
      this.callbacks.onDiveDeeper({
        question,
        answer,
        results: this.currentResults,
        searchQuery: this.currentSearchQuery
      });
    }
  }

  /**
   * Show comparison error
   */
  showCompareError(message) {
    this.elements.compareContent.innerHTML = `
      <div class="error-message">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
          <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>${message}</span>
      </div>
    `;
    this.elements.compareResult.classList.remove('hidden');
    this.hideCompareLoading();
  }
}

