// ══════════════════════════════════════════════════════════
//  main.js  ·  Game loop, rendering, input, game state
// ══════════════════════════════════════════════════════════

// ── CONSTANTS ──────────────────────────────────────────────
const FIELD_W = 1200;
const FIELD_H = 700;
const GOAL_H = 160;
const GOAL_Y = (FIELD_H - GOAL_H) / 2;
const GOAL_DEPTH = 14;
const GAME_DURATION = 180; // seconds

// ── AUDIO ──────────────────────────────────────────────────
let audioCtx = null;
let muted = false;

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function tone(freq, type, dur, vol = 0.3, delay = 0) {
  if (muted || !audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = type; o.frequency.value = freq;
  const t = audioCtx.currentTime + delay;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur);
}
function sfxKick()    { tone(160, 'triangle', 0.14, 0.45); }
function sfxGoal()    { [523,659,784,1046].forEach((f,i) => tone(f,'square',0.3,0.28,i*0.11)); }
function sfxWhistle() { tone(1760,'sine',0.4,0.2); setTimeout(()=>tone(1760,'sine',0.2,0.15),450); }
function sfxHit()     { tone(90, 'sawtooth', 0.08, 0.4); }

// ── GAME STATE ─────────────────────────────────────────────
let gameMode = 'MENU'; // MENU | PLAYING | PAUSED | PAUSED_BY_BLUR | GAMEOVER
let playerScore = 0, aiScore = 0;
let gameTimer = GAME_DURATION;
let lastTime = 0;
let animId = null;
let goalCooldown = 0;
let zoom = 1;
let notifTimeout = null;

// Input
const keys = {};
let mouseX = 0, mouseY = 0;
let mouseWorldX = 0, mouseWorldY = 0;

// ── ENTITIES ───────────────────────────────────────────────
let player, ball, bots;

function initEntities() {
  player = createPlayer();
  ball = { x: FIELD_W / 2, y: FIELD_H / 2, vx: 0, vy: 0, r: 10, lastKickedBy: null };
  bots = Array.from({ length: BOT_COUNT }, (_, i) => createBot(i));
}

// ── CANVAS & CAMERA ────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const mmCanvas = document.getElementById('minimap');
const mmCtx    = mmCanvas.getContext('2d');

function resizeCanvas() { // EVENT: resize
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();

// Camera tracks player
let camX = 0, camY = 0;
function updateCamera() {
  const vw = canvas.width  / zoom;
  const vh = canvas.height / zoom;
  camX = Math.max(0, Math.min(FIELD_W - vw, player.x - vw / 2));
  camY = Math.max(0, Math.min(FIELD_H - vh, player.y - vh / 2));
}

// Convert screen → world
function screenToWorld(sx, sy) {
  return {
    x: sx / zoom + camX,
    y: sy / zoom + camY,
  };
}

// ── KICK ───────────────────────────────────────────────────
function performKick() {
  // Direction: toward mouse cursor in world space
  const dx = mouseWorldX - ball.x;
  const dy = mouseWorldY - ball.y;
  const len = Math.hypot(dx, dy);
  const power = 280 + player.kickPower * 600;
  if (len > 0.5) {
    ball.vx = (dx / len) * power;
    ball.vy = (dy / len) * power;
  } else {
    // Kick straight ahead if no mouse direction
    ball.vx = player.facing * power;
    ball.vy = 0;
  }
  ball.lastKickedBy = 'player';
  player.shootCooldown = SHOOT_COOLDOWN_MS;
  player.kickPower = 0;
  player.isChargingKick = false;
  sfxKick();
}

// ── BALL PHYSICS ───────────────────────────────────────────
function updateBall(dt) {
  const friction = Math.pow(0.984, dt * 60);
  ball.vx *= friction;
  ball.vy *= friction;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Wall bounce (top / bottom)
  if (ball.y - ball.r < 0)       { ball.y = ball.r;        ball.vy *= -0.65; }
  if (ball.y + ball.r > FIELD_H) { ball.y = FIELD_H - ball.r; ball.vy *= -0.65; }

  // Left wall / left goal
  if (ball.x - ball.r < 0) {
    if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_H) {
      onGoal('ai');   // AI scored — ball entered player's goal (left)
    } else {
      ball.x = ball.r; ball.vx *= -0.65;
    }
  }
  // Right wall / right goal
  if (ball.x + ball.r > FIELD_W) {
    if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_H) {
      onGoal('player'); // Player scored — ball entered AI's goal (right)
    } else {
      ball.x = FIELD_W - ball.r; ball.vx *= -0.65;
    }
  }

  // Bot-ball collisions
  bots.forEach(bot => {
    if (bot.health <= 0) return;
    const d = Math.hypot(bot.x - ball.x, bot.y - ball.y);
    if (d < bot.r + ball.r) {
      const ang = Math.atan2(ball.y - bot.y, ball.x - bot.x);
      const overlap = bot.r + ball.r - d + 1;
      ball.x += Math.cos(ang) * overlap;
      ball.y += Math.sin(ang) * overlap;
      const spd = Math.max(Math.hypot(ball.vx, ball.vy), 60);
      ball.vx = Math.cos(ang) * spd;
      ball.vy = Math.sin(ang) * spd;
    }
  });
}

