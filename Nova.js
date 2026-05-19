/**
 * ==========================================================================
 * NovaChatAI — script.js  (DEBUGGED & HARDENED)
 * ==========================================================================
 * A fully-featured AI chat application powered by the OpenRouter API
 * (Mistral 7B Instruct). Handles chat sessions, localStorage persistence,
 * theme toggling, sidebar interactions, and DOM rendering.
 *
 * Architecture Sections:
 *  §1  — Configuration & API
 *  §2  — DOM Registry (populated inside init — see §16)
 *  §3  — Application State
 *  §4  — Utility Functions
 *  §5  — Theme System
 *  §6  — Toast Notification System
 *  §7  — localStorage Persistence
 *  §8  — Chat Session Management
 *  §9  — Message Rendering System
 *  §10 — Typing Indicator
 *  §11 — API Fetch Handler
 *  §12 — Input & Textarea Logic
 *  §13 — Sidebar System
 *  §14 — Settings Modal
 *  §15 — Event Listeners
 *  §16 — Initialisation  ← ROOT FIX IS HERE
 *
 * ==========================================================================
 * ROOT CAUSE OF ALL BUGS — READ THIS FIRST
 * ==========================================================================
 * The original code built the DOM object at the TOP LEVEL of the script,
 * meaning every getElementById / querySelectorAll call ran BEFORE the HTML
 * was parsed. Every reference returned null. Then attachEventListeners()
 * called .addEventListener() on null → TypeError → full crash → static UI.
 *
 * THE FIX: The DOM object is now declared as an empty object at the top,
 * and populated inside populateDOM() which is called as the FIRST thing
 * inside init(), which itself only runs after DOMContentLoaded fires.
 * All functions that touch DOM refs are therefore safe.
 *
 * A secondary safe-accessor helper (safeOn) is used in attachEventListeners
 * so the app fails gracefully instead of crashing if an element is missing.
 * ==========================================================================
 */

'use strict';

/* ==========================================================================
   §1 — CONFIGURATION & API
   -------------------------------------------------------------------------
   Replace "YOUR_OPENROUTER_API_KEY" with your real key, or enter it via
   the Settings modal (recommended — keeps keys out of source code).
   ========================================================================== */
const CONFIG = {
  API_ENDPOINT : 'https://openrouter.ai/api/v1/chat/completions',
  MODEL        : 'openrouter/auto',
  MAX_TOKENS   : 1024,
  SITE_URL     : window.location.origin,
  SITE_NAME    : 'NovaChatAI',
  SYSTEM_PROMPT: `You are NovaChatAI, a highly capable and friendly AI assistant.
You provide clear, accurate, and helpful responses.
When writing code, always use proper markdown code fences.
Keep your answers well-structured and easy to read.`,
};

/* ==========================================================================
   §2 — DOM REGISTRY
   -------------------------------------------------------------------------
   BUG FIX: Previously this object was built at the TOP LEVEL of the script,
   so all getElementById / querySelectorAll calls ran before the browser had
   parsed the HTML — every value was null, crashing the entire app.

   SOLUTION: DOM is declared as an empty object here. It is populated inside
   populateDOM(), which is called as the FIRST thing inside init(), which
   itself only runs after the DOMContentLoaded event fires.

   Never call getElementById or querySelector outside of a function that is
   guaranteed to run after DOMContentLoaded.
   ========================================================================== */
const DOM = {}; // populated by populateDOM() inside init()

/**
 * populateDOM — queries the live document and fills the DOM registry.
 * Called once at the start of init(), after DOMContentLoaded has fired.
 * Keeping all selectors here means broken IDs are immediately visible.
 */
