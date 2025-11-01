/**
 * AI Service - Chrome Built-in AI APIs wrapper
 * Simplified for MVP
 */

/**
 * Check if Chrome AI APIs are available
 */
export async function isAIAvailable() {
  try {
    if (typeof window.ai === 'undefined' || !window.ai.languageModel) {
      console.warn('[AI] Language Model API not available');
      return false;
    }
    
    const availability = await window.ai.languageModel.availability();
    // console.log('[AI] Model availability:', availability);
    
    return availability !== 'no';
  } catch (error) {
    console.error('[AI] Error checking availability:', error);
    return false;
  }
}

/**
 * Create a language model session
 */
export async function createSession(options = {}) {
  try {
    const availability = await window.ai.languageModel.availability();
    
    if (availability === 'no') {
      throw new Error('Language Model is unavailable');
    }
    
    if (availability === 'after-download') {
      console.warn('[AI] Model needs to download. This may take time.');
    }
    
    // Always specify output language for optimal quality and safety
    const sessionOptions = {
      language: 'en', // Default to English
      ...options // Allow override
    };
    
    // console.log('[AI] Creating session with options:', sessionOptions);
    const session = await window.ai.languageModel.create(sessionOptions);
    // console.log('[AI] Session created successfully');
    
    return session;
  } catch (error) {
    console.error('[AI] Error creating session:', error);
    throw error;
  }
}

/**
 * Simple prompt (non-streaming)
 */
export async function prompt(session, promptText) {
  try {
    const result = await session.prompt(promptText);
    return result;
  } catch (error) {
    console.error('[AI] Error in prompt:', error);
    throw error;
  }
}

/**
 * Streaming prompt
 */
export async function* promptStreaming(session, promptText) {
  try {
    const stream = session.promptStreaming(promptText);
    for await (const chunk of stream) {
      yield chunk;
    }
  } catch (error) {
    console.error('[AI] Error in streaming prompt:', error);
    throw error;
  }
}

/**
 * Destroy session
 */
export function destroySession(session) {
  try {
    if (session && typeof session.destroy === 'function') {
      session.destroy();
      // console.log('[AI] Session destroyed');
    }
  } catch (error) {
    console.error('[AI] Error destroying session:', error);
  }
}

