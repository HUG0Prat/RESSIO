const { ipcRenderer } = require('electron');

// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  articles: [],
  feeds: [],
  settings: {},
  currentView: 'all',
  currentFeedFilter: null,
  selectedArticle: null,
  searchQuery: '',
  dateFilter: 'all',
  pendingFeeds: [],
  editingFeedIndex: null, // index dans pendingFeeds du flux en cours d'édition avancée
};

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const data = await ipcRenderer.invoke('get-data');
  const settings = await ipcRenderer.invoke('get-settings');
  state.articles = data.articles || [];
  state.feeds = data.feeds || [];
  state.settings = settings;
  state.pendingFeeds = JSON.parse(JSON.stringify(state.feeds));

  // Charger le logo
  const logoPath = await ipcRenderer.invoke('get-logo-path');
  if (logoPath) {
    document.getElementById('app-logo').src = logoPath;
  } else {
    console.warn('Logo not available, using fallback');
    // Fallback: utiliser un emoji ou masquer l'élément
    document.getElementById('app-logo').style.display = 'none';
  }

  if (data.lastCheck) updateLastCheck(data.lastCheck);

  renderSidebar();
  renderArticles();
  updateStats();
  bindEvents();
}

// ─── IPC Events ──────────────────────────────────────────────────────────────
ipcRenderer.on('refresh-start', () => {
  setStatus('loading', 'Actualisation...');
  document.getElementById('btn-refresh').classList.add('spinning');
});

ipcRenderer.on('feed-loading', (e, name) => {
  setStatus('loading', `Chargement: ${name}`);
});

ipcRenderer.on('feed-error', (e, { name, error }) => {
  console.warn(`Feed error [${name}]:`, error);
});

ipcRenderer.on('refresh-done', async (e, { articles, newCount, lastCheck }) => {
  state.articles = articles;
  const data = await ipcRenderer.invoke('get-data');
  state.feeds = data.feeds;

  setStatus('ok', 'Actif');
  document.getElementById('btn-refresh').classList.remove('spinning');
  updateLastCheck(lastCheck);
  renderSidebar();
  renderArticles();
  updateStats();

  // Rafraîchit le détail si un article est actuellement sélectionné
  if (state.selectedArticle) {
    const updated = state.articles.find(a => a.id === state.selectedArticle.id);
    if (updated) {
      selectArticle(updated);
    } else {
      // L'article a été supprimé, on ferme le détail
      state.selectedArticle = null;
      document.getElementById('detail-empty').style.display = 'flex';
      document.getElementById('detail-content').style.display = 'none';
    }
  }

  if (newCount > 0) {
    showToast(`⚡ ${newCount} nouveau(x) article(s)`, 'Nouveaux articles détectés dans vos flux');
    updateUnreadBadge();
  }
});

// ─── Render Sidebar ───────────────────────────────────────────────────────────
function renderSidebar() {
  const container = document.getElementById('sidebar-feeds');
  container.innerHTML = '';

  const unreadByFeed = {};
  state.articles.forEach(a => {
    if (!a.read) unreadByFeed[a.feedId] = (unreadByFeed[a.feedId] || 0) + 1;
  });

  state.feeds.forEach(feed => {
    const count = unreadByFeed[feed.id] || 0;
    const div = document.createElement('div');
    div.className = 'feed-item' + (state.currentFeedFilter === feed.id ? ' active' : '');
    div.dataset.feedId = feed.id;
    div.innerHTML = `
      <div class="feed-dot" style="background:${feed.color}"></div>
      <span class="feed-name">${feed.name}</span>
      ${count > 0 ? `<span class="feed-unread" style="background:${feed.color}22;color:${feed.color};border:1px solid ${feed.color}44">${count}</span>` : ''}
    `;
    div.addEventListener('click', () => {
      state.currentFeedFilter = feed.id;
      state.currentView = 'all';
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.feed-item').forEach(f => f.classList.remove('active'));
      div.classList.add('active');
      document.getElementById('view-title').textContent = feed.name;
      renderArticles();
    });

    // Menu contextuel pour les flux
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      currentContextTarget = feed;

      showContextMenu(e.clientX, e.clientY, [
        { icon: '⚙', label: 'Modifier le flux', action: () => openFeedSettings(feed) },
        'sep',
        { icon: '✓', label: 'Tout marquer comme lu', action: () => markFeedAsRead(feed.id) },
        { icon: '↻', label: 'Actualiser ce flux', action: () => refreshSingleFeed(feed) },
        'sep',
        { icon: '✕', label: 'Supprimer', class: 'danger', action: () => deleteFeed(feed.id) }
      ]);
    });

    container.appendChild(div);
  });

  const all = state.articles.length;
  const newOnes = state.articles.filter(a => a.isNew).length;
  const unread = state.articles.filter(a => !a.read).length;

  document.getElementById('count-all').textContent = all;
  document.getElementById('count-new').textContent = newOnes;
  document.getElementById('count-unread').textContent = unread;
}

