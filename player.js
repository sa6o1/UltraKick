// ══════════════════════════════════════════════════════════
//  player.js  ·  Player entity creation and update logic
// ══════════════════════════════════════════════════════════

const PLAYER_R = 14;
const MAX_HEALTH = 100;
const MAX_STAMINA = 100;
const SHOOT_COOLDOWN_MS = 500;

function createPlayer() {
  return {
    x: 200,
    y: FIELD_H / 2,
    vx: 0,
    vy: 0,
    speed: 220,
    health: MAX_HEALTH,
    stamina: MAX_STAMINA,
    sprinting: false,
    r: PLAYER_R,
    team: 'player',
    color: '#f5d020',
    facing: 1,
    hasBall: false,       // true when ball is within dribble range
    shootCooldown: 0,     // ms remaining
    kickPower: 0,         // 0–1 charged by holding SPACE
    isChargingKick: false,
  };
}

function updatePlayer(player, ball, keys, dt) {
  // ── Movement ──
  let ax = 0, ay = 0;
  if (keys['ArrowLeft']  || keys['KeyA']) ax -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) ax += 1;
  if (keys['ArrowUp']    || keys['KeyW']) ay -= 1;
  if (keys['ArrowDown']  || keys['KeyS']) ay += 1;

  // Sprint: ShiftLeft / ShiftRight
  const wantSprint = keys['ShiftLeft'] || keys['ShiftRight'];
  player.sprinting = wantSprint && player.stamina > 5;

  const spd = player.sprinting ? player.speed * 1.65 : player.speed;

  if (player.sprinting && (ax !== 0 || ay !== 0)) {
    player.stamina = Math.max(0, player.stamina - 28 * dt);
  } else {
    player.stamina = Math.min(MAX_STAMINA, player.stamina + 18 * dt);
  }

  const len = Math.hypot(ax, ay);
  if (len > 0) {
    ax /= len; ay /= len;
    if (ax !== 0) player.facing = Math.sign(ax);
  }

  player.vx = ax * spd;
  player.vy = ay * spd;
  player.x = Math.max(player.r, Math.min(FIELD_W - player.r, player.x + player.vx * dt));
  player.y = Math.max(player.r, Math.min(FIELD_H - player.r, player.y + player.vy * dt));

  if (player.shootCooldown > 0) player.shootCooldown -= dt * 1000;

  // ── Dribble: nudge ball gently in movement direction when very close ──
  const dist = Math.hypot(player.x - ball.x, player.y - ball.y);
  const touchRange = player.r + ball.r + 6;
  player.hasBall = dist <= touchRange + 4;

  if (player.hasBall && !player.isChargingKick) {
    // Push ball just ahead of player
    const ang = Math.atan2(ball.y - player.y, ball.x - player.x);
    const targetX = player.x + Math.cos(ang) * (player.r + ball.r + 2);
    const targetY = player.y + Math.sin(ang) * (player.r + ball.r + 2);
    ball.x += (targetX - ball.x) * Math.min(1, dt * 12);
    ball.y += (targetY - ball.y) * Math.min(1, dt * 12);
    ball.vx = player.vx;
    ball.vy = player.vy;
    ball.lastKickedBy = 'player';
  }

  // ── Kick charging (SPACE held) ──
  if (keys['Space'] && player.hasBall && player.shootCooldown <= 0) {
    player.isChargingKick = true;
    player.kickPower = Math.min(1, player.kickPower + dt * 1.6);
  } else if (!keys['Space'] && player.isChargingKick) {
    // Released — fire!
    player.isChargingKick = false;
    return 'KICK'; // signal to main.js to perform kick
  }

  if (!keys['Space']) player.kickPower = 0;

  return null;
}