// ── GOAL ───────────────────────────────────────────────────
function onGoal(scorer) {
  if (goalCooldown > 0) return;
  goalCooldown = 3.5;
  scorer === 'player' ? playerScore++ : aiScore++;
  document.getElementById('playerScore').textContent = playerScore;
  document.getElementById('aiScore').textContent = aiScore;
  showNotification(scorer === 'player' ? '⚽ GOAL!' : '😬 AI SCORES!');
  sfxGoal();
  document.dispatchEvent(new CustomEvent('goalScored', { detail: { scorer } }));

  setTimeout(resetPositions, 1600);
}

function resetPositions() {
  ball.x = FIELD_W / 2; ball.y = FIELD_H / 2; ball.vx = 0; ball.vy = 0;
  player.x = 200; player.y = FIELD_H / 2;
  bots.forEach((b, i) => {
    b.x = FIELD_W * 0.62 + (i % 3) * 130;
    b.y = 80 + i * ((FIELD_H - 160) / Math.max(BOT_COUNT - 1, 1));
    b.fsm.enter(BOT_STATES.IDLE, b);
    b.health = MAX_HEALTH;
  });
}

// ── DRAWING ────────────────────────────────────────────────
function drawField() {
  // Striped pitch
  const sw = FIELD_W / 10;
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1a6b2e' : '#1d7533';
    ctx.fillRect(i * sw, 0, sw, FIELD_H);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  // Boundary
  ctx.strokeRect(1, 1, FIELD_W - 2, FIELD_H - 2);
  // Center line
  ctx.beginPath(); ctx.moveTo(FIELD_W/2, 0); ctx.lineTo(FIELD_W/2, FIELD_H); ctx.stroke();
  // Center circle
  ctx.beginPath(); ctx.arc(FIELD_W/2, FIELD_H/2, 80, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.arc(FIELD_W/2, FIELD_H/2, 4, 0, Math.PI*2); ctx.fill();
  // Penalty boxes
  ctx.strokeRect(0, FIELD_H/2 - 110, 120, 220);
  ctx.strokeRect(FIELD_W - 120, FIELD_H/2 - 110, 120, 220);
  // Corner arcs
  [[0,0,0,Math.PI/2],[FIELD_W,0,Math.PI/2,Math.PI],[FIELD_W,FIELD_H,Math.PI,Math.PI*1.5],[0,FIELD_H,Math.PI*1.5,Math.PI*2]]
    .forEach(([cx,cy,s,e]) => { ctx.beginPath(); ctx.arc(cx,cy,18,s,e); ctx.stroke(); });
  // Goals
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(-GOAL_DEPTH, GOAL_Y, GOAL_DEPTH, GOAL_H);
  ctx.fillRect(FIELD_W, GOAL_Y, GOAL_DEPTH, GOAL_H);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
  ctx.strokeRect(-GOAL_DEPTH, GOAL_Y, GOAL_DEPTH, GOAL_H);
  ctx.strokeRect(FIELD_W, GOAL_Y, GOAL_DEPTH, GOAL_H);
  // Net lines
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  for (let y = GOAL_Y; y <= GOAL_Y + GOAL_H; y += 14) {
    ctx.beginPath(); ctx.moveTo(-GOAL_DEPTH, y); ctx.lineTo(0, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(FIELD_W, y); ctx.lineTo(FIELD_W+GOAL_DEPTH, y); ctx.stroke();
  }
}

function lightenHex(hex, amt) {
  let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+amt)},${Math.min(255,g+amt)},${Math.min(255,b+amt)})`;
}

function drawEntity(e, isPlayer = false) {
  if (e.health <= 0) return;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r - 2, e.r * 0.9, e.r * 0.3, 0, 0, Math.PI*2); ctx.fill();
  // Body gradient
  const g = ctx.createRadialGradient(e.x-3, e.y-3, 2, e.x, e.y, e.r);
  g.addColorStop(0, lightenHex(e.color, 50));
  g.addColorStop(1, e.color);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
  // Icon
  ctx.fillStyle = isPlayer ? '#000' : '#fff';
  ctx.font = `bold ${isPlayer ? 12 : 10}px Barlow Condensed`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(isPlayer ? '★' : (e.idx + 1), e.x, e.y);
  // Health bar
  const bw = e.r * 2.2;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(e.x - bw/2, e.y - e.r - 9, bw, 4);
  const hp = e.health / MAX_HEALTH;
  ctx.fillStyle = hp > 0.5 ? '#2d9e47' : hp > 0.25 ? '#f5d020' : '#e63946';
  ctx.fillRect(e.x - bw/2, e.y - e.r - 9, bw * hp, 4);
  // Sprint glow
  if (isPlayer && e.sprinting) {
    ctx.strokeStyle = 'rgba(100,200,255,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, 0, Math.PI*2); ctx.stroke();
  }
  // Kick charge ring
  if (isPlayer && e.isChargingKick) {
    ctx.strokeStyle = `rgba(255,240,60,${0.3 + e.kickPower*0.7})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6 + e.kickPower * 8, 0, Math.PI*2); ctx.stroke();
  }
  // FSM label for bots
  if (!isPlayer && e.fsm) {
    const col = {IDLE:'#aaa',PATROL:'#6af',CHASE:'#f5d020',ATTACK:'#e63946',FLEE:'#f90',DEAD:'#444'}[e.fsm.state]||'#fff';
    ctx.font = '9px Barlow Condensed';
    ctx.fillStyle = col;
    ctx.fillText(e.fsm.state, e.x, e.y - e.r - 13);
  }
}

