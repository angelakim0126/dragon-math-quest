// Iris Juliet's Dragon Math Quest
// A Wings of Fire-themed .io-style growing dragon game with math challenges.
// Single player dragon grows as it eats eggs and smaller dragons. Avoid bigger
// dragons (unless you have Power mode). Math problems appear and the right
// answer makes you level up.

(() => {
  'use strict';

  // ===== Internal play-field coordinates (logical pixels) =====
  const PLAY_W = 1200;
  const PLAY_H = 720;

  // ===== Sizes =====
  const PLAYER_START_SIZE = 28;
  const PLAYER_MAX_SIZE = 220;
  const EGG_SIZE = 18;
  const MATH_EGG_SIZE = 26;
  const POWERUP_SIZE = 26;
  const EAT_BUFFER = 6; // need to be > target.size + EAT_BUFFER bigger to eat them

  // ===== Speeds (px / sec) =====
  const PLAYER_BASE_SPEED = 220;
  const PLAYER_MIN_SPEED = 130;
  const ENEMY_BASE_SPEED = 80;

  // ===== Spawn counts =====
  const MAX_EGGS = 10;
  const MAX_OTHER_DRAGONS = 6;

  // ===== Timings (ms) =====
  const MATH_FIRST_DELAY_MS = 7000;
  const MATH_INTERVAL_MS = 14000;
  const MATH_ANSWER_TIMEOUT_MS = 22000;
  const MATH_ANSWER_TIMEOUT_GENIUS_MS = 12000; // countdown round pace
  const POWERUP_INTERVAL_MS = 16000;
  const POWERUP_DURATION_MS = 8000;
  const GRACE_PERIOD_MS = 8000; // no big dragons / bombs until this elapses
  const BOMB_SIZE = 30;
  const BOMB_INTERVAL_MS = 11000;
  const MAX_BOMBS = 2;
  const GIANT_CHANCE = 0.12; // post-grace chance an enemy is a giant
  const GIANT_SIZE_MIN = 120;
  const GIANT_SIZE_MAX = 175;

  // ===== Leaderboard =====
  const LB_KEY = 'dmq_leaderboard_v1';
  const LB_NAME_KEY = 'dmq_player_name';
  const LB_SIZE = 10;
  const UNLOCK_KEY = 'dmq_unlocked_level_v1';

  // ===== Levels (each has its own map + difficulty tuning) =====
  // unlockScore: score needed on the previous level to unlock this one
  // params per level adjust the gameplay difficulty
  const LEVELS = [
    {
      id: 0, name: 'Sky Kingdom', map: 'sky',
      emoji: '✨', unlockScore: 0,
      bombsMax: 1, bigChance: 0.45, giantChance: 0.08, speedMult: 1.0,
      description: 'A starlit night sky',
    },
    {
      id: 1, name: 'Rainforest', map: 'forest',
      emoji: '🌳', unlockScore: 50,
      bombsMax: 1, bigChance: 0.50, giantChance: 0.10, speedMult: 1.05,
      description: 'Mossy trees and falling leaves',
    },
    {
      id: 2, name: 'Sunny Park', map: 'park',
      emoji: '🌼', unlockScore: 120,
      bombsMax: 2, bigChance: 0.55, giantChance: 0.12, speedMult: 1.1,
      description: 'Grass, daisies, and butterflies',
    },
    {
      id: 3, name: 'Deep Space', map: 'space',
      emoji: '🪐', unlockScore: 250,
      bombsMax: 2, bigChance: 0.60, giantChance: 0.14, speedMult: 1.15,
      description: 'Stars, nebulae, and floating planets',
    },
    {
      id: 4, name: 'Sky Fire', map: 'volcano',
      emoji: '🔥', unlockScore: 450,
      bombsMax: 3, bigChance: 0.65, giantChance: 0.16, speedMult: 1.22,
      description: 'Glowing embers and lava streams',
    },
    {
      id: 5, name: 'Ice Kingdom', map: 'arctic',
      emoji: '❄️', unlockScore: 700,
      bombsMax: 3, bigChance: 0.70, giantChance: 0.18, speedMult: 1.3,
      description: 'Snowfall and crystal frost',
    },
  ];

  // ===== State =====
  const state = {
    difficulty: 'hard',
    chosenCharIndex: 0, // index into the PLAYER_CHARS roster
    levelId: 0,         // which LEVELS entry is being played
    unlockedLevel: 0,   // highest unlocked level id (loaded from localStorage at init)
    running: false,
    paused: false,
    score: 0,
    level: 1,
    player: null,         // {x,y,vx,vy,targetVx,targetVy,size,character}
    others: [],           // dragons + eggs + math eggs + power-ups
    particles: [],
    activeMath: null,     // {problemText, answer, ids:[]}
    powerup: null,        // {kind:'fly'|'power', endsAt}
    lastFrame: 0,
    nextMathAt: 0,
    nextPowerupAt: 0,
    rafId: null,
    screenShake: 0,
    keys: new Set(),
    touch: null,          // {x,y} target in world coords
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
  const hudSize = $('hud-length');
  const hudLevel = $('hud-level');
  const hudBest = $('hud-best');
  const mathBanner = $('math-banner');
  const mathProblem = $('math-problem');
  const powerupBanner = $('powerup-banner');
  const powerupIcon = $('powerup-icon');
  const powerupText = $('powerup-text');
  const powerupTimer = $('powerup-timer');

  // ===== Characters =====
  // Loaded from characters.json (curated copy from the coloring guide).
  let CHARACTERS = [];
  let CHARACTERS_WITH_IMG = [];
  const PLAYER_CHARS_NAMES = ['Clay', 'Tsunami', 'Glory', 'Starflight', 'Sunny', 'Peril', 'Moonwatcher', 'Qibli'];
  let PLAYER_CHARS = [];
  const imgCache = new Map();

  // Tribe fallback palette for any character that has no image
  const TRIBES = {
    SkyWing:   { main: '#C8102E', accent: '#ffb347', eye: '#ffd54a' },
    SeaWing:   { main: '#1E3A8A', accent: '#5ec3ff', eye: '#7ed957' },
    NightWing: { main: '#2D1B4E', accent: '#b266ff', eye: '#ffd54a' },
    RainWing:  { main: '#2E8B57', accent: '#ff4f8b', eye: '#ffd54a' },
    SandWing:  { main: '#B8851E', accent: '#fff4d1', eye: '#000' },
    IceWing:   { main: '#a8d8ff', accent: '#ffffff', eye: '#5ec3ff' },
    MudWing:   { main: '#8B4513', accent: '#d4a017', eye: '#fff' },
    SilkWing:  { main: '#b266ff', accent: '#ffd54a', eye: '#fff' },
    HiveWing:  { main: '#C26200', accent: '#ffd54a', eye: '#000' },
    LeafWing:  { main: '#228B22', accent: '#90ee90', eye: '#ffd54a' },
  };

  function loadImage(url) {
    if (!url) return null;
    if (imgCache.has(url)) return imgCache.get(url);
    const img = new Image();
    img.src = url;
    imgCache.set(url, img);
    return img;
  }

  async function loadCharacters() {
    try {
      const res = await fetch('characters.json');
      CHARACTERS = await res.json();
    } catch (e) {
      console.warn('Could not load characters.json — using fallback');
      CHARACTERS = [];
    }
    CHARACTERS_WITH_IMG = CHARACTERS.filter(c => c.image);
    PLAYER_CHARS = PLAYER_CHARS_NAMES
      .map(n => CHARACTERS.find(c => c.name === n))
      .filter(Boolean);
    if (PLAYER_CHARS.length === 0 && CHARACTERS_WITH_IMG.length > 0) {
      PLAYER_CHARS = CHARACTERS_WITH_IMG.slice(0, 8);
    }
    // Preload player & a sample of enemies so first paint is smooth
    for (const c of PLAYER_CHARS) loadImage(c.image);
    for (const c of CHARACTERS_WITH_IMG.slice(0, 30)) loadImage(c.image);
    renderPlayerPicker();
  }

  // ===== Math problem generator =====
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // GCF / LCM helpers
  function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
  function lcm(a, b) { return (a * b) / gcd(a, b); }

  function makeMathProblem() {
    const d = state.difficulty;
    let problemText, answer;

    if (d === 'easy') {
      const op = choice(['+', '-']);
      if (op === '+') { const a = randInt(0, 9), b = randInt(0, 10 - a); answer = a + b; problemText = `${a} + ${b} = ?`; }
      else { const a = randInt(2, 10), b = randInt(0, a); answer = a - b; problemText = `${a} − ${b} = ?`; }
    } else if (d === 'medium') {
      const op = choice(['+', '-']);
      if (op === '+') { const a = randInt(2, 18), b = randInt(1, 20 - a); answer = a + b; problemText = `${a} + ${b} = ?`; }
      else { const a = randInt(5, 20), b = randInt(1, a); answer = a - b; problemText = `${a} − ${b} = ?`; }
    } else if (d === 'hard') {
      const op = choice(['+', '-', '×', '×']);
      if (op === '+') { const a = randInt(15, 80), b = randInt(10, 100 - a); answer = a + b; problemText = `${a} + ${b} = ?`; }
      else if (op === '-') { const a = randInt(20, 99), b = randInt(5, a - 1); answer = a - b; problemText = `${a} − ${b} = ?`; }
      else { const a = randInt(2, 10), b = randInt(2, 10); answer = a * b; problemText = `${a} × ${b} = ?`; }
    } else {
      // genius — Mathcounts countdown / AMC 8-10 style
      const kind = choice([
        'square', 'cube', 'sqrt', 'power2', 'power3',
        'mult', 'div', 'mult', 'percent', 'percent',
        'gcf', 'lcm', 'algebra', 'algebra',
        'factorial', 'choose2', 'sumarith', 'modulo',
        'mixed', 'mixed', 'fraction',
      ]);
      switch (kind) {
        case 'square': {
          const n = randInt(11, 25);
          answer = n * n; problemText = `${n}² = ?`; break;
        }
        case 'cube': {
          const n = randInt(3, 12);
          answer = n * n * n; problemText = `${n}³ = ?`; break;
        }
        case 'sqrt': {
          const n = randInt(5, 20);
          answer = n; problemText = `√${n * n} = ?`; break;
        }
        case 'power2': {
          const e = randInt(4, 10);
          answer = Math.pow(2, e); problemText = `2^${e} = ?`; break;
        }
        case 'power3': {
          const e = randInt(3, 6);
          answer = Math.pow(3, e); problemText = `3^${e} = ?`; break;
        }
        case 'mult': {
          const a = randInt(11, 19), b = randInt(6, 19);
          answer = a * b; problemText = `${a} × ${b} = ?`; break;
        }
        case 'div': {
          const b = randInt(4, 15), q = randInt(6, 25);
          answer = q; problemText = `${b * q} ÷ ${b} = ?`; break;
        }
        case 'percent': {
          const pcts = [10, 15, 20, 25, 30, 40, 50, 60, 75];
          const p = choice(pcts);
          // pick base so answer is whole
          let base;
          do { base = randInt(2, 20) * 10; } while ((p * base) % 100 !== 0);
          answer = (p * base) / 100;
          problemText = `${p}% of ${base} = ?`; break;
        }
        case 'gcf': {
          const x = randInt(2, 12), y = randInt(2, 12);
          const g = randInt(2, 9);
          answer = g * gcd(x, y);
          problemText = `GCF(${g * x}, ${g * y}) = ?`; break;
        }
        case 'lcm': {
          const a = randInt(3, 10), b = randInt(3, 12);
          answer = lcm(a, b);
          problemText = `LCM(${a}, ${b}) = ?`; break;
        }
        case 'algebra': {
          // ax + b = c, solve for x
          const a = randInt(2, 9), x = randInt(2, 12), b = randInt(1, 20);
          const c = a * x + b;
          answer = x;
          problemText = `${a}x + ${b} = ${c}, x = ?`; break;
        }
        case 'factorial': {
          const n = randInt(4, 7);
          let f = 1;
          for (let i = 2; i <= n; i++) f *= i;
          answer = f; problemText = `${n}! = ?`; break;
        }
        case 'choose2': {
          const n = randInt(4, 12);
          answer = n * (n - 1) / 2;
          problemText = `C(${n}, 2) = ?`; break;
        }
        case 'sumarith': {
          // sum of first n positive integers
          const n = randInt(8, 25);
          answer = n * (n + 1) / 2;
          problemText = `1+2+…+${n} = ?`; break;
        }
        case 'modulo': {
          const m = randInt(3, 9);
          const q = randInt(3, 12);
          const r = randInt(0, m - 1);
          answer = r;
          problemText = `${m * q + r} mod ${m} = ?`; break;
        }
        case 'fraction': {
          // a/b + c/d with common-friendly denominators
          const denomPair = choice([[2,4],[3,6],[2,6],[3,4],[4,8],[2,3],[3,9],[5,10]]);
          const [d1, d2] = denomPair;
          const num1 = randInt(1, d1 - 1), num2 = randInt(1, d2 - 1);
          const L = lcm(d1, d2);
          const sumNum = num1 * (L / d1) + num2 * (L / d2);
          // produce "a/b + c/d × L = ?" — answer is numerator over L when over common denom
          // simpler: ask sum × L
          answer = sumNum;
          problemText = `(${num1}/${d1} + ${num2}/${d2}) × ${L} = ?`; break;
        }
        case 'mixed': {
          // order of ops: a × b + c, or a + b × c
          const a = randInt(2, 12), b = randInt(2, 12), c = randInt(2, 20);
          if (Math.random() < 0.5) { answer = a * b + c; problemText = `${a} × ${b} + ${c} = ?`; }
          else { answer = c + a * b; problemText = `${c} + ${a} × ${b} = ?`; }
          break;
        }
      }
    }

    let wrong;
    let attempts = 0;
    do {
      // pick a wrong answer that's "near" the right one but believable
      const range = Math.max(2, Math.floor(Math.abs(answer) * 0.15));
      const delta = randInt(-range - 2, range + 2) || 1;
      wrong = answer + delta;
      if (wrong < 0) wrong = answer + Math.abs(delta) + 1;
      attempts++;
    } while (wrong === answer && attempts < 12);
    if (wrong === answer) wrong = answer + 1;

    return { problemText, answer, wrong };
  }

  // ===== Canvas sizing =====
  function sizeCanvas() {
    const wrap = canvas.parentElement;
    const cssW = Math.min(wrap.clientWidth, 1100);
    const cssH = cssW * (PLAY_H / PLAY_W);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    // Render in PLAY_W × PLAY_H coordinate space; scale by ratio
    const sx = (cssW * dpr) / PLAY_W;
    const sy = (cssH * dpr) / PLAY_H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
  }

  // ===== Spawn helpers =====
  function randomEmptyPosition(size) {
    for (let i = 0; i < 60; i++) {
      const x = randInt(size, PLAY_W - size);
      const y = randInt(size, PLAY_H - size);
      // avoid spawning right on top of the player
      if (state.player) {
        const d = dist({ x, y }, state.player);
        if (d < state.player.size + size + 100) continue;
      }
      return { x, y };
    }
    return { x: randInt(50, PLAY_W - 50), y: randInt(50, PLAY_H - 50) };
  }

  function spawnEgg() {
    const p = randomEmptyPosition(EGG_SIZE);
    state.others.push({
      type: 'egg',
      x: p.x, y: p.y, vx: 0, vy: 0,
      size: EGG_SIZE,
      seed: Math.random() * 100,
    });
  }

  function getLevel() { return LEVELS[state.levelId] || LEVELS[0]; }

  function spawnDragon(forceSize = null) {
    if (CHARACTERS.length === 0) return;
    const character = choice(CHARACTERS_WITH_IMG.length > 0 ? CHARACTERS_WITH_IMG : CHARACTERS);
    const playerSize = state.player ? state.player.size : PLAYER_START_SIZE;
    const inGrace = state.graceUntil && performance.now() < state.graceUntil;
    let size;
    const lvl = LEVELS[state.levelId] || LEVELS[0];
    if (forceSize) size = forceSize;
    else if (inGrace) {
      // During the grace window: NEVER spawn a dragon bigger than the player
      size = playerSize - randInt(6, 18) - Math.random() * 6;
    } else if (Math.random() < lvl.giantChance) {
      // Rare: spawn a GIANT dragon — much bigger than the player, very scary
      size = GIANT_SIZE_MIN + Math.random() * (GIANT_SIZE_MAX - GIANT_SIZE_MIN);
    } else if (Math.random() >= lvl.bigChance) {
      // smaller-than-player path
      size = playerSize - randInt(8, 22) - Math.random() * 6;
    } else {
      size = playerSize + randInt(12, 34) + Math.random() * 10;
    }
    size = Math.max(14, Math.min(GIANT_SIZE_MAX, size));
    const p = randomEmptyPosition(size);
    const ang = Math.random() * Math.PI * 2;
    const speed = ENEMY_BASE_SPEED * (0.7 + Math.random() * 0.7) * lvl.speedMult;
    state.others.push({
      type: 'dragon',
      x: p.x, y: p.y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      size,
      character,
      turnCooldown: 0,
      facingFlipped: false,
    });
  }

  function spawnBomb() {
    const p = randomEmptyPosition(BOMB_SIZE);
    if (!p) return;
    const ang = Math.random() * Math.PI * 2;
    state.others.push({
      type: 'bomb',
      x: p.x, y: p.y,
      vx: Math.cos(ang) * 35,
      vy: Math.sin(ang) * 35,
      size: BOMB_SIZE,
      bombTurnCooldown: 1500 + Math.random() * 1500,
      seed: Math.random() * 100,
    });
  }

  function spawnPowerup() {
    const kinds = ['fly', 'power', 'levelup'];
    const kind = choice(kinds);
    const p = randomEmptyPosition(POWERUP_SIZE);
    state.others.push({
      type: 'powerup',
      kind,
      x: p.x, y: p.y, vx: 0, vy: 0,
      size: POWERUP_SIZE,
      seed: Math.random() * 100,
    });
  }

  function spawnMath() {
    if (state.activeMath) return;
    const mp = makeMathProblem();
    const p1 = randomEmptyPosition(MATH_EGG_SIZE);
    const p2 = randomEmptyPosition(MATH_EGG_SIZE);
    const correct = {
      type: 'math', value: mp.answer, correct: true,
      x: p1.x, y: p1.y, vx: 0, vy: 0,
      size: MATH_EGG_SIZE, seed: Math.random() * 100,
      spawnedAt: performance.now(),
    };
    const wrong = {
      type: 'math', value: mp.wrong, correct: false,
      x: p2.x, y: p2.y, vx: 0, vy: 0,
      size: MATH_EGG_SIZE, seed: Math.random() * 100,
      spawnedAt: performance.now(),
    };
    state.others.push(correct, wrong);
    state.activeMath = { problemText: mp.problemText, answer: mp.answer, eggs: [correct, wrong], lastTimerShown: null };
    mathProblem.textContent = mp.problemText;
    const timeoutMs = state.difficulty === 'genius' ? MATH_ANSWER_TIMEOUT_GENIUS_MS : MATH_ANSWER_TIMEOUT_MS;
    $('math-timer').textContent = Math.ceil(timeoutMs / 1000) + 's';
    $('math-timer').classList.toggle('countdown', state.difficulty === 'genius');
    mathBanner.classList.remove('hidden');
  }

  function clearActiveMath() {
    if (!state.activeMath) return;
    state.others = state.others.filter(o => o.type !== 'math');
    state.activeMath = null;
    mathBanner.classList.add('hidden');
  }

  // ===== Geometry =====
  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function wrap(e) {
    if (e.x < -e.size) e.x = PLAY_W + e.size;
    if (e.x > PLAY_W + e.size) e.x = -e.size;
    if (e.y < -e.size) e.y = PLAY_H + e.size;
    if (e.y > PLAY_H + e.size) e.y = -e.size;
  }

  // ===== Game start =====
  function startGame() {
    state.running = true;
    state.paused = false;
    state.score = 0;
    state.level = 1;
    state.others = [];
    state.particles = [];
    state.activeMath = null;
    state.powerup = null;
    state.screenShake = 0;
    mathBanner.classList.add('hidden');
    powerupBanner.classList.add('hidden');

    const char = PLAYER_CHARS[state.chosenCharIndex] || PLAYER_CHARS[0] || CHARACTERS_WITH_IMG[0];
    state.player = {
      x: PLAY_W / 2,
      y: PLAY_H / 2,
      vx: 0, vy: 0,
      targetVx: 0, targetVy: 0,
      size: PLAYER_START_SIZE,
      character: char,
      facingFlipped: false,
      hurtFlash: 0,
    };

    for (let i = 0; i < 12; i++) spawnEgg();
    // Grace start: spawn ONLY smaller dragons. Big dragons start spawning after the grace window.
    for (let i = 0; i < 5; i++) {
      const size = PLAYER_START_SIZE - 8 - Math.random() * 8;
      spawnDragon(Math.max(14, size));
    }

    const now = performance.now();
    state.startTime = now;
    state.graceUntil = now + GRACE_PERIOD_MS;
    state.nextMathAt = now + MATH_FIRST_DELAY_MS;
    state.nextPowerupAt = now + POWERUP_INTERVAL_MS;
    state.lastFrame = now;

    showScreen('game-screen');
    // Size canvas AFTER game-screen becomes visible so clientWidth is correct
    sizeCanvas();
    hudBest.textContent = getTopScore();
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
    hudSize.textContent = state.player ? Math.round(state.player.size) : 0;
    hudLevel.textContent = state.level;
  }

  // ===== Main loop =====
  function loop(t) {
    if (!state.running) return;
    if (state.paused) { state.rafId = requestAnimationFrame(loop); return; }

    const dt = Math.min(0.05, (t - state.lastFrame) / 1000);
    state.lastFrame = t;

    // Player control
    updatePlayerDirection();
    const speed = Math.max(PLAYER_MIN_SPEED, PLAYER_BASE_SPEED - (state.player.size - PLAYER_START_SIZE) * 0.4);
    // smooth velocity toward target
    const targetVx = state.player.targetVx * speed;
    const targetVy = state.player.targetVy * speed;
    state.player.vx += (targetVx - state.player.vx) * 0.18;
    state.player.vy += (targetVy - state.player.vy) * 0.18;
    state.player.x += state.player.vx * dt;
    state.player.y += state.player.vy * dt;
    wrap(state.player);
    // WoF canon art faces left by default — flip when moving right so the dragon
    // looks toward its movement direction
    if (state.player.vx !== 0) state.player.facingFlipped = state.player.vx > 0;

    // Player motion trail (fire)
    emitDragonTrail(state.player, /*isPlayer*/ true);

    // Enemy AI + same flame-trail style, tribe-colored
    for (const o of state.others) {
      if (o.type === 'dragon') {
        updateDragonAI(o, dt);
        emitDragonTrail(o, /*isPlayer*/ false);
      } else if (o.type === 'bomb') {
        updateBombAI(o, dt, t);
      } else if (o.type === 'egg' || o.type === 'math' || o.type === 'powerup') {
        if (o.seed !== undefined) {
          o.y += Math.sin(t / 700 + o.seed) * 0.15;
        }
      }
    }

    // Collisions
    handleCollisions();

    // Spawns
    const eggCount = state.others.filter(o => o.type === 'egg').length;
    if (eggCount < MAX_EGGS) spawnEgg();
    const dragonCount = state.others.filter(o => o.type === 'dragon').length;
    if (dragonCount < MAX_OTHER_DRAGONS) spawnDragon();

    if (t >= state.nextMathAt) { spawnMath(); state.nextMathAt = t + MATH_INTERVAL_MS; }
    if (t >= state.nextPowerupAt) { spawnPowerup(); state.nextPowerupAt = t + POWERUP_INTERVAL_MS; }

    // Bombs — only after grace, capped per level
    if (t > state.graceUntil) {
      if (!state.nextBombAt) state.nextBombAt = t + 6000;
      const lvl = LEVELS[state.levelId] || LEVELS[0];
      const bombCount = state.others.filter(o => o.type === 'bomb').length;
      if (t >= state.nextBombAt && bombCount < lvl.bombsMax) {
        spawnBomb();
        state.nextBombAt = t + BOMB_INTERVAL_MS;
      }
    }

    // Math timeout — faster for Genius (Mathcounts countdown pace)
    if (state.activeMath) {
      const e0 = state.activeMath.eggs[0];
      const timeoutMs = state.difficulty === 'genius' ? MATH_ANSWER_TIMEOUT_GENIUS_MS : MATH_ANSWER_TIMEOUT_MS;
      if (e0) {
        const age = t - e0.spawnedAt;
        if (age > timeoutMs) clearActiveMath();
        else {
          const remain = Math.max(0, Math.ceil((timeoutMs - age) / 1000));
          if (state.activeMath.lastTimerShown !== remain) {
            state.activeMath.lastTimerShown = remain;
            $('math-timer').textContent = remain + 's';
          }
        }
      }
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

    // Particles
    state.particles = state.particles.filter(p => {
      p.life -= 16;
      p.x += p.vx;
      p.y += p.vy;
      if (p.isTrail) {
        // Trail/flame particles drift and slow without falling
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.vy -= 0.04; // slight upward float (like flame)
      } else {
        p.vy += 0.15; // burst particles fall like confetti
      }
      return p.life > 0;
    });

    if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - 1);
    if (state.player.hurtFlash > 0) state.player.hurtFlash = Math.max(0, state.player.hurtFlash - 1);

    render();
    state.rafId = requestAnimationFrame(loop);
  }

  function updatePlayerDirection() {
    const p = state.player;
    let tx = 0, ty = 0;
    if (state.keys.has('ArrowUp') || state.keys.has('w') || state.keys.has('W')) ty -= 1;
    if (state.keys.has('ArrowDown') || state.keys.has('s') || state.keys.has('S')) ty += 1;
    if (state.keys.has('ArrowLeft') || state.keys.has('a') || state.keys.has('A')) tx -= 1;
    if (state.keys.has('ArrowRight') || state.keys.has('d') || state.keys.has('D')) tx += 1;

    if (state.touch) {
      const dx = state.touch.x - p.x;
      const dy = state.touch.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 15) {
        tx = dx / d;
        ty = dy / d;
      } else {
        tx = 0; ty = 0;
      }
    }

    if (tx !== 0 && ty !== 0) {
      const inv = 1 / Math.sqrt(2);
      tx *= inv; ty *= inv;
    }
    p.targetVx = tx;
    p.targetVy = ty;
  }

  function updateBombAI(b, dt, t) {
    b.bombTurnCooldown -= dt * 1000;
    if (b.bombTurnCooldown <= 0) {
      b.bombTurnCooldown = 1800 + Math.random() * 2000;
      const ang = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 25;
      b.vx = Math.cos(ang) * speed;
      b.vy = Math.sin(ang) * speed;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    wrap(b);
    // Tiny ember trail
    if (Math.random() < 0.25) {
      state.particles.push({
        x: b.x + (Math.random() - 0.5) * b.size * 0.6,
        y: b.y - b.size * 1.0 + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.8 - Math.random() * 0.5,
        color: choice(['#ff6b35', '#ffd54a', '#ff3860']),
        life: 280 + Math.random() * 200,
        size: 2 + Math.random() * 2,
        isTrail: true,
      });
    }
  }

  function updateDragonAI(d, dt) {
    d.turnCooldown -= dt * 1000;
    const player = state.player;
    const dx = player.x - d.x;
    const dy = player.y - d.y;
    const dToPlayer = Math.sqrt(dx * dx + dy * dy);

    const biggerThanPlayer = d.size > player.size + EAT_BUFFER;
    const smallerThanPlayer = d.size + EAT_BUFFER < player.size;
    const powered = state.powerup && state.powerup.kind === 'power';

    if (d.turnCooldown <= 0) {
      d.turnCooldown = 700 + Math.random() * 800;
      const speedMult = getLevel().speedMult;
      if (biggerThanPlayer && !powered && dToPlayer < 220) {
        const sp = ENEMY_BASE_SPEED * 0.75 * speedMult;
        d.vx = (dx / dToPlayer) * sp;
        d.vy = (dy / dToPlayer) * sp;
      } else if ((smallerThanPlayer || powered) && dToPlayer < 280) {
        const sp = ENEMY_BASE_SPEED * 1.05 * speedMult;
        d.vx = -(dx / dToPlayer) * sp;
        d.vy = -(dy / dToPlayer) * sp;
      } else {
        const ang = Math.random() * Math.PI * 2;
        const sp = ENEMY_BASE_SPEED * (0.6 + Math.random() * 0.6) * speedMult;
        d.vx = Math.cos(ang) * sp;
        d.vy = Math.sin(ang) * sp;
      }
    }
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    wrap(d);
    if (d.vx !== 0) d.facingFlipped = d.vx > 0;
  }

  function handleCollisions() {
    const player = state.player;
    const flying = state.powerup && state.powerup.kind === 'fly';
    const powered = state.powerup && state.powerup.kind === 'power';

    const toRemove = new Set();

    for (let i = 0; i < state.others.length; i++) {
      const o = state.others[i];
      const d = dist(player, o);
      if (d > player.size * 0.6 + o.size * 0.6) continue;

      if (o.type === 'egg') {
        eatEgg(o);
        toRemove.add(o);
      } else if (o.type === 'math') {
        if (o.correct) onMathRight(o); else onMathWrong(o);
        toRemove.add(o);
      } else if (o.type === 'powerup') {
        activatePowerup(o.kind);
        burst(o.x, o.y, o.kind === 'fly' ? '#5ec3ff' : o.kind === 'power' ? '#ff6b35' : '#ffd54a', 30);
        toRemove.add(o);
      } else if (o.type === 'dragon') {
        if (powered || player.size > o.size + EAT_BUFFER) {
          // eat smaller dragon
          eatDragon(o);
          toRemove.add(o);
        } else if (o.size > player.size + EAT_BUFFER && !flying) {
          gameOver(`A bigger ${o.character ? o.character.name : 'dragon'} ate you!`);
          return;
        } else {
          // bounce
          bounce(player, o);
        }
      } else if (o.type === 'bomb') {
        if (flying) {
          // phase through bombs while flying — bomb still alive
          continue;
        }
        bombExplode(o);
        toRemove.add(o);
        gameOver('💣 You hit a bomb!');
        return;
      }
    }

    if (toRemove.size > 0) state.others = state.others.filter(o => !toRemove.has(o));
  }

  function bounce(p, o) {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / d, ny = dy / d;
    p.x = o.x + nx * (p.size * 0.6 + o.size * 0.6 + 1);
    p.y = o.y + ny * (p.size * 0.6 + o.size * 0.6 + 1);
    p.vx += nx * 60; p.vy += ny * 60;
  }

  function eatEgg(o) {
    state.score += 5;
    growPlayer(2);
    burst(o.x, o.y, '#ffe892', 14);
  }

  function eatDragon(o) {
    state.score += Math.floor(20 + o.size);
    growPlayer(Math.max(4, o.size * 0.18));
    const tribeColor = o.character && TRIBES[o.character.tribe] ? TRIBES[o.character.tribe].main : '#ff6b35';
    burst(o.x, o.y, tribeColor, 30);
    burst(o.x, o.y, '#fff4d1', 12);
  }

  function onMathRight(o) {
    state.score += 60;
    state.level += 1;
    growPlayer(12);
    burst(o.x, o.y, '#ffd54a', 35);
    burst(o.x, o.y, '#b266ff', 22);
    flashMathBanner(true);
    clearActiveMath();
  }

  function onMathWrong(o) {
    state.score = Math.max(0, state.score - 10);
    // Shrink proportionally so it's always meaningful — 25% of current size, min 10
    const player = state.player;
    const shrinkBy = Math.max(10, Math.floor(player.size * 0.25));
    shrinkPlayer(shrinkBy);
    shake(28);
    state.player.hurtFlash = 40;
    // Red burst on the wrong egg
    burst(o.x, o.y, '#ff3860', 30);
    burst(o.x, o.y, '#1a0b2e', 18);
    // Smoke poof around the now-smaller player
    smokePoof(player.x, player.y, player.size * 1.4);
    flashMathBanner(false);
    clearActiveMath();
  }

  function bombExplode(b) {
    shake(40);
    burst(b.x, b.y, '#ff3860', 50);
    burst(b.x, b.y, '#ffd54a', 35);
    burst(b.x, b.y, '#ff6b35', 35);
    burst(b.x, b.y, '#1a0b2e', 25);
  }

  function smokePoof(x, y, radius) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2.5;
      const dist = radius * (0.3 + Math.random() * 0.7);
      state.particles.push({
        x: x + Math.cos(a) * dist * 0.2,
        y: y + Math.sin(a) * dist * 0.2,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 1.2,
        color: choice(['#4a4458', '#2d1654', '#6b1f7a', '#8b8499']),
        life: 700 + Math.random() * 400,
        size: 3 + Math.random() * 5,
      });
    }
  }

  function growPlayer(by) {
    state.player.size = Math.min(PLAYER_MAX_SIZE, state.player.size + by);
    updateHud();
  }

  function shrinkPlayer(by) {
    // Floor at 18 so shrinks are always visible (8 less than starting size)
    state.player.size = Math.max(18, state.player.size - by);
    updateHud();
  }

  function activatePowerup(kind) {
    if (kind === 'levelup') {
      state.score += 30;
      state.level += 1;
      growPlayer(15);
      return;
    }
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

  function shake(a) { state.screenShake = Math.max(state.screenShake, a); }

  function emitDragonTrail(d, isPlayer) {
    const sp = Math.hypot(d.vx, d.vy);
    if (sp < 30) return;
    const intensity = Math.min(1, sp / 200);
    let colors;
    if (isPlayer) {
      colors = state.powerup && state.powerup.kind === 'power'
        ? ['#ff6b35', '#ffd54a', '#ff3860']
        : state.powerup && state.powerup.kind === 'fly'
        ? ['#5ec3ff', '#a8d8ff', '#fff']
        : ['#ffd54a', '#ffb347', '#ff6b35'];
    } else {
      const pal = (d.character && TRIBES[d.character.tribe]) || TRIBES.SkyWing;
      colors = [pal.accent, pal.main, pal.accent];
    }
    // Big & fast → more particles. Player gets a touch more density than enemies.
    const baseCount = isPlayer ? 2 : 1;
    const trailCount = baseCount + (Math.random() < intensity * 0.6 ? 1 : 0);
    for (let k = 0; k < trailCount; k++) {
      if (Math.random() > intensity) continue;
      const angBehind = Math.atan2(-d.vy, -d.vx);
      const spread = (Math.random() - 0.5) * d.size * 0.55;
      const dist = d.size * (0.5 + Math.random() * 0.35);
      const perpX = -Math.sin(angBehind);
      const perpY = Math.cos(angBehind);
      state.particles.push({
        x: d.x + Math.cos(angBehind) * dist + perpX * spread,
        y: d.y + Math.sin(angBehind) * dist + perpY * spread,
        vx: Math.cos(angBehind) * (1.2 + Math.random() * 1.3),
        vy: Math.sin(angBehind) * (1.2 + Math.random() * 1.3) - 0.15,
        color: choice(colors),
        life: (isPlayer ? 400 : 300) + Math.random() * 240,
        size: d.size * (0.08 + Math.random() * 0.12),
        isTrail: true,
      });
    }
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 1.5,
        color,
        life: 600 + Math.random() * 300,
        size: 2 + Math.random() * 4,
      });
    }
  }

  // ===== Game over =====
  function gameOver(reason) {
    state.running = false;
    cancelAnimationFrame(state.rafId);

    // Check if a new level unlocks
    const nextLevel = LEVELS[state.levelId + 1];
    let unlockedNow = null;
    if (nextLevel && state.unlockedLevel < nextLevel.id && state.score >= nextLevel.unlockScore) {
      state.unlockedLevel = nextLevel.id;
      saveUnlockedLevel();
      unlockedNow = nextLevel;
    }
    const unlockBanner = $('level-unlock-banner');
    if (unlockBanner) {
      if (unlockedNow) {
        unlockBanner.innerHTML = `🎉 <strong>New level unlocked:</strong> ${unlockedNow.emoji} ${escapeHtml(unlockedNow.name)}!`;
        unlockBanner.classList.remove('hidden');
      } else {
        unlockBanner.classList.add('hidden');
      }
    }

    $('gameover-msg').textContent = reason;
    $('final-score').textContent = state.score;
    $('final-length').textContent = Math.round(state.player.size);
    $('final-level').textContent = state.level;

    const qualifies = qualifiesForLeaderboard(state.score);
    const nameRow = $('lb-name-row');
    const newBest = $('new-best');
    if (qualifies) {
      newBest.classList.remove('hidden');
      newBest.textContent = '🏆 New high score!';
      nameRow.classList.remove('hidden');
      const lastName = localStorage.getItem(LB_NAME_KEY) || 'Iris';
      $('lb-name-input').value = lastName;
    } else {
      newBest.classList.add('hidden');
      nameRow.classList.add('hidden');
    }

    renderLeaderboard($('gameover-leaderboard'), null);
    gameoverScreen.classList.add('active');
  }

  function submitLeaderboard() {
    const name = ($('lb-name-input').value || 'Dragon').trim().slice(0, 16) || 'Dragon';
    localStorage.setItem(LB_NAME_KEY, name);
    const entry = {
      name,
      score: state.score,
      size: Math.round(state.player.size),
      level: state.level,
      difficulty: state.difficulty,
      ts: Date.now(),
    };
    const lb = readLeaderboard();
    lb.push(entry);
    lb.sort((a, b) => b.score - a.score);
    while (lb.length > LB_SIZE) lb.pop();
    localStorage.setItem(LB_KEY, JSON.stringify(lb));
    $('lb-name-row').classList.add('hidden');
    renderLeaderboard($('gameover-leaderboard'), entry);
    renderStartLeaderboard();
    hudBest.textContent = getTopScore();
  }

  function readLeaderboard() {
    try {
      const raw = localStorage.getItem(LB_KEY);
      if (!raw) return [];
      const lb = JSON.parse(raw);
      return Array.isArray(lb) ? lb : [];
    } catch { return []; }
  }

  function getTopScore() {
    const lb = readLeaderboard();
    return lb.length > 0 ? lb[0].score : 0;
  }

  function qualifiesForLeaderboard(score) {
    if (score <= 0) return false;
    const lb = readLeaderboard();
    if (lb.length < LB_SIZE) return true;
    return score > lb[lb.length - 1].score;
  }

  function renderLeaderboard(container, highlight) {
    const lb = readLeaderboard();
    if (lb.length === 0) {
      container.innerHTML = '<p class="lb-empty">No scores yet — be the first dragon!</p>';
      return;
    }
    const rows = lb.map((e, i) => {
      const isHi = highlight && e.ts === highlight.ts;
      return `<li class="lb-row${isHi ? ' lb-highlight' : ''}">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${escapeHtml(e.name)}</span>
        <span class="lb-score">${e.score}</span>
        <span class="lb-meta">${e.difficulty[0].toUpperCase() + e.difficulty.slice(1)}</span>
      </li>`;
    }).join('');
    container.innerHTML = `<ol class="lb-list">${rows}</ol>`;
  }

  function renderStartLeaderboard() {
    const c = $('start-leaderboard');
    if (!c) return;
    const lb = readLeaderboard().slice(0, 5);
    if (lb.length === 0) {
      c.innerHTML = '<p class="lb-empty">No scores yet — go make history!</p>';
      return;
    }
    c.innerHTML = `<ol class="lb-list">${lb.map((e, i) => `
      <li class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${escapeHtml(e.name)}</span>
        <span class="lb-score">${e.score}</span>
        <span class="lb-meta">${e.difficulty[0].toUpperCase() + e.difficulty.slice(1)}</span>
      </li>`).join('')}</ol>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  // ===== Rendering =====
  function render() {
    ctx.save();
    if (state.screenShake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * state.screenShake * 0.6,
        (Math.random() - 0.5) * state.screenShake * 0.6,
      );
    }
    ctx.clearRect(0, 0, PLAY_W, PLAY_H);

    drawBackground();

    // Trail particles UNDER the dragons (glowing fire/sparkles)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      if (!p.isTrail) continue;
      const a = Math.max(0, p.life / 600);
      ctx.globalAlpha = a * 0.85;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, p.color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // sort by size so smaller draws on top of larger (so you can see your dragon over the big ones)
    const order = [...state.others].sort((a, b) => b.size - a.size);
    for (const o of order) {
      if (o.size > state.player.size) drawEntity(o);
    }
    drawEntity(state.player);
    for (const o of order) {
      if (o.size <= state.player.size) drawEntity(o);
    }

    // Burst particles: normal blend ON TOP of entities (confetti-like)
    for (const p of state.particles) {
      if (p.isTrail) continue;
      ctx.globalAlpha = Math.max(0, p.life / 800);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawBackground() {
    const lvl = getLevel();
    switch (lvl.map) {
      case 'forest':  drawMapForest();  break;
      case 'park':    drawMapPark();    break;
      case 'space':   drawMapSpace();   break;
      case 'volcano': drawMapVolcano(); break;
      case 'arctic':  drawMapArctic();  break;
      case 'sky':
      default:        drawMapSky();     break;
    }
  }

  function drawMapBaseGradient(stops) {
    const g = ctx.createLinearGradient(0, 0, 0, PLAY_H);
    for (const [pos, color] of stops) g.addColorStop(pos, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PLAY_W, PLAY_H);
  }

  function drawMapSky() {
    drawMapBaseGradient([
      [0,    '#1a0830'],
      [0.5,  '#2d1654'],
      [1,    '#4a1e6e'],
    ]);
    const t = performance.now() / 1000;
    for (let i = 0; i < 40; i++) {
      const x = (i * 137.5) % PLAY_W;
      const y = (i * 97.3) % PLAY_H;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t + i * 0.7));
      ctx.globalAlpha = 0.4 * tw;
      ctx.fillStyle = '#fff4d1';
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMapForest() {
    drawMapBaseGradient([
      [0,   '#0d2818'],
      [0.5, '#1a4d2e'],
      [1,   '#0f3a22'],
    ]);
    const t = performance.now() / 1000;
    // Soft sun rays from top
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ray = ctx.createRadialGradient(PLAY_W * 0.7, 0, 0, PLAY_W * 0.7, 0, PLAY_W * 0.5);
    ray.addColorStop(0, 'rgba(200, 240, 130, 0.25)');
    ray.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ray;
    ctx.fillRect(0, 0, PLAY_W, PLAY_H);
    ctx.restore();

    // Tree silhouettes at the bottom
    const trees = 7;
    for (let i = 0; i < trees; i++) {
      const tx = (i + 0.5) * (PLAY_W / trees) + Math.sin(i) * 30;
      const sway = Math.sin(t * 0.4 + i) * 4;
      const treeHeight = 230 + (i % 3) * 30;
      const baseY = PLAY_H;
      // Trunk
      ctx.fillStyle = '#3a2014';
      ctx.fillRect(tx - 12, baseY - treeHeight * 0.45, 24, treeHeight * 0.45);
      // Foliage circles
      ctx.fillStyle = `rgba(34, ${100 + (i % 4) * 12}, 50, 0.95)`;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(
          tx + sway + (k - 1.5) * 24,
          baseY - treeHeight + 30 + (k % 2) * 30,
          50 + (k % 2) * 8,
          0, Math.PI * 2,
        );
        ctx.fill();
      }
    }

    // Floating leaves
    for (let i = 0; i < 14; i++) {
      const baseX = (i * 137.5) % PLAY_W;
      const baseY = (i * 97.3) % PLAY_H;
      const driftX = Math.sin(t * 0.5 + i) * 60;
      const fallY = ((t * 20 + i * 50) % (PLAY_H + 100)) - 50;
      const x = (baseX + driftX + PLAY_W) % PLAY_W;
      const y = (baseY + fallY) % PLAY_H;
      const rot = t * (1 + i * 0.1) + i;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = i % 3 === 0 ? '#d4a017' : i % 3 === 1 ? '#c2410c' : '#4ade80';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawMapPark() {
    drawMapBaseGradient([
      [0,   '#5ec3ff'],
      [0.55, '#a8dfff'],
      [0.6,  '#4ade80'],
      [1,    '#2e8b57'],
    ]);
    const t = performance.now() / 1000;
    // Sun
    const sunX = PLAY_W * 0.85;
    const sunY = PLAY_H * 0.15;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 120);
    sunGlow.addColorStop(0, 'rgba(255, 255, 220, 0.9)');
    sunGlow.addColorStop(0.5, 'rgba(255, 213, 74, 0.5)');
    sunGlow.addColorStop(1, 'rgba(255, 213, 74, 0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff4d1';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 40, 0, Math.PI * 2);
    ctx.fill();
    // Clouds
    for (let i = 0; i < 4; i++) {
      const cy = PLAY_H * 0.12 + i * 30;
      const cx = ((t * 18 + i * 350) % (PLAY_W + 200)) - 100;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(cx + k * 28, cy + (k % 2) * 8, 24, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Grass blades and daisies
    for (let i = 0; i < 18; i++) {
      const x = (i * 73 + 30) % PLAY_W;
      const y = PLAY_H * 0.65 + (i % 5) * 20;
      // daisy
      if (i % 3 === 0) {
        ctx.fillStyle = '#fff';
        for (let p = 0; p < 6; p++) {
          const ang = (p / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(ang) * 7, y + Math.sin(ang) * 7, 4, 6, ang, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ffd54a';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#228B22';
        ctx.fillRect(x - 1, y - 6, 2, 12);
      }
    }
    // Butterflies
    for (let i = 0; i < 3; i++) {
      const bx = (PLAY_W * (0.2 + i * 0.3)) + Math.sin(t + i) * 80;
      const by = PLAY_H * 0.4 + Math.cos(t * 1.3 + i) * 50;
      const flap = Math.sin(t * 14 + i) * 0.4;
      ctx.fillStyle = i === 0 ? '#ff4f8b' : i === 1 ? '#b266ff' : '#ffd54a';
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(1, 0.6 + flap);
      ctx.beginPath();
      ctx.arc(-6, 0, 7, 0, Math.PI * 2);
      ctx.arc(6, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawMapSpace() {
    drawMapBaseGradient([
      [0,    '#000010'],
      [0.5,  '#0a0420'],
      [1,    '#1a0830'],
    ]);
    const t = performance.now() / 1000;
    // Nebula clouds
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const nebulas = [
      { x: 0.2, y: 0.3, c: 'rgba(178, 102, 255, 0.4)', r: 280 },
      { x: 0.75, y: 0.6, c: 'rgba(255, 79, 139, 0.35)', r: 240 },
      { x: 0.5, y: 0.15, c: 'rgba(94, 195, 255, 0.3)', r: 220 },
    ];
    for (const n of nebulas) {
      const g = ctx.createRadialGradient(PLAY_W * n.x, PLAY_H * n.y, 0, PLAY_W * n.x, PLAY_H * n.y, n.r);
      g.addColorStop(0, n.c);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(PLAY_W * n.x, PLAY_H * n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // LOTS of twinkling stars
    for (let i = 0; i < 120; i++) {
      const x = (i * 137.5) % PLAY_W;
      const y = (i * 97.3) % PLAY_H;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i * 0.7));
      ctx.globalAlpha = tw;
      ctx.fillStyle = i % 7 === 0 ? '#5ec3ff' : i % 5 === 0 ? '#ff4f8b' : '#fff4d1';
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 4 === 0 ? 1.5 : 0), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Planet
    const px = PLAY_W * 0.88;
    const py = PLAY_H * 0.85;
    const pGrad = ctx.createRadialGradient(px - 30, py - 30, 0, px, py, 80);
    pGrad.addColorStop(0, '#ff9d4a');
    pGrad.addColorStop(0.6, '#c2410c');
    pGrad.addColorStop(1, '#2d1654');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(px, py, 80, 0, Math.PI * 2);
    ctx.fill();
    // Ring
    ctx.strokeStyle = 'rgba(255, 213, 74, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(px, py, 120, 30, 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawMapVolcano() {
    drawMapBaseGradient([
      [0,    '#3a0612'],
      [0.5,  '#8b1a0e'],
      [1,    '#1a0408'],
    ]);
    const t = performance.now() / 1000;
    // Lava glow at bottom
    const lava = ctx.createRadialGradient(PLAY_W / 2, PLAY_H * 1.1, 0, PLAY_W / 2, PLAY_H * 1.1, PLAY_W * 0.7);
    lava.addColorStop(0, 'rgba(255, 213, 74, 0.5)');
    lava.addColorStop(0.4, 'rgba(255, 107, 53, 0.35)');
    lava.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lava;
    ctx.fillRect(0, 0, PLAY_W, PLAY_H);
    // Volcano silhouettes
    ctx.fillStyle = '#1a0408';
    ctx.beginPath();
    ctx.moveTo(0, PLAY_H);
    ctx.lineTo(PLAY_W * 0.15, PLAY_H * 0.7);
    ctx.lineTo(PLAY_W * 0.25, PLAY_H * 0.78);
    ctx.lineTo(PLAY_W * 0.4, PLAY_H * 0.55);
    ctx.lineTo(PLAY_W * 0.55, PLAY_H * 0.75);
    ctx.lineTo(PLAY_W * 0.7, PLAY_H * 0.6);
    ctx.lineTo(PLAY_W * 0.85, PLAY_H * 0.72);
    ctx.lineTo(PLAY_W, PLAY_H * 0.65);
    ctx.lineTo(PLAY_W, PLAY_H);
    ctx.closePath();
    ctx.fill();
    // Lava streaks on the volcanoes
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(PLAY_W * 0.4, PLAY_H * 0.55);
    ctx.lineTo(PLAY_W * 0.42, PLAY_H * 0.85);
    ctx.moveTo(PLAY_W * 0.7, PLAY_H * 0.6);
    ctx.lineTo(PLAY_W * 0.68, PLAY_H * 0.9);
    ctx.stroke();
    // Floating embers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i++) {
      const baseX = (i * 137.5) % PLAY_W;
      const driftX = Math.sin(t * 0.6 + i) * 30;
      const fallY = PLAY_H - ((t * 50 + i * 60) % (PLAY_H + 100));
      const x = (baseX + driftX + PLAY_W) % PLAY_W;
      const y = fallY;
      const a = 0.7 - (PLAY_H - y) / PLAY_H * 0.7;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = i % 3 === 0 ? '#ffd54a' : '#ff6b35';
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawMapArctic() {
    drawMapBaseGradient([
      [0,    '#1e3a5f'],
      [0.5,  '#5b8fb9'],
      [1,    '#a8d8ff'],
    ]);
    const t = performance.now() / 1000;
    // Aurora ribbons
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const grad = ctx.createLinearGradient(0, PLAY_H * 0.1 + i * 40, 0, PLAY_H * 0.5 + i * 40);
      const cols = [
        ['rgba(94, 195, 255, 0.35)', 'rgba(94, 195, 255, 0)'],
        ['rgba(74, 222, 128, 0.3)',  'rgba(74, 222, 128, 0)'],
        ['rgba(178, 102, 255, 0.3)', 'rgba(178, 102, 255, 0)'],
      ][i];
      grad.addColorStop(0, cols[0]);
      grad.addColorStop(1, cols[1]);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, PLAY_H * 0.15 + i * 30 + Math.sin(t + i) * 20);
      for (let x = 0; x <= PLAY_W; x += 40) {
        ctx.lineTo(x, PLAY_H * 0.15 + i * 30 + Math.sin(t + i + x * 0.005) * 30);
      }
      ctx.lineTo(PLAY_W, PLAY_H * 0.6);
      ctx.lineTo(0, PLAY_H * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Ice mountains
    ctx.fillStyle = '#e8f4ff';
    ctx.beginPath();
    ctx.moveTo(0, PLAY_H);
    ctx.lineTo(PLAY_W * 0.2, PLAY_H * 0.72);
    ctx.lineTo(PLAY_W * 0.35, PLAY_H * 0.82);
    ctx.lineTo(PLAY_W * 0.5, PLAY_H * 0.68);
    ctx.lineTo(PLAY_W * 0.7, PLAY_H * 0.78);
    ctx.lineTo(PLAY_W * 0.85, PLAY_H * 0.65);
    ctx.lineTo(PLAY_W, PLAY_H * 0.75);
    ctx.lineTo(PLAY_W, PLAY_H);
    ctx.closePath();
    ctx.fill();
    // Falling snowflakes
    for (let i = 0; i < 40; i++) {
      const baseX = (i * 137.5) % PLAY_W;
      const driftX = Math.sin(t * 0.4 + i) * 40;
      const fallY = ((t * 30 + i * 50) % (PLAY_H + 100)) - 50;
      const x = (baseX + driftX + PLAY_W) % PLAY_W;
      const y = fallY;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 3) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEntity(o) {
    if (o === state.player) drawDragonEntity(o, true);
    else if (o.type === 'dragon') drawDragonEntity(o, false);
    else if (o.type === 'egg') drawEgg(o);
    else if (o.type === 'math') drawMathEgg(o);
    else if (o.type === 'powerup') drawPowerup(o);
    else if (o.type === 'bomb') drawBomb(o);
  }

  function drawBomb(o) {
    const t = performance.now();
    const pulse = 1 + Math.sin(t / 200) * 0.15;
    const cx = o.x, cy = o.y + Math.sin(t / 400 + o.seed) * 2;
    const r = o.size;

    // Danger red glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6 * pulse);
    glow.addColorStop(0, 'rgba(255, 56, 96, 0.6)');
    glow.addColorStop(1, 'rgba(255, 56, 96, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.6 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Bomb body (dark sphere)
    const bodyGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.25, r * 0.15, cx, cy + r * 0.1, r);
    bodyGrad.addColorStop(0, '#4a4458');
    bodyGrad.addColorStop(0.55, '#1f1a2e');
    bodyGrad.addColorStop(1, '#0a0414');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.05, r, 0, Math.PI * 2);
    ctx.fill();

    // Body highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.25, r * 0.28, r * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Fuse holder (small brass cylinder on top)
    ctx.fillStyle = '#5a4030';
    ctx.fillRect(cx - r * 0.18, cy - r * 1.05, r * 0.36, r * 0.28);
    ctx.fillStyle = '#7a5a40';
    ctx.fillRect(cx - r * 0.18, cy - r * 1.05, r * 0.36, r * 0.08);

    // Fuse curve
    ctx.strokeStyle = '#a08866';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.95);
    ctx.quadraticCurveTo(cx + r * 0.5, cy - r * 1.5, cx + r * 0.25, cy - r * 1.75);
    ctx.stroke();

    // Sparkly fuse tip
    const tipX = cx + r * 0.25;
    const tipY = cy - r * 1.75;
    const sparkleSize = 6 + Math.sin(t / 90) * 3;
    const sparkleGlow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, sparkleSize * 2.2);
    sparkleGlow.addColorStop(0, 'rgba(255, 213, 74, 0.95)');
    sparkleGlow.addColorStop(0.5, 'rgba(255, 107, 53, 0.6)');
    sparkleGlow.addColorStop(1, 'rgba(255, 107, 53, 0)');
    ctx.fillStyle = sparkleGlow;
    ctx.beginPath();
    ctx.arc(tipX, tipY, sparkleSize * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(tipX, tipY, sparkleSize * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Warning sign on the bomb body — kid-friendly hazard mark, not a skull
    ctx.font = `bold ${Math.floor(r * 0.85)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠️', cx, cy + r * 0.18);
  }

  function drawDragonEntity(o, isPlayer) {
    const c = o.character;
    const img = c && c.image ? loadImage(c.image) : null;
    const flying = isPlayer && state.powerup && state.powerup.kind === 'fly';
    const powered = isPlayer && state.powerup && state.powerup.kind === 'power';
    const t = performance.now();

    ctx.save();

    // Drop shadow / glow
    if (isPlayer) {
      // Stronger, pulsing player halo so it stands out
      const pulse = 1 + Math.sin(t / 250) * 0.18;
      const haloR = o.size * 2.0 * pulse;
      const outer = ctx.createRadialGradient(o.x, o.y, o.size * 0.7, o.x, o.y, haloR);
      const glowCol = powered ? 'rgba(255, 107, 53, 0.75)' : flying ? 'rgba(94, 195, 255, 0.75)' : 'rgba(255, 213, 74, 0.7)';
      outer.addColorStop(0, glowCol);
      outer.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.arc(o.x, o.y, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Inner crisp ring outline so player is always visible against dark/busy bg
      ctx.save();
      ctx.strokeStyle = powered ? '#ff6b35' : flying ? '#5ec3ff' : '#ffd54a';
      ctx.lineWidth = 3;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 12 + Math.sin(t / 250) * 4;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.size * (1.08 + Math.sin(t / 350) * 0.04), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(o.x, o.y + o.size * 0.55, o.size * 0.7, o.size * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (flying) ctx.globalAlpha = 0.6;

    if (img && img.complete && img.naturalWidth > 0) {
      // Image draw — keep aspect ratio, fit inside bounding circle
      const aspect = img.naturalWidth / img.naturalHeight;
      let w = o.size * 2.2, h = w / aspect;
      if (h > o.size * 2.2) { h = o.size * 2.2; w = h * aspect; }

      // Tilt the dragon toward its movement direction (capped to ±36°)
      const speed = Math.hypot(o.vx, o.vy);
      let tilt = 0;
      if (speed > 25) {
        tilt = (o.vy / speed) * (Math.PI / 5); // ~36° max
        tilt = Math.max(-Math.PI / 5, Math.min(Math.PI / 5, tilt));
      }
      const targetTilt = o.facingFlipped ? -tilt : tilt;
      // Smooth the tilt so it doesn't snap
      if (o.renderTilt === undefined) o.renderTilt = 0;
      o.renderTilt += (targetTilt - o.renderTilt) * 0.18;

      ctx.save();
      ctx.translate(o.x, o.y);
      if (o.facingFlipped) ctx.scale(-1, 1);
      ctx.rotate(o.renderTilt);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      // Fallback: tribe gradient blob
      drawDragonFallback(o);
    }

    // Name label for enemies (only if bigger threshold so it's not cluttered)
    if (!isPlayer && c && o.size > 28) {
      ctx.font = `${Math.max(10, Math.min(16, o.size * 0.2))}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const isBigger = o.size > state.player.size + EAT_BUFFER;
      ctx.fillStyle = isBigger ? '#ff3860' : '#fff4d1';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      const label = c.name;
      const ly = o.y + o.size * 0.95;
      ctx.strokeText(label, o.x, ly);
      ctx.fillText(label, o.x, ly);
    }

    if (isPlayer && state.player.hurtFlash > 0) {
      ctx.globalAlpha = state.player.hurtFlash / 30;
      ctx.fillStyle = '#ff3860';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Player overlay: orbiting sparkles + "YOU" pointer
    if (isPlayer) {
      const t = performance.now();
      const orbitR = o.size * 1.25;
      const sparkleCount = 4;
      for (let i = 0; i < sparkleCount; i++) {
        const ang = (t / 700) + (i * Math.PI * 2 / sparkleCount);
        const sx = o.x + Math.cos(ang) * orbitR;
        const sy = o.y + Math.sin(ang) * orbitR;
        const sSize = 3 + Math.sin(t / 200 + i) * 1.5;
        // 4-point star
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(t / 400);
        const starGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sSize * 3);
        starGrad.addColorStop(0, '#fff4d1');
        starGrad.addColorStop(0.5, 'rgba(255, 213, 74, 0.7)');
        starGrad.addColorStop(1, 'rgba(255, 213, 74, 0)');
        ctx.fillStyle = starGrad;
        ctx.beginPath();
        ctx.arc(0, 0, sSize * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(0, -sSize);
        ctx.lineTo(sSize * 0.35, -sSize * 0.35);
        ctx.lineTo(sSize, 0);
        ctx.lineTo(sSize * 0.35, sSize * 0.35);
        ctx.lineTo(0, sSize);
        ctx.lineTo(-sSize * 0.35, sSize * 0.35);
        ctx.lineTo(-sSize, 0);
        ctx.lineTo(-sSize * 0.35, -sSize * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // "YOU" arrow indicator floating above the player
      const arrowY = o.y - o.size - 18 - Math.sin(t / 350) * 4;
      const arrowX = o.x;
      ctx.save();
      ctx.font = `bold 14px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1a0b2e';
      ctx.strokeStyle = '#1a0b2e';
      ctx.lineWidth = 4;
      ctx.strokeText('YOU', arrowX, arrowY);
      ctx.fillStyle = '#ffd54a';
      ctx.fillText('YOU', arrowX, arrowY);
      // little down-arrow under the label
      ctx.fillStyle = '#ffd54a';
      ctx.strokeStyle = '#1a0b2e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arrowX - 5, arrowY + 8);
      ctx.lineTo(arrowX + 5, arrowY + 8);
      ctx.lineTo(arrowX, arrowY + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawDragonFallback(o) {
    const pal = (o.character && TRIBES[o.character.tribe]) || TRIBES.SkyWing;
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.size);
    g.addColorStop(0, pal.accent);
    g.addColorStop(0.6, pal.main);
    g.addColorStop(1, '#1a0b2e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2);
    ctx.fill();
    // eye
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(o.x + o.size * 0.3, o.y - o.size * 0.2, o.size * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(o.x + o.size * 0.35, o.y - o.size * 0.2, o.size * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEgg(o) {
    const bob = Math.sin(performance.now() / 600 + o.seed) * 2;
    const cx = o.x, cy = o.y + bob;
    const r = o.size;
    // glow
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
    grad.addColorStop(0, 'rgba(255, 232, 146, 0.5)');
    grad.addColorStop(1, 'rgba(255, 232, 146, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#fff4d1';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.85, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe892';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.4, r * 0.22, r * 0.3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 30, 0, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.85, r * 1.05, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawMathEgg(o) {
    const cx = o.x, cy = o.y + Math.sin(performance.now() / 500 + o.seed) * 2;
    const r = o.size;
    const pulse = 1 + Math.sin(performance.now() / 200) * 0.12;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6 * pulse);
    grad.addColorStop(0, 'rgba(255, 213, 74, 0.65)');
    grad.addColorStop(1, 'rgba(255, 213, 74, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.6 * pulse, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#fff4d1';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.9, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.9, r * 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#1a0b2e';
    ctx.font = `bold ${Math.floor(r * 1.05)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(o.value), cx, cy + 1);
  }

  function drawPowerup(o) {
    const t = performance.now();
    const cx = o.x, cy = o.y + Math.sin(t / 400 + o.seed) * 3;
    const r = o.size;
    const pulse = 1 + Math.sin(t / 180) * 0.15;
    const color = o.kind === 'fly' ? '#5ec3ff' : o.kind === 'power' ? '#ff6b35' : '#ffd54a';
    const emoji = o.kind === 'fly' ? '✨' : o.kind === 'power' ? '🔥' : '⭐';

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6 * pulse);
    grad.addColorStop(0, color + 'cc');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.6 * pulse, 0, Math.PI * 2); ctx.fill();

    ctx.font = `${Math.floor(r * 1.7)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy + 1);
  }

  // ===== Input =====
  document.addEventListener('keydown', (ev) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(ev.key)) ev.preventDefault();
    state.keys.add(ev.key);
    if (ev.key === ' ' || ev.key === 'p' || ev.key === 'P') {
      togglePause();
    }
  });
  document.addEventListener('keyup', (ev) => {
    state.keys.delete(ev.key);
  });

  function canvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * PLAY_W;
    const y = (clientY - rect.top) / rect.height * PLAY_H;
    return { x, y };
  }
  canvas.addEventListener('mousedown', (ev) => {
    state.touch = canvasPoint(ev.clientX, ev.clientY);
  });
  canvas.addEventListener('mousemove', (ev) => {
    if (state.touch) state.touch = canvasPoint(ev.clientX, ev.clientY);
  });
  canvas.addEventListener('mouseup', () => { state.touch = null; });
  canvas.addEventListener('mouseleave', () => { state.touch = null; });
  canvas.addEventListener('touchstart', (ev) => {
    const t = ev.touches[0];
    state.touch = canvasPoint(t.clientX, t.clientY);
    ev.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (ev) => {
    const t = ev.touches[0];
    state.touch = canvasPoint(t.clientX, t.clientY);
    ev.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { state.touch = null; });

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    pauseScreen.classList.toggle('active', state.paused);
  }

  // ===== UI wiring =====
  function pickDifficulty(d) {
    state.difficulty = d;
    document.querySelectorAll('.diff-btn').forEach(b => {
      const isSel = b.dataset.diff === d;
      b.classList.toggle('selected', isSel);
      b.setAttribute('aria-checked', String(isSel));
    });
  }

  function loadUnlockedLevel() {
    const n = Number(localStorage.getItem(UNLOCK_KEY));
    if (!Number.isFinite(n) || n < 0) state.unlockedLevel = 0;
    else state.unlockedLevel = Math.min(LEVELS.length - 1, Math.floor(n));
  }

  function saveUnlockedLevel() {
    localStorage.setItem(UNLOCK_KEY, String(state.unlockedLevel));
  }

  function pickLevel(id) {
    if (id > state.unlockedLevel) return; // locked
    state.levelId = id;
    renderLevelPicker();
  }

  function renderLevelPicker() {
    const container = $('level-picker');
    if (!container) return;
    container.innerHTML = LEVELS.map((lvl) => {
      const locked = lvl.id > state.unlockedLevel;
      const selected = lvl.id === state.levelId && !locked;
      return `<button class="level-card${selected ? ' selected' : ''}${locked ? ' locked' : ''}" data-id="${lvl.id}" role="radio" aria-checked="${selected}" ${locked ? 'aria-disabled="true"' : ''}>
        <span class="level-emoji">${lvl.emoji}</span>
        <span class="level-name">${lvl.name}</span>
        <span class="level-desc">${lvl.description}</span>
        ${locked
          ? `<span class="level-lock">🔒 ${lvl.unlockScore} pts</span>`
          : `<span class="level-status">Ready</span>`}
      </button>`;
    }).join('');
    container.querySelectorAll('.level-card').forEach(btn => {
      btn.addEventListener('click', () => pickLevel(Number(btn.dataset.id)));
    });
  }

  function renderPlayerPicker() {
    const container = $('player-picker');
    if (!container || PLAYER_CHARS.length === 0) return;
    container.innerHTML = PLAYER_CHARS.map((c, i) => `
      <button class="player-card${i === state.chosenCharIndex ? ' selected' : ''}" data-i="${i}" aria-label="${escapeHtml(c.name)}">
        <img src="${escapeHtml(c.image)}" alt="" loading="lazy">
        <span class="player-name">${escapeHtml(c.name)}</span>
        <span class="player-tribe">${escapeHtml(c.tribe || '')}</span>
      </button>
    `).join('');
    container.querySelectorAll('.player-card').forEach(btn => {
      btn.addEventListener('click', () => {
        state.chosenCharIndex = Number(btn.dataset.i);
        container.querySelectorAll('.player-card').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

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
    renderStartLeaderboard();
    showScreen('start-screen');
  });
  $('play-again-btn').addEventListener('click', () => {
    gameoverScreen.classList.remove('active');
    startGame();
  });
  $('home-btn').addEventListener('click', () => {
    gameoverScreen.classList.remove('active');
    renderStartLeaderboard();
    showScreen('start-screen');
  });
  $('save-score-btn').addEventListener('click', submitLeaderboard);
  $('lb-name-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); submitLeaderboard(); }
  });
  $('clear-lb-btn').addEventListener('click', () => {
    if (confirm('Clear the leaderboard? This cannot be undone.')) {
      localStorage.removeItem(LB_KEY);
      renderStartLeaderboard();
      hudBest.textContent = 0;
    }
  });

  window.addEventListener('resize', () => { if (state.running) sizeCanvas(); });

  // ===== Start-screen preview animation =====
  function previewLoop() {
    const w = previewCanvas.width;
    const h = previewCanvas.height;
    previewCtx.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    const char = PLAYER_CHARS[state.chosenCharIndex];
    const img = char ? loadImage(char.image) : null;
    const cx = w / 2 + Math.sin(t) * 8;
    const cy = h / 2 + Math.cos(t * 1.4) * 5;
    if (img && img.complete && img.naturalWidth > 0) {
      const aspect = img.naturalWidth / img.naturalHeight;
      let drawH = h * 0.95, drawW = drawH * aspect;
      if (drawW > w * 0.95) { drawW = w * 0.95; drawH = drawW / aspect; }
      previewCtx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
    }
    // sparkles
    for (let i = 0; i < 6; i++) {
      const ang = t + i * 1.05;
      const rr = 75 + Math.sin(t * 2 + i) * 8;
      const sx = cx + Math.cos(ang) * rr;
      const sy = cy + Math.sin(ang) * rr;
      previewCtx.fillStyle = 'rgba(255, 213, 74, 0.9)';
      previewCtx.beginPath();
      previewCtx.arc(sx, sy, 2 + Math.sin(t * 3 + i) * 1, 0, Math.PI * 2);
      previewCtx.fill();
    }
    requestAnimationFrame(previewLoop);
  }

  // ===== Init =====
  loadUnlockedLevel();
  state.levelId = Math.min(state.levelId, state.unlockedLevel);
  hudBest.textContent = getTopScore();
  pickDifficulty('hard');
  renderStartLeaderboard();
  renderLevelPicker();
  loadCharacters();
  previewLoop();

})();
