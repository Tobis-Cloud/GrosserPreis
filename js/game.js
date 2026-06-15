'use strict';
/* =============================================
   GROSSER PREIS – SPIELFELD
   ============================================= */

const S = window.GPStorage;

// ── Lade Daten ──
let cfg       = S.getConfig();
let cats      = S.getCategories();
let gs        = S.getGameState();        // gameState

// Falls kein Spielstand → zurück zur Config
if (!gs) { window.location.href = 'index.html'; }

const $ = id => document.getElementById(id);

// ── Overlay-Zustand ──
// 0 = geschlossen | 1 = Frage | 2 = Antwort | 3 = Punkte vergeben
let overlayState  = 0;
let currentCatIdx = null;
let currentQIdx   = null;
let selectedTeams = new Set();   // IDs der ausgewählten Teams

// ── Timer ──
let timerInterval = null;
let timerLeft     = 0;

const CAT_COLORS = ['#e63946','#2ec4b6','#4895ef','#f9c74f','#9b5de5','#06d6a0','#f77f00','#ff85a1'];

// =============================================
// INIT
// =============================================
function init() {
  $('gameTitleBar').textContent = (cfg.gameName || 'Großer Preis').toUpperCase();
  renderScoreBar();
  renderBoard();
  attachOverlayListeners();
  attachHamburgerListeners();
  attachHistoryModalListeners();
  syncSidePanel();
  updateSidePanelScores();
}

// =============================================
// SCORE-LEISTE
// =============================================
function renderScoreBar() {
  const container = $('scoreCards');
  container.innerHTML = '';
  gs.teams.forEach(team => {
    const card = document.createElement('div');
    card.className = 'score-card';
    card.id = `score_${team.id}`;
    card.style.background   = hexToRgba(team.color, 0.12);
    card.style.borderColor  = hexToRgba(team.color, 0.4);
    card.innerHTML = `
      <div class="score-team-name" style="color:${team.color};">${esc(team.name)}</div>
      <div class="score-value" style="color:${team.color};">${team.score}</div>
    `;
    card.addEventListener('click', () => openHistoryModal(team));
    container.appendChild(card);
  });
}

function updateScoreCard(team) {
  const card = $(`score_${team.id}`);
  if (!card) return;
  card.querySelector('.score-value').textContent = team.score;
}

// =============================================
// SPIELFELD RENDERN
// =============================================
function renderBoard() {
  const board = $('gameBoard');
  board.innerHTML = '';

  const numCats  = cats.length;
  const numSteps = cfg.pointSteps.length;

  // Grid-Template: Kategorien als Spalten
  board.style.gridTemplateColumns = `repeat(${numCats}, 1fr)`;
  board.style.gridTemplateRows    = `auto repeat(${numSteps}, 1fr)`;

  // ── Kategorie-Header ──
  cats.forEach((cat, ci) => {
    const el = document.createElement('div');
    el.className = 'game-cat-header';
    el.style.background = hexToRgba(CAT_COLORS[ci % CAT_COLORS.length], 0.85);
    el.style.color = '#fff';
    el.style.fontSize = numCats > 5 ? 'clamp(10px,1.2vw,14px)' : 'clamp(12px,1.5vw,18px)';
    el.textContent = cat.name;
    board.appendChild(el);
  });

  // ── Fragen-Zellen ──
  cfg.pointSteps.forEach((pts, ri) => {
    cats.forEach((cat, ci) => {
      const q   = cat.questions[ri];
      const qId = q?.id;
      const answered = gs.answeredIds.includes(qId);

      const cell = document.createElement('div');
      cell.className = 'game-cell' + (answered ? ' answered' : '') + (q?.isJoker ? ' is-joker' : '');
      cell.id = `cell_${qId}`;

      const color = CAT_COLORS[ci % CAT_COLORS.length];
      cell.style.background = hexToRgba(color, 0.3);
      cell.style.color = '#fff';

      // Punktzahl groß anzeigen
      const ptSize = numCats > 6 ? 'clamp(18px,2.5vw,36px)' : 'clamp(22px,3.5vw,52px)';
      cell.innerHTML = `<span style="font-size:${ptSize};">${pts}</span>`;

      if (!answered) {
        cell.addEventListener('click', () => openQuestion(ci, ri));
      }
      board.appendChild(cell);
    });
  });
}

