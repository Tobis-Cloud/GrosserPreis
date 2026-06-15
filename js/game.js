'use strict';
/* =============================================
   GROSSER PREIS – SPIELFELD
   ============================================= */

const S = window.GPStorage;

let cfg  = S.getConfig();
let cats = S.getCategories();
let gs   = S.getGameState();

if (!gs) { window.location.href = 'index.html'; }

const $ = id => document.getElementById(id);

// ── Overlay-Zustand ──
// 0=geschlossen | 1=Frage | 2=Antwort | 3=Punkte vergeben | 4=Joker-Direkt
let overlayState  = 0;
let currentCatIdx = null;
let currentQIdx   = null;
let selectedTeams = new Set();

// ── Tastatur-Fokus (Hauptansicht) ──
let focusCatIdx = 0;
let focusQIdx   = 0;
let currentGroupId = null;   // für Undo-Gruppierung

// ── Timer ──
let timerInterval = null;

const CAT_COLORS = ['#e63946','#2ec4b6','#4895ef','#f9c74f','#9b5de5','#06d6a0','#f77f00','#ff85a1'];

// =============================================
// INIT
// =============================================
function init() {
  // Startendes Team aus Konfiguration setzen
  if (!('currentTeamIdx' in gs)) {
    const startId = cfg.startingTeamId;
    const startIdx = startId ? gs.teams.findIndex(t => t.id === startId) : 0;
    gs.currentTeamIdx = Math.max(0, startIdx);
  }
  if (!gs.undoneHistory) gs.undoneHistory = [];

  $('gameTitleBar').textContent = cfg.gameName || 'Großer Preis';
  renderScoreBar();
  renderBoard();
  updateCurrentTeamDisplay();
  attachOverlayListeners();
  attachHamburgerListeners();
  attachHistoryModalListeners();
  syncSidePanel();
  updateSidePanelScores();
  updateSidePanelTeamSelector();

  // Tastatur-Shortcuts: Steuerung, Leertaste, Enter & Pfeiltasten
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoLastAward(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redoLastAward(); }
      return;
    }

    const isInputActive = document.activeElement && 
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
    if (isInputActive) return;

    if (overlayState === 0) {
      // Hauptansicht: Pfeiltasten & Enter
      if (e.key === 'ArrowUp') {
        e.preventDefault(); moveFocus(0, -1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault(); moveFocus(0, 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); moveFocus(-1, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); moveFocus(1, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const qId = cats[focusCatIdx]?.questions[focusQIdx]?.id;
        if (qId && !gs.answeredIds.includes(qId)) {
          openQuestion(focusCatIdx, focusQIdx);
        }
      }
    } else {
      // Overlay geöffnet: Leertaste oder Enter zum Durchklicken
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        e.preventDefault();
        if (overlayState === 1) {
          showAnswer();
        } else if (overlayState === 2) {
          showAwardPanel();
        } else if (e.key === 'Enter' && (overlayState === 3 || overlayState === 4)) {
          awardPoints();
        }
      }
    }
  });
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
    card.style.background  = hexToRgba(team.color, 0.12);
    card.style.borderColor = hexToRgba(team.color, 0.4);
    card.innerHTML = `
      <div class="score-team-name" style="color:${team.color};">${esc(team.name)}</div>
      <div class="score-value"    style="color:${team.color};">${team.score}</div>
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
// AKTUELLES TEAM
// =============================================
function updateCurrentTeamDisplay() {
  const team = gs.teams[gs.currentTeamIdx];
  if (!team) return;
  const bar = $('currentTeamBar');
  bar.style.background   = hexToRgba(team.color, 0.12);
  bar.style.borderColor  = team.color;
  bar.style.color        = team.color;
  $('currentTeamNameDisplay').textContent = team.name;
}

function advanceTeam() {
  gs.currentTeamIdx = (gs.currentTeamIdx + 1) % gs.teams.length;
  S.saveGameState(gs);
  updateCurrentTeamDisplay();
  updateSidePanelTeamSelector();
}

// =============================================
// SPIELFELD RENDERN
// =============================================
function renderBoard() {
  const board = $('gameBoard');
  board.innerHTML = '';

  const numCats  = cats.length;
  const numSteps = cfg.pointSteps.length;

  board.style.gridTemplateColumns = `repeat(${numCats}, 1fr)`;
  board.style.gridTemplateRows    = `auto repeat(${numSteps}, 1fr)`;

  // Kategorie-Header
  cats.forEach((cat, ci) => {
    const el = document.createElement('div');
    el.className = 'game-cat-header';
    el.style.background = hexToRgba(CAT_COLORS[ci % CAT_COLORS.length], 0.85);
    el.style.color = '#fff';
    el.style.fontSize = numCats > 5 ? 'clamp(10px,1.2vw,14px)' : 'clamp(12px,1.5vw,18px)';
    el.textContent = cat.name;
    board.appendChild(el);
  });

  // Fragen-Zellen (Joker sieht IDENTISCH aus wie normale Felder)
  cfg.pointSteps.forEach((pts, ri) => {
    cats.forEach((cat, ci) => {
      const q       = cat.questions[ri];
      const qId     = q?.id;
      const answered = gs.answeredIds.includes(qId);

      const cell = document.createElement('div');
      // Joker bekommt KEINE spezielle Klasse → sieht gleich aus
      cell.className = 'game-cell' + (answered ? ' answered' : '');
      cell.id = `cell_${qId}`;

      const color = CAT_COLORS[ci % CAT_COLORS.length];
      cell.style.background = hexToRgba(color, 0.3);
      cell.style.color = '#fff';

      const ptSize = numCats > 6 ? 'clamp(18px,2.5vw,36px)' : 'clamp(22px,3.5vw,52px)';
      cell.innerHTML = `<span style="font-size:${ptSize};">${pts}</span>`;

      if (!answered) {
        cell.addEventListener('click', () => openQuestion(ci, ri));
      }
      board.appendChild(cell);
    });
  });
  keepOrInitFocus();
}

// =============================================
// FRAGEN-OVERLAY
// =============================================
function openQuestion(ci, ri) {
  currentCatIdx  = ci;
  currentQIdx    = ri;
  selectedTeams  = new Set();
  currentGroupId = S.generateId('grp');

  const cat = cats[ci];
  const q   = cat.questions[ri];
  const pts = cfg.pointSteps[ri];

  // ── JOKER: direkt zur Punkte-Vergabe ──
  if (q.isJoker) {
    // Header anzeigen, aber kein Fragetext
    $('oCatLabel').textContent        = cat.name;
    $('oPtsBig').textContent          = pts + ' Punkte';
    $('oJokerBadge').style.display    = 'flex';   // Joker-Badge intern anzeigen
    $('oQuestionBlock').style.display = 'none';
    $('oAnswerBlock').style.display   = 'none';
    $('oNegativeRow').style.display   = cfg.allowNegativePoints ? 'flex' : 'none';
    $('oNegativeCheck').checked       = false;
    $('oHint').style.display          = 'none';

    overlayState = 4;
    $('questionOverlay').classList.add('active');
    showAwardPanel();
    return;
  }

  // ── NORMAL ──
  $('oCatLabel').textContent        = cat.name;
  $('oPtsBig').textContent          = pts + ' Punkte';
  $('oJokerBadge').style.display    = 'none';
  $('oQuestionBlock').style.display = 'flex';

  $('oQuestionText').textContent = q.question.text || '';
  renderMedia($('oQuestionMedia'), q.question);

  $('oAnswerBlock').style.display  = 'none';
  $('oAnswerText').textContent     = '';
  $('oAnswerMedia').innerHTML      = '';
  $('oAwardPanel').style.display   = 'none';
  $('oNegativeRow').style.display  = cfg.allowNegativePoints ? 'flex' : 'none';
  $('oNegativeCheck').checked      = false;
  $('oHint').style.display         = 'block';
  $('oHint').textContent           = 'Klicken zum Aufdecken der Antwort';

  overlayState = 1;
  $('questionOverlay').classList.add('active');
  startTimer();
}

function closeOverlay() {
  $('questionOverlay').classList.remove('active');
  $('oQuestionBlock').style.display = 'flex';
  overlayState = 0;
  stopTimer();
}

// ── State-Machine: Klick auf Overlay ──
function attachOverlayListeners() {
  $('questionOverlay').addEventListener('click', e => {
    if (e.target.closest('#oAwardPanel')) return;

    if (overlayState === 1) {
      showAnswer();
    } else if (overlayState === 2) {
      showAwardPanel();
    }
  });

  $('oBtnAward').addEventListener('click',  e => { e.stopPropagation(); awardPoints(); });
  $('oBtnNobody').addEventListener('click', e => { e.stopPropagation(); awardNobody(); });
}

function showAnswer() {
  const q = cats[currentCatIdx].questions[currentQIdx];

  $('oAnswerBlock').style.display = 'flex';
  $('oAnswerText').textContent    = q.answer.text || '';
  renderMedia($('oAnswerMedia'), q.answer);
  $('oHint').textContent = 'Klicken zum Vergeben der Punkte';

  overlayState = 2;
  stopTimer();
}

function showAwardPanel() {
  overlayState = 3;
  $('oHint').style.display = 'none';

  const grid = $('oAwardGrid');
  grid.innerHTML = '';
  gs.teams.forEach(team => {
    const btn = document.createElement('button');
    btn.className = 'award-btn';
    // Aktuelles Team vorauswählen
    if (team.id === gs.teams[gs.currentTeamIdx]?.id) {
      btn.classList.add('selected');
      selectedTeams.add(team.id);
    }
    btn.dataset.teamId    = team.id;
    btn.style.color       = team.color;
    btn.style.borderColor = hexToRgba(team.color, 0.4);
    btn.innerHTML = `<span class="a-name">${esc(team.name)}</span><span class="a-score">${team.score}</span>`;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tid = team.id;
      if (selectedTeams.has(tid)) { selectedTeams.delete(tid); btn.classList.remove('selected'); }
      else                        { selectedTeams.add(tid);    btn.classList.add('selected'); }
    });
    grid.appendChild(btn);
  });

  $('oAwardPanel').style.display = 'block';
}

// ── Punkte vergeben ──
function awardPoints() {
  const pts   = cfg.pointSteps[currentQIdx];
  const isNeg = cfg.allowNegativePoints && $('oNegativeCheck').checked;
  const sign  = isNeg ? -1 : 1;
  const cat   = cats[currentCatIdx];
  const q     = cat.questions[currentQIdx];
  const grpId = currentGroupId;

  // Wenn niemand ausgewählt → wie "Niemand"
  if (!selectedTeams.size) { awardNobody(); return; }

  // Punkte gutschreiben
  selectedTeams.forEach(tid => {
    const team = gs.teams.find(t => t.id === tid);
    if (!team) return;
    const awarded = pts * sign;
    team.score += awarded;

    gs.scoreHistory.push({
      groupId:      grpId,
      questionId:   q.id,
      timestamp:    Date.now(),
      teamId:       team.id,
      teamName:     team.name,
      teamColor:    team.color,
      points:       awarded,
      categoryName: cat.name,
      questionText: q.question.text || (q.isJoker ? '[Joker]' : '[Bild/Video]'),
      pointValue:   pts,
      isJoker:      q.isJoker,
      nobody:       false,
    });

    updateScoreCard(team);
  });

  // Redo-Stack leeren (neue Aktion bricht Redo-Kette)
  gs.undoneHistory = [];

  S.saveGameState(gs);
  updateSidePanelScores();
  markAnswered(q.id);
  advanceTeam();
  closeOverlay();
  checkGameOver();
}

// ── Niemand bekommt Punkte ──
function awardNobody() {
  const cat = cats[currentCatIdx];
  const q   = cat.questions[currentQIdx];
  const pts = cfg.pointSteps[currentQIdx];

  // Dummy-Eintrag damit Undo funktioniert
  gs.scoreHistory.push({
    groupId:      currentGroupId,
    questionId:   q.id,
    timestamp:    Date.now(),
    teamId:       null,
    teamName:     'Niemand',
    teamColor:    '#888',
    points:       0,
    categoryName: cat.name,
    questionText: q.question.text || (q.isJoker ? '[Joker]' : '[Bild/Video]'),
    pointValue:   pts,
    isJoker:      q.isJoker,
    nobody:       true,
  });

  gs.undoneHistory = [];
  S.saveGameState(gs);
  markAnswered(q.id);
  advanceTeam();
  closeOverlay();
  checkGameOver();
}

function markAnswered(questionId) {
  if (!gs.answeredIds.includes(questionId)) gs.answeredIds.push(questionId);
  S.saveGameState(gs);
  renderBoard();
}

function unmarkAnswered(questionId) {
  gs.answeredIds = gs.answeredIds.filter(id => id !== questionId);
  S.saveGameState(gs);
  renderBoard();
}

function findQuestionIndices(questionId) {
  for (let ci = 0; ci < cats.length; ci++) {
    for (let ri = 0; ri < cats[ci].questions.length; ri++) {
      if (cats[ci].questions[ri]?.id === questionId) return [ci, ri];
    }
  }
  return [-1, -1];
}

function checkGameOver() {
  const total = cats.reduce((sum, c) => sum + c.questions.length, 0);
  if (gs.answeredIds.length >= total) {
    setTimeout(() => window.location.href = 'results.html', 800);
  }
}

// =============================================
// UNDO / REDO
// =============================================
function undoLastAward() {
  if (!gs.scoreHistory.length) { showToast('Nichts rückgängig zu machen'); return; }

  // Letzten groupId finden
  const lastGroupId = gs.scoreHistory[gs.scoreHistory.length - 1].groupId;
  if (!lastGroupId) { showToast('Dieser Eintrag kann nicht rückgängig gemacht werden'); return; }

  const toUndo = gs.scoreHistory.filter(h => h.groupId === lastGroupId);
  const questionId = toUndo[0]?.questionId;

  // Punkte rückgängig
  toUndo.forEach(h => {
    if (h.nobody || !h.teamId) return;
    const team = gs.teams.find(t => t.id === h.teamId);
    if (team) {
      team.score -= h.points;
      updateScoreCard(team);
    }
  });

  // Aus History entfernen, in Undo-Stack
  gs.scoreHistory = gs.scoreHistory.filter(h => h.groupId !== lastGroupId);
  if (!gs.undoneHistory) gs.undoneHistory = [];
  gs.undoneHistory.push(...toUndo);

  // Frage wieder spielbar machen
  if (questionId) unmarkAnswered(questionId);

  // Team-Advance rückgängig
  gs.currentTeamIdx = ((gs.currentTeamIdx - 1) + gs.teams.length) % gs.teams.length;
  updateCurrentTeamDisplay();
  updateSidePanelTeamSelector();

  S.saveGameState(gs);
  updateSidePanelScores();
  showToast('↩ Rückgängig gemacht');
}

function redoLastAward() {
  if (!gs.undoneHistory?.length) { showToast('Nichts zum Wiederholen'); return; }

  const lastGroupId = gs.undoneHistory[gs.undoneHistory.length - 1].groupId;
  const toRedo = gs.undoneHistory.filter(h => h.groupId === lastGroupId);
  const questionId = toRedo[0]?.questionId;

  // Punkte erneut gutschreiben
  toRedo.forEach(h => {
    if (h.nobody || !h.teamId) return;
    const team = gs.teams.find(t => t.id === h.teamId);
    if (team) {
      team.score += h.points;
      updateScoreCard(team);
    }
  });

  // Zurück in History
  gs.undoneHistory = gs.undoneHistory.filter(h => h.groupId !== lastGroupId);
  gs.scoreHistory.push(...toRedo);

  // Frage wieder als beantwortet markieren
  if (questionId) markAnswered(questionId);

  // Team advance wiederholen
  gs.currentTeamIdx = (gs.currentTeamIdx + 1) % gs.teams.length;
  updateCurrentTeamDisplay();
  updateSidePanelTeamSelector();

  S.saveGameState(gs);
  updateSidePanelScores();
  showToast('↪ Wiederhergestellt');
}

// =============================================
// MEDIEN RENDERN
// =============================================
function renderMedia(container, content) {
  container.innerHTML = '';
  if (!content) return;

  (content.images || []).forEach(src => {
    const img = document.createElement('img');
    img.src = src; img.alt = 'Bild';
    container.appendChild(img);
  });

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

  let left = secs;
  $('timerDisplay').style.display = 'block';
  $('timerDisplay').textContent = left;
  $('timerDisplay').style.color = 'var(--gold)';

  timerInterval = setInterval(() => {
    left--;
    $('timerDisplay').textContent = left;
    if (left <= 5) $('timerDisplay').style.color = 'var(--red)';
    if (left <= 0) {
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
  const history = gs.scoreHistory.filter(h => h.teamId === team.id && !h.nobody);
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
      const col  = h.points >= 0 ? 'var(--green)' : 'var(--red)';
      return `
        <div class="history-entry">
          <div class="history-dot" style="background:${team.color};"></div>
          <div class="history-info">
            <div style="font-size:13px;font-weight:700;">${esc(h.categoryName)}${h.isJoker ? ' ⭐' : ''}</div>
            <div class="text-xs text-dim" style="margin-top:3px;">${esc(h.questionText)}</div>
          </div>
          <div class="history-pts" style="color:${col};">${sign}${h.points}</div>
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

  $('sp_chkNegative').addEventListener('change', e => {
    cfg.allowNegativePoints = e.target.checked;
    S.saveConfig(cfg);
    if ($('oNegativeRow')) $('oNegativeRow').style.display = cfg.allowNegativePoints ? 'flex' : 'none';
  });

  $('sp_btnResults').addEventListener('click', () => window.location.href = 'results.html');

  // Undo / Redo
  $('sp_btnUndo').addEventListener('click', () => { closeSidePanel(); undoLastAward(); });
  $('sp_btnRedo').addEventListener('click', () => { closeSidePanel(); redoLastAward(); });

  // Fullscreen
  const btnFs = $('btnFullscreen');
  if (btnFs) btnFs.addEventListener('click', toggleFullscreen);
}

