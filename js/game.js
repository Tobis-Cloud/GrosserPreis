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
// 0=geschlossen | 1=Frage | 2=Antwort | 3=Punkte vergeben | 4=Joker-Direkt | 5=Schätzfragen-Panel
let overlayState  = 0;
let currentCatIdx = null;
let currentQIdx   = null;
let selectedTeams = new Set();
// Schätzfragen: Ergebnisse der Gruppen (Map teamId -> number)
let estimateGuesses = {};

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
          const q = cats[currentCatIdx]?.questions[currentQIdx];
          const qType = q?.questionType || (q?.isJoker ? 'joker' : 'normal');
          if (qType === 'estimate') {
            showEstimatePanel();
          } else {
            showAnswer();
          }
        } else if (overlayState === 2) {
          showAwardPanel();
        } else if (e.key === 'Enter' && (overlayState === 3 || overlayState === 4)) {
          awardPoints();
        }
      }
    }
  });
  checkRestoreFullscreen();

  // Tastaturfokus ausblenden bei Mausbewegung
  let lastMouseX = 0;
  let lastMouseY = 0;
  document.addEventListener('mousemove', e => {
    if (e.clientX === lastMouseX && e.clientY === lastMouseY) return;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    document.querySelectorAll('.game-cell.focused').forEach(el => el.classList.remove('focused'));
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
  estimateGuesses = {};
  currentGroupId = S.generateId('grp');

  const cat = cats[ci];
  const q   = cat.questions[ri];
  const pts = cfg.pointSteps[ri];

  // Rückwärtskompatibilität: questionType aus isJoker ableiten
  const qType = q.questionType || (q.isJoker ? 'joker' : 'normal');

  // ── JOKER: direkt zur Punkte-Vergabe ──
  if (qType === 'joker') {
    $('oCatLabel').textContent        = cat.name;
    $('oPtsBig').textContent          = pts + ' Punkte';
    $('oJokerBadge').style.display    = 'flex';
    $('oQuestionBlock').style.display = 'none';
    $('oAnswerBlock').style.display   = 'none';
    $('oEstimatePanel').style.display = 'none';
    $('oNegativeRow').style.display   = cfg.allowNegativePoints ? 'flex' : 'none';
    $('oNegativeCheck').checked       = false;
    $('oHint').style.display          = 'none';

    overlayState = 4;
    $('questionOverlay').classList.add('active');
    showAwardPanel();
    return;
  }

  // ── ALLE ANDEREN TYPEN (normal, estimate, multiple_choice) ──
  $('oCatLabel').textContent        = cat.name;
  $('oPtsBig').textContent          = pts + ' Punkte';
  $('oJokerBadge').style.display    = 'none';
  $('oQuestionBlock').style.display = 'flex';
  $('oEstimatePanel').style.display = 'none';

  $('oQuestionText').textContent = q.question.text || '';
  renderMedia($('oQuestionMedia'), q.question);

  $('oAnswerBlock').style.display  = 'none';
  $('oAnswerText').textContent     = '';
  $('oAnswerMedia').innerHTML      = '';
  $('oMcOptions').style.display    = 'none';
  $('oMcOptions').innerHTML        = '';
  $('oAwardPanel').style.display   = 'none';
  $('oNegativeRow').style.display  = cfg.allowNegativePoints ? 'flex' : 'none';
  $('oNegativeCheck').checked      = false;
  $('oHint').style.display         = 'block';

  if (qType === 'estimate') {
    $('oHint').textContent = 'Klicken zum Eingeben der Schätzungen';
  } else {
    $('oHint').textContent = 'Klicken zum Aufdecken der Antwort';
  }

  overlayState = 1;
  $('questionOverlay').classList.add('active');
  startTimer();
}

function closeOverlay() {
  $('questionOverlay').classList.remove('active');
  $('oQuestionBlock').style.display = 'flex';
  $('oEstimatePanel').style.display = 'none';
  overlayState = 0;
  stopTimer();
}

// ── Schätzfragen-Panel anzeigen ──
function showEstimatePanel() {
  overlayState = 5;
  stopTimer();
  $('oHint').style.display = 'none';
  $('oEstimateResult').style.display = 'none';

  // Eingabefelder für alle Teams generieren
  const inputs = $('oEstimateInputs');
  inputs.innerHTML = '';
  estimateGuesses = {};

  gs.teams.forEach(team => {
    estimateGuesses[team.id] = null;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;';
    row.innerHTML = `
      <div style="width:12px;height:12px;border-radius:50%;background:${team.color};flex-shrink:0;"></div>
      <span style="flex:1;font-size:15px;font-weight:700;color:${team.color};">${esc(team.name)}</span>
      <input type="number" placeholder="Schätzung" data-tid="${team.id}"
        style="width:160px;text-align:center;font-size:18px;font-weight:700;"
        class="estInput" />
    `;
    inputs.appendChild(row);
  });

  // Inputs-Events
  inputs.querySelectorAll('.estInput').forEach(el => {
    el.addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      estimateGuesses[e.target.dataset.tid] = isNaN(val) ? null : val;
    });
  });

  $('oEstimatePanel').style.display = 'block';
}