// ─── Render Articles ──────────────────────────────────────────────────────────
function renderArticles() {
  const container = document.getElementById('articles-list');
  let articles = [...state.articles];

  if (state.currentFeedFilter !== null)
    articles = articles.filter(a => a.feedId === state.currentFeedFilter);
  if (state.currentView === 'new') articles = articles.filter(a => a.isNew);
  if (state.currentView === 'unread') articles = articles.filter(a => !a.read);

  if (state.dateFilter === 'today') {
    const today = new Date(); today.setHours(0,0,0,0);
    articles = articles.filter(a => new Date(a.pubDate) >= today);
  } else if (state.dateFilter === 'week') {
    const week = new Date(); week.setDate(week.getDate() - 7);
    articles = articles.filter(a => new Date(a.pubDate) >= week);
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    articles = articles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.feedName.toLowerCase().includes(q)
    );
  }

  if (articles.length === 0) {
    container.innerHTML = `<div class="articles-empty">${state.searchQuery ? 'Aucun résultat pour "' + state.searchQuery + '"' : 'Aucun article'}</div>`;
    return;
  }

  container.innerHTML = '';
  articles.forEach((article, i) => {
    const card = document.createElement('div');
    card.className = `article-card${article.read ? ' read' : ' unread'}${article.isNew ? ' is-new' : ''}${state.selectedArticle?.id === article.id ? ' active' : ''}`;
    card.style.setProperty('--feed-color', article.feedColor);
    card.style.animationDelay = `${Math.min(i * 20, 200)}ms`;
    card.dataset.id = article.id;

    card.innerHTML = `
      <div class="article-meta">
        <span class="article-source" style="background:${article.feedColor}22;color:${article.feedColor};border:1px solid ${article.feedColor}44">${article.feedName}</span>
        <span class="article-date">${formatDate(article.pubDate)}</span>
      </div>
      <div class="article-title">${escapeHtml(article.title)}</div>
      ${article.description ? `<div class="article-excerpt">${escapeHtml(article.description)}</div>` : ''}
    `;
    card.addEventListener('click', () => selectArticle(article));

    // Menu contextuel pour les articles
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      currentContextTarget = article;

      showContextMenu(e.clientX, e.clientY, [
        { icon: '✓', label: 'Marquer comme lu', class: article.read ? '' : 'success', action: () => markArticleAsRead(article) },
        { icon: '↗', label: 'Lire l\'article complet', action: () => ipcRenderer.invoke('open-external', article.link) },
        'sep',
        { icon: '�', label: 'Modifier le flux', action: () => openFeedEditorFromArticle(article) },
        { icon: '⚙', label: 'Paramètres avancés', action: () => openFeedAdvancedFromArticle(article) },
        'sep',
        { icon: '✕', label: 'Supprimer l\'article', class: 'danger', action: () => deleteArticle(article) }
      ]);
    });

    container.appendChild(card);
  });
}

