/**
 * Google SERP URL Extractor
 * Extracts organic search result URLs from Google search results page
 */

/**
 * Extract search query from Google page
 */
function extractSearchQuery() {
  try {
    // Try URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    
    if (query) {
      return query;
    }
    
    // Try search input field
    const searchInput = document.querySelector('input[name="q"]');
    if (searchInput && searchInput.value) {
      return searchInput.value;
    }
    
    // Try page title
    const titleMatch = document.title.match(/^(.+?)\s*-\s*Google/);
    if (titleMatch) {
      return titleMatch[1];
    }
    
    return null;
  } catch (error) {
    console.error('[SERP] Failed to extract search query:', error);
    return null;
  }
}

/**
 * Check if an element is an ad, sponsored content, or non-organic result
 */
function isAdOrSponsored(element) {
  // Check for ad indicators
  const adIndicators = [
    'Sponsored',
    'Ad',
    'Advertisement',
    'Promoted'
  ];
  
  const text = element.textContent || '';
  const classes = element.className || '';
  
  // Check text content
  if (adIndicators.some(indicator => text.includes(indicator))) {
    return true;
  }
  
  // Check classes
  if (classes.includes('ads') || classes.includes('ad-') || classes.includes('sponsored')) {
    return true;
  }
  
  // Check for "People also ask" section
  // These are the common parent classes/attributes for PAA
  if (element.closest('.related-question-pair') ||
      element.closest('.kp-blk') ||
      element.closest('[data-initq]') ||
      element.closest('.kno-rdesc') ||
      element.querySelector('.related-question-pair')) {
    // console.log('[SERP] Skipping "People also ask" element');
    return true;
  }
  
  // Check parent for ad container
  let parent = element.parentElement;
  for (let i = 0; i < 3 && parent; i++) {
    const parentClasses = parent.className || '';
    if (parentClasses.includes('ads') || parentClasses.includes('commercial')) {
      return true;
    }
    parent = parent.parentElement;
  }
  
  return false;
}

/**
 * Wait for elements to appear on the page
 */
function waitForElements(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      resolve(elements);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        observer.disconnect();
        resolve(elements);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Timeout fallback
    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelectorAll(selector));
    }, timeout);
  });
}

/**
 * Extract organic search result URLs from Google SERP
 */
