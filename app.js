// Iris Juliet's Dragon Math Quest
// A snake-style adventure where a Wings of Fire dragon eats eggs, smaller
// dragons, and solves math problems to level up.

(() => {
  'use strict';

  // ===== Tribe palette (Wings of Fire inspired) =====
  const TRIBES = {
    SkyWing:   { main: '#C8102E', accent: '#ffb347', eye: '#ffd54a' },
    SeaWing:   { main: '#1E3A8A', accent: '#5ec3ff', eye: '#7ed957' },
    NightWing: { main: '#2D1B4E', accent: '#b266ff', eye: '#ffd54a' },
    RainWing:  { main: '#2E8B57', accent: '#ff4f8b', eye: '#ffd54a' },
    SandWing:  { main: '#B8851E', accent: '#fff4d1', eye: '#000' },
    IceWing:   { main: '#a8d8ff', accent: '#ffffff', eye: '#5ec3ff' },
    MudWing:   { main: '#8B4513', accent: '#d4a017', eye: '#fff' },
    SilkWing:  { main: '#b266ff', accent: '#ffd54a', eye: '#fff' },
  };
  const TRIBE_NAMES = Object.keys(TRIBES);

  // ===== Constants =====
  const GRID_COLS = 28;
  const GRID_ROWS = 20;
  const TICK_BASE_MS = 130;   // base tick speed
  const TICK_MIN_MS  = 70;    // fastest the dragon will go

  const START_LENGTH = 4;
  const MAX_EGGS = 6;
  const MAX_MINI_DRAGONS = 3;
  const MAX_BIG_DRAGONS = 2;

  const SPAWN_BIG_AT_LENGTH = 8;
  const SPAWN_BIG_INTERVAL_MS = 12000;

  const MATH_FIRST_DELAY_MS = 8000;
  const MATH_INTERVAL_MS = 16000;
  const MATH_ANSWER_TIMEOUT_MS = 22000; // answer eggs disappear after this

  const POWERUP_INTERVAL_MS = 18000;
  const POWERUP_DURATION_MS = 8000;

  // ===== State =====
  const state = {
    difficulty: 'hard',
    running: false,
    paused: false,
    score: 0,
    level: 1,
    best: Number(localStorage.getItem('dmq_best') || 0),
    dragon: null,        // {body: [{c,r}], dir:{dc,dr}, nextDir, tribe, length}
    eggs: [],            // [{c,r,kind:'egg'|'mini'|'big'|'fly'|'power'|'levelup'|'math', value?:number, correct?:bool, tribe?:string}]
    bigDragons: [],      // [{path:[{c,r}], dir:{dc,dr}, tribe, length}]
    particles: [],
    activeMath: null,    // {problem, answer, eggs:[id,id]}
    powerup: null,       // {kind:'fly'|'power', endsAt}
    tickMs: TICK_BASE_MS,
    lastTickAt: 0,
    nextBigSpawnAt: 0,
    nextMathAt: 0,
    nextPowerupAt: 0,
    rafId: null,
    screenShake: 0,
  };

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const startScreen = $('start-screen');
  const gameScreen = $('game-screen');
  const pauseScreen = $('pause-screen');
  const gameoverScreen = $('gameover-screen');
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const previewCanvas = $('preview-canvas');
  const previewCtx = previewCanvas.getContext('2d');

  const hudScore = $('hud-score');
  const hudLength = $('hud-length');
  const hudLevel = $('hud-level');
  const hudBest = $('hud-best');
  const mathBanner = $('math-banner');
  const mathProblem = $('math-problem');
  const powerupBanner = $('powerup-banner');
  const powerupIcon = $('powerup-icon');
  const powerupText = $('powerup-text');
  const powerupTimer = $('powerup-timer');

  // ===== Sizing =====
  let cellSize = 24;
  function sizeCanvas() {
    const wrap = canvas.parentElement;
    const cssWidth = Math.min(wrap.clientWidth, 900);
    cellSize = Math.floor(cssWidth / GRID_COLS);
    const cssHeight = cellSize * GRID_ROWS;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = (cellSize * GRID_COLS) + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width  = Math.floor(cellSize * GRID_COLS * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ===== Difficulty / math =====
  function pickDifficulty(d) {
    state.difficulty = d;
    document.querySelectorAll('.diff-btn').forEach(b => {
      const isSel = b.dataset.diff === d;
      b.classList.toggle('selected', isSel);
      b.setAttribute('aria-checked', String(isSel));
    });
  }

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function makeMathProblem() {
    const d = state.difficulty;
    let a, b, op, answer, problemText;

    if (d === 'easy') {
      op = choice(['+', '-']);
      if (op === '+') {
        a = randInt(0, 9); b = randInt(0, 10 - a);
        answer = a + b;
      } else {
        a = randInt(2, 10); b = randInt(0, a);
        answer = a - b;
      }
    } else if (d === 'medium') {
      op = choice(['+', '-']);
      if (op === '+') {
        a = randInt(2, 18); b = randInt(1, 20 - a);
        answer = a + b;
      } else {
        a = randInt(5, 20); b = randInt(1, a);
        answer = a - b;
      }
    } else {
      // hard: within 100 + times tables
      op = choice(['+', '-', '×', '×']);
      if (op === '+') {
        a = randInt(15, 80); b = randInt(10, 100 - a);
        answer = a + b;
      } else if (op === '-') {
        a = randInt(20, 99); b = randInt(5, a - 1);
        answer = a - b;
      } else {
        a = randInt(2, 10); b = randInt(2, 10);
        answer = a * b;
      }
    }

    problemText = `${a} ${op} ${b} = ?`;

    // wrong answer: nearby but not equal
    let wrong;
    let attempts = 0;
    do {
      const delta = choice([-3, -2, -1, 1, 2, 3, -10, 10]);
      wrong = answer + delta;
      if (wrong < 0) wrong = answer + Math.abs(delta);
      attempts++;
    } while (wrong === answer && attempts < 10);
    if (wrong === answer) wrong = answer + 1;

    return { problemText, answer, wrong };
  }

  // ===== Grid helpers =====
  function cellOccupied(c, r) {
    if (state.dragon) {
      for (const seg of state.dragon.body) if (seg.c === c && seg.r === r) return true;
    }
    for (const e of state.eggs) if (e.c === c && e.r === r) return true;
    for (const bd of state.bigDragons) {
      for (const seg of bd.path) if (seg.c === c && seg.r === r) return true;
    }
    return false;
  }

  function randomEmptyCell() {
    for (let i = 0; i < 200; i++) {
      const c = randInt(1, GRID_COLS - 2);
      const r = randInt(1, GRID_ROWS - 2);
      if (!cellOccupied(c, r)) return { c, r };
    }
    return null;
  }

  // ===== Spawning =====
  function spawnEgg() {
    const cell = randomEmptyCell();
    if (!cell) return;
    state.eggs.push({ ...cell, kind: 'egg' });
  }

  function spawnMiniDragon() {
    const cell = randomEmptyCell();
    if (!cell) return;
    state.eggs.push({ ...cell, kind: 'mini', tribe: choice(TRIBE_NAMES) });
  }

  function spawnBigDragon() {
    const start = randomEmptyCell();
    if (!start) return;
    const path = [];
    const len = 5;
    for (let i = 0; i < len; i++) path.push({ ...start });
    const dirs = [{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1}];
    state.bigDragons.push({
      path,
      dir: choice(dirs),
      tribe: choice(TRIBE_NAMES),
      moveCounter: 0,
    });
  }

  function spawnPowerup() {
    const kind = choice(['fly', 'power', 'levelup']);
    const cell = randomEmptyCell();
    if (!cell) return;
    state.eggs.push({ ...cell, kind });
  }

  function spawnMathAnswers() {
    if (state.activeMath) return;
    const mp = makeMathProblem();
    const correctCell = randomEmptyCell();
    if (!correctCell) return;
    const wrongCell = randomEmptyCell();
    if (!wrongCell) return;

    const correctEgg = { ...correctCell, kind: 'math', value: mp.answer, correct: true, spawnedAt: performance.now() };
    const wrongEgg   = { ...wrongCell,   kind: 'math', value: mp.wrong,  correct: false, spawnedAt: performance.now() };
    state.eggs.push(correctEgg, wrongEgg);

    state.activeMath = { problemText: mp.problemText, answer: mp.answer, eggs: [correctEgg, wrongEgg] };
    mathProblem.textContent = mp.problemText;
    mathBanner.classList.remove('hidden');
  }

  function clearActiveMath() {
    if (!state.activeMath) return;
    state.eggs = state.eggs.filter(e => e.kind !== 'math');
    state.activeMath = null;
    mathBanner.classList.add('hidden');
  }

  // ===== Dragon control =====
  function setDir(dc, dr) {
    if (!state.dragon) return;
    const cur = state.dragon.dir;
    // disallow 180° reversal
    if (cur.dc === -dc && cur.dr === -dr) return;
    state.dragon.nextDir = { dc, dr };
  }

  // ===== Game start =====
  function startGame() {
    sizeCanvas();
    state.running = true;
    state.paused = false;
    state.score = 0;
    state.level = 1;
    state.eggs = [];
    state.bigDragons = [];
    state.particles = [];
    state.activeMath = null;
    state.powerup = null;
    state.tickMs = TICK_BASE_MS;
    state.screenShake = 0;
    mathBanner.classList.add('hidden');
    powerupBanner.classList.add('hidden');

    const startC = Math.floor(GRID_COLS / 3);
    const startR = Math.floor(GRID_ROWS / 2);
    const body = [];
    for (let i = 0; i < START_LENGTH; i++) body.push({ c: startC - i, r: startR });
    state.dragon = {
      body,
      dir: { dc: 1, dr: 0 },
      nextDir: { dc: 1, dr: 0 },
      tribe: 'SkyWing',
      length: START_LENGTH,
      hurt: 0,
    };

    // seed eggs
    for (let i = 0; i < 5; i++) spawnEgg();
    spawnMiniDragon();

    const now = performance.now();
    state.nextBigSpawnAt = now + 6000;
    state.nextMathAt = now + MATH_FIRST_DELAY_MS;
    state.nextPowerupAt = now + POWERUP_INTERVAL_MS;
    state.lastTickAt = now;

    showScreen('game-screen');
    hudBest.textContent = state.best;
    updateHud();

    cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(loop);
  }

  function showScreen(id) {
    [startScreen, gameScreen, pauseScreen, gameoverScreen].forEach(s => {
      s.classList.toggle('active', s.id === id);
    });
  }

  function updateHud() {
    hudScore.textContent = state.score;
    hudLength.textContent = state.dragon ? state.dragon.length : 0;
    hudLevel.textContent = state.level;
    hudBest.textContent = state.best;
  }

  // ===== Main loop =====
  function loop(t) {
    if (!state.running) return;
    if (state.paused) { state.rafId = requestAnimationFrame(loop); return; }

    // Tick dragon
    if (t - state.lastTickAt >= state.tickMs) {
      tickDragon();
      state.lastTickAt = t;
    }

    // Big dragons move slower (every other tick-ish)
    state.bigDragons.forEach(bd => {
      bd.moveCounter = (bd.moveCounter || 0) + (t - (bd._lastT || t));
      bd._lastT = t;
      if (bd.moveCounter >= state.tickMs * 1.6) {
        moveBigDragon(bd);
        bd.moveCounter = 0;
      }
    });

    // Spawns
    if (t >= state.nextBigSpawnAt && state.dragon.length >= SPAWN_BIG_AT_LENGTH && state.bigDragons.length < MAX_BIG_DRAGONS) {
      spawnBigDragon();
      state.nextBigSpawnAt = t + SPAWN_BIG_INTERVAL_MS;
    }
    if (state.eggs.filter(e => e.kind === 'egg').length < 4) spawnEgg();
    if (state.eggs.filter(e => e.kind === 'mini').length < 1 && state.dragon.length >= 6) spawnMiniDragon();

    if (t >= state.nextMathAt) {
      spawnMathAnswers();
      state.nextMathAt = t + MATH_INTERVAL_MS;
    }
    if (t >= state.nextPowerupAt) {
      spawnPowerup();
      state.nextPowerupAt = t + POWERUP_INTERVAL_MS;
    }

    // Expire math after timeout
    if (state.activeMath) {
      const age = t - state.activeMath.eggs[0].spawnedAt;
      if (age > MATH_ANSWER_TIMEOUT_MS) clearActiveMath();
    }

    // Power-up countdown
    if (state.powerup) {
      const remain = state.powerup.endsAt - t;
      if (remain <= 0) {
        state.powerup = null;
        powerupBanner.classList.add('hidden');
      } else {
        powerupTimer.textContent = Math.ceil(remain / 1000);
      }
    }

    // particles
    state.particles = state.particles.filter(p => {
      p.life -= 16;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      return p.life > 0;
    });

    if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - 1);

    render();
    state.rafId = requestAnimationFrame(loop);
  }

  function tickDragon() {
    const d = state.dragon;
    d.dir = d.nextDir;
    const head = d.body[0];
    const newHead = { c: head.c + d.dir.dc, r: head.r + d.dir.dr };

    // wall collision
    if (newHead.c < 0 || newHead.c >= GRID_COLS || newHead.r < 0 || newHead.r >= GRID_ROWS) {
      return gameOver('You flew into the wall!');
    }

    // self collision
    for (let i = 0; i < d.body.length - 1; i++) {
      if (d.body[i].c === newHead.c && d.body[i].r === newHead.r) {
        return gameOver('You bit your own tail!');
      }
    }

    // big dragon collision
    const flying = state.powerup && state.powerup.kind === 'fly';
    const powered = state.powerup && state.powerup.kind === 'power';
    for (const bd of state.bigDragons) {
      const collided = bd.path.some(seg => seg.c === newHead.c && seg.r === newHead.r);
      if (collided) {
        if (powered) {
          // EAT the big dragon!
          devourBigDragon(bd, newHead);
          break;
        } else if (!flying) {
          return gameOver('A bigger dragon got you!');
        }
      }
    }

    // egg/food collision
    let ate = null;
    state.eggs = state.eggs.filter(e => {
      if (e.c === newHead.c && e.r === newHead.r) { ate = e; return false; }
      return true;
    });

    d.body.unshift(newHead);
    let grew = false;

    if (ate) {
      onEat(ate, newHead);
      grew = true;
      // some foods grow more
      if (ate.kind === 'mini') {
        // grow extra 1
        d.length += 1;
      } else if (ate.kind === 'levelup') {
        d.length += 3;
        for (let i = 0; i < 3; i++) d.body.push({ ...d.body[d.body.length - 1] });
      } else if (ate.kind === 'math' && ate.correct) {
        d.length += 2;
        d.body.push({ ...d.body[d.body.length - 1] });
      }
    }

    if (!grew) {
      d.body.pop();
    } else {
      d.length = d.body.length;
    }

    // Speed scales with length
    state.tickMs = Math.max(TICK_MIN_MS, TICK_BASE_MS - (d.length - START_LENGTH) * 1.6);

    updateHud();
  }

  function devourBigDragon(bd, headPos) {
    state.score += 100;
    state.dragon.length += 5;
    for (let i = 0; i < 5; i++) state.dragon.body.push({ ...state.dragon.body[state.dragon.body.length - 1] });
    burst(headPos.c, headPos.r, TRIBES[bd.tribe].main, 40);
    burst(headPos.c, headPos.r, '#fff', 20);
    state.bigDragons = state.bigDragons.filter(x => x !== bd);
  }

  function onEat(e, headPos) {
    const px = headPos.c, py = headPos.r;
    switch (e.kind) {
      case 'egg':
        state.score += 5;
        burst(px, py, '#ffe892', 12);
        break;
      case 'mini': {
        state.score += 15;
        const col = TRIBES[e.tribe] ? TRIBES[e.tribe].main : '#ff6b35';
        burst(px, py, col, 18);
        break;
      }
      case 'math': {
        if (e.correct) {
          state.score += 50;
          state.level += 1;
          burst(px, py, '#ffd54a', 30);
          burst(px, py, '#b266ff', 20);
          flashMathBanner(true);
        } else {
          // wrong! shrink + lose points
          state.score = Math.max(0, state.score - 10);
          shrinkDragon(2);
          shake(20);
          burst(px, py, '#ff3860', 25);
          flashMathBanner(false);
        }
        clearActiveMath();
        break;
      }
      case 'fly':
        activatePowerup('fly');
        burst(px, py, '#5ec3ff', 25);
        break;
      case 'power':
        activatePowerup('power');
        burst(px, py, '#ff6b35', 25);
        break;
      case 'levelup':
        state.score += 25;
        state.level += 1;
        burst(px, py, '#ffd54a', 28);
        burst(px, py, '#ff6b35', 18);
        break;
    }
  }

  function shrinkDragon(by) {
    const d = state.dragon;
    for (let i = 0; i < by && d.body.length > 2; i++) d.body.pop();
    d.length = d.body.length;
  }

  function activatePowerup(kind) {
    state.powerup = { kind, endsAt: performance.now() + POWERUP_DURATION_MS };
    powerupIcon.textContent = kind === 'fly' ? '✨' : '🔥';
    powerupText.textContent = kind === 'fly' ? 'FLY MODE' : 'POWER MODE';
    powerupBanner.classList.remove('hidden');
  }

  function flashMathBanner(correct) {
    mathBanner.style.transition = 'none';
    mathBanner.style.background = correct
      ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.55), rgba(255, 213, 74, 0.55))'
      : 'linear-gradient(135deg, rgba(255, 56, 96, 0.6), rgba(178, 102, 255, 0.4))';
    setTimeout(() => {
      mathBanner.style.transition = '';
      mathBanner.style.background = '';
    }, 250);
  }

  function shake(amount) { state.screenShake = Math.max(state.screenShake, amount); }

  function moveBigDragon(bd) {
    const head = bd.path[0];
    const dragonHead = state.dragon.body[0];

    // 70% chase the player, 30% random — but flip direction if blocked
    let dir = bd.dir;
    if (Math.random() < 0.7) {
      const dx = Math.sign(dragonHead.c - head.c);
      const dy = Math.sign(dragonHead.r - head.r);
      if (Math.abs(dragonHead.c - head.c) > Math.abs(dragonHead.r - head.r)) {
        if (dx !== 0) dir = { dc: dx, dr: 0 };
      } else {
        if (dy !== 0) dir = { dc: 0, dr: dy };
      }
    } else if (Math.random() < 0.3) {
      const dirs = [{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1}];
      dir = choice(dirs);
    }

    let newHead = { c: head.c + dir.dc, r: head.r + dir.dr };
    if (newHead.c < 0 || newHead.c >= GRID_COLS || newHead.r < 0 || newHead.r >= GRID_ROWS) {
      // bounce
      dir = { dc: -dir.dc, dr: -dir.dr };
      newHead = { c: head.c + dir.dc, r: head.r + dir.dr };
    }
    bd.dir = dir;
    bd.path.unshift(newHead);
    bd.path.pop();
  }

  // ===== Particles =====
  function burst(c, r, color, count) {
    const cx = (c + 0.5) * cellSize;
    const cy = (r + 0.5) * cellSize;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      state.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 1,
        color,
        life: 600 + Math.random() * 300,
        size: 2 + Math.random() * 3,
      });
    }
  }

  // ===== Game over =====
  function gameOver(reason) {
    state.running = false;
    cancelAnimationFrame(state.rafId);
    const isBest = state.score > state.best;
    if (isBest) {
      state.best = state.score;
      localStorage.setItem('dmq_best', String(state.best));
    }

    $('gameover-msg').textContent = reason;
    $('final-score').textContent = state.score;
    $('final-length').textContent = state.dragon.length;
    $('final-level').textContent = state.level;
    $('final-best').textContent = state.best;
    $('new-best').classList.toggle('hidden', !isBest);
    gameoverScreen.classList.add('active');
  }

  // ===== Rendering =====
  function render() {
    const W = cellSize * GRID_COLS;
    const H = cellSize * GRID_ROWS;
    ctx.save();
    if (state.screenShake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * state.screenShake * 0.3,
        (Math.random() - 0.5) * state.screenShake * 0.3,
      );
    }
    ctx.clearRect(0, 0, W, H);

    drawGridBg(W, H);

    // eggs / food
    for (const e of state.eggs) drawFood(e);

    // big dragons
    for (const bd of state.bigDragons) drawBigDragon(bd);

    // player dragon
    drawDragon(state.dragon);

    // particles
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 800);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawGridBg(W, H) {
    // soft grid dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let c = 0; c < GRID_COLS; c++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        ctx.beginPath();
        ctx.arc((c + 0.5) * cellSize, (r + 0.5) * cellSize, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawFood(e) {
    const cx = (e.c + 0.5) * cellSize;
    const cy = (e.r + 0.5) * cellSize;
    const t = performance.now() / 1000;
    const bob = Math.sin(t * 3 + e.c + e.r) * 1.5;

    if (e.kind === 'egg') {
      drawEgg(cx, cy + bob, cellSize * 0.42, '#fff4d1', '#ffe892');
    } else if (e.kind === 'mini') {
      drawMiniDragon(cx, cy + bob, cellSize * 0.5, TRIBES[e.tribe], t);
    } else if (e.kind === 'math') {
      drawMathEgg(cx, cy + bob, cellSize * 0.46, e.value, e.correct);
    } else if (e.kind === 'fly') {
      drawPowerup(cx, cy + bob, cellSize * 0.45, '✨', '#5ec3ff');
    } else if (e.kind === 'power') {
      drawPowerup(cx, cy + bob, cellSize * 0.45, '🔥', '#ff6b35');
    } else if (e.kind === 'levelup') {
      drawPowerup(cx, cy + bob, cellSize * 0.45, '⭐', '#ffd54a');
    }
  }

  function drawEgg(cx, cy, r, fill, shine) {
    // glow
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
    grad.addColorStop(0, 'rgba(255, 232, 146, 0.4)');
    grad.addColorStop(1, 'rgba(255, 232, 146, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2); ctx.fill();

    // egg shape
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.82, r, 0, 0, Math.PI * 2);
    ctx.fill();
    // shine
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.35, r * 0.22, r * 0.32, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // outline
    ctx.strokeStyle = 'rgba(60, 30, 0, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.82, r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawMathEgg(cx, cy, r, value, correct) {
    // pulsing golden glow
    const pulse = 1 + Math.sin(performance.now() / 200) * 0.1;
    const glowColor = 'rgba(255, 213, 74, 0.55)';
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.8 * pulse);
    grad.addColorStop(0, glowColor);
    grad.addColorStop(1, 'rgba(255, 213, 74, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.8 * pulse, 0, Math.PI * 2); ctx.fill();

    // egg
    ctx.fillStyle = '#fff4d1';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.88, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.88, r * 1.05, 0, 0, Math.PI * 2);
    ctx.stroke();

    // number
    ctx.fillStyle = '#1a0b2e';
    ctx.font = `bold ${Math.floor(r * 0.95)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), cx, cy + 1);
  }

  function drawPowerup(cx, cy, r, emoji, color) {
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.13;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5 * pulse);
    grad.addColorStop(0, color + 'cc');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.5 * pulse, 0, Math.PI * 2); ctx.fill();

    ctx.font = `${Math.floor(r * 1.6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy + 1);
  }

  function drawMiniDragon(cx, cy, r, palette, t) {
    const flap = Math.sin(t * 8) * 0.3;
    // body
    ctx.fillStyle = palette.main;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.85, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    // belly
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.05, cy + r * 0.2, r * 0.5, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    // wing
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy - r * 0.2);
    ctx.quadraticCurveTo(cx - r * 0.6, cy - r * 0.9 - flap * 4, cx - r * 0.95, cy - r * 0.2);
    ctx.quadraticCurveTo(cx - r * 0.6, cy - r * 0.4, cx - r * 0.2, cy - r * 0.2);
    ctx.fill();
    // head
    ctx.fillStyle = palette.main;
    ctx.beginPath();
    ctx.arc(cx + r * 0.55, cy - r * 0.1, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    // eye
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(cx + r * 0.7, cy - r * 0.2, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx + r * 0.74, cy - r * 0.2, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDragon(d) {
    if (!d) return;
    const flying = state.powerup && state.powerup.kind === 'fly';
    const powered = state.powerup && state.powerup.kind === 'power';
    const t = performance.now() / 1000;

    // body segments — gradient from gold (front) to fire/magic (tail)
    const palette = TRIBES[d.tribe];
    for (let i = d.body.length - 1; i >= 0; i--) {
      const seg = d.body[i];
      const cx = (seg.c + 0.5) * cellSize;
      const cy = (seg.r + 0.5) * cellSize;
      const headness = 1 - i / Math.max(1, d.body.length - 1); // 1 at head, 0 at tail
      const size = cellSize * (0.42 + headness * 0.08);

      if (flying) ctx.globalAlpha = 0.55;

      // outer scale
      const main = palette.main;
      const accent = palette.accent;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
      grad.addColorStop(0, accent);
      grad.addColorStop(0.6, main);
      grad.addColorStop(1, '#1a0b2e');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();

      // ridge spikes (every 3rd segment)
      if (i > 0 && i % 3 === 0) {
        ctx.fillStyle = palette.accent;
        const pdir = directionBetween(d.body[i - 1], seg);
        const perp = { x: -pdir.dr, y: pdir.dc };
        ctx.beginPath();
        ctx.moveTo(cx + perp.x * size * 0.8, cy + perp.y * size * 0.8);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx - perp.x * size * 0.8, cy - perp.y * size * 0.8);
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    // head
    const head = d.body[0];
    const hx = (head.c + 0.5) * cellSize;
    const hy = (head.r + 0.5) * cellSize;
    const dir = d.dir;
    const angle = Math.atan2(dir.dr, dir.dc);
    drawDragonHead(hx, hy, cellSize * 0.55, angle, palette, t, powered);

    // wings sprout from second segment
    if (d.body.length > 2) {
      const w = d.body[1];
      const wx = (w.c + 0.5) * cellSize;
      const wy = (w.r + 0.5) * cellSize;
      drawDragonWings(wx, wy, cellSize * 0.9, angle, palette, t);
    }
  }

  function directionBetween(a, b) {
    return { dc: Math.sign(b.c - a.c), dr: Math.sign(b.r - a.r) };
  }

  function drawDragonHead(cx, cy, r, angle, palette, t, glow) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    if (glow) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
      g.addColorStop(0, 'rgba(255, 107, 53, 0.55)');
      g.addColorStop(1, 'rgba(255, 107, 53, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // head shape (snout pointing along +x)
    const grad = ctx.createLinearGradient(-r, 0, r, 0);
    grad.addColorStop(0, palette.main);
    grad.addColorStop(1, palette.accent);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.1, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // horns
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.7);
    ctx.lineTo(-r * 0.5, -r * 1.3);
    ctx.lineTo(0, -r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, r * 0.7);
    ctx.lineTo(-r * 0.5, r * 1.3);
    ctx.lineTo(0, r * 0.6);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.25, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = palette.eye;
    ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.25, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(r * 0.43, -r * 0.25, r * 0.07, 0, Math.PI * 2); ctx.fill();
    // eye shine
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.3, r * 0.04, 0, Math.PI * 2); ctx.fill();

    // nostril
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath(); ctx.arc(r * 0.85, -r * 0.08, r * 0.06, 0, Math.PI * 2); ctx.fill();

    // mouth — smiling
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, r * 0.18);
    ctx.quadraticCurveTo(r * 0.85, r * 0.42, r * 0.95, r * 0.18);
    ctx.stroke();

    // fire breath when powered
    if (glow) {
      const off = Math.sin(t * 18) * 2;
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath();
      ctx.moveTo(r * 1.0, -r * 0.1 + off);
      ctx.lineTo(r * 1.8, -r * 0.25);
      ctx.lineTo(r * 1.6, 0);
      ctx.lineTo(r * 1.9, r * 0.2);
      ctx.lineTo(r * 1.0, r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.moveTo(r * 1.0, -r * 0.05);
      ctx.lineTo(r * 1.4, -r * 0.1);
      ctx.lineTo(r * 1.5, r * 0.05);
      ctx.lineTo(r * 1.0, r * 0.1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawDragonWings(cx, cy, span, angle, palette, t) {
    const flap = Math.sin(t * 12) * 0.25 + 0.3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.fillStyle = palette.accent;
    // top wing
    ctx.beginPath();
    ctx.moveTo(0, -span * 0.1);
    ctx.quadraticCurveTo(-span * 0.4, -span * (0.5 + flap), -span * 0.85, -span * 0.15);
    ctx.quadraticCurveTo(-span * 0.4, -span * 0.25, 0, -span * 0.1);
    ctx.closePath();
    ctx.fill();
    // bottom wing
    ctx.beginPath();
    ctx.moveTo(0, span * 0.1);
    ctx.quadraticCurveTo(-span * 0.4, span * (0.5 + flap), -span * 0.85, span * 0.15);
    ctx.quadraticCurveTo(-span * 0.4, span * 0.25, 0, span * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawBigDragon(bd) {
    const palette = TRIBES[bd.tribe];
    const t = performance.now() / 1000;
    for (let i = bd.path.length - 1; i >= 0; i--) {
      const seg = bd.path[i];
      const cx = (seg.c + 0.5) * cellSize;
      const cy = (seg.r + 0.5) * cellSize;
      const size = cellSize * (0.55 + (1 - i / bd.path.length) * 0.1);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
      grad.addColorStop(0, palette.accent);
      grad.addColorStop(0.6, palette.main);
      grad.addColorStop(1, '#0d0420');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // angry head
    const head = bd.path[0];
    const hx = (head.c + 0.5) * cellSize;
    const hy = (head.r + 0.5) * cellSize;
    const angle = Math.atan2(bd.dir.dr, bd.dir.dc);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);

    const r = cellSize * 0.7;
    // head
    const g = ctx.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, palette.main);
    g.addColorStop(1, palette.accent);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.1, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // big horns
    ctx.fillStyle = '#1a0b2e';
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.7);
    ctx.lineTo(-r * 0.6, -r * 1.4);
    ctx.lineTo(0.05, -r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, r * 0.7);
    ctx.lineTo(-r * 0.6, r * 1.4);
    ctx.lineTo(0.05, r * 0.5);
    ctx.closePath();
    ctx.fill();

    // angry red eye
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.2, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c2410c';
    ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
    // angry brow
    ctx.strokeStyle = '#1a0b2e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.55);
    ctx.lineTo(r * 0.55, -r * 0.35);
    ctx.stroke();

    // teeth
    ctx.fillStyle = 'white';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(r * (0.55 + k * 0.12), r * 0.15);
      ctx.lineTo(r * (0.58 + k * 0.12), r * 0.4);
      ctx.lineTo(r * (0.6 + k * 0.12), r * 0.15);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // ===== Input =====
  document.addEventListener('keydown', (ev) => {
    if (!state.running) return;
    switch (ev.key) {
      case 'ArrowUp': case 'w': case 'W': setDir(0, -1); ev.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S': setDir(0, 1); ev.preventDefault(); break;
      case 'ArrowLeft': case 'a': case 'A': setDir(-1, 0); ev.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': setDir(1, 0); ev.preventDefault(); break;
      case ' ': case 'p': case 'P': togglePause(); ev.preventDefault(); break;
    }
  });

  // touch/swipe
  let touchStart = null;
  canvas.addEventListener('touchstart', (ev) => {
    const t = ev.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchmove', (ev) => {
    if (!touchStart) return;
    const t = ev.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const threshold = 22;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
    touchStart = { x: t.clientX, y: t.clientY };
    ev.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { touchStart = null; });

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    pauseScreen.classList.toggle('active', state.paused);
  }

  // ===== Difficulty button wiring =====
  document.querySelectorAll('.diff-btn').forEach(b => {
    b.addEventListener('click', () => pickDifficulty(b.dataset.diff));
  });

  $('start-btn').addEventListener('click', startGame);
  $('pause-btn').addEventListener('click', togglePause);
  $('resume-btn').addEventListener('click', togglePause);
  $('quit-btn').addEventListener('click', () => {
    state.running = false;
    cancelAnimationFrame(state.rafId);
    pauseScreen.classList.remove('active');
    showScreen('start-screen');
  });
  $('play-again-btn').addEventListener('click', () => {
    gameoverScreen.classList.remove('active');
    startGame();
  });
  $('home-btn').addEventListener('click', () => {
    gameoverScreen.classList.remove('active');
    showScreen('start-screen');
  });

  window.addEventListener('resize', () => { if (state.running) sizeCanvas(); });

  // ===== Start screen preview animation =====
  function previewLoop() {
    const w = previewCanvas.width;
    const h = previewCanvas.height;
    previewCtx.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    const cx = w / 2 + Math.sin(t) * 12;
    const cy = h / 2 + Math.cos(t * 1.4) * 6;
    const palette = TRIBES.SkyWing;

    // wings
    drawDragonWingsRaw(previewCtx, cx, cy, 70, 0, palette, t);
    // head (using same logic with canvas ctx)
    drawDragonHeadRaw(previewCtx, cx, cy, 28, Math.sin(t) * 0.1, palette, t);

    // sparkles around
    for (let i = 0; i < 5; i++) {
      const ang = t + i * 1.25;
      const rr = 60 + Math.sin(t * 2 + i) * 8;
      const sx = cx + Math.cos(ang) * rr;
      const sy = cy + Math.sin(ang) * rr;
      previewCtx.fillStyle = 'rgba(255, 213, 74, 0.8)';
      previewCtx.beginPath();
      previewCtx.arc(sx, sy, 2 + Math.sin(t * 3 + i) * 1, 0, Math.PI * 2);
      previewCtx.fill();
    }

    requestAnimationFrame(previewLoop);
  }

  function drawDragonHeadRaw(ctxIn, cx, cy, r, angle, palette, t) {
    ctxIn.save();
    ctxIn.translate(cx, cy);
    ctxIn.rotate(angle);
    const grad = ctxIn.createLinearGradient(-r, 0, r, 0);
    grad.addColorStop(0, palette.main);
    grad.addColorStop(1, palette.accent);
    ctxIn.fillStyle = grad;
    ctxIn.beginPath();
    ctxIn.ellipse(0, 0, r * 1.1, r * 0.85, 0, 0, Math.PI * 2);
    ctxIn.fill();
    // horns
    ctxIn.fillStyle = palette.accent;
    ctxIn.beginPath();
    ctxIn.moveTo(-r * 0.2, -r * 0.7); ctxIn.lineTo(-r * 0.5, -r * 1.3); ctxIn.lineTo(0, -r * 0.6); ctxIn.closePath(); ctxIn.fill();
    ctxIn.beginPath();
    ctxIn.moveTo(-r * 0.2, r * 0.7); ctxIn.lineTo(-r * 0.5, r * 1.3); ctxIn.lineTo(0, r * 0.6); ctxIn.closePath(); ctxIn.fill();
    // eye
    ctxIn.fillStyle = 'white'; ctxIn.beginPath(); ctxIn.arc(r * 0.35, -r * 0.25, r * 0.22, 0, Math.PI * 2); ctxIn.fill();
    ctxIn.fillStyle = palette.eye; ctxIn.beginPath(); ctxIn.arc(r * 0.4, -r * 0.25, r * 0.13, 0, Math.PI * 2); ctxIn.fill();
    ctxIn.fillStyle = '#000'; ctxIn.beginPath(); ctxIn.arc(r * 0.43, -r * 0.25, r * 0.07, 0, Math.PI * 2); ctxIn.fill();
    ctxIn.fillStyle = 'white'; ctxIn.beginPath(); ctxIn.arc(r * 0.45, -r * 0.3, r * 0.04, 0, Math.PI * 2); ctxIn.fill();
    // smile
    ctxIn.strokeStyle = 'rgba(0,0,0,0.55)'; ctxIn.lineWidth = 1.6;
    ctxIn.beginPath();
    ctxIn.moveTo(r * 0.55, r * 0.18);
    ctxIn.quadraticCurveTo(r * 0.85, r * 0.42, r * 0.95, r * 0.18);
    ctxIn.stroke();
    ctxIn.restore();
  }

  function drawDragonWingsRaw(ctxIn, cx, cy, span, angle, palette, t) {
    const flap = Math.sin(t * 6) * 0.3 + 0.3;
    ctxIn.save();
    ctxIn.translate(cx, cy);
    ctxIn.rotate(angle);
    ctxIn.fillStyle = palette.accent + 'cc';
    ctxIn.beginPath();
    ctxIn.moveTo(0, -span * 0.05);
    ctxIn.quadraticCurveTo(-span * 0.4, -span * (0.5 + flap), -span * 0.85, -span * 0.05);
    ctxIn.quadraticCurveTo(-span * 0.4, -span * 0.2, 0, -span * 0.05);
    ctxIn.closePath();
    ctxIn.fill();
    ctxIn.beginPath();
    ctxIn.moveTo(0, span * 0.05);
    ctxIn.quadraticCurveTo(-span * 0.4, span * (0.5 + flap), -span * 0.85, span * 0.05);
    ctxIn.quadraticCurveTo(-span * 0.4, span * 0.2, 0, span * 0.05);
    ctxIn.closePath();
    ctxIn.fill();
    ctxIn.restore();
  }

  // init
  hudBest.textContent = state.best;
  pickDifficulty('hard');
  previewLoop();

})();