function syncSidePanel() {
  $('sp_chkNegative').checked = cfg.allowNegativePoints;
}

// Wer ist dran (Team-Selector im Side-Panel)
function updateSidePanelTeamSelector() {
  const container = $('spTeamSelector');
  if (!container) return;
  container.innerHTML = '';
  gs.teams.forEach((team, idx) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm' + (idx === gs.currentTeamIdx ? '' : '');
    btn.style.cssText = `
      flex:1; border-color:${hexToRgba(team.color, idx === gs.currentTeamIdx ? 0.9 : 0.3)};
      color:${team.color};
      background:${idx === gs.currentTeamIdx ? hexToRgba(team.color, 0.2) : 'transparent'};
      font-weight:${idx === gs.currentTeamIdx ? '800' : '600'};
    `;
    btn.innerHTML = (idx === gs.currentTeamIdx ? '▶ ' : '') + esc(team.name);
    btn.addEventListener('click', () => {
      gs.currentTeamIdx = idx;
      S.saveGameState(gs);
      updateCurrentTeamDisplay();
      updateSidePanelTeamSelector();
    });
    container.appendChild(btn);
  });
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
      const team = gs.teams.find(t => t.id === e.target.dataset.tid);
      if (!team) return;
      const oldScore = team.score;
      team.score = parseInt(e.target.value, 10) || 0;
      gs.scoreHistory.push({
        groupId:      S.generateId('manual'),
        questionId:   null,
        timestamp:    Date.now(),
        teamId:       team.id,
        teamName:     team.name,
        teamColor:    team.color,
        points:       team.score - oldScore,
        categoryName: '(Manuell)',
        questionText: 'Manuelle Korrektur',
        pointValue:   Math.abs(team.score - oldScore),
        isJoker:      false,
        nobody:       false,
      });
      gs.undoneHistory = [];
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
  if (!hex || hex.length < 7) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// =============================================