// ── Schätzfragen auswerten ──
function evaluateEstimates() {
  const q      = cats[currentCatIdx].questions[currentQIdx];
  const target = q.estimateTarget;

  // Alle eingegebenen Schätzungen sammeln
  const guesses = gs.teams
    .map(team => ({ team, val: estimateGuesses[team.id] }))
    .filter(g => g.val !== null && g.val !== undefined);

  if (!guesses.length) {
    showToast('⚠ Mindestens eine Schätzung eingeben'); return;
  }

  let resultHTML = '';

  if (target !== null && target !== undefined) {
    // Korrekte Zahl bekannt → nächste Schätzung gewinnt
    const sorted = [...guesses].sort((a, b) =>
      Math.abs(a.val - target) - Math.abs(b.val - target)
    );
    const closest = sorted[0];
    const isTied  = sorted.length > 1 && Math.abs(sorted[0].val - target) === Math.abs(sorted[1].val - target);

    // Auflistung aller Schätzungen
    const rows = sorted.map((g, i) => {
      const diff = Math.abs(g.val - target);
      const isWinner = diff === Math.abs(closest.val - target);
      return `<div style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="width:10px;height:10px;border-radius:50%;background:${g.team.color};"></div>
        <span style="flex:1;font-weight:700;color:${g.team.color};">${esc(g.team.name)}</span>
        <span style="font-size:16px;font-weight:900;">${g.val}</span>
        <span style="font-size:12px;color:var(--text-dim);">(±${diff})</span>
        ${isWinner ? '<span style="color:var(--gold);">\u2b50</span>' : ''}
      </div>`;
    }).join('');

    resultHTML = `
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:8px;">Korrekte Antwort: <span style="color:var(--gold);font-size:18px;">${target}</span></div>
      ${rows}
      <div style="margin-top:12px;font-size:15px;font-weight:700;color:var(--gold);">
        ${isTied ? '🤝 Gleichstand!' : `🏆 ${esc(closest.team.name)} gewinnt!`}
      </div>
    `;

    // Sieger vorauswählen
    selectedTeams = new Set(sorted.filter(g => Math.abs(g.val - target) === Math.abs(closest.val - target)).map(g => g.team.id));
  } else {
    // Kein Zielwert → nur Schätzungen anzeigen, manuell auswählen
    const rows = guesses.map(g => `
      <div style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="width:10px;height:10px;border-radius:50%;background:${g.team.color};"></div>
        <span style="font-weight:700;color:${g.team.color};">${esc(g.team.name)}</span>
        <span style="font-size:16px;font-weight:900;margin-left:auto;">${g.val}</span>
      </div>`).join('');
    resultHTML = `${rows}<div style="margin-top:10px;font-size:13px;color:var(--text-dim);">Kein Zielwert hinterlegt – bitte manuell auswählen.</div>`;
    selectedTeams = new Set();
  }

  // Ergebnis anzeigen
  $('oEstimateResult').innerHTML   = resultHTML;
  $('oEstimateResult').style.display = 'block';

  // Direkt zum Vergabe-Panel (Sieger sind vorausgewählt)
  $('oEstimatePanel').style.display = 'none';
  $('oAwardPanel').style.display   = 'none';
  overlayState = 5;

  // Award-Panel öffnen mit vorausgewähltem Team
  showAwardPanelWithPreselect();
}