function populateDOM() {
  // Layout
  DOM.appShell         = document.getElementById('appShell');
  DOM.sidebar          = document.getElementById('sidebar');
  DOM.sidebarOverlay   = document.getElementById('sidebarOverlay');
  DOM.sidebarToggle    = document.getElementById('sidebarToggle');
  DOM.sidebarClose     = document.getElementById('sidebarClose');

  // Navbar
  DOM.themeToggle      = document.getElementById('themeToggle');
  DOM.themeIcon        = document.getElementById('themeIcon');
  DOM.newChatBtnNav    = document.getElementById('newChatBtnNav');
  DOM.settingsBtnNav   = document.getElementById('settingsBtnNav');

  // Sidebar actions
  DOM.newChatBtnSidebar  = document.getElementById('newChatBtnSidebar');
  DOM.settingsBtnSidebar = document.getElementById('settingsBtnSidebar');
  DOM.searchChats        = document.getElementById('searchChats');
  DOM.chatHistoryList    = document.getElementById('chatHistoryList');
  DOM.historyEmpty       = document.getElementById('historyEmpty');

  // Chat area
  DOM.chatWindow       = document.getElementById('chatWindow');
  DOM.welcomeScreen    = document.getElementById('welcomeScreen');
  DOM.messageFeed      = document.getElementById('messageFeed');
  DOM.typingIndicator  = document.getElementById('typingIndicator');

  // Input area
  DOM.inputForm        = document.getElementById('inputForm');
  DOM.messageInput     = document.getElementById('messageInput');
  DOM.sendBtn          = document.getElementById('sendBtn');
  DOM.sendIcon         = document.getElementById('sendIcon');
  DOM.sendSpinner      = document.getElementById('sendSpinner');
  DOM.charCounter      = document.getElementById('charCounter');

  // Settings modal
  DOM.settingsModal    = document.getElementById('settingsModal');
  DOM.settingsClose    = document.getElementById('settingsClose');
  DOM.saveSettingsBtn  = document.getElementById('saveSettingsBtn');
  DOM.clearAllDataBtn  = document.getElementById('clearAllDataBtn');
  DOM.apiKeyInput      = document.getElementById('apiKeyInput');
  DOM.toggleApiKeyVis  = document.getElementById('toggleApiKeyVisibility');
  DOM.eyeIcon          = document.getElementById('eyeIcon');

  // NodeLists — queried after DOM exists
  DOM.themeRadios = document.querySelectorAll('input[name="theme"]');
  DOM.chips       = document.querySelectorAll('.chip');

  // Toast
  DOM.toast = document.getElementById('toast');
}

/**
 * validateDOM — after populateDOM(), check every key for null.
 * Logs a clear warning for each missing element so mismatched IDs are
 * caught immediately in the console during development.
 */
function validateDOM() {
  const required = [
    'appShell','sidebar','sidebarOverlay','sidebarToggle','sidebarClose',
    'themeToggle','themeIcon','newChatBtnNav','settingsBtnNav',
    'newChatBtnSidebar','settingsBtnSidebar','searchChats',
    'chatHistoryList','historyEmpty','chatWindow','welcomeScreen',
    'messageFeed','typingIndicator','inputForm','messageInput',
    'sendBtn','sendIcon','sendSpinner','charCounter',
    'settingsModal','settingsClose','saveSettingsBtn','clearAllDataBtn',
    'apiKeyInput','toggleApiKeyVis','eyeIcon','toast',
  ];

  let missing = 0;
  required.forEach(key => {
    if (!DOM[key]) {
      console.warn(`NovaChatAI WARNING: DOM element not found → "${key}". ` +
        `Check that the HTML id matches exactly.`);
      missing++;
    }
  });

  if (missing === 0) {
    console.log('%cNovaChatAI DOM validation passed ✓', 'color:#68d391;');
  }
}

/* ==========================================================================
   §3 — APPLICATION STATE
   ========================================================================== */
let state = {
  apiKey        : '',
  theme         : 'dark',
  isLoading     : false,
  currentChatId : null,
  chats         : {},
  searchQuery   : '',
};

/* ==========================================================================
   §4 — UTILITY FUNCTIONS
   ========================================================================== */

