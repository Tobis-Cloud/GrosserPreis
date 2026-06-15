'use strict';
/* =============================================
   GROSSER PREIS – KONFIGURATIONSSEITE
   ============================================= */

const S = window.GPStorage;

// ── Zustand ──
let cfg       = S.getConfig();
let teams     = S.getTeams();
let cats      = S.getCategories();

// Editier-Kontext für den Fragen-Modal
let editCtx = { catIdx: null, qIdx: null };
let editCatIdx = null;
// temporäre Bilder im Modal
let modalImages = { question: [], answer: [] };

const CAT_COLORS = ['var(--c0)','var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)','var(--c6)','var(--c7)'];
const MAX_CATS   = 8;

// ── DOM-Referenzen ──
const $ = id => document.getElementById(id);

// =============================================
// INITIALISIERUNG
// =============================================
function init() {
  loadSettingsUI();
  renderTeams();
  renderGrid();
  syncSidePanel();
  attachTabListeners();
  attachSettingsListeners();
  attachTeamListeners();
  attachImportExportListeners();
  attachModalListeners();
  attachHamburgerListeners();
  updateHeaderTitle();
}

// =============================================
// TABS
// =============================================
function attachTabListeners() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// =============================================
// EINSTELLUNGEN
// =============================================
function loadSettingsUI() {
  $('inputGameName').value  = cfg.gameName;
  $('inputPointSteps').value = cfg.pointSteps.join(',');
  $('inputTimer').value     = cfg.timerSeconds;
  $('chkNegative').checked  = cfg.allowNegativePoints;
  $('chkSpieleiter').checked = cfg.spielleiterMode;
}

function readSettingsUI() {
  const steps = $('inputPointSteps').value
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0);

  return {
    gameName:            $('inputGameName').value.trim() || 'Großer Preis',
    pointSteps:          steps.length ? steps : [100,200,300,400,500],
    timerSeconds:        parseInt($('inputTimer').value, 10) || 0,
    allowNegativePoints: $('chkNegative').checked,
    spielleiterMode:     $('chkSpieleiter').checked,
  };
}

function attachSettingsListeners() {
  $('btnSaveSettings').addEventListener('click', saveSettings);
  $('btnStart').addEventListener('click', startGame);
  $('btnResetAll').addEventListener('click', () => confirmAction(
    'Alles zurücksetzen?',
    'Alle Kategorien, Fragen, Teams und Einstellungen werden gelöscht. Das kann nicht rückgängig gemacht werden.',
    () => { S.resetAll(); location.reload(); }
  ));

  // Live-Sync Spielname → Header
  $('inputGameName').addEventListener('input', () => {
    $('headerTitle').textContent = $('inputGameName').value.toUpperCase() || 'GROSSER PREIS';
  });
}

function saveSettings(showHint = true) {
  cfg = readSettingsUI();
  // Fragen-Struktur anpassen wenn sich Punkteschritte geändert haben
  syncCatPointSteps();
  S.saveConfig(cfg);
  S.saveCategories(cats);
  renderGrid();
  updateHeaderTitle();
  if (showHint) {
    const hint = $('saveSettingsHint');
    hint.style.display = 'inline';
    setTimeout(() => hint.style.display = 'none', 2000);
  }
  showToast('Einstellungen gespeichert');
}

function updateHeaderTitle() {
  $('headerTitle').textContent = (cfg.gameName || 'Großer Preis').toUpperCase();
}

// Wenn Punkteschritte geändert → Kategorien anpassen
function syncCatPointSteps() {
  const steps = cfg.pointSteps;
  cats = cats.map(cat => {
    const updatedQ = steps.map(pts => {
      const existing = cat.questions.find(q => q.points === pts);
      return existing || S.createQuestion(pts);
    });
    return { ...cat, questions: updatedQ };
  });
}