function drawBall() {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(ball.x, ball.y + ball.r - 1, ball.r*0.9, ball.r*0.3, 0, 0, Math.PI*2); ctx.fill();
  // White sphere
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
  // Patches
  ctx.fillStyle = '#222';
  [[0,0],[1.1,-0.7],[-1.1,-0.7],[0,1.2],[-1,0.6],[1,0.6]].forEach(([dx,dy]) => {
    ctx.beginPath(); ctx.arc(ball.x+dx*ball.r*0.5, ball.y+dy*ball.r*0.5, 2.5, 0, Math.PI*2); ctx.fill();
  });
  // Speed trail
  const spd = Math.hypot(ball.vx, ball.vy);
  if (spd > 80) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.5, spd/500)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(ball.x - ball.vx*0.07, ball.y - ball.vy*0.07);
    ctx.stroke();
  }
}

function drawAimArrow() {
  if (!player.hasBall || player.shootCooldown > 0) return;
  const dx = mouseWorldX - ball.x, dy = mouseWorldY - ball.y;
  const len = Math.hypot(dx, dy);
  if (len < 5) return;
  const nx = dx/len, ny = dy/len;
  const alpha = player.isChargingKick ? 0.9 : 0.45;
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = `rgba(245,208,32,${alpha})`;
  ctx.lineWidth = player.isChargingKick ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.moveTo(ball.x + nx*12, ball.y + ny*12);
  ctx.lineTo(ball.x + nx*90, ball.y + ny*90);
  ctx.stroke();
  ctx.setLineDash([]);
  // Arrowhead
  const ax = ball.x + nx*90, ay = ball.y + ny*90;
  const perp = Math.atan2(ny, nx);
  ctx.fillStyle = `rgba(245,208,32,${alpha})`;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - Math.cos(perp-0.4)*12, ay - Math.sin(perp-0.4)*12);
  ctx.lineTo(ax - Math.cos(perp+0.4)*12, ay - Math.sin(perp+0.4)*12);
  ctx.closePath(); ctx.fill();
}