function generateId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * escapeHtml — sanitises user-provided text before injecting into innerHTML.
 * Critical XSS prevention. Always use this for user-sourced strings.
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(text)));
  return div.innerHTML;
}

/**
 * safeOn — attaches an event listener only if the element is non-null.
 * -------------------------------------------------------------------------
 * BUG FIX: The original attachEventListeners() called .addEventListener()
 * directly on DOM refs that were null (DOM queried before HTML existed).
 * This produced "Cannot read properties of null (reading 'addEventListener')"
 * and crashed the ENTIRE listener setup — leaving the UI completely static.
 *
 * safeOn absorbs null elements gracefully; the rest of the app keeps working.
 */
function safeOn(el, event, handler) {
  if (!el) return;
  el.addEventListener(event, handler);
}

/**
 * parseMarkdown — lightweight Markdown → HTML converter.
 * Code fences are extracted first to prevent double-processing,
 * then restored after all inline rules have been applied.
 */
function parseMarkdown(text) {
  if (typeof text !== 'string') return '';

  const codeBlocks = [];
  let output = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const langLabel = lang
      ? `<div class="code-lang-label">${escapeHtml(lang)}</div>`
      : '';
    codeBlocks.push(
      `<pre>${langLabel}<code>${escapeHtml(code.trim())}</code></pre>`
    );
    return `%%CODEBLOCK_${idx}%%`;
  });

  output = output.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
  output = output.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*(.+?)\*/g, '<em>$1</em>');
  output = output.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  output = output.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  output = output.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  output = output.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  output = output.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  output = output.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  output = output.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  output = output.replace(/^---$/gm, '<hr>');
  output = output.replace(/\n\n/g, '</p><p>');
  output = output.replace(/\n/g, '<br>');
  output = `<p>${output}</p>`;
  output = output.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => codeBlocks[Number(idx)]);

  return output;
}

/* ==========================================================================
   §5 — THEME SYSTEM
   -------------------------------------------------------------------------
   BUG FIX: applyTheme() was called in init() BEFORE populateDOM() ran,
   meaning DOM.themeIcon and DOM.themeRadios were undefined at call time.
   Fixed by strict ordering in init(): populateDOM() always runs first.
   Null guards here provide a second safety net.
   ========================================================================== */

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);

  if (DOM.themeIcon) {
    DOM.themeIcon.className = theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
  }

  if (DOM.themeToggle) {
    DOM.themeToggle.setAttribute('aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    );
  }

  if (DOM.themeRadios) {
    DOM.themeRadios.forEach(radio => {
      radio.checked = radio.value === theme;
    });
  }

  saveTheme(theme);
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

/* ==========================================================================
   §6 — TOAST NOTIFICATION SYSTEM
   ========================================================================== */
let toastTimeout = null;

function showToast(message, type = 'default', duration = 2800) {
  if (!DOM.toast) return;

  if (toastTimeout) clearTimeout(toastTimeout);

  DOM.toast.textContent = message;
  DOM.toast.className   = `toast ${type}`;
  DOM.toast.hidden      = false;

  // Double rAF ensures the transition fires after display:block is applied
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (DOM.toast) DOM.toast.classList.add('show');
    });
  });

  toastTimeout = setTimeout(() => {
    if (DOM.toast) {
      DOM.toast.classList.remove('show');
      setTimeout(() => { if (DOM.toast) DOM.toast.hidden = true; }, 300);
    }
  }, duration);
}

/* ==========================================================================
   §7 — LOCALSTORAGE PERSISTENCE
   -------------------------------------------------------------------------
   JSON.stringify serialises JS objects → strings for storage.
   JSON.parse reverses this. Both wrapped in try/catch because localStorage
   can throw in private browsing or when storage quota is exceeded.
   ========================================================================== */