// =============================================
// TEAMS
// =============================================
function renderTeams() {
  const list = $('teamList');
  list.innerHTML = '';
  teams.forEach((team, i) => {
    const card = document.createElement('div');
    card.className = 'team-card anim-in';
    card.style.animationDelay = `${i * 50}ms`;
    card.innerHTML = `
      <input type="color" value="${team.color}" title="Farbe wählen"
        style="width:36px;height:36px;border-radius:50%;padding:2px;border:2px solid var(--border);cursor:pointer;background:transparent;"
        data-idx="${i}" class="teamColorPicker" />
      <input type="text" class="team-name-input" value="${esc(team.name)}"
        data-idx="${i}" style="flex:1;" placeholder="Teamname" />
      <button class="btn btn-icon-sm btn-danger" data-idx="${i}" title="Team löschen" class="delTeamBtn">✕</button>
    `;
    list.appendChild(card);
  });

  // Events
  list.querySelectorAll('.teamColorPicker').forEach(el => {
    el.addEventListener('input', e => {
      const i = +e.target.dataset.idx;
      teams[i].color = e.target.value;
      saveTeams();
    });
  });
  list.querySelectorAll('.team-name-input').forEach(el => {
    el.addEventListener('change', e => {
      const i = +e.target.dataset.idx;
      teams[i].name = e.target.value.trim() || `Team ${i+1}`;
      saveTeams();
    });
    el.addEventListener('focus', e => e.target.select());
  });
  list.querySelectorAll('.delTeamBtn').forEach(el => {
    el.addEventListener('click', e => {
      const i = +e.target.dataset.idx;
      if (teams.length <= 1) { showToast('Mindestens 1 Team erforderlich'); return; }
      teams.splice(i, 1);
      saveTeams();
      renderTeams();
    });
  });
}

function attachTeamListeners() {
  $('btnAddTeam').addEventListener('click', () => {
    const colors = ['#ff6b6b','#4ecdc4','#4895ef','#f9c74f','#9b5de5','#06d6a0','#f77f00','#ff85a1'];
    const color = colors[teams.length % colors.length];
    teams.push({ id: S.generateId('team'), name: `Team ${teams.length + 1}`, color });
    saveTeams();
    renderTeams();
  });
}

function saveTeams() {
  S.saveTeams(teams);
}

// =============================================
// FRAGEN-GRID
// =============================================
function renderGrid() {
  const grid = $('questionGrid');
  grid.innerHTML = '';

  const numCats    = cats.length;
  const numSteps   = cfg.pointSteps.length;
  const totalCols  = numCats + 1 + (numCats < MAX_CATS ? 1 : 0); // pts-label + cats + add-btn

  // CSS-Grid definieren: pts-label + Kategorien + ggf. Add-Button
  const catCols = `60px repeat(${numCats}, minmax(130px, 1fr))${numCats < MAX_CATS ? ' 60px' : ''}`;
  grid.style.gridTemplateColumns = catCols;

  $('catCountLabel').textContent = `(${numCats}/${MAX_CATS})`;

  // ── Zeile 1: Kategorie-Header ──
  // Leer-Ecke
  grid.appendChild(makeEl('div', ''));

  cats.forEach((cat, ci) => {
    const col = makeEl('div', `
      <span>${esc(cat.name)}</span>
      <span style="font-size:10px;margin-top:4px;opacity:0.6;">klicken zum Bearbeiten</span>
    `, 'q-grid-cat-header');
    col.style.background = CAT_COLORS[ci % CAT_COLORS.length];
    col.style.color = '#fff';
    col.dataset.ci = ci;
    col.addEventListener('click', () => openCatModal(ci));
    grid.appendChild(col);
  });

  // Add-Kategorie-Button
  if (numCats < MAX_CATS) {
    const addBtn = makeEl('div', '+', 'add-cat-btn');
    addBtn.title = 'Kategorie hinzufügen';
    addBtn.addEventListener('click', addCategory);
    grid.appendChild(addBtn);
  }

  // ── Zeilen: Fragen pro Punktwert ──
  cfg.pointSteps.forEach((pts, ri) => {
    // Punkte-Label
    const ptLabel = makeEl('div', pts, 'q-pts-label');
    grid.appendChild(ptLabel);

    cats.forEach((cat, ci) => {
      const q = cat.questions[ri];
      if (!q) { grid.appendChild(makeEl('div', '–', 'q-grid-cell')); return; }

      const hasContent = !!(q.question.text || q.question.images.length || q.question.videoUrl ||
                            q.answer.text   || q.answer.images.length   || q.answer.videoUrl);
      const cell = makeEl('div', '', 'q-grid-cell');
      if (hasContent) cell.classList.add('has-content');
      if (q.isJoker)  cell.classList.add('is-joker');

      cell.innerHTML = `
        <div class="q-cell-icons">
          ${hasContent ? '<span style="color:var(--green);">●</span>' : ''}
          ${q.isJoker  ? '<span>⭐</span>' : ''}
        </div>
        <div style="font-size:18px;font-weight:900;color:var(--gold);">${pts}</div>
        <div class="q-cell-preview">${esc(q.question.text || (hasContent ? '📷/🎥' : ''))}</div>
      `;
      cell.dataset.ci = ci;
      cell.dataset.ri = ri;
      cell.addEventListener('click', () => openQuestionModal(ci, ri));
      grid.appendChild(cell);
    });

    // Platzhalter für Add-Button-Spalte
    if (numCats < MAX_CATS) grid.appendChild(makeEl('div', ''));
  });
}

