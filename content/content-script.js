/**
 * Content Script - Extracts content from web pages
 * Simple, clean implementation for MVP
 */

// console.log('[Content] Nutshell content script loaded');

/**
 * Extract text from element - comprehensive approach
 * Gets ALL text content including figcaption, blockquote, etc.
 */
function extractText(element) {
  if (!element) return '';
  
  // Skip excluded elements (scripts, styles, navigation)
  const excludedTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'NAV', 'HEADER', 'FOOTER', 'BUTTON', 'OPTION', 'SELECT', 'INPUT', 'TEXTAREA', 'LABEL', 'FORM'];
  if (excludedTags.includes(element.tagName)) return '';
  
  // Skip common navigation/sidebar classes and IDs
  // Note: We DON'T filter "infobox" or "aside" - they contain valuable content!
  const excludedClasses = [
    'navigation', 'navbar', 'nav-menu', 'sidebar', 'toc', 'table-of-contents',
    'mw-portlet', 'vector-menu', 'mw-list-item', // Wikipedia navigation
    'navbox', 'vertical-navbox', 'metadata', // Wikipedia navboxes (not infoboxes!)
    'printfooter', 'catlinks', 'mw-footer', // Wikipedia footer
    'interlanguage-link', 'mw-interlanguage' // Wikipedia language links
  ];
  
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.toLowerCase();
    if (excludedClasses.some(exc => classes.includes(exc))) {
      return '';
    }
  }
  
  if (element.id) {
    const id = element.id.toLowerCase();
    if (excludedClasses.some(exc => id.includes(exc)) || 
        id === 'toc' || 
        id.startsWith('mw-') ||
        id.includes('navigation')) {
      return '';
    }
  }
  
  // For text nodes, return content directly
  if (element.nodeType === Node.TEXT_NODE) {
    return element.textContent.trim();
  }
  
  // IMPROVED: Use a cloned element to extract ALL text content comprehensively
  // This ensures we capture figcaption, blockquote, aside, and all other text elements
  const clone = element.cloneNode(true);
  
  // Remove excluded elements from clone
  excludedTags.forEach(tag => {
    const elements = clone.querySelectorAll(tag);
    elements.forEach(el => el.remove());
  });
  
  // Remove elements with excluded classes
  excludedClasses.forEach(exc => {
    const elements = clone.querySelectorAll(`[class*="${exc}"]`);
    elements.forEach(el => el.remove());
  });
  
  // Get all text content from the cleaned clone
  const text = clone.textContent || '';
  
  // Clean up: normalize whitespace, remove excessive line breaks
  return text
    .replace(/\s+/g, ' ') // Replace multiple spaces/newlines with single space
    .trim();
}

/**
 * Extract content sections from page
 * Handles pages with and without headings gracefully
 */