async function extractSearchResultURLs(maxResults = 10) {
  try {
    const results = [];
    const seenUrls = new Set();
    
    // console.log('[SERP] 🔍 Starting search result extraction...');
    // console.log('[SERP] Max results requested:', maxResults);
    // console.log('[SERP] Current URL:', window.location.href);
    // console.log('[SERP] Page title:', document.title);
    // console.log('[SERP] Document ready state:', document.readyState);
    
    // Wait a moment for Google's dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Strategy 1: Try multiple selectors for result containers
    let resultDivs = [];
    const selectors = [
      'div.MjjYud',      // Current Google result container (2024+)
      '.g',              // Classic Google result div
      'div.tF2Cxc',      // Modern Google result card (nested)
      'div[data-hveid]', // Alternative result div
      'div.Gx5Zad',      // Another alternative
    ];
    
    for (const selector of selectors) {
      resultDivs = Array.from(document.querySelectorAll(selector));
      if (resultDivs.length > 0) {
        // console.log(`[SERP] ✅ Found ${resultDivs.length} results using selector: ${selector}`);
        break;
      }
    }
    
    // Sort by position if data-rpos attribute is present
    if (resultDivs.length > 0 && resultDivs[0].querySelector('[data-rpos]')) {
      // console.log('[SERP] Sorting by data-rpos attribute...');
      resultDivs.sort((a, b) => {
        const posA = parseInt(a.querySelector('[data-rpos]')?.getAttribute('data-rpos') || '999');
        const posB = parseInt(b.querySelector('[data-rpos]')?.getAttribute('data-rpos') || '999');
        return posA - posB;
      });
      // console.log('[SERP] Results sorted by position:', resultDivs.map(d => d.querySelector('[data-rpos]')?.getAttribute('data-rpos')).join(', '));
    }
    
    // Strategy 2: If no containers found, find all h3 elements and work backwards to their parent containers
    if (resultDivs.length === 0) {
      // console.log('[SERP] No result containers found, trying h3-based extraction...');
      const h3Elements = document.querySelectorAll('h3');
      // console.log(`[SERP] Found ${h3Elements.length} h3 elements on page`);
      
      // Get unique parent containers of h3 elements that are likely search results
      const parentDivs = new Set();
      h3Elements.forEach(h3 => {
        // Find the closest div that looks like a result container
        let parent = h3.closest('div[data-hveid], div.g, div.tF2Cxc, div.Gx5Zad');
        if (!parent) {
          // If no specific container, go up a few levels (3-4 levels typically)
          parent = h3.parentElement?.parentElement?.parentElement;
        }
        if (parent && parent.querySelector('a[href^="http"]')) {
          parentDivs.add(parent);
        }
      });
      resultDivs = Array.from(parentDivs);
      // console.log(`[SERP] Extracted ${resultDivs.length} result containers from h3 parents`);
    }
    
    if (resultDivs.length === 0) {
      console.warn('[SERP] ⚠️ No results found with any strategy');
      // console.log('[SERP] === DIAGNOSTIC INFO ===');
      // console.log('[SERP] Total divs on page:', document.querySelectorAll('div').length);
      // console.log('[SERP] Total h3 elements:', document.querySelectorAll('h3').length);
      // console.log('[SERP] Total links:', document.querySelectorAll('a').length);
      // console.log('[SERP] Links starting with http:', document.querySelectorAll('a[href^="http"]').length);
      // console.log('[SERP] Body classes:', document.body.className);
      // console.log('[SERP] Page HTML sample (first 1000 chars):', document.body.innerHTML.substring(0, 1000));
      // console.log('[SERP] === END DIAGNOSTIC ===');
      return [];
    }
    
    // console.log(`[SERP] Processing ${resultDivs.length} result divs...`);
    
    for (let i = 0; i < resultDivs.length; i++) {
      const resultDiv = resultDivs[i];
      
      // Stop if we have enough results
      if (results.length >= maxResults) {
        // console.log(`[SERP] Reached max results (${maxResults}), stopping`);
        break;
      }
      
      // console.log(`[SERP] --- Processing div ${i + 1}/${resultDivs.length} ---`);
      // console.log(`[SERP] Classes:`, resultDiv.className);
      
      // Skip ads
      if (isAdOrSponsored(resultDiv)) {
        // console.log('[SERP] ❌ Skipping: ad or non-organic content');
        continue;
      }
      
      // console.log('[SERP] ✅ Passed ad/sponsor check');
      
      // Find the main title link (the one with h3 inside it)
      // This is the PRIMARY link for each result
      // First try: find h3, then get its parent link
      const h3Element = resultDiv.querySelector('h3');
      let titleLink = null;
      
      if (h3Element) {
        // console.log('[SERP] Found h3:', h3Element.textContent.trim().substring(0, 50));
        // Check if h3's parent is a link
        if (h3Element.parentElement && h3Element.parentElement.tagName === 'A') {
          titleLink = h3Element.parentElement;
          // console.log('[SERP] Title link: h3 parent is <a>');
        } else {
          // Sometimes h3 is inside other elements, find closest link
          titleLink = h3Element.closest('a');
          if (titleLink) {
            // console.log('[SERP] Title link: found via closest(a)');
          }
        }
      } else {
        // console.log('[SERP] No h3 found in div');
      }
      
      // Fallback: find any link with h3 inside
      if (!titleLink) {
        // console.log('[SERP] Trying fallback: looking for any link with h3 inside...');
        const links = resultDiv.querySelectorAll('a');
        // console.log(`[SERP] Found ${links.length} links in div`);
        for (const link of links) {
          if (link.querySelector('h3')) {
            titleLink = link;
            // console.log('[SERP] Title link: found via fallback');
            break;
          }
        }
      }
      
      if (!titleLink || titleLink.tagName !== 'A') {
        // console.log('[SERP] ❌ No title link found in result div');
        continue;
      }
      
      // console.log('[SERP] ✅ Title link found');
      
      const href = titleLink.href;
      // console.log('[SERP] Extracted href:', href);
      
      // Skip if not a valid URL
      if (!href || !href.startsWith('http')) {
        // console.log('[SERP] ❌ Invalid URL:', href);
        continue;
      }
      // console.log('[SERP] ✅ Valid HTTP(S) URL');
      
      // Skip Google's own URLs
      if (href.includes('google.com') || 
          href.includes('youtube.com') ||
          href.includes('maps.google')) {
        // console.log('[SERP] ❌ Skipping Google URL:', href);
        continue;
      }
      // console.log('[SERP] ✅ Not a Google URL');
      
      // Skip if already seen
      if (seenUrls.has(href)) {
        // console.log('[SERP] ❌ Duplicate URL:', href);
        continue;
      }
      // console.log('[SERP] ✅ URL is unique');
      
      // Extract title from h3
      const h3 = titleLink.querySelector('h3') || resultDiv.querySelector('h3');
      const title = h3 ? h3.textContent.trim() : titleLink.textContent.trim();
      // console.log('[SERP] Extracted title:', title.substring(0, 50));
      
      // Skip if no title
      if (!title || title.length < 3) {
        // console.log('[SERP] ❌ No valid title found');
        continue;
      }
      // console.log('[SERP] ✅ Valid title');
      
      // Extract snippet/description
      let snippet = '';
      const descSpan = resultDiv.querySelector('.VwiC3b, .s, .st, [data-content-feature="1"]');
      if (descSpan) {
        snippet = descSpan.textContent.trim();
        // console.log('[SERP] Extracted snippet:', snippet.substring(0, 50));
      } else {
        // console.log('[SERP] No snippet found');
      }
      
      // console.log(`[SERP] ✅✅✅ ADDING RESULT #${results.length + 1}: ${title.substring(0, 50)}`);
      
      results.push({
        url: href,
        title: title,
        snippet: snippet,
        position: results.length + 1
      });
      
      seenUrls.add(href);
    }
    
    // console.log('[SERP] ✅ Found', results.length, 'organic results');
    // console.log('[SERP] Results:', results.map(r => `${r.position}. ${r.title}`).join('\n'));
    
    return results;
    
  } catch (error) {
    console.error('[SERP] Failed to extract search results:', error);
    return [];
  }
}