// ─── Select Article ───────────────────────────────────────────────────────────
async function selectArticle(article) {
  state.selectedArticle = article;

  if (!article.read || article.isNew) {
    article.read = true;
    article.isNew = false;
    await ipcRenderer.invoke('mark-read', article.id);
    renderSidebar();
    updateStats();
    updateUnreadBadge();
  }

  document.querySelectorAll('.article-card').forEach(c => {
    c.classList.toggle('active', c.dataset.id === article.id);
    if (c.dataset.id === article.id) {
      c.classList.remove('is-new', 'unread');
      c.classList.add('read');
    }
  });

  document.getElementById('detail-empty').style.display = 'none';
  const content = document.getElementById('detail-content');
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.flex = '1';

  document.getElementById('detail-source-badge').textContent = article.feedName;
  document.getElementById('detail-source-badge').style.cssText = `background:${article.feedColor}22;color:${article.feedColor};border:1px solid ${article.feedColor}44`;
  document.getElementById('detail-date').textContent = formatDateFull(article.pubDate);
  document.getElementById('detail-new-badge').className = 'detail-new-badge';
  document.getElementById('detail-title').textContent = article.title;
  document.getElementById('detail-description').textContent = article.description || 'Aucun résumé disponible. Cliquez sur "Lire l\'article complet" pour accéder au contenu.';

  document.getElementById('btn-open-link').onclick = () => ipcRenderer.invoke('open-external', article.link);
  document.getElementById('btn-mark-read').onclick = async () => {
    article.read = true;
    await ipcRenderer.invoke('mark-read', article.id);
    renderArticles();
    updateStats();
  };
  document.getElementById('btn-delete-article').onclick = async () => {
    await ipcRenderer.invoke('delete-article', article.id);
    state.articles = state.articles.filter(a => a.id !== article.id);
    state.selectedArticle = null;
    document.getElementById('detail-empty').style.display = 'flex';
    document.getElementById('detail-content').style.display = 'none';
    renderSidebar();
    renderArticles();
    updateStats();
  };

  // Menu contextuel pour le détail de l'article
  content.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    currentContextTarget = article;

    showContextMenu(e.clientX, e.clientY, [
      { icon: '📄', label: 'Copier le contenu', action: () => copyToClipboard(article.description || '') },
      { icon: '📝', label: 'Copier le titre', action: () => copyToClipboard(article.title) },
      { icon: '🔗', label: 'Copier le lien', action: () => copyToClipboard(article.link) },
      'sep',
      { icon: '📝', label: 'Modifier le flux', action: () => openFeedEditorFromArticle(article) },
      { icon: '⚙', label: 'Paramètres avancés', action: () => openFeedAdvancedFromArticle(article) },
      'sep',
      { icon: '↻', label: 'Actualiser le contenu', action: () => refreshArticleContent(article) }
    ]);
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-total').textContent = state.articles.length;
  document.getElementById('stat-unread').textContent = state.articles.filter(a => !a.read).length;
  document.getElementById('stat-feeds').textContent = state.feeds.filter(f => f.active).length;
}