function extractSections() {
  const sections = [];
  let currentSection = null;
  let sectionIndex = 0;
  let orphanedContent = []; // Content without headings
  
  // TRULY UNIVERSAL APPROACH: Always use body, let filtering handle everything
  // This works on ANY page structure - no hardcoded selectors needed!
  // The extractText() function already filters out nav, header, footer, sidebars, etc.
  const mainContent = document.body;
  // console.log('[Content] Using document.body - universal filtering will handle content extraction');
  
  // Process all elements (including inline elements like span, a, b, etc.)
  const allElements = mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, td, th, pre, blockquote, article, section, div, span, a, strong, em, b, i, q, cite, mark, small');
  // console.log('[Content] Found', allElements.length, 'elements to process');
  
  for (const element of allElements) {
    // Check if it's a heading
    if (element.matches('h1, h2, h3, h4, h5, h6')) {
      // Save previous section if exists (lowered from 20 to 15 chars)
      if (currentSection && currentSection.text.trim().length > 15) {
        sections.push(currentSection);
        currentSection = null;
      }
      
      // If we have orphaned content, create a section for it
      if (orphanedContent.length > 0 && !currentSection) {
        const orphanedText = orphanedContent.join('\n\n');
        // Lowered from 50 to 30 chars for orphaned content
        if (orphanedText.length > 30) {
          sections.push({
            id: `sec_${sectionIndex++}`,
            heading: 'Content',
            level: 1,
            text: orphanedText,
            metadata: {
              tag: 'div',
              hasCode: false,
              hasList: false
            }
          });
        }
        orphanedContent = [];
      }
      
      // Start new section
      const headingText = extractText(element);
      if (headingText) {
        currentSection = {
          id: `sec_${sectionIndex++}`,
          heading: headingText,
          level: parseInt(element.tagName[1]),
          text: '',
          metadata: {
            tag: element.tagName,
            hasCode: false,
            hasList: false
          }
        };
      }
    }
    // Add content to current section or orphaned list
    else if (element.matches('p, li, td, th, pre, blockquote, div, article, section, span, a, strong, em, b, i, q, cite, mark, small')) {
      // Avoid duplicate extraction by checking if this element is nested inside a parent we're already processing
      let shouldExtract = true;
      
      // For containers (divs/article/section): only extract if they don't contain nested structural elements
      if (element.matches('div, article, section')) {
        const hasNestedContent = element.querySelector('p, li, h1, h2, h3, h4, h5, h6, article, section');
        if (hasNestedContent) {
          shouldExtract = false; // Container - we'll process its children
        }
      }
      
      // For inline elements (span/a/b/etc): only extract if NOT nested inside a block element we're already processing
      if (element.matches('span, a, strong, em, b, i, q, cite, mark, small')) {
        // Check if this inline element is inside a parent block element (p, div, li, etc.)
        const parentBlock = element.closest('p, li, td, th, pre, blockquote, div');
        if (parentBlock && allElements.includes && Array.from(allElements).includes(parentBlock)) {
          shouldExtract = false; // Parent will extract this content
        }
      }
      
      if (shouldExtract) {
        const text = extractText(element);
        if (text && text.length > 10) {
          if (currentSection) {
            // Add to current section
            currentSection.text += text + '\n\n';
            
            if (element.matches('pre, code')) {
              currentSection.metadata.hasCode = true;
            }
            if (element.matches('li')) {
              currentSection.metadata.hasList = true;
            }
          } else {
            // No section yet, add to orphaned content
            orphanedContent.push(text);
          }
        }
      }
    }
  }
  
  // Add last section (lowered from 20 to 15 chars)
  if (currentSection && currentSection.text.trim().length > 15) {
    sections.push(currentSection);
  }
  
  // Handle remaining orphaned content
  if (orphanedContent.length > 0) {
    const orphanedText = orphanedContent.join('\n\n');
    // Lowered from 50 to 30 chars
    if (orphanedText.length > 30) {
      sections.push({
        id: `sec_${sectionIndex++}`,
        heading: sections.length === 0 ? 'Main Content' : 'Additional Content',
        level: 1,
        text: orphanedText,
        metadata: {
          tag: 'div',
          hasCode: false,
          hasList: false
        }
      });
    }
  }
  
  // FALLBACK: If no sections found, try to extract all text as one section
  if (sections.length === 0) {
    // console.log('[Content] No structured content found, extracting page text...');
    const allText = extractText(mainContent);
    // console.log('[Content] Extracted text length:', allText.length, 'chars');
    
    // LOWERED threshold from 50 to 20 chars to handle minimal landing pages
    if (allText && allText.length > 20) {
      // Get page title as fallback heading
      const pageTitle = document.title || 'Page Content';
      
      sections.push({
        id: 'sec_0',
        heading: pageTitle,
        level: 1,
        text: allText,
        metadata: {
          tag: 'body',
          hasCode: false,
          hasList: false
        }
      });
      // console.log('[Content] Created fallback section with page content');
    } else {
      console.warn('[Content] Page has too little text (<50 chars)');
      // console.log('[Content] Page title:', document.title);
      // console.log('[Content] Page URL:', window.location.href);
      // console.log('[Content] Body HTML preview:', document.body?.innerHTML?.substring(0, 500));
    }
  }
  
  // console.log('[Content] Extracted', sections.length, 'sections');
  
  if (sections.length === 0) {
    console.error('[Content] ⚠️ NO CONTENT EXTRACTED - Check console logs above for details');
  }
  return sections;
}