// =============================================
// FRAGEN-OVERLAY
// =============================================
function openQuestion(ci, ri) {
  currentCatIdx = ci;
  currentQIdx   = ri;
  selectedTeams = new Set();

  const cat = cats[ci];
  const q   = cat.questions[ri];
  const pts = cfg.pointSteps[ri];

  // Felder befüllen
  $('oCatLabel').textContent = cat.name;
  $('oPtsBig').textContent   = pts + ' Punkte';
  $('oJokerBadge').style.display = q.isJoker ? 'flex' : 'none';

  // Frage
  $('oQuestionText').textContent = q.question.text || '';
  renderMedia($('oQuestionMedia'), q.question);

  // Antwort verstecken
  $('oAnswerBlock').style.display  = 'none';
  $('oAnswerText').textContent     = '';
  $('oAnswerMedia').innerHTML      = '';
  $('oAwardPanel').style.display   = 'none';
  $('oNegativeRow').style.display  = cfg.allowNegativePoints ? 'flex' : 'none';
  $('oNegativeCheck').checked      = false;

  // Spielleiter-Hinweis
  $('oSpieleiterHint').style.display = cfg.spielleiterMode ? 'flex' : 'none';
  $('oHint').textContent = cfg.spielleiterMode
    ? 'Spielleiter: Klicken zum Aufdecken der Antwort'
    : 'Klicken zum Aufdecken der Antwort';

  overlayState = 1;
  $('questionOverlay').classList.add('active');

  // Timer starten
  startTimer();
}

function closeOverlay() {
  $('questionOverlay').classList.remove('active');
  overlayState = 0;
  stopTimer();
}

// ── Overlay-Klick-Handler (State-Machine) ──
function attachOverlayListeners() {
  $('questionOverlay').addEventListener('click', e => {
    // Klick auf Buttons im Award-Panel nicht weiterleiten
    if (e.target.closest('#oAwardPanel') || e.target.closest('#oAwardGrid') || e.target.closest('#oJokerBadge')) return;

    if (overlayState === 1) {
      // → Antwort zeigen
      showAnswer();
    } else if (overlayState === 2) {
      // Nur weiter wenn NICHT Spielleiter-Modus (im SM klickt der SL auf separaten Button)
      if (!cfg.spielleiterMode) showAwardPanel();
    }
  });

  // Spielleiter: separater Button zum Aufdecken
  $('oSpieleiterHint').addEventListener('click', e => {
    e.stopPropagation();
    if (overlayState === 1) showAnswer();
    else if (overlayState === 2) showAwardPanel();
  });

  // Punkte vergeben
  $('oBtnAward').addEventListener('click', e => { e.stopPropagation(); awardPoints(); });
  $('oBtnNobody').addEventListener('click', e => { e.stopPropagation(); markAnswered(); closeOverlay(); });
}

function showAnswer() {
  const cat = cats[currentCatIdx];
  const q   = cat.questions[currentQIdx];

  $('oAnswerBlock').style.display = 'flex';
  $('oAnswerText').textContent    = q.answer.text || '';
  renderMedia($('oAnswerMedia'), q.answer);

  $('oHint').textContent = cfg.spielleiterMode
    ? 'Spielleiter: Klicken zum Vergeben der Punkte'
    : 'Klicken zum Vergeben der Punkte';
  $('oSpieleiterHint').textContent = '🔒 Spielleiter: Klicken zum Vergeben der Punkte';
  $('oSpieleiterHint').style.display = cfg.spielleiterMode ? 'flex' : 'none';

  overlayState = 2;
  stopTimer();
}