// TASTATUR-NAVIGATIONS-HILFSFUNKTIONEN
// =============================================
function keepOrInitFocus() {
  const currentQId = cats[focusCatIdx]?.questions[focusQIdx]?.id;
  if (currentQId && !gs.answeredIds.includes(currentQId)) {
    updateFocusHighlight();
    return;
  }
  initFocus();
}

function initFocus() {
  for (let r = 0; r < cfg.pointSteps.length; r++) {
    for (let c = 0; c < cats.length; c++) {
      const qId = cats[c].questions[r]?.id;
      if (!gs.answeredIds.includes(qId)) {
        focusCatIdx = c;
        focusQIdx = r;
        updateFocusHighlight();
        return;
      }
    }
  }
}

function updateFocusHighlight() {
  document.querySelectorAll('.game-cell').forEach(el => el.classList.remove('focused'));
  const qId = cats[focusCatIdx]?.questions[focusQIdx]?.id;
  if (qId) {
    const cell = $(`cell_${qId}`);
    if (cell) cell.classList.add('focused');
  }
}

function moveFocus(dirX, dirY) {
  const numCats = cats.length;
  const numSteps = cfg.pointSteps.length;
  
  let targetC = (focusCatIdx + dirX + numCats) % numCats;
  let targetR = (focusQIdx + dirY + numSteps) % numSteps;
  
  const unanswered = [];
  for (let c = 0; c < numCats; c++) {
    for (let r = 0; r < numSteps; r++) {
      const qId = cats[c].questions[r]?.id;
      if (!gs.answeredIds.includes(qId)) {
        unanswered.push({ c, r });
      }
    }
  }
  
  if (!unanswered.length) return;
  
  let bestCell = null;
  let minDist = Infinity;
  
  unanswered.forEach(cell => {
    let dist = Math.abs(cell.c - targetC) + Math.abs(cell.r - targetR);
    if (dist < minDist) {
      minDist = dist;
      bestCell = cell;
    }
  });
  
  if (bestCell) {
    focusCatIdx = bestCell.c;
    focusQIdx = bestCell.r;
    updateFocusHighlight();
  }
}

// =============================================
// VOLLBILDMODUS
// =============================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      showToast('Vollbildmodus konnte nicht aktiviert werden');
    });
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  const btn = $('btnFullscreen');
  if (btn) {
    btn.textContent = document.fullscreenElement ? '🗗' : '⛶';
    btn.title = document.fullscreenElement ? 'Vollbild beenden' : 'Vollbildmodus';
  }
});

// ── START ──
init();