function addCategory() {
  if (cats.length >= MAX_CATS) { showToast(`Maximal ${MAX_CATS} Kategorien`); return; }
  const newCat = S.createCategory(`Kategorie ${cats.length + 1}`, cfg.pointSteps, cats.length);
  cats.push(newCat);
  S.saveCategories(cats);
  renderGrid();
}

// =============================================
// KATEGORIE-MODAL
// =============================================
function openCatModal(ci) {
  editCatIdx = ci;
  $('catNameInput').value = cats[ci].name;
  openModal('catNameModal');
  setTimeout(() => { $('catNameInput').focus(); $('catNameInput').select(); }, 100);
}

function attachModalListeners() {
  // Kategorien-Modal
  $('saveCatModal').addEventListener('click', () => {
    const name = $('catNameInput').value.trim();
    if (!name) return;
    cats[editCatIdx].name = name;
    S.saveCategories(cats);
    renderGrid();
    closeModal('catNameModal');
  });
  $('closeCatModal').addEventListener('click', () => closeModal('catNameModal'));
  $('cancelCatModal').addEventListener('click', () => closeModal('catNameModal'));
  $('catNameInput').addEventListener('keydown', e => { if (e.key==='Enter') $('saveCatModal').click(); });

  $('deleteCatBtn').addEventListener('click', () => {
    confirmAction('Kategorie löschen?', `Kategorie „${cats[editCatIdx].name}" mit allen Fragen löschen?`, () => {
      cats.splice(editCatIdx, 1);
      S.saveCategories(cats);
      renderGrid();
      closeModal('catNameModal');
    });
  });

  // Fragen-Modal Tabs
  document.querySelectorAll('#qModalTabs .modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#qModalTabs .modal-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.qtab;
      $('qtab-question').style.display = which === 'question' ? 'flex' : 'none';
      $('qtab-answer').style.display   = which === 'answer'   ? 'flex' : 'none';
    });
  });

  // Fragen-Modal Save/Close
  $('saveQModal').addEventListener('click', saveQuestion);
  $('closeQModal').addEventListener('click', () => closeModal('questionModal'));
  $('cancelQModal').addEventListener('click', () => closeModal('questionModal'));

  // Fragen zurücksetzen
  $('btnResetQuestions').addEventListener('click', () => confirmAction(
    'Alle Fragen zurücksetzen?',
    'Alle Fragen, Antworten und Bilder werden gelöscht. Kategorienamen bleiben erhalten.',
    () => {
      cats = cats.map(cat => ({
        ...cat,
        questions: cfg.pointSteps.map(pts => S.createQuestion(pts))
      }));
      S.saveCategories(cats);
      renderGrid();
      showToast('Fragen zurückgesetzt');
    }
  ));

  // Bestätigungs-Modal
  $('confirmCancel').addEventListener('click', () => closeModal('confirmModal'));

  // Overlay-Klick schließt Modal
  ['questionModal','catNameModal','confirmModal'].forEach(id => {
    $(id).addEventListener('click', e => { if (e.target === $(id)) closeModal(id); });
  });
}

// =============================================
// FRAGEN-MODAL
// =============================================
function openQuestionModal(ci, ri) {
  editCtx = { catIdx: ci, qIdx: ri };
  const cat = cats[ci];
  const q   = cat.questions[ri];
  const pts = cfg.pointSteps[ri];

  $('qModalTitle').textContent = `${esc(cat.name)} – ${pts} Punkte`;
  $('qModalJoker').checked = q.isJoker;

  // Frage-Felder
  $('qTextQuestion').value = q.question.text || '';
  $('qVideoQuestion').value = q.question.videoUrl || '';
  modalImages.question = [...(q.question.images || [])];

  // Antwort-Felder
  $('qTextAnswer').value = q.answer.text || '';
  $('qVideoAnswer').value = q.answer.videoUrl || '';
  modalImages.answer = [...(q.answer.images || [])];

  // Bilder rendern
  renderModalImages('question');
  renderModalImages('answer');

  // Tab zurück auf "Frage"
  document.querySelectorAll('#qModalTabs .modal-tab')[0].click();

  openModal('questionModal');
  setTimeout(() => $('qTextQuestion').focus(), 100);
}

