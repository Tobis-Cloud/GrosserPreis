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

  renderWinner(sorted[0]);
  renderPodium(sorted);
  renderChart(sorted);
  renderLog();
  startConfetti();

  $('btnPlayAgain').addEventListener('click', () => {
    S.resetGameState();
    window.location.href = 'game.html';
  });
}

// ── Gewinner ──
function renderWinner(winner) {
  if (!winner) return;
  $('winnerName').textContent  = winner.name;
  $('winnerName').style.color  = winner.color;
  $('winnerScore').textContent = winner.score + ' Punkte';
  document.querySelector('.winner-card').style.borderColor = winner.color;
  document.querySelector('.winner-card').style.boxShadow  = `0 0 44px ${hexToRgba(winner.color, 0.3)}`;
}

// ── Podium ──
function renderPodium(sorted) {
  const medals = ['🥇','🥈','🥉'];
  $('podiumGrid').innerHTML = sorted.map((team, i) => `
    <div class="podium-card anim-in" style="animation-delay:${i*80}ms;border-color:${hexToRgba(team.color, 0.4)};">
      <div class="podium-rank">${medals[i] || (i+1)+'.'}</div>
      <div class="podium-name" style="color:${team.color};">${esc(team.name)}</div>
      <div class="podium-score">${team.score} Pkt.</div>
    </div>
  `).join('');
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

init();