/**
 * Get page statistics
 */
function getStatistics(sections) {
  const text = sections.map(s => s.text).join(' ');
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  return {
    sections: sections.length,
    words: words.length,
    characters: text.length,
    readingTime: Math.ceil(words.length / 200) // ~200 words per minute
  };
}

/**
 * Extract content from page
 */
async function extractContent() {
  try {
    // console.log('[Content] Starting content extraction...');
    
    const sections = extractSections();
    const statistics = getStatistics(sections);
    
    // console.log('[Content] Extraction complete:', statistics);
    
    return {
      success: true,
      sections,
      statistics,
      metadata: {
        url: window.location.href,
        title: document.title,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    console.error('[Content] Extraction failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Highlight section on page
 */
function highlightSection(sectionId, heading) {
  // console.log('[Content] Highlighting section:', sectionId, heading);
  
  try {
    // Remove any existing highlights
    document.querySelectorAll('.nutshell-highlight').forEach(el => {
      el.classList.remove('nutshell-highlight');
    });
    
    // Strategy 1: Try to find by data-section-id if we set it during extraction
    let targetElement = document.querySelector(`[data-section-id="${sectionId}"]`);
    
    // Strategy 2: Find by heading text
    if (!targetElement && heading) {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const h of headings) {
        if (h.textContent.trim() === heading.trim()) {
          targetElement = h;
          break;
        }
      }
    }
    
    // Strategy 3: Try partial heading match
    if (!targetElement && heading) {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const h of headings) {
        if (h.textContent.includes(heading) || heading.includes(h.textContent)) {
          targetElement = h;
          break;
        }
      }
    }
    
    if (targetElement) {
      // Add highlight class
      targetElement.classList.add('nutshell-highlight');
      
      // Scroll to element with smooth animation
      targetElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        targetElement.classList.remove('nutshell-highlight');
      }, 3000);
      
      // console.log('[Content] Section highlighted:', heading);
      return true;
    } else {
      console.warn('[Content] Could not find section to highlight:', heading);
      return false;
    }
  } catch (error) {
    console.error('[Content] Error highlighting section:', error);
    return false;
  }
}

/**
 * Inject highlight CSS
 */
function injectHighlightCSS() {
  if (document.getElementById('nutshell-highlight-css')) return;
  
  const style = document.createElement('style');
  style.id = 'nutshell-highlight-css';
  style.textContent = `
    .nutshell-highlight {
      animation: nutshell-pulse 2s ease-in-out;
      background: linear-gradient(90deg, 
        rgba(26, 115, 232, 0.2) 0%, 
        rgba(26, 115, 232, 0.1) 50%, 
        rgba(26, 115, 232, 0.2) 100%);
      background-size: 200% 100%;
      padding: 8px;
      border-radius: 4px;
      border-left: 4px solid #1a73e8;
      box-shadow: 0 2px 8px rgba(26, 115, 232, 0.3);
      transition: all 0.3s ease;
    }
    
    @keyframes nutshell-pulse {
      0%, 100% {
        background-position: 0% 50%;
        box-shadow: 0 2px 8px rgba(26, 115, 232, 0.3);
      }
      50% {
        background-position: 100% 50%;
        box-shadow: 0 4px 12px rgba(26, 115, 232, 0.5);
      }
    }
  `;
  document.head.appendChild(style);
}

// Inject CSS when script loads
injectHighlightCSS();

/**
 * Message listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // console.log('[Content] Received message:', message.type);
  
  if (message.type === 'EXTRACT_CONTENT') {
    extractContent().then(result => {
      sendResponse(result);
    });
    return true; // Async response
  }
  
  if (message.type === 'HIGHLIGHT_SECTION') {
    const { sectionId, heading } = message.data;
    const success = highlightSection(sectionId, heading);
    sendResponse({ success });
    return false; // Sync response
  }
  
  return false;
});

// console.log('[Content] ✅ Ready to extract content & highlight sections');