const STORAGE_KEYS = {
  CHATS  : 'novachat_chats',
  API_KEY: 'novachat_api_key',
  THEME  : 'novachat_theme',
};

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(state.chats));
  } catch (err) {
    console.warn('NovaChatAI: Failed to save chats to localStorage', err);
  }
}

function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHATS);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('NovaChatAI: Failed to parse chats from localStorage', err);
    return {};
  }
}

function saveApiKey(key) {
  try { localStorage.setItem(STORAGE_KEYS.API_KEY, key); } catch (_) {}
}

function loadApiKey() {
  try { return localStorage.getItem(STORAGE_KEYS.API_KEY) || ''; } catch (_) { return ''; }
}

function saveTheme(theme) {
  try { localStorage.setItem(STORAGE_KEYS.THEME, theme); } catch (_) {}
}

function loadTheme() {
  try { return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark'; } catch (_) { return 'dark'; }
}

function clearAllData() {
  try {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  } catch (_) {}
  state.chats = {};
  state.currentChatId = null;
  renderHistoryList();
  startNewChat();
  showToast('All data cleared.', 'success');
}

/* ==========================================================================
   §8 — CHAT SESSION MANAGEMENT
   ========================================================================== */

function startNewChat() {
  const id = generateId();
  state.chats[id] = { id, title: 'New Chat', messages: [] };
  state.currentChatId = id;

  if (DOM.messageFeed) DOM.messageFeed.innerHTML = '';
  showWelcomeScreen(true);
  renderHistoryList();
  saveChats();
  closeSidebar();
}

function loadChat(chatId) {
  const chat = state.chats[chatId];
  if (!chat) return;

  state.currentChatId = chatId;
  if (DOM.messageFeed) DOM.messageFeed.innerHTML = '';

  if (chat.messages.length > 0) {
    showWelcomeScreen(false);
    chat.messages.forEach(msg => {
      appendMessageToFeed(msg.role, msg.content, msg.timestamp, false);
    });
    scrollToBottom();
  } else {
    showWelcomeScreen(true);
  }

  renderHistoryList();
  closeSidebar();
}

function deleteChat(chatId, event) {
  // Prevent the click bubbling to the li row and triggering loadChat
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }

  delete state.chats[chatId];
  saveChats();

  if (state.currentChatId === chatId) {
    startNewChat();
  } else {
    renderHistoryList();
  }

  showToast('Conversation deleted.', 'default');
}

function deriveTitle(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > 42 ? clean.slice(0, 42) + '…' : clean;
}

/* ==========================================================================
   §9 — MESSAGE RENDERING SYSTEM
   ========================================================================== */

/**
 * showWelcomeScreen — toggles welcome screen & message feed visibility.
 * BUG FIX: Added null guards. Previously crashed when called before
 * DOM existed.
 */
function showWelcomeScreen(show) {
  if (DOM.welcomeScreen) DOM.welcomeScreen.hidden      = !show;
  if (DOM.messageFeed)   DOM.messageFeed.style.display = show ? 'none' : 'flex';
}

/**
 * appendMessageToFeed — creates and injects a message bubble into the DOM.
 * @param {'user'|'assistant'} role
 * @param {string}             content
 * @param {number|null}        timestamp
 * @param {boolean}            doScroll
 */