function updateUnreadBadge() {
  const newCount = state.articles.filter(a => a.isNew).length;
  const badge = document.getElementById('unread-badge');
  if (newCount > 0) {
    badge.textContent = `${newCount} nouvelles`;
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
  document.getElementById('count-new').textContent = newCount;
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function openSettings() {
  state.pendingFeeds = JSON.parse(JSON.stringify(state.feeds));
  state.editingFeedIndex = null;
  document.getElementById('setting-interval').value = state.settings.refreshInterval;
  document.getElementById('setting-max-articles').value = state.settings.maxArticlesPerFeed;
  document.getElementById('toggle-notifs').className = 'toggle' + (state.settings.notificationsEnabled ? ' on' : '');
  hideFeedAdvanced();
  hideFeedEditor();
  renderFeedsEditor();
  document.getElementById('settings-panel').classList.add('open');
}

// ─── Feed Editor ──────────────────────────────────────────────────────────────
function renderFeedsEditor() {
  const container = document.getElementById('feeds-editor');
  document.getElementById('feeds-count').textContent = `${state.pendingFeeds.length} sources`;
  container.innerHTML = '';

  state.pendingFeeds.forEach((feed, i) => {
    const fmt = feed.feedFormat || { mode: 'auto', fields: {} };
    const row = document.createElement('div');
    row.className = 'feed-edit-row';
    row.innerHTML = `
      <input type="color" class="feed-color-input" value="${feed.color}" title="Choisir la couleur" data-ci="${i}">
      <span class="feed-edit-name">${escapeHtml(feed.name)}</span>
      <span class="feed-edit-url" style="display:none; font-size:9px; color:var(--text-dim); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:0 4px;">${escapeHtml(feed.url)}</span>
      <span class="feed-format-badge ${fmt.mode !== 'auto' ? 'custom' : ''}">${fmt.mode === 'auto' ? 'AUTO' : fmt.mode.toUpperCase()}</span>
      <div class="toggle ${feed.active ? 'on' : ''}" data-ti="${i}" title="${feed.active ? 'Actif' : 'Inactif'}"></div>
      <button class="btn-advanced" data-edit="${i}" title="Modifier le flux">📝 Éditer</button>
      <button class="btn-advanced" data-adv="${i}" title="Paramètres avancés du flux">⚙ Avancé</button>
      <button class="btn-secondary btn-remove-feed" data-remove="${i}" style="padding:3px 8px;font-size:10px">✕</button>
    `;

    row.querySelector('.feed-color-input').addEventListener('input', (e) => {
      state.pendingFeeds[i].color = e.target.value;
      row.querySelector('.feed-color-input').style.outline = `2px solid ${e.target.value}`;
    });

    row.querySelector('[data-ti]').addEventListener('click', (e) => {
      state.pendingFeeds[i].active = !state.pendingFeeds[i].active;
      e.currentTarget.classList.toggle('on');
    });

    row.querySelector('[data-edit]').addEventListener('click', () => {
      openFeedEditor(i);
    });

    row.querySelector('[data-adv]').addEventListener('click', () => {
      openFeedAdvanced(i);
    });

    row.querySelector('[data-remove]').addEventListener('click', () => {
      state.pendingFeeds.splice(i, 1);
      if (state.editingFeedIndex === i) hideFeedAdvanced();
      else if (state.editingFeedIndex > i) state.editingFeedIndex--;
      renderFeedsEditor();
    });

    container.appendChild(row);
  });
}

// ─── Feed Editor (Inline) ─────────────────────────────────────────────────────
function openFeedEditor(index) {
  state.editingFeedIndex = index;
  const feed = state.pendingFeeds[index];

  document.getElementById('edit-field-name').value = feed.name;
  document.getElementById('edit-field-url').value = feed.url;
  document.getElementById('edit-field-color').value = feed.color;

  document.getElementById('feed-edit-panel').classList.add('open');
}

function openFeedEditorFromArticle(article) {
  // Ouvrir l'éditeur basique (nom, lien, couleur) pour le flux de l'article
  const feed = state.feeds.find(f => f.id === article.feedId);
  if (!feed) return;
  
  openSettings();
  const index = state.pendingFeeds.findIndex(f => f.id === feed.id);
  if (index >= 0) {
    openFeedEditor(index);
  }
}

function hideFeedEditor() {
  document.getElementById('feed-edit-panel').classList.remove('open');
  state.editingFeedIndex = null;
}

function saveFeedEditor() {
  const i = state.editingFeedIndex;
  if (i === null || i === undefined) return;

  const name = document.getElementById('edit-field-name').value.trim();
  const url = document.getElementById('edit-field-url').value.trim();
  const color = document.getElementById('edit-field-color').value;

  if (!name || !url) {
    showToast('❌ Erreur', 'Le nom et l\'URL ne peuvent pas être vides');
    return;
  }

  state.pendingFeeds[i].name = name;
  state.pendingFeeds[i].url = url;
  state.pendingFeeds[i].color = color;

  hideFeedEditor();
  renderFeedsEditor();
  showToast('✓ Modifié', 'Les paramètres du flux ont été mises à jour');
}

// ─── Feed Advanced Editor ─────────────────────────────────────────────────────
function openFeedAdvanced(index) {
  state.editingFeedIndex = index;
  const feed = state.pendingFeeds[index];
  const fmt = feed.feedFormat || { mode: 'auto', fields: {} };
  const f = fmt.fields || {};

  document.getElementById('adv-feed-title').textContent = feed.name;
  document.getElementById('adv-mode').value = fmt.mode || 'auto';
  document.getElementById('adv-field-title').value = f.title || '';
  document.getElementById('adv-field-link').value = f.link || '';
  document.getElementById('adv-field-description').value = f.description || '';
  document.getElementById('adv-field-pubdate').value = f.pubDate || '';
  document.getElementById('adv-field-id').value = f.id || '';

  toggleAdvancedFields(fmt.mode || 'auto');
  document.getElementById('feed-advanced-panel').classList.add('open');
}

function hideFeedAdvanced() {
  document.getElementById('feed-advanced-panel').classList.remove('open');
  state.editingFeedIndex = null;
}

function toggleAdvancedFields(mode) {
  const fieldsSection = document.getElementById('adv-fields-section');
  fieldsSection.style.display = (mode === 'auto') ? 'none' : 'block';
}

function saveAdvanced() {
  const i = state.editingFeedIndex;
  if (i === null || i === undefined) return;

  const mode = document.getElementById('adv-mode').value;
  const fields = {
    title:       document.getElementById('adv-field-title').value.trim(),
    link:        document.getElementById('adv-field-link').value.trim(),
    description: document.getElementById('adv-field-description').value.trim(),
    pubDate:     document.getElementById('adv-field-pubdate').value.trim(),
    id:          document.getElementById('adv-field-id').value.trim(),
  };

  state.pendingFeeds[i].feedFormat = { mode, fields };
  hideFeedAdvanced();
  renderFeedsEditor();
}

// ─── Events ───────────────────────────────────────────────────────────────────
function bindEvents() {
  // Nav items
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      state.currentView = item.dataset.view;
      state.currentFeedFilter = null;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.feed-item').forEach(f => f.classList.remove('active'));
      item.classList.add('active');
      const titles = { all: 'Tous les articles', new: 'Nouveaux articles', unread: 'Articles non lus' };
      document.getElementById('view-title').textContent = titles[item.dataset.view];
      renderArticles();
    });
  });

  // Filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.dateFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderArticles();
    });
  });

  document.getElementById('search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderArticles();
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    ipcRenderer.invoke('refresh-feeds');
  });

  document.getElementById('btn-mark-all').addEventListener('click', async () => {
    await ipcRenderer.invoke('mark-all-read');
    state.articles.forEach(a => { a.read = true; a.isNew = false; });
    renderSidebar(); renderArticles(); updateStats(); updateUnreadBadge();
    showToast('✓ Terminé', 'Tous les articles marqués comme lus');
  });

  // Menu contextuel pour la titlebar
  document.getElementById('titlebar').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      { icon: '↻', label: 'Actualiser tous les flux', class: 'primary', action: () => ipcRenderer.invoke('refresh-feeds') },
      { icon: '✓', label: 'Tout marquer comme lu', action: async () => {
        await ipcRenderer.invoke('mark-all-read');
        state.articles.forEach(a => { a.read = true; a.isNew = false; });
        renderSidebar(); renderArticles(); updateStats(); updateUnreadBadge();
        showToast('✓ Terminé', 'Tous les articles marqués comme lus');
      }}
    ]);
  });

  // Settings open/close
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', () => document.getElementById('settings-panel').classList.remove('open'));
  document.getElementById('settings-cancel').addEventListener('click', () => document.getElementById('settings-panel').classList.remove('open'));
  document.getElementById('settings-panel').addEventListener('click', (e) => {
    if (e.target === document.getElementById('settings-panel')) document.getElementById('settings-panel').classList.remove('open');
  });

  document.getElementById('toggle-notifs').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('on');
  });

  // Add feed
  document.getElementById('btn-add-feed-confirm').addEventListener('click', () => {
    const name = document.getElementById('new-feed-name').value.trim();
    const url  = document.getElementById('new-feed-url').value.trim();
    if (!name || !url) return;
    const palette = ['#ff4444','#ff8800','#00d4ff','#ff0066','#aa44ff','#44ffaa','#ffdd00','#ff6688','#00ffcc'];
    state.pendingFeeds.push({
      id: Date.now(), name, url, active: true,
      color: palette[state.pendingFeeds.length % palette.length],
      feedFormat: { mode: 'auto', fields: {} }
    });
    document.getElementById('new-feed-name').value = '';
    document.getElementById('new-feed-url').value = '';
    renderFeedsEditor();
  });

  document.getElementById('btn-add-feed').addEventListener('click', openSettings);

  // Save settings
  document.getElementById('settings-save').addEventListener('click', async () => {
    // Ferme l'éditeur avancé ouvert s'il y en a un (annule sans sauver)
    hideFeedAdvanced();
    const settings = {
      refreshInterval:    parseInt(document.getElementById('setting-interval').value) || 15,
      maxArticlesPerFeed: parseInt(document.getElementById('setting-max-articles').value) || 20,
      notificationsEnabled: document.getElementById('toggle-notifs').classList.contains('on'),
    };
    await ipcRenderer.invoke('save-settings', settings);
    await ipcRenderer.invoke('save-feeds', state.pendingFeeds);
    state.settings = settings;
    state.feeds = JSON.parse(JSON.stringify(state.pendingFeeds));
    document.getElementById('settings-panel').classList.remove('open');
    renderSidebar(); updateStats();
    showToast('✓ Sauvegardé', 'Paramètres enregistrés');
  });

  // Export data
  document.getElementById('btn-export-data').addEventListener('click', async () => {
    await ipcRenderer.invoke('export-data');
    showToast('📁 Explorateur ouvert', 'Le dossier de données a été ouvert');
  });

  // Clear data
  document.getElementById('btn-clear-data').addEventListener('click', async () => {
    if (confirm('⚠️ ATTENTION\n\nCette action va supprimer TOUTES vos données personnelles :\n• Tous les articles sauvegardés\n• Tous les flux RSS personnalisés\n• Tous les paramètres modifiés\n\nL\'application sera remise à zéro avec les flux par défaut.\n\nCette action est IRRÉVERSIBLE.\n\nConfirmer la réinitialisation ?')) {
      const success = await ipcRenderer.invoke('clear-data');
      if (success) {
        // Recharger l'application
        location.reload();
      } else {
        showToast('❌ Erreur', 'Impossible de supprimer les données');
      }
    }
  });

  // Advanced panel events
  document.getElementById('adv-mode').addEventListener('change', (e) => {
    toggleAdvancedFields(e.target.value);
  });

  document.getElementById('adv-save').addEventListener('click', saveAdvanced);
  document.getElementById('adv-cancel').addEventListener('click', hideFeedAdvanced);

  // Feed edit panel events
  document.getElementById('edit-save').addEventListener('click', saveFeedEditor);
  document.getElementById('edit-cancel').addEventListener('click', hideFeedEditor);

  // Window controls
  document.getElementById('btn-min').addEventListener('click', () => ipcRenderer.send('window-minimize'));
  document.getElementById('btn-max').addEventListener('click', () => ipcRenderer.send('window-maximize'));
  document.getElementById('btn-close').addEventListener('click', () => ipcRenderer.send('window-close'));

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('context-menu').style.display === 'block') {
        hideContextMenu();
      } else if (document.getElementById('feed-edit-panel').classList.contains('open')) {
        hideFeedEditor();
      } else if (document.getElementById('feed-advanced-panel').classList.contains('open')) {
        hideFeedAdvanced();
      } else {
        document.getElementById('settings-panel').classList.remove('open');
      }
    }
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ipcRenderer.invoke('refresh-feeds'); }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(type, text) {
  document.getElementById('status-dot').className = 'status-dot' + (type === 'loading' ? ' loading' : type === 'error' ? ' error' : '');
  document.getElementById('status-text').textContent = text;
}