function drawKickPowerBar() {
  if (!player.isChargingKick) return;
  const bw = 80, bh = 8;
  // Draw in screen space (not world)
  const sx = canvas.width/2 - bw/2;
  const sy = canvas.height - 80;
  ctx.save(); ctx.resetTransform();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(sx-2, sy-2, bw+4, bh+4);
  const g = ctx.createLinearGradient(sx,0,sx+bw,0);
  g.addColorStop(0,'#2d9e47'); g.addColorStop(0.6,'#f5d020'); g.addColorStop(1,'#e63946');
  ctx.fillStyle = g;
  ctx.fillRect(sx, sy, bw * player.kickPower, bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.strokeRect(sx, sy, bw, bh);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Barlow Condensed';
  ctx.textAlign = 'center';
  ctx.fillText('KICK POWER', sx + bw/2, sy - 6);
  ctx.restore();
}

// ── MINIMAP ────────────────────────────────────────────────
function drawMinimap() {
  const mw = mmCanvas.width, mh = mmCanvas.height;
  const sx = mw / FIELD_W, sy = mh / FIELD_H;
  mmCtx.clearRect(0, 0, mw, mh);
  mmCtx.fillStyle = '#1a6b2e'; mmCtx.fillRect(0,0,mw,mh);
  mmCtx.strokeStyle='rgba(255,255,255,0.25)'; mmCtx.lineWidth=1;
  mmCtx.strokeRect(0,0,mw,mh);
  mmCtx.beginPath(); mmCtx.moveTo(mw/2,0); mmCtx.lineTo(mw/2,mh); mmCtx.stroke();
  // Goals
  mmCtx.fillStyle='rgba(255,255,255,0.3)';
  mmCtx.fillRect(0, GOAL_Y*sy, 3, GOAL_H*sy);
  mmCtx.fillRect(mw-3, GOAL_Y*sy, 3, GOAL_H*sy);
  // Bots
  bots.forEach(b => {
    if (b.health <= 0) return;
    mmCtx.fillStyle = b.color;
    mmCtx.beginPath(); mmCtx.arc(b.x*sx, b.y*sy, 3, 0, Math.PI*2); mmCtx.fill();
  });
  // Ball
  mmCtx.fillStyle='#fff';
  mmCtx.beginPath(); mmCtx.arc(ball.x*sx, ball.y*sy, 3, 0, Math.PI*2); mmCtx.fill();
  // Player
  mmCtx.fillStyle='#f5d020';
  mmCtx.beginPath(); mmCtx.arc(player.x*sx, player.y*sy, 4, 0, Math.PI*2); mmCtx.fill();
  // Viewport rect
  mmCtx.strokeStyle='rgba(255,255,255,0.5)';
  mmCtx.strokeRect(camX*sx, camY*sy, (canvas.width/zoom)*sx, (canvas.height/zoom)*sy);
}

// ── HUD ────────────────────────────────────────────────────
function updateHUD() {
  const hp = player.health / MAX_HEALTH;
  document.getElementById('healthFill').style.width = (hp*100)+'%';
  document.getElementById('healthFill').style.backgroundPosition = `${(1-hp)*100}% 0%`;
  document.getElementById('staminaFill').style.width = (player.stamina/MAX_STAMINA*100)+'%';
  document.getElementById('kickFill').style.width = (player.kickPower*100)+'%';
  const m = Math.floor(gameTimer/60);
  const s = Math.floor(gameTimer%60);
  document.getElementById('timerDisplay').textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

function updateDebug() {
  document.getElementById('stateDebug').innerHTML = bots.map((b,i) =>
    `BOT ${i+1}: <span style="color:${{IDLE:'#aaa',PATROL:'#6af',CHASE:'#f5d020',ATTACK:'#e63946',FLEE:'#f90',DEAD:'#444'}[b.fsm.state]}">${b.fsm.state}</span> HP:${Math.round(b.health)}`
  ).join('<br>');
}

// ── NOTIFICATION ───────────────────────────────────────────
function showNotification(msg) {
  const el = document.getElementById('notification');
  el.textContent = msg; el.style.opacity = '1';
  if (notifTimeout) clearTimeout(notifTimeout);
  notifTimeout = setTimeout(() => el.style.opacity = '0', 2000);
}

// ── MAIN LOOP ──────────────────────────────────────────────
function gameLoop(ts) {                           // EVENT: requestAnimationFrame
  if (gameMode !== 'PLAYING') return;
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (goalCooldown > 0) goalCooldown -= dt;

  // Mouse world pos (using camX/camY)
  mouseWorldX = mouseX / zoom + camX;
  mouseWorldY = mouseY / zoom + camY;

  // Player
  const signal = updatePlayer(player, ball, keys, dt);
  if (signal === 'KICK') performKick();

  // Bots
  bots.forEach(b => updateBot(b, ball, player, dt));

  // Ball
  updateBall(dt);

  // Timer
  gameTimer -= dt;
  if (gameTimer <= 0) { gameTimer = 0; endGame(); return; }

  // Player death → respawn
  if (player.health <= 0) {
    player.health = 40;
    player.x = 200; player.y = FIELD_H/2;
    showNotification('💀 TACKLED!');
  }

  updateCamera();
  updateHUD();
  updateDebug();

  // ── RENDER ──────────────────────────────────────────────
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  drawField();
  drawAimArrow();
  bots.forEach(b => drawEntity(b, false));
  drawEntity(player, true);
  drawBall();

  ctx.restore();

  drawKickPowerBar();  // screen-space, drawn after restore
  drawMinimap();

  animId = requestAnimationFrame(gameLoop);
}

// ── GAME MANAGEMENT ────────────────────────────────────────
function startGame() {
  initAudio();
  playerScore = 0; aiScore = 0; gameTimer = GAME_DURATION;
  document.getElementById('playerScore').textContent = '0';
  document.getElementById('aiScore').textContent = '0';
  zoom = 1;
  initEntities();
  gameMode = 'PLAYING';
  showScreen(null);
  showGameUI(true);
  sfxWhistle();
  document.dispatchEvent(new CustomEvent('gameStart'));
  lastTime = performance.now();
  animId = requestAnimationFrame(gameLoop);
}

function endGame() {
  gameMode = 'GAMEOVER';
  cancelAnimationFrame(animId);
  showGameUI(false);
  document.getElementById('goPlayerScore').textContent = playerScore;
  document.getElementById('goAiScore').textContent = aiScore;
  document.getElementById('goResult').textContent =
    playerScore > aiScore ? '🏆 YOU WIN!' : playerScore < aiScore ? '❌ YOU LOSE' : '🤝 DRAW';
  document.dispatchEvent(new CustomEvent('gameOver', { detail: { playerScore, aiScore } }));
  showScreen('gameOverScreen');
}

function pauseGame() {
  if (gameMode !== 'PLAYING') return;
  gameMode = 'PAUSED';
  cancelAnimationFrame(animId);
  showGameUI(false);
  showScreen('pauseScreen');
}

function resumeGame() {
  if (gameMode !== 'PAUSED' && gameMode !== 'PAUSED_BY_BLUR') return;
  gameMode = 'PLAYING';
  showScreen(null);
  showGameUI(true);
  lastTime = performance.now();
  animId = requestAnimationFrame(gameLoop);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  if (id) document.getElementById(id).classList.remove('hidden');
}

function showGameUI(visible) {
  ['hud','minimap','stateDebug'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', !visible);
  });
}

// ══════════════════════════════════════════════════════════
//  EVENTS  (14 types documented)
// ══════════════════════════════════════════════════════════

// 1. load
window.addEventListener('load', () => { showScreen('menuScreen'); });

// 2. keydown
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') gameMode === 'PLAYING' ? pauseGame() : resumeGame();
  if (e.code === 'KeyM') toggleMute();
  e.preventDefault();
});