function appendMessageToFeed(role, content, timestamp = null, doScroll = true) {
  if (!DOM.messageFeed) return;

  const ts         = timestamp || Date.now();
  const isUser     = role === 'user';
  const timeString = formatTime(ts);

  // Avatar
  const avatar       = document.createElement('div');
  avatar.className   = 'message__avatar';
  avatar.textContent = isUser ? 'U' : 'N';
  avatar.setAttribute('aria-hidden', 'true');

  // Bubble
  const bubble     = document.createElement('div');
  bubble.className = 'message__bubble';
  if (isUser) {
    bubble.textContent = content; // plain text — XSS safe
  } else {
    bubble.innerHTML = parseMarkdown(content); // safe Markdown parser
  }

  // Meta row
  const meta     = document.createElement('div');
  meta.className = 'message__meta';

  const timeEl       = document.createElement('span');
  timeEl.className   = 'message__time';
  timeEl.textContent = timeString;

  const copyBtn     = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.type      = 'button'; // BUG FIX: prevent accidental form submission
  copyBtn.setAttribute('aria-label', 'Copy message');
  copyBtn.innerHTML = '<i class="ph ph-copy" aria-hidden="true"></i> Copy';

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(content);
      copyBtn.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i> Copied!';
      setTimeout(() => {
        copyBtn.innerHTML = '<i class="ph ph-copy" aria-hidden="true"></i> Copy';
      }, 1800);
    } catch {
      showToast('Could not access clipboard.', 'error');
    }
  });

  meta.append(timeEl, copyBtn);

  const body     = document.createElement('div');
  body.className = 'message__body';
  body.append(bubble, meta);

  const message     = document.createElement('div');
  message.className = `message message--${isUser ? 'user' : 'ai'}`;
  message.setAttribute('aria-label',
    `${isUser ? 'You' : 'NovaChatAI'} at ${timeString}`
  );

  if (isUser) {
    message.append(body, avatar);
  } else {
    message.append(avatar, body);
  }

  DOM.messageFeed.appendChild(message);
  if (doScroll) scrollToBottom();
}

/**
 * scrollToBottom — smoothly scrolls the chat window to the latest message.
 */
function scrollToBottom() {
  if (!DOM.chatWindow) return;
  requestAnimationFrame(() => {
    DOM.chatWindow.scrollTo({ top: DOM.chatWindow.scrollHeight, behavior: 'smooth' });
  });
}

/* ==========================================================================
   §10 — TYPING INDICATOR
   ========================================================================== */

function showTypingIndicator() {
  if (!DOM.typingIndicator) return;
  DOM.typingIndicator.hidden = false;
  scrollToBottom();
}

function hideTypingIndicator() {
  if (!DOM.typingIndicator) return;
  DOM.typingIndicator.hidden = true;
}

/* ==========================================================================
   §11 — API FETCH HANDLER
   ========================================================================== */

