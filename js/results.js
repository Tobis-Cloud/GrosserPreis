'use strict';
/* =============================================
   GROSSER PREIS – ERGEBNISSEITE
   ============================================= */

const S  = window.GPStorage;
const gs = S.getGameState();
const cfg = S.getConfig();

const $ = id => document.getElementById(id);

function init() {
  if (!gs) { window.location.href = 'index.html'; return; }

  $('gameNameTitle').textContent = cfg.gameName || 'Großer Preis';

  const sorted = [...gs.teams].sort((a,b) => b.score - a.score);

  renderWinner(sorted);
  renderPodium(sorted);
  renderChart(sorted);
  renderLog();
  startConfetti();

  $('btnPlayAgain').addEventListener('click', () => {
    S.resetGameState();
    window.location.href = 'game.html';
  });

  const btnDl = $('btnDownloadResults');
  if (btnDl) {
    btnDl.addEventListener('click', downloadResultsImage);
  }
  checkRestoreFullscreen();
}

// ── Gewinner ──
function renderWinner(sortedTeams) {
  if (!sortedTeams || sortedTeams.length === 0) return;

  const maxScore = sortedTeams[0].score;
  const winners = sortedTeams.filter(t => t.score === maxScore);

  const labelEl = document.querySelector('.winner-label');
  const nameEl = $('winnerName');
  const scoreEl = $('winnerScore');
  const cardEl = document.querySelector('.winner-card');

  if (winners.length > 1) {
    // Gleichstand / Unentschieden
    labelEl.textContent = 'Gleichstand!';
    nameEl.textContent = winners.map(w => w.name).join(' & ');

    const goldColor = 'hsl(42, 90%, 62%)';
    nameEl.style.color = goldColor;
    scoreEl.textContent = maxScore + ' Punkte';
    cardEl.style.borderColor = goldColor;
    cardEl.style.boxShadow = `0 0 44px ${hexToRgba('#ffd60a', 0.35)}`;
  } else {
    // Ein eindeutiger Gewinner
    const winner = winners[0];
    labelEl.textContent = 'Gewinner';
    nameEl.textContent = winner.name;
    nameEl.style.color = winner.color;
    scoreEl.textContent = winner.score + ' Punkte';
    cardEl.style.borderColor = winner.color;
    cardEl.style.boxShadow = `0 0 44px ${hexToRgba(winner.color, 0.3)}`;
  }
}

// ── Podium ──
function renderPodium(sorted) {
  const medals = ['🥇','🥈','🥉'];
  let currentRank = 1;
  let lastScore = null;

  $('podiumGrid').innerHTML = sorted.map((team, i) => {
    if (lastScore !== null && team.score < lastScore) {
      currentRank = i + 1;
    }
    lastScore = team.score;

    const rankText = medals[currentRank - 1] || `${currentRank}.`;

    return `
      <div class="podium-card anim-in" style="animation-delay:${i*80}ms;border-color:${hexToRgba(team.color, 0.4)};">
        <div class="podium-rank">${rankText}</div>
        <div class="podium-name" style="color:${team.color};">${esc(team.name)}</div>
        <div class="podium-score">${team.score} Pkt.</div>
      </div>
    `;
  }).join('');
}