function updateLastCheck(iso) {
  const t = formatTime(iso);
  document.getElementById('last-check-time').textContent = `MAJ ${t}`;
  document.getElementById('stat-lastcheck').textContent = t;
}

function formatDate(iso) {
  try {
    const d = new Date(iso), now = new Date(), diff = now - d;
    if (diff < 3600000) return `il y a ${Math.floor(diff/60000)}min`;
    if (diff < 86400000) return `il y a ${Math.floor(diff/3600000)}h`;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  } catch { return '–'; }
}

function formatDateFull(iso) {
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return '–'; }
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '–'; }
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(title, body) {
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-body').textContent = body;
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// ─── Context Menu Actions ─────────────────────────────────────────────────────

// Actions pour les flux
function openFeedSettings(feed) {
  // Ouvrir les paramètres et afficher le panel d'édition
  state.pendingFeeds = JSON.parse(JSON.stringify(state.feeds));
  state.editingFeedIndex = null;
  
  // Ouvrir les paramètres
  document.getElementById('setting-interval').value = state.settings.refreshInterval;
  document.getElementById('setting-max-articles').value = state.settings.maxArticlesPerFeed;
  document.getElementById('toggle-notifs').className = 'toggle' + (state.settings.notificationsEnabled ? ' on' : '');
  hideFeedAdvanced();
  hideFeedEditor();
  renderFeedsEditor();
  document.getElementById('settings-panel').classList.add('open');
  
  // Trouver l'index du flux dans pendingFeeds et l'ouvrir en édition
  const index = state.pendingFeeds.findIndex(f => f.id === feed.id);
  if (index >= 0) {
    openFeedEditor(index);
  }
}

function openFeedAdvancedForFeed(feed) {
  openFeedSettings(feed); // Même chose que openFeedSettings pour l'instant
}

function markFeedAsRead(feedId) {
  const articlesToMark = state.articles.filter(a => a.feedId === feedId && !a.read);
  articlesToMark.forEach(async (article) => {
    article.read = true;
    article.isNew = false;
    await ipcRenderer.invoke('mark-read', article.id);
  });
  renderSidebar();
  renderArticles();
  updateStats();
  updateUnreadBadge();
  showToast('✓ Terminé', `${articlesToMark.length} article(s) marqué(s) comme lu(s)`);
}

async function refreshSingleFeed(feed) {
  setStatus('loading', `Actualisation: ${feed.name}`);
  try {
    const xml = await ipcRenderer.invoke('fetch-feed-xml', feed.url);
    const articles = await ipcRenderer.invoke('parse-feed-xml', xml, feed);
    
    for (const article of articles.slice(0, state.settings.maxArticlesPerFeed)) {
      if (!state.articles.some(a => a.id === article.id)) {
        article.isNew = true;
        state.articles.unshift(article);
      }
    }
    
    setStatus('ok', 'Actif');
    renderSidebar();
    renderArticles();
    updateStats();
    updateUnreadBadge();
    
    const newCount = articles.filter(a => a.isNew).length;
    if (newCount > 0) {
      showToast(`⚡ ${newCount} nouveau(x) article(s)`, `Nouveaux articles dans ${feed.name}`);
    } else {
      showToast('✓ Actualisé', `Aucun nouvel article dans ${feed.name}`);
    }
  } catch (e) {
    setStatus('error', 'Erreur');
    showToast('❌ Erreur', `Impossible d'actualiser ${feed.name}`);
  }
}

async function deleteFeed(feedId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce flux ?')) return;
  
  state.feeds = state.feeds.filter(f => f.id !== feedId);
  state.articles = state.articles.filter(a => a.feedId !== feedId);
  await ipcRenderer.invoke('save-feeds', state.feeds);
  
  renderSidebar();
  renderArticles();
  updateStats();
  updateUnreadBadge();
  showToast('✓ Supprimé', 'Le flux a été supprimé');
}

// Actions pour les articles
async function markArticleAsRead(article) {
  if (article.read) return;
  article.read = true;
  article.isNew = false;
  await ipcRenderer.invoke('mark-read', article.id);
  renderSidebar();
  renderArticles();
  updateStats();
  updateUnreadBadge();
}

function openFeedAdvancedFromArticle(article) {
  // Ouvrir les paramètres avancés en utilisant les données de cet article comme template
  const feed = state.feeds.find(f => f.id === article.feedId);
  if (!feed) return;
  
  openSettings();
  // Trouver l'index du flux
  const index = state.pendingFeeds.findIndex(f => f.id === feed.id);
  if (index >= 0) {
    state.editingFeedIndex = index;
    const fmt = feed.feedFormat || { mode: 'auto', fields: {} };
    
    // Pré-remplir avec les données de l'article comme template
    document.getElementById('adv-mode').value = 'custom';
    document.getElementById('adv-field-title').value = 'title'; // Utiliser les balises standard
    document.getElementById('adv-field-link').value = 'link';
    document.getElementById('adv-field-description').value = 'description';
    document.getElementById('adv-field-pubdate').value = 'pubDate';
    document.getElementById('adv-field-id').value = 'guid';
    
    toggleAdvancedFields('custom');
    document.getElementById('feed-advanced-panel').classList.add('open');
  }
}

async function deleteArticle(article) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) return;
  
  await ipcRenderer.invoke('delete-article', article.id);
  state.articles = state.articles.filter(a => a.id !== article.id);
  
  if (state.selectedArticle?.id === article.id) {
    state.selectedArticle = null;
    document.getElementById('detail-empty').style.display = 'flex';
    document.getElementById('detail-content').style.display = 'none';
  }
  
  renderSidebar();
  renderArticles();
  updateStats();
  updateUnreadBadge();
  showToast('✓ Supprimé', 'L\'article a été supprimé');
}

// Actions générales
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('✓ Copié', 'Le texte a été copié dans le presse-papiers');
  }).catch(() => {
    showToast('❌ Erreur', 'Impossible de copier le texte');
  });
}

async function refreshArticleContent(article) {
  // Actualiser le contenu de cet article spécifique
  // Pour l'instant, on peut juste rafraîchir tout le flux
  const feed = state.feeds.find(f => f.id === article.feedId);
  if (feed) {
    await refreshSingleFeed(feed);
  }
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
let currentContextTarget = null;

function showContextMenu(x, y, items) {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = '';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  items.forEach(item => {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'context-sep';
      menu.appendChild(sep);
      return;
    }

    const div = document.createElement('div');
    div.className = `context-item ${item.class || ''}`;
    div.innerHTML = `<span class="context-icon">${item.icon}</span><span>${item.label}</span>`;
    div.addEventListener('click', () => {
      hideContextMenu();
      if (item.action) item.action();
    });
    menu.appendChild(div);
  });

  menu.style.display = 'block';

  // Fermer le menu si on clique ailleurs
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 10);
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
  currentContextTarget = null;
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();