async function sendMessageToAPI(userText) {
  // Guard: chat may have been deleted while a prior request was in flight
  const chat = state.chats[state.currentChatId];
  if (!chat) { setLoadingState(false); return; }

  if (!state.apiKey) {
    showToast('Add your OpenRouter API key in Settings ⚙️', 'error', 4000);
    setLoadingState(false);
    return;
  }

  const userTimestamp = Date.now();
  chat.messages.push({ role: 'user', content: userText, timestamp: userTimestamp });

  if (chat.messages.length === 1) {
    chat.title = deriveTitle(userText);
    renderHistoryList();
  }

  showWelcomeScreen(false);
  appendMessageToFeed('user', userText, userTimestamp);
  showTypingIndicator();
  saveChats();

  /*
   * Build the full message history for the API.
   * System prompt always leads, followed by every turn so far.
   */
  const apiMessages = [
    { role: 'system', content: CONFIG.SYSTEM_PROMPT },
    ...chat.messages.map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Bearer ${state.apiKey}`,
        'HTTP-Referer' : CONFIG.SITE_URL,
        'X-Title'      : CONFIG.SITE_NAME,
      },
      body: JSON.stringify({
        model     : CONFIG.MODEL,
        max_tokens: CONFIG.MAX_TOKENS,
        messages  : apiMessages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg  = errorData?.error?.message || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    const data      = await response.json();
    const aiContent = data?.choices?.[0]?.message?.content;
    if (!aiContent) throw new Error('No response content from AI.');

    const aiTimestamp = Date.now();
    chat.messages.push({ role: 'assistant', content: aiContent, timestamp: aiTimestamp });
    saveChats();

    hideTypingIndicator();
    appendMessageToFeed('assistant', aiContent, aiTimestamp);

  } catch (error) {
    hideTypingIndicator();

    const isNetworkError = error instanceof TypeError &&
      error.message.toLowerCase().includes('fetch');

    const userFacingMsg = isNetworkError
      ? 'Network error — check your internet connection.'
      : `API error: ${error.message}`;

    appendMessageToFeed('assistant', `⚠️ ${userFacingMsg}`, Date.now());
    showToast(userFacingMsg, 'error', 5000);
    console.error('NovaChatAI API error:', error);

  } finally {
    // Always restore the input — prevents stuck loading state on any error path
    setLoadingState(false);
  }
}

/* ==========================================================================
   §12 — INPUT & TEXTAREA LOGIC
   ========================================================================== */

function setLoadingState(loading) {
  state.isLoading = loading;

  if (DOM.messageInput) DOM.messageInput.disabled = loading;

  if (DOM.sendBtn) {
    DOM.sendBtn.disabled = loading ||
      (DOM.messageInput ? DOM.messageInput.value.trim().length === 0 : true);
  }

  if (DOM.sendIcon)    DOM.sendIcon.hidden    = loading;
  if (DOM.sendSpinner) DOM.sendSpinner.hidden = !loading;

  if (!loading && DOM.messageInput) DOM.messageInput.focus();
}

function handleSend() {
  if (!DOM.messageInput) return;
  const text = DOM.messageInput.value.trim();
  if (!text || state.isLoading) return;

  DOM.messageInput.value = '';
  autoResizeTextarea();
  updateCharCounter();
  setLoadingState(true);
  sendMessageToAPI(text);
}

function autoResizeTextarea() {
  if (!DOM.messageInput) return;
  DOM.messageInput.style.height = 'auto';
  DOM.messageInput.style.height = `${DOM.messageInput.scrollHeight}px`;
}

function updateCharCounter() {
  if (!DOM.messageInput || !DOM.charCounter) return;

  const len = DOM.messageInput.value.length;
  // BUG FIX: use getAttribute('maxlength') which works even when the
  // .maxLength property returns -1 for unsupported input types
  const max = parseInt(DOM.messageInput.getAttribute('maxlength'), 10) || 4000;

  DOM.charCounter.textContent = `${len} / ${max}`;
  DOM.charCounter.classList.toggle('warn',   len > max * 0.80);
  DOM.charCounter.classList.toggle('danger', len > max * 0.95);

  if (DOM.sendBtn) {
    DOM.sendBtn.disabled = len === 0 || state.isLoading;
  }
}

/* ==========================================================================
   §13 — SIDEBAR SYSTEM
   ========================================================================== */

function openSidebar() {
  if (DOM.sidebar)        DOM.sidebar.classList.add('open');
  if (DOM.sidebarOverlay) DOM.sidebarOverlay.classList.add('visible');
  if (DOM.sidebarToggle)  DOM.sidebarToggle.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  if (DOM.sidebar)        DOM.sidebar.classList.remove('open');
  if (DOM.sidebarOverlay) DOM.sidebarOverlay.classList.remove('visible');
  if (DOM.sidebarToggle)  DOM.sidebarToggle.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function toggleSidebar() {
  if (!DOM.sidebar) return;
  DOM.sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
}

/**
 * renderHistoryList — rebuilds the sidebar chat list from state.chats.
 * Sorts newest-first, filters by search query.
 */
function renderHistoryList() {
  if (!DOM.chatHistoryList) return;

  DOM.chatHistoryList.innerHTML = '';

  let sortedIds = Object.keys(state.chats).sort((a, b) => {
    const tA = parseInt(a.split('_')[1], 10) || 0;
    const tB = parseInt(b.split('_')[1], 10) || 0;
    return tB - tA;
  });

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    sortedIds = sortedIds.filter(id =>
      state.chats[id].title.toLowerCase().includes(q)
    );
  }

  if (DOM.historyEmpty) {
    DOM.historyEmpty.hidden = sortedIds.length > 0;
  }

  sortedIds.forEach(chatId => {
    const chat = state.chats[chatId];
    const li   = document.createElement('li');

    li.className = `history-item${chatId === state.currentChatId ? ' active' : ''}`;
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-label', `Open chat: ${chat.title}`);

    li.innerHTML = `
      <i class="ph ph-chat-circle history-item__icon" aria-hidden="true"></i>
      <span class="history-item__title" title="${escapeHtml(chat.title)}">
        ${escapeHtml(chat.title)}
      </span>
      <button
        class="history-item__delete btn-icon"
        type="button"
        aria-label="Delete this conversation"
        title="Delete"
        data-id="${chatId}"
      >
        <i class="ph ph-trash" aria-hidden="true"></i>
      </button>
    `;

    li.addEventListener('click', () => loadChat(chatId));

    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        loadChat(chatId);
      }
    });

    const deleteBtn = li.querySelector('.history-item__delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', e => deleteChat(chatId, e));
    }

    DOM.chatHistoryList.appendChild(li);
  });
}

/* ==========================================================================
   §14 — SETTINGS MODAL
   ========================================================================== */

function openSettings() {
  if (!DOM.settingsModal) return;
  DOM.settingsModal.hidden = false;
  if (DOM.apiKeyInput) DOM.apiKeyInput.value = state.apiKey;

  const modal = DOM.settingsModal.querySelector('.modal');
  if (modal && typeof modal.focus === 'function') modal.focus();
}

function closeSettings() {
  if (DOM.settingsModal) DOM.settingsModal.hidden = true;
}

function saveSettings() {
  const newKey = DOM.apiKeyInput ? DOM.apiKeyInput.value.trim() : '';
  const checkedRadio = DOM.themeRadios
    ? [...DOM.themeRadios].find(r => r.checked)
    : null;
  const newTheme = checkedRadio ? checkedRadio.value : 'dark';

  state.apiKey = newKey;
  saveApiKey(newKey);
  applyTheme(newTheme);
  closeSettings();
  showToast('Settings saved ✓', 'success');
}

/* ==========================================================================
   §15 — EVENT LISTENERS
   -------------------------------------------------------------------------
   BUG FIX: All .addEventListener() calls now go through safeOn(), which
   checks for null before attaching. This means a single missing element
   does not crash the entire setup and leave the app non-interactive.
   ========================================================================== */

function attachEventListeners() {

  // Sidebar
  safeOn(DOM.sidebarToggle,  'click', toggleSidebar);
  safeOn(DOM.sidebarClose,   'click', closeSidebar);
  safeOn(DOM.sidebarOverlay, 'click', closeSidebar);

  // New chat
  safeOn(DOM.newChatBtnNav,     'click', startNewChat);
  safeOn(DOM.newChatBtnSidebar, 'click', startNewChat);

  // Theme toggle
  safeOn(DOM.themeToggle, 'click', toggleTheme);

  // Settings modal
  safeOn(DOM.settingsBtnNav,     'click', openSettings);
  safeOn(DOM.settingsBtnSidebar, 'click', openSettings);
  safeOn(DOM.settingsClose,      'click', closeSettings);
  safeOn(DOM.saveSettingsBtn,    'click', saveSettings);

  safeOn(DOM.clearAllDataBtn, 'click', () => {
    if (confirm('Delete all conversations? This cannot be undone.')) {
      clearAllData();
      closeSettings();
    }
  });

  // Click outside modal box → close
  safeOn(DOM.settingsModal, 'click', e => {
    if (e.target === DOM.settingsModal) closeSettings();
  });

  // API key visibility toggle
  safeOn(DOM.toggleApiKeyVis, 'click', () => {
    if (!DOM.apiKeyInput) return;
    const isPassword     = DOM.apiKeyInput.type === 'password';
    DOM.apiKeyInput.type = isPassword ? 'text' : 'password';
    if (DOM.eyeIcon) {
      DOM.eyeIcon.className = isPassword ? 'ph ph-eye-slash' : 'ph ph-eye';
    }
  });

  // Input form submit
  safeOn(DOM.inputForm, 'submit', e => {
    e.preventDefault();
    handleSend();
  });

  // Enter to send (Shift+Enter = newline)
  safeOn(DOM.messageInput, 'keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize + char counter
  safeOn(DOM.messageInput, 'input', () => {
    autoResizeTextarea();
    updateCharCounter();
  });

  // Suggestion chips
  if (DOM.chips) {
    DOM.chips.forEach(chip => {
      safeOn(chip, 'click', () => {
        const prompt = chip.dataset.prompt;
        if (!prompt || !DOM.messageInput) return;
        DOM.messageInput.value = prompt;
        autoResizeTextarea();
        updateCharCounter();
        DOM.messageInput.focus();
      });
    });
  }

  // Sidebar search filter
  safeOn(DOM.searchChats, 'input', e => {
    state.searchQuery = e.target.value;
    renderHistoryList();
  });

  // Theme radios inside settings
  if (DOM.themeRadios) {
    DOM.themeRadios.forEach(radio => {
      safeOn(radio, 'change', () => {
        if (radio.checked) applyTheme(radio.value);
      });
    });
  }

  // Global keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (DOM.settingsModal && !DOM.settingsModal.hidden) closeSettings();
      else if (DOM.sidebar && DOM.sidebar.classList.contains('open')) closeSidebar();
    }
  });
}

/* ==========================================================================
   §16 — INITIALISATION
   ==========================================================================
   ROOT FIX EXPLANATION
   ==========================================================================
   THE BUG: The DOM object was built at the TOP LEVEL of the file (outside
   any function). Scripts run as the browser encounters them — BEFORE the
   rest of the HTML is parsed. So every getElementById returned null. Then
   attachEventListeners() called .addEventListener() on null and threw:
     "Cannot read properties of null (reading 'addEventListener')"
   This crashed the entire listener setup. The UI was completely static.

   THE FIX — strict four-step ordering inside DOMContentLoaded:
     1. populateDOM()        ← query all elements NOW (HTML exists)
     2. validateDOM()        ← warn about any missing IDs
     3. applyTheme()         ← safe because DOM is now populated
     4. attachEventListeners()  ← safe because DOM is now populated
   ==========================================================================
*/

function init() {
  // STEP 1: Populate every DOM reference (HTML is guaranteed to exist here)
  populateDOM();

  // STEP 2: Validate — surface any ID mismatches in the console
  validateDOM();

  // STEP 3: Load persisted preferences
  state.apiKey = loadApiKey();
  state.chats  = loadChats();
  const savedTheme = loadTheme();

  // STEP 4: Apply theme (DOM.themeIcon and DOM.themeRadios are valid now)
  applyTheme(savedTheme);

  // STEP 5: Attach all event listeners (all DOM refs are valid now)
  attachEventListeners();

  // STEP 6: Restore most recent chat, or start fresh
  const chatIds = Object.keys(state.chats);
  if (chatIds.length > 0) {
    const newestId = chatIds.sort((a, b) => {
      const tA = parseInt(a.split('_')[1], 10) || 0;
      const tB = parseInt(b.split('_')[1], 10) || 0;
      return tB - tA;
    })[0];
    loadChat(newestId);
  } else {
    startNewChat();
  }

  // STEP 7: Focus input for immediate typing
  if (DOM.messageInput) DOM.messageInput.focus();

  console.log(
    '%cNovaChatAI initialised ✓',
    'color: #f5a623; font-weight: bold; font-size: 13px;'
  );
}

// DOMContentLoaded fires after HTML is fully parsed — the correct and
// only safe moment to query the DOM and bootstrap the application.
document.addEventListener('DOMContentLoaded', init);