/**
 * Check if current page is a Google search results page
 */
function isGoogleSearchPage() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  const search = window.location.search;
  
  return (
    (hostname.includes('google.com') || hostname.includes('google.')) &&
    (pathname === '/search' || pathname.startsWith('/search')) &&
    search.includes('q=')
  );
}

// Listen for messages from sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_GOOGLE_SERP') {
    const isSerp = isGoogleSearchPage();
    const query = isSerp ? extractSearchQuery() : null;
    
    sendResponse({
      isGoogleSerp: isSerp,
      searchQuery: query
    });
    return true;
  }
  
  if (message.type === 'EXTRACT_SERP_URLS') {
    // Handle async extraction
    (async () => {
      try {
        // console.log('[SERP] 📨 Received EXTRACT_SERP_URLS message');
        const maxResults = message.data?.maxResults || 10;
        // console.log('[SERP] Extracting up to', maxResults, 'results');
        
        const results = await extractSearchResultURLs(maxResults);
        const searchQuery = extractSearchQuery();
        
        // console.log('[SERP] 📤 Sending response:', {
        //   success: true,
        //   count: results.length,
        //   hasQuery: !!searchQuery
        // });
        
        sendResponse({
          success: true,
          searchQuery: searchQuery,
          results: results,
          count: results.length
        });
      } catch (error) {
        console.error('[SERP] ❌ Extraction error:', error);
        sendResponse({
          success: false,
          error: error.message,
          results: [],
          count: 0
        });
      }
    })();
    
    return true; // Will respond asynchronously
  }
});

// console.log('[SERP] Google SERP extractor loaded');