// 3. keyup
document.addEventListener('keyup', e => { keys[e.code] = false; });

// 4. mousemove
canvas.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// 5. mousedown — right-click tackle
canvas.addEventListener('mousedown', e => {
  if (e.button === 2 && gameMode === 'PLAYING') {
    bots.forEach(bot => {
      if (Math.hypot(bot.x - player.x, bot.y - player.y) < 65 && bot.health > 0) {
        bot.health = Math.max(0, bot.health - 22);
        const ang = Math.atan2(bot.y - player.y, bot.x - player.x);
        bot.x += Math.cos(ang) * 35; bot.y += Math.sin(ang) * 35;
        showNotification('💥 TACKLE!');
        sfxHit();
      }
    });
  }
});

// 6. mouseup
canvas.addEventListener('mouseup', () => {});

// 7. contextmenu — prevent default
canvas.addEventListener('contextmenu', e => e.preventDefault());

// 8. wheel — zoom
window.addEventListener('wheel', e => {
  zoom = Math.max(0.6, Math.min(2.2, zoom - e.deltaY * 0.001));
  e.preventDefault();
}, { passive: false });

// 9. resize
window.addEventListener('resize', resizeCanvas);

// 10. focus
window.addEventListener('focus', () => {
  if (gameMode === 'PAUSED_BY_BLUR') resumeGame();
});