// Award-Panel mit vorausgewählten Teams öffnen (nach Schätzauswertung)
function showAwardPanelWithPreselect() {
  overlayState = 3;
  $('oHint').style.display = 'none';

  const grid = $('oAwardGrid');
  grid.innerHTML = '';
  gs.teams.forEach(team => {
    const btn = document.createElement('button');
    btn.className = 'award-btn';
    if (selectedTeams.has(team.id)) btn.classList.add('selected');
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

// ── State-Machine: Klick auf Overlay ──
function attachOverlayListeners() {
  $('questionOverlay').addEventListener('click', e => {
    if (e.target.closest('#oAwardPanel')) return;
    if (e.target.closest('#oEstimatePanel')) return;

    if (overlayState === 1) {
      const q = cats[currentCatIdx]?.questions[currentQIdx];
      const qType = q?.questionType || (q?.isJoker ? 'joker' : 'normal');
      if (qType === 'estimate') {
        showEstimatePanel();
      } else {
        showAnswer();
      }
    } else if (overlayState === 2) {
      showAwardPanel();
    }
  });

  $('oBtnAward').addEventListener('click',  e => { e.stopPropagation(); awardPoints(); });
  $('oBtnNobody').addEventListener('click', e => { e.stopPropagation(); awardNobody(); });

  // Schätzfragen-Buttons
  $('oBtnEstimateEval').addEventListener('click', e => { e.stopPropagation(); evaluateEstimates(); });
  $('oBtnEstimateSkip').addEventListener('click', e => { e.stopPropagation(); awardNobody(); });
}

function showAnswer() {
  const q = cats[currentCatIdx].questions[currentQIdx];
  const qType = q.questionType || (q.isJoker ? 'joker' : 'normal');

  $('oAnswerBlock').style.display = 'flex';
  $('oAnswerText').textContent    = q.answer.text || '';
  renderMedia($('oAnswerMedia'), q.answer);
  $('oHint').textContent = 'Klicken zum Vergeben der Punkte';

  // Multiple-Choice Optionen anzeigen
  const mcPanel = $('oMcOptions');
  if (qType === 'multiple_choice' && q.mcOptions?.length) {
    mcPanel.style.display = 'grid';
    mcPanel.style.gridTemplateColumns = 'repeat(auto-fill,minmax(180px,1fr))';
    mcPanel.style.gap = '8px';
    mcPanel.innerHTML = q.mcOptions.map(opt => `
      <div style="
        padding:12px 16px;border-radius:var(--radius-sm);
        border:2px solid ${opt.isCorrect ? 'var(--green)' : 'var(--border)'};
        background:${opt.isCorrect ? 'rgba(63,185,80,0.15)' : 'rgba(255,255,255,0.04)'};
        font-size:14px;font-weight:${opt.isCorrect ? '700' : '500'};
        color:${opt.isCorrect ? 'var(--green)' : 'var(--text-dim)'};
        display:flex;align-items:center;gap:8px;
      ">
        <span>${opt.isCorrect ? '\u2705' : '\u25cb'}</span>
        <span>${esc(opt.text)}</span>
      </div>
    `).join('');
  } else {
    mcPanel.style.display = 'none';
  }

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

  // Bonus-/Strafpunkte: Dropdown-Färbung
  $('sp_bonusValue').addEventListener('change', () => updateBonusDropdownColor());

  // Bonus vergeben
  $('sp_btnBonus').addEventListener('click', awardBonusPoints);

  // Fullscreen
  const btnFs = $('btnFullscreen');
  if (btnFs) btnFs.addEventListener('click', toggleFullscreen);
}

// Dropdown-Farbe je nach Vorzeichen
function updateBonusDropdownColor() {
  const sel = $('sp_bonusValue');
  const val = parseInt(sel.value, 10);
  sel.style.color = val > 0 ? 'var(--green)' : 'var(--red)';
  const btn = $('sp_btnBonus');
  if (val > 0) {
    btn.textContent = `➕ +${val} Bonuspunkte vergeben`;
    btn.style.background = 'linear-gradient(135deg,#3fb950,#2ea043)';
  } else {
    btn.textContent = `➖ ${val} Strafpunkte vergeben`;
    btn.style.background = 'linear-gradient(135deg,#f85149,#b91c1c)';
  }
  btn.style.borderColor = 'transparent';
  btn.style.color = '#fff';
}

// Team-Buttons für Bonus-Vergabe rendern
let bonusSelectedTeams = new Set();

function updateBonusTeamButtons() {
  bonusSelectedTeams = new Set();
  const container = $('sp_bonusTeamBtns');
  container.innerHTML = '';
  gs.teams.forEach(team => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm';
    btn.dataset.tid = team.id;
    btn.style.cssText = `
      border-color:${hexToRgba(team.color, 0.4)};
      color:${team.color};
      background:transparent;
      font-weight:700;
      text-align:left;
      justify-content:flex-start;
      gap:10px;
    `;
    const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${team.color};"></span>`;
    btn.innerHTML = `${dot} ${esc(team.name)} <span style="margin-left:auto;font-size:12px;opacity:0.7;">${team.score} Pkt</span>`;
    btn.addEventListener('click', () => {
      if (bonusSelectedTeams.has(team.id)) {
        bonusSelectedTeams.delete(team.id);
        btn.style.background = 'transparent';
        btn.style.boxShadow = 'none';
      } else {
        bonusSelectedTeams.add(team.id);
        btn.style.background = hexToRgba(team.color, 0.18);
        btn.style.boxShadow = `0 0 12px ${hexToRgba(team.color, 0.35)}`;
      }
    });
    container.appendChild(btn);
  });
  updateBonusDropdownColor();
}

// Bonus-/Strafpunkte vergeben
function awardBonusPoints() {
  if (!bonusSelectedTeams.size) { showToast('⚠ Bitte mindestens ein Team auswählen'); return; }

  const pts    = parseInt($('sp_bonusValue').value, 10);
  const isBonus = pts > 0;
  const label  = isBonus ? 'Bonuspunkt' : 'Strafpunkt';
  const grpId  = S.generateId('bonus');

  bonusSelectedTeams.forEach(tid => {
    const team = gs.teams.find(t => t.id === tid);
    if (!team) return;
    team.score += pts;
    gs.scoreHistory.push({
      groupId:      grpId,
      questionId:   null,
      timestamp:    Date.now(),
      teamId:       team.id,
      teamName:     team.name,
      teamColor:    team.color,
      points:       pts,
      categoryName: `(${label})`,
      questionText: `${isBonus ? '🎁 Bonuspunkte' : '⚠️ Strafpunkte'} (${pts > 0 ? '+' : ''}${pts})`,
      pointValue:   Math.abs(pts),
      isJoker:      false,
      nobody:       false,
      isBonus:      true,
    });
    updateScoreCard(team);
  });

  gs.undoneHistory = [];
  S.saveGameState(gs);
  updateSidePanelScores();
  updateBonusTeamButtons(); // Scores in Buttons aktualisieren

  const names = [...bonusSelectedTeams].map(tid => gs.teams.find(t => t.id === tid)?.name).filter(Boolean).join(', ');
  showToast(`${isBonus ? '🎁' : '⚠️'} ${pts > 0 ? '+' : ''}${pts} Pkt für ${names}`);
  bonusSelectedTeams = new Set();
}

function syncSidePanel() {
  $('sp_chkNegative').checked = cfg.allowNegativePoints;
}

function openSidePanel() {
  $('sidePanel').classList.add('open');
  $('sideOverlay').classList.add('active');
  // Bonus-Buttons beim Öffnen immer aktualisieren (Scores könnten geändert haben)
  updateBonusTeamButtons();
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
    document.documentElement.requestFullscreen()
      .then(() => {
        localStorage.setItem('gp_fullscreen_pref', 'true');
      })
      .catch(err => {
        showToast('Vollbildmodus konnte nicht aktiviert werden');
      });
  } else {
    document.exitFullscreen();
    localStorage.setItem('gp_fullscreen_pref', 'false');
  }
}

let isUnloading = false;
window.addEventListener('beforeunload', () => { isUnloading = true; });

document.addEventListener('fullscreenchange', () => {
  if (isUnloading) return;
  const isFS = !!document.fullscreenElement;
  localStorage.setItem('gp_fullscreen_pref', isFS ? 'true' : 'false');
  const btn = $('btnFullscreen');
  if (btn) {
    btn.textContent = isFS ? '🗗' : '⛶';
    btn.title = isFS ? 'Vollbild beenden' : 'Vollbildmodus';
  }
});

function checkRestoreFullscreen() {
  const pref = localStorage.getItem('gp_fullscreen_pref') === 'true';
  if (pref && !document.fullscreenElement) {
    const handler = () => {
      document.documentElement.requestFullscreen().catch(() => {});
      document.removeEventListener('click', handler, true);
      document.removeEventListener('keydown', handler, true);
    };
    document.addEventListener('click', handler, true);
    document.addEventListener('keydown', handler, true);
  }
}

// ── START ──
init();
