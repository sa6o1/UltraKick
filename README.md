# ⚽ ULTRAKICK — Browser Soccer with FSM AI

A browser-based soccer game built with HTML5 Canvas, CSS, and vanilla JavaScript.
Features intelligent bot opponents driven by a **Finite State Machine** AI.

## 🎮 How to Play

| Control | Action |
|---|---|
| `WASD` | Move player |
| `SHIFT` | Sprint (drains stamina) |
| `SPACE` (hold + release) | Charge & kick ball toward mouse cursor |
| `Right-click` | Tackle nearby bots |
| `Scroll wheel` | Zoom in/out |
| `ESC` | Pause / Resume |
| `M` | Mute / Unmute |

**Score more goals than the AI before time runs out!**

## 📁 Repository Structure

```
/
├── index.html          # Entry point
├── README.md
├── fsm-diagram.png     # FSM state diagram
├── css/
│   └── style.css       # All styles
├── js/
│   ├── fsm.js          # Reusable FSM class
│   ├── player.js       # Player entity & controls
│   ├── enemy.js        # Bot entity & FSM-driven AI
│   └── main.js         # Game loop, rendering, events
└── assets/
    ├── images/
    └── sounds/
```

## 🤖 Bot AI — Finite State Machine

Each of the 5 bots runs an independent FSM with **6 states**:

| State | Behaviour |
|---|---|
| `IDLE` | Standing still, timer-based |
| `PATROL` | Moving to random target on AI half |
| `CHASE` | Pursuing ball or player |
| `ATTACK` | Close to ball — kicks toward player's goal |
| `FLEE` | Health < 22% — runs away from player |
| `DEAD` | Respawns after 3 seconds |

### FSM Transition Table

| Current State | Condition | Next State | Action |
|---|---|---|---|
| IDLE | timer > 1.2s | PATROL | Pick random patrol target |
| PATROL | player < 220px OR ball < 200px | CHASE | Start chasing |
| PATROL | timer > 5s | IDLE | Reset |
| CHASE | ball < 28px | ATTACK | Start kicking |
| CHASE | health < 22% | FLEE | Run away |
| CHASE | player > 350px AND ball > 300px | PATROL | Resume patrol |
| ATTACK | ball > 70px | CHASE | Re-chase ball |
| ATTACK | health < 22% | FLEE | Run away |
| FLEE | player > 280px AND health > 45% | PATROL | Calm down |
| FLEE | health <= 0 | DEAD | Play death |
| DEAD | timer > 3s | IDLE | Respawn |

## 📡 Events Implemented (14 types)

1. `keydown` — movement, kick charge, ESC pause, M mute
2. `keyup` — release keys
3. `mousemove` — aim cursor tracking
4. `mousedown` — right-click tackle
5. `mouseup` — (registered, reserved)
6. `contextmenu` — prevent default on right-click
7. `wheel` — zoom in/out
8. `load` — initialise game on page load
9. `resize` — responsive canvas resize
10. `focus` — auto-resume when tab regains focus
11. `blur` — auto-pause when tab loses focus
12. `visibilitychange` — pause on tab switch
13. `click` — all UI buttons
14. `requestAnimationFrame` — game loop + `setInterval` — bot health regen

Custom events: `gameStart`, `gameOver`, `goalScored`

## 🛠 Technologies

- HTML5 Canvas API
- Vanilla JavaScript (ES6+ classes, arrow functions)
- Web Audio API (procedural sound — no audio files needed)
- CSS3 animations & custom properties

## 🚀 Play Online

Deploy to GitHub Pages: Settings → Pages → Deploy from main branch.