// ── Punkte-Verlauf Chart ──
function renderChart(teams) {
  // Für jedes Team: akkumulierte Punkte über Zeit aufbauen
  const history = gs.scoreHistory;
  if (!history.length) { $('scoreChart').closest('.chart-card').style.display = 'none'; return; }

  // Zeitachse: alle Einträge sortiert
  const events = [...history].sort((a,b) => a.timestamp - b.timestamp);

  // Labels: Frageindex
  const labels = events.map((_, i) => `Runde ${i+1}`);

  // Datensätze pro Team
  const datasets = teams.map(team => {
    let running = 0;
    const data = events.map(e => {
      if (e.teamId === team.id) running += e.points;
      return running;
    });
    return {
      label: team.name,
      data,
      borderColor: team.color,
      backgroundColor: hexToRgba(team.color, 0.12),
      borderWidth: 3,
      tension: 0.3,
      pointRadius: 5,
      pointHoverRadius: 7,
      fill: false,
    };
  });

  new Chart($('scoreChart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      animation: { duration: 1000 },
      plugins: {
        legend: {
          labels: { color: '#e8eaf6', font: { family: 'Outfit', weight: '700', size: 13 } }
        },
        tooltip: {
          callbacks: {
            title: items => `Nach ${items[0].label}`,
            label: item => ` ${item.dataset.label}: ${item.parsed.y} Punkte`,
          },
          backgroundColor: '#1e2a3a',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: '#8b949e', font: { family: 'Outfit' } },
          grid:  { color: 'rgba(255,255,255,0.06)' },
        },
        y: {
          ticks: { color: '#8b949e', font: { family: 'Outfit' } },
          grid:  { color: 'rgba(255,255,255,0.06)' },
        },
      },
    },
  });
}

// ── Vollständiger Log ──
function renderLog() {
  const log = $('historyLog');
  const events = [...gs.scoreHistory].sort((a,b) => a.timestamp - b.timestamp);

  if (!events.length) {
    log.innerHTML = '<div class="text-dim text-center" style="padding:20px;">Keine Punkte vergeben.</div>';
    return;
  }

  log.innerHTML = events.map(h => {
    const sign = h.points >= 0 ? '+' : '';
    const col  = h.points >= 0 ? 'var(--green)' : 'var(--red)';
    return `
      <div class="history-entry" style="margin-bottom:8px;">
        <div class="history-dot" style="background:${h.teamColor};"></div>
        <div class="history-info">
          <div style="font-size:13px;font-weight:700;">
            ${esc(h.teamName)} · <span style="color:var(--text-dim);font-weight:500;">${esc(h.categoryName)}</span>
            ${h.isJoker ? ' ⭐' : ''}
          </div>
          <div class="text-xs text-dim" style="margin-top:2px;">${esc(h.questionText)}</div>
        </div>
        <div class="history-pts" style="color:${col};">${sign}${h.points}</div>
      </div>
    `;
  }).join('');
}

