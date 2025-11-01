import * as storage from './lib/storage.js';

let cacheData = [];

// Setup event listeners on page load
function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', loadCache);
  document.getElementById('exportBtn').addEventListener('click', exportCache);
  document.getElementById('clearBtn').addEventListener('click', clearAllCache);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  
  // Event delegation for dynamically created buttons
  document.getElementById('content').addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (!target) return;
    
    if (target.classList.contains('view-details-btn')) {
      const index = parseInt(target.dataset.index, 10);
      viewDetails(index);
    } else if (target.classList.contains('delete-entry-btn')) {
      const url = target.dataset.url;
      deleteEntry(url);
    }
  });
}

// Initialize theme from extension settings
async function initializeTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    const theme = result.theme || 'light';
    applyTheme(theme);
  } catch (error) {
    console.error('Failed to load theme:', error);
    applyTheme('light');
  }
}

// Apply theme
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    document.getElementById('sunIcon').style.display = 'none';
    document.getElementById('moonIcon').style.display = 'block';
    document.getElementById('themeText').textContent = 'Light';
  } else {
    document.body.classList.remove('dark-mode');
    document.getElementById('sunIcon').style.display = 'block';
    document.getElementById('moonIcon').style.display = 'none';
    document.getElementById('themeText').textContent = 'Dark';
  }
}

// Toggle theme
async function toggleTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    const currentTheme = result.theme || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    await chrome.storage.local.set({ theme: newTheme });
    applyTheme(newTheme);
    
    // Notify extension to update theme
    chrome.runtime.sendMessage({ type: 'THEME_CHANGED', theme: newTheme });
  } catch (error) {
    console.error('Failed to toggle theme:', error);
  }
}

async function loadCache() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading cache data...</p></div>';

  try {
    // Read the single serp-cache.json file
    const CACHE_FILE = 'serp-cache.json';
    const cacheObj = await storage.read(CACHE_FILE);

    // console.log('Cache file content:', cacheObj);

    // Convert cache object to array format
    cacheData = [];
    if (cacheObj && typeof cacheObj === 'object') {
      for (const [url, entry] of Object.entries(cacheObj)) {
        if (entry && entry.data) {
          cacheData.push({
            url: url,
            cachedAt: entry.cachedAt,
            ...entry.data
          });
        }
      }
    }

    // console.log('Parsed cache entries:', cacheData.length);
    displayCache();
  } catch (error) {
    console.error('Failed to load cache:', error);
    content.innerHTML = `
      <div class="empty-state">
        <h2>❌ Error Loading Cache</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function displayCache() {
  const content = document.getElementById('content');

  if (cacheData.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h2>No Cache Data Found</h2>
        <p>No SERP analyses have been cached yet.</p>
        <p style="margin-top: 10px; font-size: 14px;">Run some Google search analyses to see data here!</p>
      </div>
    `;
    return;
  }

  // Calculate stats
  const totalEntries = cacheData.length;
  const totalSize = cacheData.reduce((sum, item) => {
    const size = JSON.stringify(item).length;
    return sum + size;
  }, 0);
  const totalSections = cacheData.reduce((sum, item) => sum + (item.extractedContent?.sections?.length || 0), 0);
  const totalWords = cacheData.reduce((sum, item) => sum + (item.extractedContent?.metadata?.totalWords || 0), 0);

  let html = `
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${totalEntries}</div>
        <div class="stat-label">Cached Pages</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalSections}</div>
        <div class="stat-label">Total Sections</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalWords.toLocaleString()}</div>
        <div class="stat-label">Total Words</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatBytes(totalSize)}</div>
        <div class="stat-label">Cache Size</div>
      </div>
    </div>

    <div class="cache-list">
      <h2>Cached Analyses</h2>
  `;

  cacheData.forEach((item, index) => {
    const date = new Date(item.cachedAt).toLocaleString();
    const size = formatBytes(JSON.stringify(item).length);
    const domain = new URL(item.url).hostname;
    const title = item.title || domain;
    const sectionsCount = item.extractedContent?.sections?.length || 0;
    const wordsCount = item.extractedContent?.metadata?.totalWords || 0;
    
    // Calculate cache age
    const ageMs = Date.now() - item.cachedAt;
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);
    let ageText = '';
    if (ageDays > 0) ageText = `${ageDays} day${ageDays > 1 ? 's' : ''} ago`;
    else if (ageHours > 0) ageText = `${ageHours} hour${ageHours > 1 ? 's' : ''} ago`;
    else if (ageMinutes > 0) ageText = `${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`;
    else ageText = 'just now';

    html += `
      <div class="cache-item">
        <div class="cache-header">
          <div class="cache-url">
            <strong>${escapeHTML(title)}</strong>
            <small style="display: block; color: #6b7280; margin-top: 4px;">${escapeHTML(domain)}</small>
          </div>
        </div>
        <div class="cache-meta">
          <div class="cache-meta-item">
            <span class="cache-meta-label">Cached</span>
            <span>${ageText}</span>
          </div>
          <div class="cache-meta-item">
            <span class="cache-meta-label">Sections</span>
            <span>${sectionsCount} sections</span>
          </div>
          <div class="cache-meta-item">
            <span class="cache-meta-label">Words</span>
            <span>${wordsCount.toLocaleString()} words</span>
          </div>
          <div class="cache-meta-item">
            <span class="cache-meta-label">Size</span>
            <span>${size}</span>
          </div>
          <div class="cache-meta-item">
            <span class="cache-meta-label">Timestamp</span>
            <span>${date}</span>
          </div>
        </div>
        <div class="cache-actions">
          <button class="btn btn-secondary btn-small view-details-btn" data-index="${index}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
            </svg>
            View Details
          </button>
          <button class="btn btn-danger btn-small delete-entry-btn" data-url="${escapeHTML(item.url)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M3 6H5H21M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Delete
          </button>
        </div>
        <div id="details-${index}" style="display: none;"></div>
      </div>
    `;
  });

  html += '</div>';
  content.innerHTML = html;
}