// 11. blur
window.addEventListener('blur', () => {
  if (gameMode === 'PLAYING') {
    gameMode = 'PAUSED_BY_BLUR';
    cancelAnimationFrame(animId);
  }
});

// 12. visibilitychange
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gameMode === 'PLAYING') pauseGame();
});

// Custom game events
document.addEventListener('goalScored', e => console.log('[goalScored]', e.detail.scorer));
document.addEventListener('gameStart',  () => console.log('[gameStart]'));
document.addEventListener('gameOver',   e => console.log('[gameOver]', e.detail));

// 13. click — buttons
document.getElementById('playBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('quitBtn').addEventListener('click', () => { gameMode='MENU'; showScreen('menuScreen'); });
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('menuBtn').addEventListener('click', () => showScreen('menuScreen'));
document.getElementById('muteBtn').addEventListener('click', toggleMute);

function toggleMute() {
  muted = !muted;
  document.getElementById('muteBtn').textContent = muted ? '🔇' : '🔊';
}

// 14. setInterval — bot health regen
setInterval(() => {
  if (gameMode !== 'PLAYING') return;
  bots.forEach(b => { if (b.health > 0 && b.health < MAX_HEALTH) b.health = Math.min(MAX_HEALTH, b.health + 1); });
}, 1000);

// Idle background render (menu/gameover screens)
function renderIdle() {
  if (gameMode !== 'PLAYING' && gameMode !== 'PAUSED') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width/2 - FIELD_W/2, canvas.height/2 - FIELD_H/2);
    drawField();
    ctx.restore();
  }
  requestAnimationFrame(renderIdle);
}
renderIdle();
