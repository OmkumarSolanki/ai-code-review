// ─── Shared utilities for all pages ──────────────────────

const API = '/api';

// ─── Theme ───────────────────────────────────────────────

function getTheme() {
  return localStorage.getItem('theme') || 'dark';
}

function setTheme(theme) {
  localStorage.setItem('theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  // Re-render navbar to update the icon
  const navEl = document.getElementById('navbar');
  if (navEl) {
    const activeId = document.querySelector('.navbar-links a.active')?.id;
    navEl.innerHTML = renderNavbar();
    if (activeId) setActiveNav(activeId);
  }
}

// Apply theme immediately on script load (before paint)
(function() {
  document.documentElement.setAttribute('data-theme', getTheme());
})();

// ─── localStorage-based config (no accounts) ────────────

function getProvider() {
  return localStorage.getItem('llm-provider') || 'demo';
}

function setProvider(provider) {
  localStorage.setItem('llm-provider', provider);
}

function getApiKey() {
  return localStorage.getItem('api-key') || '';
}

function setApiKey(key) {
  if (key) {
    localStorage.setItem('api-key', key);
  } else {
    localStorage.removeItem('api-key');
  }
}

function hasApiKey() {
  return !!localStorage.getItem('api-key');
}

function getModel() {
  return localStorage.getItem('llm-model') || '';
}

function setModel(model) {
  if (model) {
    localStorage.setItem('llm-model', model);
  } else {
    localStorage.removeItem('llm-model');
  }
}

function getMaskedKey() {
  const key = getApiKey();
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

// ─── API calls ───────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-LLM-Provider': getProvider(),
    ...options.headers,
  };

  // Send API key and model in headers for AI features
  const key = getApiKey();
  if (key) headers['X-Api-Key'] = key;
  const model = getModel();
  if (model) headers['X-LLM-Model'] = model;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ─── Helpers ─────────────────────────────────────────────

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function scoreClass(score) {
  if (score >= 80) return 'score-good';
  if (score >= 50) return 'score-ok';
  return 'score-bad';
}

function severityBadge(severity) {
  return `<span class="badge badge-${severity}">${severity}</span>`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Simple Markdown Renderer ────────────────────────────

function renderMarkdown(md) {
  if (!md) return '';
  let html = escapeHtml(md);

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<div class="code-block">${code.trim()}</div>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-4]>)/g, '$1');
  html = html.replace(/(<\/h[1-4]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<div class="code-block">)/g, '$1');
  html = html.replace(/(<\/div>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<hr>)/g, '$1');
  return html;
}

// ─── Navbar ──────────────────────────────────────────────

function renderNavbar() {
  const provider = getProvider();
  const key = hasApiKey();
  const isDemo = provider === 'demo';
  const isDark = getTheme() === 'dark';

  let dot, label;
  if (isDemo) {
    dot = 'status-dot-yellow';
    label = 'Demo Mode';
  } else if (key) {
    dot = 'status-dot-green';
    const modelId = getModel();
    const modelSuffix = modelId ? ` (${modelId.split('-').slice(0,3).join('-')})` : '';
    label = provider.charAt(0).toUpperCase() + provider.slice(1) + modelSuffix + ' — ' + getMaskedKey();
  } else {
    dot = 'status-dot-red';
    label = provider.charAt(0).toUpperCase() + provider.slice(1) + ' — No key';
  }

  // Sun/Moon SVG icons
  const sunIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  const moonIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  // Logo — shield with code bracket + checkmark
  const logo = `<svg class="brand-logo" width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 2L4 7v9c0 7.73 5.12 14.48 12 16 6.88-1.52 12-8.27 12-16V7L16 2z" fill="var(--primary)" opacity="0.15" stroke="var(--primary)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M11 13l-3 3 3 3" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 13l3 3-3 3" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 11l-4 10" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
    <circle cx="24" cy="8" r="4.5" fill="var(--success)" stroke="var(--surface)" stroke-width="1.5"/>
    <path d="M22.5 8l1 1 2-2" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  return `
    <nav class="navbar">
      <a href="/dashboard.html" class="navbar-brand">
        ${logo} AI Reviewer
      </a>
      <div class="navbar-links">
        <a href="/dashboard.html" id="nav-dashboard">Tools</a>
        <a href="/history.html" id="nav-history">History</a>
        <a href="/settings.html" id="nav-settings">Settings</a>
        <a href="/settings.html" class="nav-status-link" title="${label}">
          <span class="status-dot ${dot}"></span>
          <span class="nav-status-text">${escapeHtml(label)}</span>
        </a>
        <button class="theme-toggle" onclick="toggleTheme()" title="${isDark ? 'Switch to light mode' : 'Switch to dark mode'}">
          ${isDark ? sunIcon : moonIcon}
        </button>
      </div>
    </nav>
  `;
}

function setActiveNav(id) {
  document.querySelectorAll('.navbar-links a').forEach(a => a.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ─── Footer ─────────────────────────────────────────────

function renderFooter() {
  const ghIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>';
  const mailIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4l-10 8L2 4"/></svg>';
  return `
    <footer class="site-footer">
      <div class="footer-content">
        <span class="footer-built">Built by Om Solanki</span>
        <div class="footer-links">
          <a href="https://github.com/OmkumarSolanki" target="_blank" rel="noopener">${ghIcon} GitHub</a>
          <a href="mailto:omsolankisde+aicodereview@gmail.com">${mailIcon} Email</a>
        </div>
      </div>
    </footer>
  `;
}

// ─── File reading helpers ────────────────────────────────

const ALLOWED_EXT = new Set([
  '.ts','.tsx','.js','.jsx','.py','.java','.go','.rs','.rb',
  '.cpp','.c','.h','.cs','.php','.swift','.kt','.scala',
  '.sql','.html','.css','.json','.yaml','.yml','.md','.txt',
  '.sh','.bash','.zsh','.dockerfile','.tf','.graphql','.prisma',
  '.xml','.toml','.ini'
]);

function getExt(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function isAllowedFile(name) {
  return ALLOWED_EXT.has(getExt(name));
}

async function readFileList(fileList) {
  const results = [];
  for (const file of fileList) {
    const path = file.webkitRelativePath || file.name;
    if (!isAllowedFile(path)) continue;
    if (path.split('/').some(p => p.startsWith('.') || p === 'node_modules' || p === '__pycache__' || p === 'dist' || p === 'build')) continue;
    try {
      const content = await file.text();
      if (!content || content.length > 10 * 1024 * 1024) continue;
      results.push({ filename: path, content });
    } catch { /* skip */ }
  }
  return results;
}
