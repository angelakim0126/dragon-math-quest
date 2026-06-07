# Iris Juliet's Dragon Math Quest

A Wings of Fire-themed snake game where a dragon eats eggs and smaller dragons, runs away from bigger dragons, and solves math problems to level up.

## How to play

- **Move** — Arrow keys, WASD, or swipe on iPad
- **Eat eggs** 🥚 — grow longer, score points
- **Eat smaller dragons** 🐲 — bonus points + extra growth
- **Run from big dragons** 😱 — they will eat you!
- **Solve math** 🧠 — a problem appears periodically with two answer eggs in the world. Eat the **right** one to LEVEL UP. The wrong one shrinks you.
- **Power-ups:**
  - ✨ **Fly** — phase through big dragons (8 seconds)
  - 🔥 **Power** — eat big dragons (8 seconds)
  - ⭐ **Level Up** — grow extra big

## How to open it

Double-click `index.html`. It will open in your default browser.

If it doesn't quite work that way on your machine, run a tiny local server:

```
cd ~/Documents/dragon-math-game
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Press Ctrl+C in Terminal to stop.

## Difficulty levels

Pick on the start screen. The default is **Hard**.

| Level | Math |
|---|---|
| Easy | Add / subtract within 10 |
| Medium | Add / subtract within 20 |
| Hard | Add / subtract within 100 + times tables (×) |

## How it was made

Pure HTML / CSS / JS — no build step, no dependencies. Single `index.html` + `app.js` + `styles.css`. Renders on a `<canvas>` and saves the best score in `localStorage`.

This site is for personal home use only. Wings of Fire is © Tui T. Sutherland and Scholastic Inc. Not affiliated with Scholastic.