function viewDetails(index) {
  const detailsDiv = document.getElementById(`details-${index}`);
  const item = cacheData[index];
  
  if (detailsDiv.style.display === 'none') {
    detailsDiv.style.display = 'block';
    detailsDiv.innerHTML = formatDetailView(item);
  } else {
    detailsDiv.style.display = 'none';
  }
}

function formatDetailView(item) {
  const sections = item.extractedContent?.sections || [];
  const metadata = item.extractedContent?.metadata || {};
  
  let sectionsHTML = '';
  if (sections.length > 0) {
    sectionsHTML = sections.map(section => `
      <div class="section-item">
        <div class="section-heading">${escapeHTML(section.heading || 'No Heading')}</div>
        <div class="section-content">${escapeHTML((section.content || section.text || 'No content').substring(0, 200))}${(section.content || section.text || '').length > 200 ? '...' : ''}</div>
      </div>
    `).join('');
  } else {
    sectionsHTML = '<div class="section-item"><div class="section-content">No sections available</div></div>';
  }
  
  return `
    <div class="detail-view">
      <div class="detail-section">
        <div class="detail-section-title">📄 Page Information</div>
        <div class="detail-item">
          <div class="detail-label">URL</div>
          <div class="detail-value"><a href="${item.url}" target="_blank" style="color: var(--btn-primary); text-decoration: none;">${escapeHTML(item.url)}</a></div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Title</div>
          <div class="detail-value">${escapeHTML(item.title || 'N/A')}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Cached At</div>
          <div class="detail-value">${new Date(item.cachedAt).toLocaleString()}</div>
        </div>
      </div>
      
      <div class="detail-section">
        <div class="detail-section-title">📊 Content Statistics</div>
        <div class="detail-item">
          <div class="detail-label">Total Sections</div>
          <div class="detail-value">${metadata.totalSections || sections.length || 0}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Total Words</div>
          <div class="detail-value">${(metadata.totalWords || 0).toLocaleString()}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Total Characters</div>
          <div class="detail-value">${(metadata.totalChars || 0).toLocaleString()}</div>
        </div>
      </div>
      
      ${item.summary ? `
      <div class="detail-section">
        <div class="detail-section-title">✨ AI Summary</div>
        <div class="detail-item">
          <div class="detail-value">${escapeHTML(item.summary)}</div>
        </div>
      </div>
      ` : ''}
      
      ${item.relevance !== undefined ? `
      <div class="detail-section">
        <div class="detail-section-title">🎯 Relevance Score</div>
        <div class="detail-item">
          <div class="detail-value">${(item.relevance * 100).toFixed(1)}%</div>
        </div>
      </div>
      ` : ''}
      
      <div class="detail-section">
        <div class="detail-section-title">📝 Content Sections (${sections.length})</div>
        <div class="detail-sections">
          ${sectionsHTML}
        </div>
      </div>
    </div>
  `;
}

async function deleteEntry(url) {
  const domain = new URL(url).hostname;
  if (!confirm(`Delete cached entry for ${domain}?`)) return;

  try {
    const CACHE_FILE = 'serp-cache.json';
    const cacheObj = await storage.read(CACHE_FILE) || {};
    
    if (cacheObj[url]) {
      delete cacheObj[url];
      await storage.write(CACHE_FILE, cacheObj);
      alert('✅ Cache entry deleted!');
      loadCache();
    } else {
      alert('⚠️ Entry not found in cache');
    }
  } catch (error) {
    alert('❌ Failed to delete: ' + error.message);
  }
}

async function clearAllCache() {
  if (!confirm('Are you sure you want to clear ALL SERP cache data? This cannot be undone.')) return;

  try {
    const CACHE_FILE = 'serp-cache.json';
    await storage.write(CACHE_FILE, {});
    alert('✅ All SERP cache cleared!');
    loadCache();
  } catch (error) {
    alert('❌ Failed to clear cache: ' + error.message);
  }
}

function exportCache() {
  const dataStr = JSON.stringify(cacheData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nutshell-cache-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await initializeTheme();
  loadCache();
});

