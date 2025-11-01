/**
 * Storage Service - OPFS (Origin Private File System)
 * Atomic file operations for session persistence
 */

let root = null;
let isInitialized = false;

/**
 * Initialize OPFS
 */
export async function initialize() {
  if (isInitialized) return true;
  
  try {
    root = await navigator.storage.getDirectory();
    isInitialized = true;
    // console.log('[Storage] OPFS initialized');
    return true;
  } catch (error) {
    console.error('[Storage] Failed to initialize OPFS:', error);
    throw error;
  }
}

/**
 * Write data to file
 */
export async function write(filename, data) {
  if (!isInitialized) await initialize();
  
  try {
    const fileHandle = await root.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await writable.write(content);
    await writable.close();
    
    // console.log('[Storage] Written:', filename);
    return true;
  } catch (error) {
    console.error('[Storage] Write failed:', filename, error);
    throw error;
  }
}

/**
 * Read data from file
 */
export async function read(filename, parseJSON = true) {
  if (!isInitialized) await initialize();
  
  try {
    const fileHandle = await root.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const content = await file.text();
    
    // console.log('[Storage] Read:', filename);
    return parseJSON ? JSON.parse(content) : content;
  } catch (error) {
    if (error.name === 'NotFoundError') {
      // console.log('[Storage] File not found:', filename);
      return null;
    }
    console.error('[Storage] Read failed:', filename, error);
    throw error;
  }
}

/**
 * Delete file
 */
export async function deleteFile(filename) {
  if (!isInitialized) await initialize();
  
  try {
    await root.removeEntry(filename);
    // console.log('[Storage] Deleted:', filename);
    return true;
  } catch (error) {
    if (error.name === 'NotFoundError') {
      // console.log('[Storage] File not found for deletion:', filename);
      return true;
    }
    console.error('[Storage] Delete failed:', filename, error);
    throw error;
  }
}

/**
 * Check if file exists
 */
export async function exists(filename) {
  if (!isInitialized) await initialize();
  
  try {
    await root.getFileHandle(filename);
    return true;
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

/**
 * List all files
 */
export async function listFiles() {
  if (!isInitialized) await initialize();
  
  try {
    const files = [];
    for await (const entry of root.values()) {
      if (entry.kind === 'file') {
        files.push(entry.name);
      }
    }
    // console.log('[Storage] Found', files.length, 'files');
    return files;
  } catch (error) {
    console.error('[Storage] List files failed:', error);
    throw error;
  }
}

/**
 * Clear all data (dangerous!)
 */
export async function clearAll() {
  if (!isInitialized) await initialize();
  
  try {
    const files = await listFiles();
    for (const filename of files) {
      await deleteFile(filename);
    }
    // console.log('[Storage] Cleared all data');
    return true;
  } catch (error) {
    console.error('[Storage] Clear all failed:', error);
    throw error;
  }
}

/**
 * Get storage usage
 */
export async function getStorageStats() {
  if (!isInitialized) await initialize();
  
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage,
      quota: estimate.quota,
      usagePercent: ((estimate.usage / estimate.quota) * 100).toFixed(2)
    };
  } catch (error) {
    console.error('[Storage] Failed to get stats:', error);
    return null;
  }
}
