// ══════════════════════════════════════════════════════════
//  fsm.js  ·  Reusable Finite State Machine class
//  Used by all bot/NPC entities in the game.
// ══════════════════════════════════════════════════════════

class FSM {
  /**
   * @param {string} initialState
   * @param {Object} transitions  { STATE: { NEXT_STATE: conditionFn(ctx, fsm) } }
   * @param {Object} onEnter      { STATE: fn(ctx, fsm) }   called when entering a state
   * @param {Object} onExit       { STATE: fn(ctx, fsm) }   called when leaving a state
   */
  constructor(initialState, transitions, onEnter = {}, onExit = {}) {
    this.state = initialState;
    this.transitions = transitions;
    this.onEnter = onEnter;
    this.onExit = onExit;
    this.timer = 0;         // time spent in current state (seconds)
    this.prevState = null;
  }

  /** Evaluate all transitions for the current state */
  update(ctx, dt) {
    this.timer += dt;
    const trans = this.transitions[this.state];
    if (!trans) return;
    for (const [nextState, condition] of Object.entries(trans)) {
      if (condition(ctx, this)) {
        this.enter(nextState, ctx);
        return;
      }
    }
  }

  /** Force a state change */
  enter(state, ctx) {
    if (this.onExit[this.state]) this.onExit[this.state](ctx, this);
    this.prevState = this.state;
    this.state = state;
    this.timer = 0;
    if (this.onEnter[state]) this.onEnter[state](ctx, this);
  }

  /** Helper: is the machine in one of the given states? */
  is(...states) {
    return states.includes(this.state);
  }
}
