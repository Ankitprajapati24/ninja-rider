const ROUND_TIME = 90, COUNTDOWN = 3, FINAL_STRETCH = 10;
const COMBO_WINDOW = 5, COMBO_STEP = 0.5, MAX_MULTIPLIER = 5;
const BEST_KEY = 'ninjaRider.best';
const OVERLAYS = ['menu', 'paused', 'over']; // element ids, named after the state that shows them

// localStorage can be missing or blocked (private windows); the game just forgets the record then.
function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(value) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* not persisted */ }
}

const formatTime = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const multiplierFor = (combo) => Math.min(MAX_MULTIPLIER, 1 + Math.max(0, combo - 1) * COMBO_STEP);
export const formatScore = (value) => value.toLocaleString('en-US');

// Round state, scoring and the menu / countdown / pause / results screens.
// hooks: { onStart(), onEnd(result), banner(text, kind) }
export function createGame(audio, hooks) {
  const $ = (id) => document.getElementById(id);
  const game = {
    state: 'menu', score: 0, time: ROUND_TIME, played: 0, countdown: 0, combo: 0, comboTime: 0, best: loadBest(),
    stats: { targets: 0, gold: 0, hurdles: 0, orbs: 0, bestCombo: 0 },
  };
  const shown = { score: -1, time: '', mult: -1, fill: -1 };

  const multiplier = () => Math.min(MAX_MULTIPLIER, 1 + game.combo * COMBO_STEP);

  function setState(state) {
    game.state = state;
    document.body.dataset.state = state;
    for (const name of OVERLAYS) $(name).hidden = name !== state;
  }

  function render() {
    const time = formatTime(game.time), mult = multiplier();
    const fill = Math.round(Math.max(0, game.comboTime / COMBO_WINDOW) * 100);
    if (game.score !== shown.score) { shown.score = game.score; $('score').textContent = formatScore(game.score); }
    if (time !== shown.time) {
      shown.time = time;
      $('time').textContent = time;
      $('time').classList.toggle('low', game.time <= FINAL_STRETCH);
    }
    if (mult !== shown.mult) { shown.mult = mult; $('combo').textContent = `×${mult}`; }
    if (fill !== shown.fill) { shown.fill = fill; $('comboFill').style.width = `${fill}%`; }
  }

  function start() {
    audio.unlock();
    Object.assign(game, { score: 0, time: ROUND_TIME, played: 0, combo: 0, comboTime: 0, countdown: COUNTDOWN });
    game.stats = { targets: 0, gold: 0, hurdles: 0, orbs: 0, bestCombo: 0 };
    hooks.onStart();
    setState('countdown');
    render();
    hooks.banner(String(COUNTDOWN), 'count');
    audio.countdown(false);
    audio.setIntensity(1);
  }

  function finish() {
    const record = game.score > game.best;
    if (record) {
      game.best = game.score;
      saveBest(game.best);
    }
    $('finalScore').textContent = formatScore(game.score);
    $('finalBest').textContent = formatScore(game.best);
    $('menuBest').textContent = formatScore(game.best);
    $('newBest').hidden = !record;
    $('statTargets').textContent = game.stats.targets;
    $('statGold').textContent = game.stats.gold;
    $('statHurdles').textContent = game.stats.hurdles;
    $('statOrbs').textContent = game.stats.orbs;
    $('statCombo').textContent = `×${multiplierFor(game.stats.bestCombo)}`;
    setState('over');
    audio.setIntensity(0);
    audio.over();
    if (record && game.score > 0) audio.record();
    hooks.onEnd({
      score: game.score,
      duration: Math.round(game.played),
      targets: game.stats.targets,
      gold: game.stats.gold,
      hurdles: game.stats.hurdles,
      orbs: game.stats.orbs,
      bestCombo: multiplierFor(game.stats.bestCombo),
    });
  }

  function toMenu() {
    setState('menu');
    audio.setIntensity(0);
  }

  function pause() { if (game.state === 'playing') setState('paused'); }
  function resume() { if (game.state === 'paused') setState('playing'); }

  // Adds `base` points scaled by the current combo and extends the combo.
  function award(base) {
    const mult = multiplier();
    const points = Math.round((base * mult) / 10) * 10;
    game.score += points;
    game.combo++;
    game.comboTime = COMBO_WINDOW;
    game.stats.bestCombo = Math.max(game.stats.bestCombo, game.combo);
    const next = multiplier();
    if (next > mult && Number.isInteger(next)) {
      hooks.banner(`Combo ×${next}`, 'combo');
      audio.combo(next);
    }
    return { points, mult };
  }

  function breakCombo() {
    game.combo = 0;
    game.comboTime = 0;
  }

  function updateCountdown(dt) {
    const before = Math.ceil(game.countdown);
    game.countdown -= dt;
    const after = Math.ceil(game.countdown);
    if (after === before) return;
    if (after > 0) {
      hooks.banner(String(after), 'count');
      audio.countdown(false);
    } else {
      hooks.banner('Ride!', 'count');
      audio.countdown(true);
      setState('playing');
    }
  }

  function update(dt) {
    if (game.state === 'countdown') return updateCountdown(dt);
    if (game.state !== 'playing') return;
    const before = game.time;
    game.time -= dt;
    game.played += dt;
    if (game.comboTime > 0) {
      game.comboTime -= dt;
      if (game.comboTime <= 0) breakCombo();
    }
    audio.setIntensity(game.time <= FINAL_STRETCH ? 2 : 1);
    if (game.time <= FINAL_STRETCH && game.time > 0 && Math.ceil(game.time) !== Math.ceil(before)) audio.tick();
    if (before > FINAL_STRETCH && game.time <= FINAL_STRETCH) hooks.banner('10 seconds!', 'warn');
    if (game.time <= 0) {
      game.time = 0;
      render();
      finish();
      return;
    }
    render();
  }

  $('resumeBtn').addEventListener('click', resume);
  $('pauseBtn').addEventListener('click', pause);
  $('menuBest').textContent = formatScore(game.best);
  setState('menu');
  render();

  return {
    get state() { return game.state; },
    stats: () => game.stats,
    addTime(seconds) { game.time += seconds; },
    start, toMenu, pause, resume, award, breakCombo, update,
  };
}