function renderModalImages(side) {
  const container = $(`qImages${capitalize(side)}`);
  container.innerHTML = '';
  const imgs = modalImages[side];

  imgs.forEach((src, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'img-thumb';
    thumb.innerHTML = `<img src="${src}" alt="Bild ${i+1}" />
      <button class="img-thumb-del" data-i="${i}" data-side="${side}" title="Bild entfernen">✕</button>`;
    thumb.querySelector('.img-thumb-del').addEventListener('click', e => {
      e.stopPropagation();
      modalImages[e.target.dataset.side].splice(+e.target.dataset.i, 1);
      renderModalImages(e.target.dataset.side);
    });
    container.appendChild(thumb);
  });

  // Add-Button
  const addBtn = document.createElement('div');
  addBtn.className = 'img-add';
  addBtn.title = 'Bild hinzufügen';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => pickImage(side));
  container.appendChild(addBtn);
}

function pickImage(side) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.multiple = true;
  inp.addEventListener('change', async () => {
    for (const file of inp.files) {
      const b64 = await compressImage(file, 800, 0.82);
      modalImages[side].push(b64);
    }
    renderModalImages(side);
  });
  inp.click();
}

function saveQuestion() {
  const { catIdx, qIdx } = editCtx;
  const q = cats[catIdx].questions[qIdx];

  q.isJoker           = $('qModalJoker').checked;
  q.question.text     = $('qTextQuestion').value.trim();
  q.question.videoUrl = $('qVideoQuestion').value.trim();
  q.question.images   = [...modalImages.question];
  q.answer.text       = $('qTextAnswer').value.trim();
  q.answer.videoUrl   = $('qVideoAnswer').value.trim();
  q.answer.images     = [...modalImages.answer];

  S.saveCategories(cats);
  renderGrid();
  closeModal('questionModal');
  showToast('Frage gespeichert');
}

// =============================================
// IMPORT / EXPORT
// =============================================
function attachImportExportListeners() {
  // Excel Drag & Drop
  const dz = $('excelDropZone');
  dz.addEventListener('click', () => $('excelFileInput').click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleExcelFile(f);
  });
  $('excelFileInput').addEventListener('change', e => {
    if (e.target.files[0]) handleExcelFile(e.target.files[0]);
  });

  // JSON Export
  $('btnExportJSON').addEventListener('click', () => {
    saveSettings(false);
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `grosserpreis_${Date.now()}.json`;
    a.click();
    showToast('JSON exportiert');
  });

  // JSON Import
  $('btnImportJSON').addEventListener('click', () => $('jsonFileInput').click());
  $('jsonFileInput').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        S.importJSON(ev.target.result);
        cfg   = S.getConfig();
        teams = S.getTeams();
        cats  = S.getCategories();
        loadSettingsUI();
        renderTeams();
        renderGrid();
        showToast('✓ Konfiguration importiert');
      } catch(err) {
        showToast('Fehler beim Importieren: ' + err.message);
      }
    };
    reader.readAsText(f);
  });
}

