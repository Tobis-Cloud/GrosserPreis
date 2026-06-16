'use strict';

// =============================================
// SCHLÜSSEL & STANDARDWERTE
// =============================================
const GP_KEYS = {
  CONFIG: 'gp_config',
  TEAMS: 'gp_teams',
  CATEGORIES: 'gp_categories',
  GAME_STATE: 'gp_gameState',
};

const DEFAULT_CONFIG = {
  gameName: 'Großer Preis',
  pointSteps: [100, 80, 60, 40, 20],
  allowNegativePoints: false,
  startingTeamId: null,
  timerSeconds: 0,
};

const DEFAULT_TEAMS = [
  { id: 'team_1', name: 'Team 1', color: '#ff6b6b' },
  { id: 'team_2', name: 'Team 2', color: '#4ecdc4' },
];

// =============================================
// HILFSFUNKTIONEN
// =============================================
function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createQuestion(points) {
  return {
    id: generateId('q'),
    points,
    // Fragetyp: 'normal' | 'joker' | 'estimate' | 'multiple_choice' | 'list'
    questionType: 'normal',
    // Rückwärtskompatibilität
    get isJoker() { return this.questionType === 'joker'; },
    question: { text: '', images: [], videoUrl: '' },
    answer:   { text: '', images: [], videoUrl: '' },
    // Multiple-Choice-Optionen: Array von { text, isCorrect }
    mcOptions: [],
    // Schätzfrage: korrekte Zahl
    estimateTarget: null,
    // Liste: Array von Strings (Unterpunkte)
    listItems: [],
  };
}

function createCategory(name, pointSteps, index = 0) {
  return {
    id: generateId('cat'),
    name: name || `Kategorie ${index + 1}`,
    questions: pointSteps.map(pts => createQuestion(pts)),
  };
}

// =============================================
// STORAGE API
// =============================================
window.GPStorage = {
  generateId,
  createQuestion,
  createCategory,

  // --- CONFIG ---
  getConfig() {
    try {
      const s = localStorage.getItem(GP_KEYS.CONFIG);
      return s ? { ...DEFAULT_CONFIG, ...JSON.parse(s) } : { ...DEFAULT_CONFIG };
    } catch { return { ...DEFAULT_CONFIG }; }
  },
  saveConfig(cfg) {
    localStorage.setItem(GP_KEYS.CONFIG, JSON.stringify(cfg));
  },

  // --- TEAMS ---
  getTeams() {
    try {
      const s = localStorage.getItem(GP_KEYS.TEAMS);
      return s ? JSON.parse(s) : JSON.parse(JSON.stringify(DEFAULT_TEAMS));
    } catch { return JSON.parse(JSON.stringify(DEFAULT_TEAMS)); }
  },
  saveTeams(teams) {
    localStorage.setItem(GP_KEYS.TEAMS, JSON.stringify(teams));
  },

  // --- KATEGORIEN & FRAGEN ---
  getCategories() {
    try {
      const s = localStorage.getItem(GP_KEYS.CATEGORIES);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  },
  saveCategories(cats) {
    localStorage.setItem(GP_KEYS.CATEGORIES, JSON.stringify(cats));
  },

  // --- SPIELSTAND ---
  getGameState() {
    try {
      const s = localStorage.getItem(GP_KEYS.GAME_STATE);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  },
  saveGameState(state) {
    localStorage.setItem(GP_KEYS.GAME_STATE, JSON.stringify(state));
  },

  // --- RESET ---
  resetAll() {
    Object.values(GP_KEYS).forEach(k => localStorage.removeItem(k));
  },
  resetCategories() {
    localStorage.removeItem(GP_KEYS.CATEGORIES);
  },
  resetGameState() {
    localStorage.removeItem(GP_KEYS.GAME_STATE);
  },

  // --- EXPORT / IMPORT ---
  exportJSON() {
    return JSON.stringify({
      config: this.getConfig(),
      teams: this.getTeams(),
      categories: this.getCategories(),
    }, null, 2);
  },
  importJSON(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.config)     this.saveConfig(data.config);
    if (data.teams)      this.saveTeams(data.teams);
    if (data.categories) this.saveCategories(data.categories);
  },
};
