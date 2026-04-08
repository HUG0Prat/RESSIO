# ◈ Ressio

> **Lecteur RSS universel** — Une interface élégante et moderne pour organiser tous vos flux RSS en un seul endroit.

[![Electron](https://img.shields.io/badge/Electron-41.2.0-blue?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-orange?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey?style=flat-square)](https://github.com)

---

## 📋 Table des matières

- [Fonctionnalités](#fonctionnalités)
- [Technologies](#technologies)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Configuration](#configuration)
- [Données & Stockage](#données--stockage)
- [Développement](#développement)
- [Confidentialité](#confidentialité)
- [Licence](#licence)
- [Crédits](#crédits)

---

## ✨ Fonctionnalités

- 🔄 **Flux RSS préconfigurés** — 7 sources par défaut (TechCrunch, The Verge, Hacker News, BBC News, Reddit, Dev.to, Medium, Product Hunt)
- 🔔 **Notifications système** — Alerte native dès qu'un nouvel article arrive
- 🌙 **Interface sombre élégante** — Design hexagonal avec palette moderne et typographie épurée
- 💾 **100% stockage local** — Toutes vos données restent sur votre ordinateur
- 🔍 **Filtres intelligents** — Filtrer par source, date, statut (lu/non lu), recherche full-text
- ✏️ **Gestion complète des flux** — Ajouter, modifier, supprimer, configurer les paramètres
- ⚙️ **Parsing personnalisé** — Délimiteurs RSS/Atom custom pour les flux non-conformes
- 🔄 **Auto-refresh configurable** — Vérification automatique toutes les N minutes
- 🖱️ **Menu contextuels** — Options rapides via clic droit sur articles et flux
- 📁 **Import/Export** — Sauvegardez ou accédez facilement à vos données

---

## 🛠 Technologies

### Frontend
- **Vanilla JavaScript** — Sans framework, optimisé pour les performances
- **HTML5 & CSS3** — Interface moderne avec variables CSS
- **Electron IPC** — Communication inter-processus fluide

### Backend
- **Node.js** — Runtime JavaScript côté serveur
- **Électron 41.2.0** — Framework desktop cross-plateforme
- **RSS/Atom Parser** — Parsing personnalisé supportant les formats non-standards

### Build & Packaging
- **electron-builder 26.8.1** — Génération d'exécutables
- **npm** — Gestion des dépendances

---

## 🚀 Installation

### Prérequis

- [Node.js](https://nodejs.org/) **version 18+** (LTS recommandé)
- npm (inclus avec Node.js)
- Windows 10+ ou macOS 10.13+

### Étapes

#### 1. Cloner ou télécharger le projet

```bash
git clone https://github.com/HUG0Prat/ressio.git
cd ressio
```

#### 2. Installer les dépendances

```bash
npm install
```

#### 3. Lancer l'application

```bash
npm start
```

#### 4. Créer un exécutable (optionnel)

```bash
# Construire pour votre plateforme
npm run build
```

L'installateur sera disponible dans le dossier `dist/`.


---

## 📖 Utilisation

### Démarrage rapide

1. **Lancer Ressio** → L'application charge les 7 flux par défaut
2. **Consulter les articles** → Cliquez sur un article pour voir son détail
3. **Actualiser** → Bouton `ACTUALISER` ou `Ctrl+R`
4. **Rechercher** → Utilisez la barre réservée aux filtres

### Actions principales

| Action | Raccourci |
|--------|-----------|
| Actualiser tous les flux | `ACTUALISER` ou `Ctrl+R` |
| Marquer tout comme lu | Bouton `✓` dans la barre de titre |
| Ouvrir un article | `↗ Lire` ou clique contextuel |
| Modifier un flux | Clic droit → `📝 Modifier le flux` |
| Paramètres avancés | Clic droit → `⚙ Paramètres avancés` |
| Ajouter un flux | Paramètres `⚙` → `Flux RSS` |
| Ouvrir les données | Paramètres → `📁 Ouvrir dossier` |

### Menu contextuel (clic droit)

#### Sur un article en liste
- ✓ Marquer comme lu
- ↗ Lire l'article complet
- 📝 Modifier le flux
- ⚙ Paramètres avancés
- ✕ Supprimer l'article

#### Sur le détail d'un article
- 📄 Copier le contenu
- 📝 Copier le titre
- 🔗 Copier le lien
- 📝 Modifier le flux
- ⚙ Paramètres avancés
- ↻ Actualiser le contenu

#### Sur un flux (barre latérale)
- ✓ Marquer comme lu
- ↻ Actualiser ce flux
- 🗑️ Supprimer le flux

---

## ⚙️ Configuration

### Paramètres généraux

Accédez à **Paramètres** (`⚙`) pour configurer :

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| **Intervalle de vérification** | Minutes entre chaque actualisation automatique | 15 min |
| **Articles max par flux** | Nombre maximum d'articles conservés par flux | 20 |
| **Notifications système** | Alerte desktop pour les nouveaux articles | Activé |

### Paramètres avancés d'un flux

Pour chaque flux, vous pouvez personnaliser le parsing :

- **Mode de parsing** : Auto (recommandé), RSS 2.0 forcé, ou Atom forcé
- **Balises personnalisées** :
  - `title` — balise pour le titre
  - `link` — balise pour le lien
  - `description` — balise pour le contenu
  - `pubDate` — balise pour la date
  - `id/guid` — balise pour l'identifiant unique

⚠️ **Laissez vide pour utiliser la valeur par défaut**

---

## 💾 Données & Stockage

### Localisation des données

Ressio stocke tout **localement** sur votre ordinateur :

- **Windows** : `%APPDATA%\Ressio\`
- **macOS** : `~/Library/Application Support/Ressio/`
- **Linux** : `~/.config/Ressio/`

### Fichiers créés

| Fichier | Contenu |
|---------|---------|
| `ressio_data.json` | Articles + configuration des flux |
| `ressio_settings.json` | Préférences utilisateur (intervalle, notifications, max articles) |

### Exporter vos données

1. Ouvrez **Paramètres** (`⚙`)
2. Section **Données & Stockage**
3. Cliquez `📁 Ouvrir dossier`
4. Copiez les fichiers `.json` où vous le souhaitez

### Réinitialiser l'application

Pour supprimer toutes vos données et revenir aux paramètres par défaut :

1. Ouvrez **Paramètres** (`⚙`)
2. Section **Données & Stockage**
3. Cliquez `🗑️ Réinitialiser`
4. Confirmez l'avertissement

⚠️ **Cette action est irréversible**

---

## 👨‍💻 Développement

### Architecture

```
Ressio/
├── main.js              # Backend Electron (IPC, RSS parsing, data persistence)
├── src/
│   ├── app.js          # Frontend logic (rendering, events, state)
│   ├── index.html      # Interface UI
│   └── styles.css      # Styles (intégrés en HTML)
├── assets/
│   └── logo.png        # Application logo
├── package.json        # Dépendances et scripts
└── README.md          # Cette documentation
```

### Structure du code

**main.js** (Backend)
- Gestion de la fenêtre Electron
- Fetching RSS avec gestion des redirects
- Parsing XML personnalisé (RSS 2.0 + Atom)
- Cronjob auto-refresh
- IPC handlers pour communication

**app.js** (Frontend)
- Rendu dynamique des articles et flux
- Gestion de l'état applicatif
- Context menus
- Panels d'édition (feeds, advanced settings)
- Événements utilisateur

**index.html**
- Structure sémantique
- Design responsive
- Thème sombre avec variables CSS
- Intégration du logo

### Scripts npm

```bash
npm start          # Lance l'app en développement
npm run build      # Crée l'exécutable
npm run dev        # Mode développement avec reload
```

### Points d'extension

- **Ajouter des flux par défaut** : Modifiez `DEFAULT_FEEDS` dans `main.js`
- **Personnaliser le thème** : Ajustez les variables CSS dans `index.html`
- **Ajouter des paramètres** : Étendez `DEFAULT_SETTINGS` et `bindEvents()`
- **Changer l'intervalle de refresh** : Variable `refreshInterval` dans les settings

---

## 🔒 Confidentialité

### Collecte de données

✅ **Ressio ne collecte AUCUNE donnée personnelle**

- ✅ Les données restent 100% locales
- ✅ Aucun serveur central
- ✅ Aucun tracking ou analytics
- ✅ Aucune connexion Internet sauf vers les flux RSS
- ✅ Code source ouvert et vérifiable

### Communication réseau

Seules les requêtes vers les flux RSS sont émises (HTTP GET avec User-Agent `Ressio RSS Reader/1.0`).

### Permissions

Ressio accède uniquement à :
- 📁 Dossier `userData` pour stocker les JSON
- 🌐 Internet pour récupérer les flux RSS

---

## 📜 Licence

Ce projet est sous licence **MIT**.

Voir [LICENSE](LICENSE) pour les détails complets.

---

## 🙏 Crédits

### Développement

- **Framework** : [Electron](https://www.electronjs.org/) 41.2.0
- **Build** : [electron-builder](https://www.electron.build/)
- **Runtime** : [Node.js](https://nodejs.org/)

### Flux RSS par défaut

- [TechCrunch](https://techcrunch.com/)
- [The Verge](https://www.theverge.com/)
- [Hacker News](https://news.ycombinator.com/)
- [BBC News](https://www.bbc.com/news)
- [Reddit r/technology](https://www.reddit.com/r/technology/)
- [Dev.to](https://dev.to/)
- [Medium](https://medium.com/)
- [Product Hunt](https://www.producthunt.com/)

### Inspirations

- Design système hexagonal inspiré des interfaces modernes
- Patterns architecture appliqués au vanilla JS
- Thème sombre pour productivité optimale

### Contributeurs

N'hésitez pas à ouvrir une issue ou un PR ! 🚀

---

## 📧 Support

Avez-vous une question ou un problème ?

- 📝 Ouvrez une [issue GitHub](https://github.com)
- 💬 Consultez la [documentation](https://github.com)
- 🐛 Signalez un bug avec des détails de reproduction

---

## 🎯 Roadmap

### Prévu pour les versions futures

- [ ] Sync cloud optionnelle
- [ ] Plugin system pour custom parsers
- [ ] Dark/Light mode switcher
- [ ] Export/Import OPML
- [ ] Recherche avancée avec marqueurs
- [ ] Catégories/tags pour les flux
- [ ] Statistiques de lecture
- [ ] Recherches de flux nouveaux flux RSS dans l'application
- [ ] Ajuster la taille de l'application pour les petits ecrans
- [ ] Portage vers une version Docker (avec panel web)

---

**Ressio** — *Lisez mieux, restez informé.* 📖

Made with ❤️ • Utilisez Ressio