function handleExcelFile(file) {
  // SheetJS wird dynamisch geladen
  loadSheetJS(() => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const sheet1 = wb.Sheets[wb.SheetNames[0]];
        const sheet2 = wb.SheetNames.length > 1 ? wb.Sheets[wb.SheetNames[1]] : null;

        const rows1 = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: '' });
        const rows2 = sheet2 ? XLSX.utils.sheet_to_json(sheet2, { header: 1, defval: '' }) : [];

        if (!rows1.length) { showToast('Leere Datei'); return; }

        const headerRow = rows1[0];
        const questionRows = rows1.slice(1);
        const answerRows   = rows2.slice(1);

        // Punkteschritte aus Anzahl der Datenzeilen ableiten oder aktuelle verwenden
        const numRows  = questionRows.length;
        const newSteps = cfg.pointSteps.slice(0, numRows);
        while (newSteps.length < numRows) {
          newSteps.push((newSteps[newSteps.length-1] || 0) + 100);
        }

        const newCats = [];
        for (let ci = 0; ci < headerRow.length && ci < MAX_CATS; ci++) {
          const catName = String(headerRow[ci] || '').trim() || `Kategorie ${ci+1}`;
          const questions = newSteps.map((pts, ri) => {
            const q = S.createQuestion(pts);
            q.question.text = String(questionRows[ri]?.[ci] || '').trim();
            q.answer.text   = String(answerRows[ri]?.[ci]   || '').trim();
            return q;
          });
          newCats.push({ id: S.generateId('cat'), name: catName, questions });
        }

        cfg.pointSteps = newSteps;
        cats = newCats;
        S.saveConfig(cfg);
        S.saveCategories(cats);

        loadSettingsUI();
        renderGrid();

        // Vorschau anzeigen
        const preview = $('excelPreview');
        preview.style.display = 'block';
        preview.innerHTML = `<div class="text-green font-bold mb-8">✓ Import erfolgreich!</div>
          <div class="text-sm text-dim">${newCats.length} Kategorien, ${newSteps.length} Fragestufen importiert.</div>`;
        showToast(`Excel importiert: ${newCats.length} Kategorien`);
      } catch(err) {
        showToast('Excel-Fehler: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function loadSheetJS(cb) {
  if (window.XLSX) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
  s.onload = cb;
  document.head.appendChild(s);
}

// =============================================
// START
// =============================================
function startGame() {
  saveSettings(false);
  if (!cats.length) { showToast('⚠ Mindestens 1 Kategorie erforderlich'); return; }
  if (teams.length < 1) { showToast('⚠ Mindestens 1 Team erforderlich'); return; }

  const hasAnyQ = cats.some(c => c.questions.some(q =>
    q.question.text || q.question.images.length || q.question.videoUrl
  ));
  if (!hasAnyQ) { showToast('⚠ Noch keine Fragen konfiguriert'); return; }

  // Spielstand initialisieren
  const gameState = {
    startedAt:    Date.now(),
    teams:        teams.map(t => ({ ...t, score: 0 })),
    answeredIds:  [],
    scoreHistory: [],
  };
  S.saveGameState(gameState);
  window.location.href = 'game.html';
}

// =============================================
// HAMBURGER / SIDE-PANEL
// =============================================
function attachHamburgerListeners() {
  $('hamburgerBtn').addEventListener('click', openSidePanel);
  $('closeSidePanel').addEventListener('click', closeSidePanel);
  $('sideOverlay').addEventListener('click', closeSidePanel);
  $('sp_btnStart').addEventListener('click', startGame);
  $('sp_btnReset').addEventListener('click', () => {
    closeSidePanel();
    $('btnResetAll').click();
  });

  // Sync side-panel toggles ↔ main toggles
  $('sp_chkSpieleiter').addEventListener('change', e => {
    $('chkSpieleiter').checked = e.target.checked;
    cfg.spielleiterMode = e.target.checked;
    S.saveConfig(cfg);
  });
  $('sp_chkNegative').addEventListener('change', e => {
    $('chkNegative').checked = e.target.checked;
    cfg.allowNegativePoints = e.target.checked;
    S.saveConfig(cfg);
  });
}

function syncSidePanel() {
  $('sp_chkSpieleiter').checked = cfg.spielleiterMode;
  $('sp_chkNegative').checked   = cfg.allowNegativePoints;
}

function openSidePanel()  { $('sidePanel').classList.add('open');   $('sideOverlay').classList.add('active'); }
function closeSidePanel() { $('sidePanel').classList.remove('open'); $('sideOverlay').classList.remove('active'); }

// =============================================
// BESTÄTIGUNGS-MODAL
// =============================================
let _confirmCb = null;
function confirmAction(title, text, cb) {
  $('confirmTitle').textContent = title;
  $('confirmText').textContent  = text;
  _confirmCb = cb;
  openModal('confirmModal');
}
$('confirmOk').addEventListener('click', () => {
  closeModal('confirmModal');
  if (_confirmCb) _confirmCb();
  _confirmCb = null;
});

// =============================================
// MODAL HELPERS
// =============================================
function openModal(id)  { $(id).classList.add('active'); }
function closeModal(id) { $(id).classList.remove('active'); }

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
// BILD-KOMPRIMIERUNG
// =============================================
function compressImage(file, maxPx, quality) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = url;
  });
}

// =============================================
// HILFSFUNKTIONEN
// =============================================
function makeEl(tag, html, cls = '') {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.innerHTML = html;
  return el;
}
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── START ──
init();
