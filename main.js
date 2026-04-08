const { app, BrowserWindow, Notification, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

function makeId(str) {
  return crypto.createHash('md5').update(str || String(Math.random())).digest('hex').slice(0, 32);
}

const DATA_PATH = path.join(app.getPath('userData'), 'ressio_data.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'ressio_settings.json');

let mainWindow;
let checkInterval = null;

const DEFAULT_FEEDS = [
  { id: 1, name: 'Juridique', url: 'https://www.actu-juridique.fr/feed/', active: true, color: '#ff4444' },
  { id: 2, name: 'Voyages', url: 'https://www.brochuresenligne.com/xml/syndication.rss', active: true, color: '#ff8800' },
  { id: 3, name: 'Economie', url: 'https://www.abcbourse.com/rss/chroniquesrss', active: true, color: '#00d4ff' },
  { id: 4, name: 'Géopolitique', url: 'https://feeds.feedburner.com/AfricaIntelligence-fr', active: true, color: '#ff0066' },
  { id: 5, name: 'Cybersecurité', url: 'https://www.01net.com/tag/cybersecurite/feed/', active: true, color: '#aa44ff' },
  { id: 6, name: 'Jeux vidéo', url: 'https://partner-feeds.20min.ch/rss/20minutes/jeux-video', active: true, color: '#44ffaa' },
  { id: 7, name: 'Programmation', url: 'https://blog.adatechschool.fr/rss/', active: true, color: '#ffdd00' },
];

const DEFAULT_SETTINGS = {
  refreshInterval: 15,
  notificationsEnabled: true,
  maxArticlesPerFeed: 20,
  theme: 'dark',
};

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    // Migration depuis l'ancien nom CyberWatch
    const oldPath = path.join(app.getPath('userData'), 'cyberwatch_data.json');
    if (fs.existsSync(oldPath)) {
      const data = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
      fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
      return data;
    }
  } catch (e) {}
  return { feeds: DEFAULT_FEEDS, articles: [], lastCheck: null };
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
    const oldPath = path.join(app.getPath('userData'), 'cyberwatch_settings.json');
    if (fs.existsSync(oldPath)) {
      const s = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(oldPath, 'utf8')) };
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
      return s;
    }
  } catch (e) {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Ressio RSS Reader/1.0' },
      timeout: 10000
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function extractTag(xml, tag) {
  const re = new RegExp(
    '<' + tag + '[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/' + tag + '>',
    'i'
  );
  const match = xml.match(re);
  return match ? match[1].trim() : '';
}

function extractAttr(xml, tag, attr) {
  const match = xml.match(new RegExp('<' + tag + '[^>]*' + attr + '=["\']([^"\']+)["\']', 'i'));
  return match ? match[1] : '';
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHtml(html) {
  return html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, code) => String.fromCharCode(parseInt(code)))
    .replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

function extractField(block, customTag, fallbacks) {
  if (customTag && customTag.trim()) {
    const val = extractTag(block, customTag.trim()) || extractAttr(block, customTag.trim(), 'href');
    if (val) return val;
  }
  for (const tag of fallbacks) {
    const val = extractTag(block, tag) || (tag === 'link' ? extractAttr(block, 'link', 'href') : '');
    if (val) return val;
  }
  return '';
}

function buildArticle(block, feedInfo, customFields) {
  const f = customFields || {};
  const title   = extractField(block, f.title,       ['title']);
  const link    = extractField(block, f.link,        ['link', 'guid']);
  const desc    = extractField(block, f.description, ['description', 'summary', 'content:encoded', 'content']);
  const pubDate = extractField(block, f.pubDate,     ['pubDate', 'published', 'updated', 'dc:date']);
  const idRaw   = extractField(block, f.id,          ['guid', 'id']) || link;

  if (!title || !link) return null;

  let parsedDate = new Date().toISOString();
  if (pubDate) {
    const d = new Date(pubDate.replace(/<!\[CDATA\[|\]\]>/g, '').trim());
    if (!isNaN(d.getTime())) parsedDate = d.toISOString();
  }

  return {
    id: makeId(idRaw || link),
    feedId: feedInfo.id,
    feedName: feedInfo.name,
    feedColor: feedInfo.color,
    title: decodeHtml(title),
    link: link.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
    description: decodeHtml(stripHtml(desc || '')).slice(0, 500),
    pubDate: parsedDate,
    isNew: false,
    read: false,
  };
}

function parseRSS(xml, feedInfo) {
  const articles = [];
  const fmt = feedInfo.feedFormat || {};
  const mode = fmt.mode || 'auto';
  const customFields = (mode !== 'auto') ? (fmt.fields || {}) : {};

  const parseBlocks = (blockTag) => {
    const re = new RegExp('<' + blockTag + '[^>]*>([\\s\\S]*?)<\\/' + blockTag + '>', 'gi');
    let m;
    while ((m = re.exec(xml)) !== null) {
      const art = buildArticle(m[1], feedInfo, customFields);
      if (art) articles.push(art);
    }
  };

  if (mode === 'atom') {
    parseBlocks('entry');
    if (articles.length === 0) parseBlocks('item');
  } else {
    parseBlocks('item');
    if (articles.length === 0) parseBlocks('entry');
  }

  return articles;
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

async function refreshFeeds() {
  const data = loadData();
  const settings = loadSettings();
  const newArticles = [];

  mainWindow?.webContents.send('refresh-start');

  for (const feed of data.feeds.filter(f => f.active)) {
    try {
      mainWindow?.webContents.send('feed-loading', feed.name);
      const xml = await fetchUrl(feed.url);
      const articles = parseRSS(xml, feed);

      for (const article of articles.slice(0, settings.maxArticlesPerFeed)) {
        if (!data.articles.some(a => a.id === article.id)) {
          article.isNew = true;
          newArticles.push(article);
          data.articles.unshift(article);
        }
      }
    } catch (e) {
      console.error(`Feed error for ${feed.name}:`, e.message);
      mainWindow?.webContents.send('feed-error', { name: feed.name, error: e.message });
    }
  }

  data.articles = data.articles.slice(0, 500);
  data.lastCheck = new Date().toISOString();
  saveData(data);

  if (newArticles.length > 0 && settings.notificationsEnabled) {
    new Notification({
      title: `⚡ Ressio — ${newArticles.length} nouvel(les) article(s)`,
      body: newArticles.slice(0, 3).map(a => `• ${a.title.slice(0, 60)}`).join('\n'),
      icon: path.join(__dirname, 'assets', 'logo.ico'),
    }).show();
  }

  mainWindow?.webContents.send('refresh-done', { articles: data.articles, newCount: newArticles.length, lastCheck: data.lastCheck });
  return { articles: data.articles, newCount: newArticles.length };
}

function startAutoRefresh() {
  if (checkInterval) clearInterval(checkInterval);
  const settings = loadSettings();
  checkInterval = setInterval(refreshFeeds, settings.refreshInterval * 60 * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0d12',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'assets', 'logo.ico'),
  });

  mainWindow.loadFile('src/index.html');
  startAutoRefresh();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ─── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle('get-data', () => loadData());
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (e, settings) => { saveSettings(settings); startAutoRefresh(); return true; });
ipcMain.handle('refresh-feeds', () => refreshFeeds());
ipcMain.handle('mark-read', (e, articleId) => {
  const data = loadData();
  const art = data.articles.find(a => a.id === articleId);
  if (art) { art.read = true; art.isNew = false; }
  saveData(data); return true;
});
ipcMain.handle('mark-all-read', () => {
  const data = loadData();
  data.articles.forEach(a => { a.read = true; a.isNew = false; });
  saveData(data); return true;
});
ipcMain.handle('save-feeds', (e, feeds) => {
  const data = loadData();
  data.feeds = feeds;
  saveData(data); return true;
});
ipcMain.handle('open-external', (e, url) => { shell.openExternal(url); });
ipcMain.handle('delete-article', (e, articleId) => {
  const data = loadData();
  data.articles = data.articles.filter(a => a.id !== articleId);
  saveData(data); return true;
});
ipcMain.handle('get-logo-path', () => {
  const logoPath = path.join(__dirname, 'assets', 'logo.ico');
  if (fs.existsSync(logoPath)) {
    return logoPath;
  } else {
    console.warn('Logo file not found:', logoPath);
    return null;
  }
});
ipcMain.handle('fetch-feed-xml', async (e, url) => {
  return await fetchUrl(url);
});
ipcMain.handle('parse-feed-xml', async (e, xml, feed) => {
  return parseRSS(xml, feed);
});
ipcMain.handle('export-data', () => {
  const userDataDir = app.getPath('userData');
  shell.openPath(userDataDir);
  return true;
});
ipcMain.handle('clear-data', () => {
  try {
    // Supprimer les fichiers de données
    if (fs.existsSync(DATA_PATH)) fs.unlinkSync(DATA_PATH);
    if (fs.existsSync(SETTINGS_PATH)) fs.unlinkSync(SETTINGS_PATH);
    
    // Remettre les paramètres par défaut
    const defaultData = { feeds: DEFAULT_FEEDS, articles: [], lastCheck: null };
    const defaultSettings = DEFAULT_SETTINGS;
    saveData(defaultData);
    saveSettings(defaultSettings);
    
    // Redémarrer l'auto-refresh avec les nouveaux paramètres
    startAutoRefresh();
    
    return true;
  } catch (error) {
    console.error('Erreur lors de la suppression des données:', error);
    return false;
  }
});
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());