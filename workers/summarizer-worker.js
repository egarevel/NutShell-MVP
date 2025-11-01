/**
 * Summarizer Worker - Parallel Section Summarization
 * Uses Chrome Summarizer API
 */

let sections = [];
let summarizers = [];
let sectionSummaries = [];

/**
 * Initialize worker
 */
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;
  
  // console.log('[SummarizerWorker] Received message:', type);
  
  try {
    switch (type) {
      case 'SUMMARIZE':
        await handleSummarize(data);
        break;
      case 'CANCEL':
        handleCancel();
        break;
      default:
        console.warn('[SummarizerWorker] Unknown message type:', type);
    }
  } catch (error) {
    console.error('[SummarizerWorker] Error:', error);
    postMessage({
      type: 'ERROR',
      error: error.message
    });
  }
});

/**
 * Handle summarization request
 * NEW APPROACH: Show sections first, then stream summaries one-by-one
 */
async function handleSummarize(data) {
  sections = data.sections;
  
  if (!sections || sections.length === 0) {
    throw new Error('No sections provided');
  }
  
  // console.log('[SummarizerWorker] Summarizing', sections.length, 'sections');
  
  // Step 1: Send sections list immediately
  postMessage({
    type: 'SECTIONS_LOADED',
    sections: sections.map(s => ({
      id: s.id,
      heading: s.heading,
      originalText: s.text
    }))
  });
  
  // Check if Summarizer API is available
  if (!('Summarizer' in self)) {
    console.warn('[SummarizerWorker] Chrome Summarizer API not available, using fallback');
    
    // Send fallback for each section
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const fallbackText = section.text.length > 500 
        ? section.text.substring(0, 500) + '...' 
        : section.text;
      
      postMessage({
        type: 'SECTION_SUMMARY',
        sectionIndex: i,
        totalSections: sections.length,
        id: section.id,
        heading: section.heading,
        summary: fallbackText,
        originalLength: section.text.length,
        failed: true,
        error: 'Summarizer API not available'
      });
    }
    
    postMessage({ type: 'COMPLETE' });
    return;
  }
  
  // Step 2: Process sections one by one (top to bottom)
  sectionSummaries = [];
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    
    try {
      // Create summarizer for this section
      const summarizer = await Summarizer.create({
        type: 'key-points',
        format: 'plain-text',
        length: 'short'
      });
      
      // Prepare text: heading + content
      const textToSummarize = `${section.heading}\n\n${section.text}`;
      
      // Use streaming API for real-time display
      const stream = summarizer.summarizeStreaming(textToSummarize);
      let fullSummary = '';
      
      for await (const chunk of stream) {
        // Chrome API sends DELTA chunks (word by word), NOT full text!
        // We need to APPEND each chunk to build the full summary
        if (chunk && chunk.length > 0) {
          fullSummary += chunk; // ✅ APPEND each delta chunk!
          
          // Send accumulated text so far
          postMessage({
            type: 'SECTION_SUMMARY_CHUNK',
            sectionIndex: i,
            totalSections: sections.length,
            id: section.id,
            heading: section.heading,
            chunk: fullSummary, // Send accumulated text
            isComplete: false
          });
        }
      }
      
      // Cleanup
      summarizer.destroy();
      
      // Send final complete message
      const sectionSummary = {
        id: section.id,
        heading: section.heading,
        summary: fullSummary || 'Summary unavailable',
        originalLength: section.text.length,
        failed: false
      };
      
      sectionSummaries.push(sectionSummary);
      
      postMessage({
        type: 'SECTION_SUMMARY',
        sectionIndex: i,
        totalSections: sections.length,
        ...sectionSummary,
        isComplete: true
      });
      
      // console.log(`[SummarizerWorker] ✅ Summarized section ${i + 1}/${sections.length}: ${section.heading}`);
      
    } catch (error) {
      console.error('[SummarizerWorker] Failed to summarize section:', section.heading, error);
      
      // Fallback: use original text (truncated if too long)
      const fallbackText = section.text.length > 500 
        ? section.text.substring(0, 500) + '...' 
        : section.text;
      
      const sectionSummary = {
        id: section.id,
        heading: section.heading,
        summary: fallbackText,
        originalLength: section.text.length,
        failed: true,
        error: error.message
      };
      
      sectionSummaries.push(sectionSummary);
      
      // Send fallback
      postMessage({
        type: 'SECTION_SUMMARY',
        sectionIndex: i,
        totalSections: sections.length,
        ...sectionSummary
      });
      
      // console.log(`[SummarizerWorker] ⚠️ Used fallback for section ${i + 1}/${sections.length}: ${section.heading}`);
    }
  }
  
  // Step 3: Send complete signal
  postMessage({
    type: 'COMPLETE',
    sectionSummaries,
    statistics: {
      totalSections: sections.length,
      summarizedSections: sectionSummaries.filter(s => !s.failed).length,
      failedSections: sectionSummaries.filter(s => s.failed).length,
      totalOriginalLength: sections.reduce((sum, s) => sum + s.text.length, 0),
      totalSummaryLength: sectionSummaries.reduce((sum, s) => sum + s.summary.length, 0)
    }
  });
  
  // console.log('[SummarizerWorker] ✅ Summarization complete:', {
  //   total: sections.length,
  //   successful: sectionSummaries.filter(s => !s.failed).length,
  //   failed: sectionSummaries.filter(s => s.failed).length
  // });
}


/**
 * Create fallback summary (when AI API not available)
 */
function createFallbackSummary(sections) {
  // Group sections by heading level
  const topLevelSections = sections.filter(s => s.level <= 2);
  
  // Create a structured outline
  const outline = topLevelSections
    .map(s => `• ${s.heading}`)
    .join('\n');
  
  const totalWords = sections.reduce((sum, s) => {
    return sum + s.text.split(/\s+/).length;
  }, 0);
  
  const readingTime = Math.ceil(totalWords / 200);
  
  const summary = `📄 **Page Overview**\n\n` +
    `This page contains ${sections.length} sections with approximately ${totalWords.toLocaleString()} words ` +
    `(~${readingTime} minute read).\n\n` +
    `**Main Topics:**\n${outline}\n\n` +
    `💡 *Note: AI summarization is not available. You can still ask questions about this page using the chat feature!*`;
  
  // Create simple section summaries (first 150 chars of each section)
  const sectionSummaries = sections.map(s => ({
    id: s.id,
    heading: s.heading,
    summary: s.text.substring(0, 150) + (s.text.length > 150 ? '...' : ''),
    originalLength: s.text.length
  }));
  
  return {
    summary,
    sectionSummaries
  };
}

/**
 * Handle cancellation
 */
function handleCancel() {
  // console.log('[SummarizerWorker] Cancellation requested');
  // Cleanup
  summarizers.forEach(s => {
    try {
      s.destroy();
    } catch (e) {
      // Ignore
    }
  });
  summarizers = [];
}

// console.log('[SummarizerWorker] 🚀 Worker initialized');

