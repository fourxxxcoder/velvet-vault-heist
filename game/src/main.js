// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, paused, caught, win and game
// over. A click (or Q) throws a lure where the mouse points; E pops smoke; F fires the
// EMP; Shift sneaks; P pauses.
//
// ?seed=N fixes the guard and camera behaviour. ?shot=start|play|alarm|getaway (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. window.__heist exposes the live state for
// playtesting and debugging.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAUGHT, EVENT_EMP, EVENT_LOCKDOWN, EVENT_LOOT, EVENT_LURE, EVENT_OVER, EVENT_SMOKE, EVENT_SPOTTED, EVENT_STAR, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_EMP, ACTION_PAUSE, ACTION_SMOKE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** The debug hook: the live state, in plain numbers, for playtests and screenshots. */
function exposeState(screen) {
  const state = world.state;
  window.__heist = {
    screen,
    score: state.score,
    alarm: Math.round(state.alarm),
    lives: state.lives,
    lootTaken: world.lootTaken(),
    lootTotal: world.lootTotal(),
    starTaken: state.starTaken,
    tools: { ...state.tools },
    smoked: state.player.smoked > 0,
    detection: Math.round(world.maxDetection() * 100) / 100,
    lockdown: state.lockdownLeft > 0,
    time: Math.round(state.elapsed),
    player: { x: Math.round(state.player.x), y: Math.round(state.player.y) },
    guards: state.guards.map((guard) => ({
      name: guard.name,
      x: Math.round(guard.x),
      y: Math.round(guard.y),
      state: guard.state,
      detection: Math.round(guard.detection * 100) / 100,
    })),
    cameras: state.cameras.map((camera) => ({ name: camera.name, off: camera.offLeft > 0, spotted: Math.round(camera.spotted * 100) / 100 })),
  };
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      exposeState(scene.screen);
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let stepCount = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal the Aurora Star and get out.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Clean getaway. Score ${world.state.score}.` : `Caught three times. Score ${world.state.score}.`);
  }

  function react(events) {
    const state = world.state;
    if (events & EVENT_LOOT) audio.loot();
    if (events & EVENT_STAR) audio.star();
    if (events & EVENT_LURE) audio.lure();
    if (events & EVENT_SMOKE) audio.smoke();
    if (events & EVENT_EMP) audio.emp();
    if (events & EVENT_LOCKDOWN) audio.chase();
    if (events & EVENT_SPOTTED) announce('A camera has you!');
    if (events & EVENT_CAUGHT) {
      audio.caught();
      screen = SCREEN_CAUGHT;
      announce(state.notice);
    }
    if (events & EVENT_WIN) {
      audio.win();
      endGame(true);
    } else if (events & EVENT_OVER) {
      audio.over();
      endGame(false);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_WIN || screen === SCREEN_OVER)) {
      startGame();
      return;
    }
    if (screen !== SCREEN_PLAY) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    let tool = null;
    let toolAt = null;
    if (actions & ACTION_SMOKE) tool = 'smoke';
    else if (actions & ACTION_EMP) tool = 'emp';
    else if (click !== null) {
      const worldPoint = renderer.toWorld(click.x, click.y);
      if (worldPoint !== null) {
        tool = 'lure';
        toolAt = worldPoint;
      }
    }
    if (tool !== null) {
      const events = world.step(0, { x: 0, y: 0 }, input.sneaking(), tool, toolAt, false);
      react(events);
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, false, null, null, true);
      return;
    }
    if (screen === SCREEN_CAUGHT) {
      const events = world.step(STEP, { x: 0, y: 0 }, false, null, null, false);
      if (!world.state.caught && !world.state.over) {
        screen = SCREEN_PLAY;
        announce('Back on your feet. The night goes on.');
      } else if (world.state.over) {
        endGame(false);
      }
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, input.move(), input.sneaking(), null, null, false);
    stepCount += 1;
    if (stepCount % 30 === 0) audio.step();
    audio.setAlarmHot(world.state.alarm > 70);
    react(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_CAUGHT) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_CAUGHT)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, now / 1000);
    exposeState(screen);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Velvet Vault. Press Space to begin the heist.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