function showAwardPanel() {
  overlayState = 3;
  $('oHint').style.display = 'none';
  $('oSpieleiterHint').style.display = 'none';

  // Award-Grid befüllen
  const grid = $('oAwardGrid');
  grid.innerHTML = '';
  gs.teams.forEach(team => {
    const btn = document.createElement('button');
    btn.className = 'award-btn';
    btn.dataset.teamId = team.id;
    btn.style.color      = team.color;
    btn.style.borderColor = hexToRgba(team.color, 0.4);
    btn.innerHTML = `<span class="a-name">${esc(team.name)}</span><span class="a-score">${team.score}</span>`;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tid = team.id;
      if (selectedTeams.has(tid)) { selectedTeams.delete(tid); btn.classList.remove('selected'); }
      else { selectedTeams.add(tid); btn.classList.add('selected'); }
    });
    grid.appendChild(btn);
  });

  $('oAwardPanel').style.display = 'block';
}

function awardPoints() {
  const pts     = cfg.pointSteps[currentQIdx];
  const isNeg   = cfg.allowNegativePoints && $('oNegativeCheck').checked;
  const sign    = isNeg ? -1 : 1;
  const cat     = cats[currentCatIdx];
  const q       = cat.questions[currentQIdx];

  selectedTeams.forEach(tid => {
    const team = gs.teams.find(t => t.id === tid);
    if (!team) return;
    const awarded = pts * sign;
    team.score += awarded;

    gs.scoreHistory.push({
      timestamp:    Date.now(),
      teamId:       team.id,
      teamName:     team.name,
      teamColor:    team.color,
      points:       awarded,
      categoryName: cat.name,
      questionText: q.question.text || '[Bild/Video]',
      pointValue:   pts,
      isJoker:      q.isJoker,
    });

    updateScoreCard(team);
  });

  S.saveGameState(gs);
  updateSidePanelScores();
  markAnswered();
  closeOverlay();
  checkGameOver();
}

function markAnswered() {
  const q = cats[currentCatIdx]?.questions[currentQIdx];
  if (!q) return;
  if (!gs.answeredIds.includes(q.id)) gs.answeredIds.push(q.id);
  S.saveGameState(gs);

  const cell = $(`cell_${q.id}`);
  if (cell) { cell.classList.add('answered'); cell.style.pointerEvents = 'none'; }
}

function checkGameOver() {
  const total     = cats.reduce((sum, c) => sum + c.questions.length, 0);
  const answered  = gs.answeredIds.length;
  if (answered >= total) {
    setTimeout(() => window.location.href = 'results.html', 800);
  }
}

