// ══════════════════════════════════════════════════════════
//  enemy.js  ·  Bot entity creation and FSM-driven update
//
//  FSM States (6):
//    IDLE     → waiting, timer-based
//    PATROL   → moving to a random target on the AI half
//    CHASE    → pursuing the ball or player
//    ATTACK   → close to ball, kicking toward player goal
//    FLEE     → low health, running away
//    DEAD     → respawning after 3 s
// ══════════════════════════════════════════════════════════

const BOT_STATES = {
  IDLE:   'IDLE',
  PATROL: 'PATROL',
  CHASE:  'CHASE',
  ATTACK: 'ATTACK',
  FLEE:   'FLEE',
  DEAD:   'DEAD',
};

const BOT_R = 13;
const BOT_COUNT = 5;

// ── Distance helpers ──────────────────────────────────────
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function distBall(bot, ball) { return Math.hypot(bot.x - ball.x, bot.y - ball.y); }

// ── FSM factory ───────────────────────────────────────────
function makeBotFSM() {
  const transitions = {
    [BOT_STATES.IDLE]: {
      [BOT_STATES.PATROL]: (ctx) => ctx.fsm.timer > 1.2,
    },
    [BOT_STATES.PATROL]: {
      [BOT_STATES.CHASE]: (ctx, fsm, { player, ball }) =>
        dist(ctx, player) < 220 || distBall(ctx, ball) < 200,
      [BOT_STATES.IDLE]: (ctx) => ctx.fsm.timer > 5,
    },
    [BOT_STATES.CHASE]: {
      [BOT_STATES.ATTACK]: (ctx, fsm, { ball }) => distBall(ctx, ball) < 28,
      [BOT_STATES.FLEE]:   (ctx) => ctx.health < MAX_HEALTH * 0.22,
      [BOT_STATES.PATROL]: (ctx, fsm, { player, ball }) =>
        dist(ctx, player) > 350 && distBall(ctx, ball) > 300,
    },
    [BOT_STATES.ATTACK]: {
      [BOT_STATES.FLEE]:  (ctx) => ctx.health < MAX_HEALTH * 0.22,
      [BOT_STATES.CHASE]: (ctx, fsm, { ball }) => distBall(ctx, ball) > 70,
    },
    [BOT_STATES.FLEE]: {
      [BOT_STATES.PATROL]: (ctx, fsm, { player }) =>
        dist(ctx, player) > 280 && ctx.health > MAX_HEALTH * 0.45,
      [BOT_STATES.DEAD]: (ctx) => ctx.health <= 0,
    },
    [BOT_STATES.DEAD]: {
      [BOT_STATES.IDLE]: (ctx) => ctx.fsm.timer > 3,
    },
  };

  const onEnter = {
    [BOT_STATES.PATROL]: (ctx) => {
      ctx.patrolTarget = {
        x: FIELD_W * 0.45 + Math.random() * FIELD_W * 0.5,
        y: 40 + Math.random() * (FIELD_H - 80),
      };
    },
    [BOT_STATES.DEAD]: (ctx) => {
      ctx.health = 0;
    },
    [BOT_STATES.IDLE]: (ctx) => {
      // Respawn if coming from DEAD
      if (ctx.fsm.prevState === BOT_STATES.DEAD) {
        ctx.health = MAX_HEALTH;
        ctx.x = FIELD_W * 0.65 + Math.random() * 200;
        ctx.y = 60 + Math.random() * (FIELD_H - 120);
      }
    },
  };

  return new FSM(BOT_STATES.IDLE, transitions, onEnter);
}

// ── Bot factory ───────────────────────────────────────────
function createBot(idx) {
  const colors = ['#e63946', '#c1121f', '#ff6b6b', '#ff4d4d', '#d62828'];
  return {
    x: FIELD_W * 0.55 + (idx % 3) * 150 + Math.random() * 30,
    y: 80 + idx * ((FIELD_H - 160) / Math.max(BOT_COUNT - 1, 1)) + Math.random() * 20,
    vx: 0, vy: 0,
    speed: 150 + Math.random() * 40,
    health: MAX_HEALTH,
    r: BOT_R,
    team: 'ai',
    color: colors[idx % colors.length],
    fsm: makeBotFSM(),
    patrolTarget: null,
    kickCooldown: 0,
    facing: -1,
    idx,
  };
}

// ── Bot update ────────────────────────────────────────────
function updateBot(bot, ball, player, dt) {
  // Wrap transition conditions with game context
  const origTrans = bot.fsm.transitions;
  // Patch transitions to pass {ball, player} context
  const ctx = { ...bot, fsm: bot.fsm };

  // Manual FSM update with context
  bot.fsm.timer += dt;
  const trans = bot.fsm.transitions[bot.fsm.state];
  if (trans) {
    for (const [nextState, condition] of Object.entries(trans)) {
      if (condition(bot, bot.fsm, { ball, player })) {
        bot.fsm.enter(nextState, bot);
        break;
      }
    }
  }

  const state = bot.fsm.state;
  if (state === BOT_STATES.DEAD) return;

  let tx = bot.x, ty = bot.y;
  let speed = bot.speed;

  switch (state) {
    case BOT_STATES.IDLE:
      break; // stand still

    case BOT_STATES.PATROL:
      if (bot.patrolTarget) { tx = bot.patrolTarget.x; ty = bot.patrolTarget.y; }
      break;

    case BOT_STATES.CHASE:
      // Chase the ball
      tx = ball.x; ty = ball.y;
      break;

    case BOT_STATES.ATTACK: {
      tx = ball.x; ty = ball.y;
      const db = distBall(bot, ball);
      if (db < bot.r + ball.r + 8 && bot.kickCooldown <= 0) {
        // Kick toward left goal (player's goal)
        const ang = Math.atan2(FIELD_H / 2 - ball.y, -ball.x);
        const power = 300 + Math.random() * 100;
        ball.vx = Math.cos(ang) * power;
        ball.vy = Math.sin(ang) * power + (Math.random() - 0.5) * 80;
        ball.lastKickedBy = 'ai';
        bot.kickCooldown = 0.55;
        sfxKick();
      }
      break;
    }

    case BOT_STATES.FLEE: {
      const ang = Math.atan2(bot.y - player.y, bot.x - player.x);
      tx = bot.x + Math.cos(ang) * 300;
      ty = bot.y + Math.sin(ang) * 300;
      speed *= 1.35;
      break;
    }
  }

  if (bot.kickCooldown > 0) bot.kickCooldown -= dt;

  // Move toward target
  const dx = tx - bot.x, dy = ty - bot.y;
  const d = Math.hypot(dx, dy);
  if (d > 2) {
    bot.x += (dx / d) * speed * dt;
    bot.y += (dy / d) * speed * dt;
    if (dx !== 0) bot.facing = Math.sign(dx);
  }

  // Clamp to field
  bot.x = Math.max(bot.r, Math.min(FIELD_W - bot.r, bot.x));
  bot.y = Math.max(bot.r, Math.min(FIELD_H - bot.r, bot.y));

  // Collide with player — push player, deal damage in ATTACK
  const dp = dist(bot, player);
  if (dp < bot.r + player.r) {
    const ang = Math.atan2(player.y - bot.y, player.x - bot.x);
    const overlap = (bot.r + player.r) - dp;
    player.x += Math.cos(ang) * overlap * 0.5;
    player.y += Math.sin(ang) * overlap * 0.5;
    if (state === BOT_STATES.ATTACK) {
      player.health = Math.max(0, player.health - 6 * dt * 20);
      sfxHit();
    }
  }
}