// ── Konfetti ──
function startConfetti() {
  const canvas = $('confettiCanvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    r: Math.random() * 8 + 4,
    d: Math.random() * 0.8 + 0.5,
    color: ['#f5c842','#ff6b6b','#4ecdc4','#9b5de5','#4895ef','#06d6a0'][Math.floor(Math.random()*6)],
    spin: Math.random() * 0.2 - 0.1,
    angle: Math.random() * Math.PI * 2,
    tilt: Math.random() * 10 - 5,
  }));

  let frame = 0;
  let raf;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r * 0.5);
      ctx.restore();

      p.y     += p.d * 2.5;
      p.x     += Math.sin(frame * 0.01 + p.spin) * 1.2;
      p.angle += p.spin;
      if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
    });
    frame++;
    if (frame < 360) raf = requestAnimationFrame(draw);
    else { ctx.clearRect(0,0,canvas.width,canvas.height); }
  }
  draw();

  window.addEventListener('resize', () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

// ── Hilfsfunktionen ──
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(100,100,100,${alpha})`;
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Bild-Export ──
function downloadResultsImage() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const w = 1200;
  const h = 800;
  canvas.width = w;
  canvas.height = h;
  
  // 1. Hintergrund zeichnen
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#111322');
  grad.addColorStop(1, '#1a1d36');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  
  // Deko-Kreise
  ctx.fillStyle = 'rgba(255, 183, 3, 0.03)';
  ctx.beginPath(); ctx.arc(w/2, h/2, 400, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(78, 205, 196, 0.02)';
  ctx.beginPath(); ctx.arc(100, 100, 200, 0, Math.PI*2); ctx.fill();
  
  // Rahmen
  ctx.strokeStyle = 'rgba(255, 183, 3, 0.2)';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 30, w - 60, h - 60);

  // 2. Header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb703';
  ctx.font = 'bold 54px system-ui, -apple-system, sans-serif';
  ctx.fillText(cfg.gameName || 'Großer Preis', w / 2, 90);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('🏆  OFFIZIELLES ENDERGEBNIS  🏆', w / 2, 130);
  
  // 3. Teams sortieren
  const sorted = [...gs.teams].sort((a,b) => b.score - a.score);
  const maxScore = sorted[0] ? sorted[0].score : 0;
  const winners = sorted.filter(t => t.score === maxScore);
  const isTie = winners.length > 1;
  const primaryWinner = winners[0];
  
  // 4. Gewinner (Linke Spalte)
  const leftX = 350;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.strokeStyle = isTie ? 'rgba(255, 183, 3, 0.6)' : (primaryWinner ? hexToRgba(primaryWinner.color, 0.6) : 'rgba(255, 183, 3, 0.5)');
  ctx.lineWidth = 3;
  
  const cardW = 500;
  const cardH = 460;
  const cardX = leftX - cardW / 2;
  const cardY = 200;
  
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(cardX, cardY, cardW, cardH, 20);
  } else {
    ctx.rect(cardX, cardY, cardW, cardH);
  }
  ctx.fill();
  ctx.stroke();
  
  // Pokal
  ctx.font = '100px system-ui, -apple-system, sans-serif';
  ctx.fillText('🏆', leftX, cardY + 120);
  
  ctx.fillStyle = '#ffb703';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(isTie ? 'GLEICHSTAND / SIEGER' : '1. PLATZ / SIEGER', leftX, cardY + 170);
  
  ctx.fillStyle = isTie ? '#ffb703' : (primaryWinner ? primaryWinner.color : '#fff');
  if (isTie) {
    const winnerNames = winners.map(w => w.name).join(' & ');
    if (winnerNames.length > 20) {
      ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    } else {
      ctx.font = 'bold 38px system-ui, -apple-system, sans-serif';
    }
    ctx.fillText(winnerNames, leftX, cardY + 230);
  } else {
    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.fillText(primaryWinner ? primaryWinner.name : 'Kein Team', leftX, cardY + 230);
  }
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.fillText(primaryWinner ? `${primaryWinner.score} Punkte` : '0 Punkte', leftX, cardY + 290);
  
  // 5. Platzierungen (Rechte Spalte)
  const rightX = 650;
  const listY = 200;
  const rowW = 460;
  const rowH = 70;
  
  let currentRank = 1;
  let lastScore = null;
  
  sorted.forEach((team, idx) => {
    if (idx >= 6) return;
    
    const currY = listY + idx * (rowH + 10);
    
    if (lastScore !== null && team.score < lastScore) {
      currentRank = idx + 1;
    }
    lastScore = team.score;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    if (currentRank === 1) {
      ctx.fillStyle = 'rgba(255, 183, 3, 0.08)';
      ctx.strokeStyle = 'rgba(255, 183, 3, 0.3)';
    }
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(rightX, currY, rowW, rowH, 10);
    } else {
      ctx.rect(rightX, currY, rowW, rowH);
    }
    ctx.fill();
    ctx.stroke();
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    const medals = ['🥇', '🥈', '🥉'];
    ctx.fillText(medals[currentRank - 1] || ` ${currentRank}.`, rightX + 20, currY + rowH / 2 + 8);
    
    ctx.fillStyle = team.color;
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(team.name, rightX + 80, currY + rowH / 2 + 7);
    
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${team.score} Pkt.`, rightX + rowW - 20, currY + rowH / 2 + 7);
  });
  
  // 6. Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  const dateStr = new Date().toLocaleDateString('de-DE', { hour: '2-digit', minute: '2-digit' });
  ctx.fillText(`Erstellt am ${dateStr} · tobiasayen.github.io/GrosserPreis`, w / 2, h - 50);
  
  // 7. Download auslösen
  const a = document.createElement('a');
  a.download = `${(cfg.gameName || 'GrosserPreis').replace(/\s+/g, '_')}_Ergebnis.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

let isUnloading = false;
window.addEventListener('beforeunload', () => { isUnloading = true; });

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

init();