// =============================================
// MEDIEN RENDERN
// =============================================
function renderMedia(container, content) {
  container.innerHTML = '';
  if (!content) return;

  // Bilder
  (content.images || []).forEach(src => {
    const img = document.createElement('img');
    img.src = src; img.alt = 'Bild';
    container.appendChild(img);
  });

  // Video
  if (content.videoUrl) {
    const ytId = extractYouTubeId(content.videoUrl);
    if (ytId) {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=0&rel=0`;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.frameBorder = '0';
      container.appendChild(iframe);
    } else {
      const video = document.createElement('video');
      video.src = content.videoUrl;
      video.controls = true;
      container.appendChild(video);
    }
  }
}

function extractYouTubeId(url) {
  const patterns = [
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
  ];
  for (const pat of patterns) {
    const m = url.match(pat);
    if (m) return m[1];
  }
  return null;
}

// =============================================
// TIMER
// =============================================
function startTimer() {
  stopTimer();
  const secs = cfg.timerSeconds;
  if (!secs) { $('timerDisplay').style.display = 'none'; return; }

  timerLeft = secs;
  $('timerDisplay').style.display = 'block';
  $('timerDisplay').textContent = timerLeft;
  $('timerDisplay').style.color = 'var(--gold)';

  timerInterval = setInterval(() => {
    timerLeft--;
    $('timerDisplay').textContent = timerLeft;
    if (timerLeft <= 5) $('timerDisplay').style.color = 'var(--red)';
    if (timerLeft <= 0) {
      stopTimer();
      $('timerDisplay').textContent = '⏰';
      if (overlayState === 1) showAnswer();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  $('timerDisplay').style.display = 'none';
}

// =============================================
// PUNKTE-VERLAUF MODAL
// =============================================
function openHistoryModal(team) {
  const history = gs.scoreHistory.filter(h => h.teamId === team.id);
  $('histModalTitle').textContent = `📊 ${team.name} – Punkteverlauf`;
  $('histModalTitle').style.color = team.color;

  const content = $('histModalContent');
  if (!history.length) {
    content.innerHTML = '<div class="text-dim text-center" style="padding:20px;">Noch keine Punkte vergeben.</div>';
  } else {
    let running = 0;
    content.innerHTML = history.map(h => {
      running += h.points;
      const sign = h.points >= 0 ? '+' : '';
      return `
        <div class="history-entry">
          <div class="history-dot" style="background:${team.color};"></div>
          <div class="history-info">
            <div style="font-size:13px;font-weight:700;">${esc(h.categoryName)}</div>
            <div class="text-xs text-dim" style="margin-top:3px;">${esc(h.questionText)}</div>
          </div>
          <div class="history-pts" style="color:${h.points >= 0 ? 'var(--green)' : 'var(--red)'};">${sign}${h.points}</div>
          <div style="font-size:13px;font-weight:700;min-width:50px;text-align:right;color:${team.color};">= ${running}</div>
        </div>
      `;
    }).join('');
  }

  $('historyModal').classList.add('active');
}

function attachHistoryModalListeners() {
  $('closeHistModal').addEventListener('click', () => $('historyModal').classList.remove('active'));
  $('historyModal').addEventListener('click', e => {
    if (e.target === $('historyModal')) $('historyModal').classList.remove('active');
  });
}

// =============================================
// HAMBURGER / SIDE-PANEL
// =============================================
function attachHamburgerListeners() {
  $('hamburgerBtn').addEventListener('click', openSidePanel);
  $('closeSidePanel').addEventListener('click', closeSidePanel);
  $('sideOverlay').addEventListener('click', closeSidePanel);

  $('sp_chkSpieleiter').addEventListener('change', e => {
    cfg.spielleiterMode = e.target.checked;
    S.saveConfig(cfg);
  });
  $('sp_chkNegative').addEventListener('change', e => {
    cfg.allowNegativePoints = e.target.checked;
    S.saveConfig(cfg);
    if ($('oNegativeRow')) $('oNegativeRow').style.display = cfg.allowNegativePoints ? 'flex' : 'none';
  });

  $('sp_btnResults').addEventListener('click', () => window.location.href = 'results.html');
}

function syncSidePanel() {
  $('sp_chkSpieleiter').checked = cfg.spielleiterMode;
  $('sp_chkNegative').checked   = cfg.allowNegativePoints;
}

function updateSidePanelScores() {
  const list = $('spScoreList');
  list.innerHTML = '';
  gs.teams.forEach(team => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.innerHTML = `
      <div style="width:10px;height:10px;border-radius:50%;background:${team.color};flex-shrink:0;"></div>
      <span style="flex:1;font-size:14px;font-weight:600;">${esc(team.name)}</span>
      <input type="number" value="${team.score}" style="width:80px;text-align:center;"
        data-tid="${team.id}" class="spScoreInput" />
    `;
    list.appendChild(row);
  });
  list.querySelectorAll('.spScoreInput').forEach(inp => {
    inp.addEventListener('change', e => {
      const tid  = e.target.dataset.tid;
      const team = gs.teams.find(t => t.id === tid);
      if (!team) return;
      const oldScore = team.score;
      team.score = parseInt(e.target.value, 10) || 0;
      gs.scoreHistory.push({
        timestamp: Date.now(),
        teamId: team.id,
        teamName: team.name,
        teamColor: team.color,
        points: team.score - oldScore,
        categoryName: '(Manuell)',
        questionText: 'Manuelle Korrektur',
        pointValue: Math.abs(team.score - oldScore),
        isJoker: false,
      });
      S.saveGameState(gs);
      updateScoreCard(team);
    });
  });
}

function openSidePanel()  { $('sidePanel').classList.add('open');   $('sideOverlay').classList.add('active'); }
function closeSidePanel() { $('sidePanel').classList.remove('open'); $('sideOverlay').classList.remove('active'); }

// =============================================
// TOAST
// =============================================
let _toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(60px)';
  }, 2800);
}

// =============================================
// HILFSFUNKTIONEN
// =============================================
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── START ──
init();
