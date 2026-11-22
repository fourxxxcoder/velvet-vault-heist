// The world: everything the game is, with no drawing and no browser in it. The thief,
// the guards, the cameras, the loot, the tools and the alarm meter. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react — play a
// sound, announce a line — without the world knowing about screens or sound.
//
// The job, in one paragraph: slip in at the bottom-left, lift what you can, take the
// Aurora Star from the vault, and walk out the way you came in. Guards and cameras fill
// the alarm meter while they see you; a full meter locks the museum down and every guard
// runs you down. A guard that reaches you costs a life. Three lives, then the night is
// over — or walk out with the Star and the getaway pays off.

import { ALARM, CAMERA, FIELD, GUARD, LIVES, LOOT_VALUES, STEP, THIEF, TOOLS, WIN_BONUS } from './config.js';
import { ENTRY, EXIT, LOOT_SPOTS, resolveMove, standsFree } from './levels.js';
import { anyAlerted, anyChasing, createGuards, guardTouching, maxDetection, resetGuards, sendToInvestigate, stepGuard } from './guards.js';
import { anySpotting, createCameras, resetCameras, stepCamera, switchOffAll } from './cameras.js';

export const EVENT_LOOT = 1;
export const EVENT_STAR = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_WIN = 8;
export const EVENT_OVER = 16;
export const EVENT_LURE = 32;
export const EVENT_SMOKE = 64;
export const EVENT_EMP = 128;
export const EVENT_SPOTTED = 256;
export const EVENT_LOCKDOWN = 512;

/** How close the thief must be to lift a piece of loot (loot sits on cases and plinths). */
const LOOT_REACH = 50;
/** How close the thief must be to the exit door to walk out. */
const EXIT_REACH = 34;

export function createWorld(random) {
  const guards = createGuards();
  const cameras = createCameras();
  const loot = LOOT_SPOTS.map((spot) => ({ ...spot, taken: false }));
  const state = {
    player: { x: ENTRY.x, y: ENTRY.y, sneaking: false, smoked: 0, facing: -Math.PI / 2 },
    guards,
    cameras,
    loot,
    score: 0,
    lives: LIVES,
    alarm: 0,
    lockdownLeft: 0,
    elapsed: 0,
    tools: { lures: TOOLS.lures, smoke: TOOLS.smoke, emp: TOOLS.emp },
    lures: [],
    smokeClouds: [],
    starTaken: false,
    won: false,
    over: false,
    caught: false,
    caughtFreeze: 0,
    /** The last thing that happened, for the HUD line ("Spotted by Vera!"). */
    notice: '',
    noticeLeft: 0,
  };

  function reset() {
    state.player.x = ENTRY.x;
    state.player.y = ENTRY.y;
    state.player.sneaking = false;
    state.player.smoked = 0;
    state.player.facing = -Math.PI / 2;
    resetGuards(guards);
    resetCameras(cameras);
    for (const item of loot) item.taken = false;
    state.score = 0;
    state.lives = LIVES;
    state.alarm = 0;
    state.lockdownLeft = 0;
    state.elapsed = 0;
    state.tools = { lures: TOOLS.lures, smoke: TOOLS.smoke, emp: TOOLS.emp };
    state.lures = [];
    state.smokeClouds = [];
    state.starTaken = false;
    state.won = false;
    state.over = false;
    state.caught = false;
    state.caughtFreeze = 0;
    state.notice = '';
    state.noticeLeft = 0;
  }

  function setNotice(text) {
    state.notice = text;
    state.noticeLeft = 3;
  }

  /** The thief throws a lure (a coin) at (x, y): guards in earshot come to look. */
  function throwLure(x, y) {
    if (state.tools.lures <= 0 || state.over || state.won) return 0;
    state.tools.lures -= 1;
    state.lures.push({ x, y, left: TOOLS.lureSeconds });
    let heard = 0;
    for (const guard of guards) {
      const dx = guard.x - x;
      const dy = guard.y - y;
      if (dx * dx + dy * dy < TOOLS.lureHearing * TOOLS.lureHearing) {
        sendToInvestigate(guard, x, y, TOOLS.lureSeconds);
        heard += 1;
      }
    }
    setNotice(heard > 0 ? `Clink! ${heard} guard${heard > 1 ? 's' : ''} heard it.` : 'Clink! Nobody heard it.');
    return EVENT_LURE;
  }

  /** The thief pops a smoke pellet: a cloud that hides them for a few seconds. */
  function useSmoke() {
    if (state.tools.smoke <= 0 || state.over || state.won) return 0;
    state.tools.smoke -= 1;
    state.player.smoked = TOOLS.smokeSeconds;
    state.smokeClouds.push({ x: state.player.x, y: state.player.y, left: TOOLS.smokeSeconds });
    setNotice('Smoke! They lost you — for a moment.');
    return EVENT_SMOKE;
  }

  /** The thief fires the EMP: every camera goes dark, and the alarm jumps. */
  function useEmp() {
    if (state.tools.emp <= 0 || state.over || state.won) return 0;
    state.tools.emp -= 1;
    switchOffAll(cameras, CAMERA.empOffSeconds);
    state.alarm = Math.min(100, state.alarm + ALARM.empSpike);
    setNotice(`EMP! Cameras dark for ${CAMERA.empOffSeconds}s — but the alarm heard it.`);
    return EVENT_EMP;
  }

  function takeLoot(item) {
    item.taken = true;
    state.score += item.value;
    if (item.kind === 'auroraStar') {
      state.starTaken = true;
      setNotice('THE AURORA STAR IS YOURS. Get out — the way you came in!');
      return EVENT_STAR;
    }
    setNotice(`${item.name} pocketed — $${item.value}.`);
    return EVENT_LOOT;
  }

  function getCaught(guard) {
    state.lives -= 1;
    state.caught = true;
    state.caughtFreeze = THIEF.caughtFreeze;
    state.alarm = ALARM.afterCaught;
    state.lockdownLeft = 0;
    setNotice(`${guard.name} grabbed you! A life lost — ${state.lives} left.`);
    if (state.lives <= 0) return EVENT_CAUGHT | EVENT_OVER;
    return EVENT_CAUGHT;
  }

  function win() {
    state.won = true;
    const timeBonus = Math.max(0, Math.floor((WIN_BONUS.timeParSeconds - state.elapsed) * WIN_BONUS.perSecond));
    const toolBonus = (state.tools.lures + state.tools.smoke + state.tools.emp) * WIN_BONUS.perToolLeft;
    const lifeBonus = state.lives * WIN_BONUS.perLifeLeft;
    state.score += timeBonus + toolBonus + lifeBonus;
    state.winBreakdown = { timeBonus, toolBonus, lifeBonus };
    return EVENT_WIN;
  }

  /**
   * One fixed step. `move` is {x, y} normalised (-1..1 each), `sneaking` halves speed and
   * detection, `tool` is 'lure' | 'smoke' | 'emp' | null (with `toolAt` for the lure's
   * landing spot). With `harmless` set (the title screen's backdrop) the world moves but
   * nothing is caught, nothing scores and the alarm never rises.
   */
  function step(dt, move, sneaking, tool, toolAt, harmless) {
    let events = 0;
    const player = state.player;

    if (state.caughtFreeze > 0) {
      state.caughtFreeze -= dt;
      if (state.caughtFreeze <= 0 && !state.over) {
        // Back on your feet at the entry, guards reset, the night goes on.
        state.caught = false;
        player.x = ENTRY.x;
        player.y = ENTRY.y;
        resetGuards(guards);
        resetCameras(cameras);
      }
      return events;
    }

    if (!harmless) state.elapsed += dt;
    if (state.noticeLeft > 0) state.noticeLeft -= dt;

    // Tools, before movement: a lure is thrown where the mouse points.
    if (!harmless && tool === 'lure') events |= throwLure(toolAt.x, toolAt.y);
    else if (!harmless && tool === 'smoke') events |= useSmoke();
    else if (!harmless && tool === 'emp') events |= useEmp();

    // Movement: walk or sneak, sliding along walls and cases.
    player.sneaking = sneaking;
    const speed = sneaking ? THIEF.sneakSpeed : THIEF.walkSpeed;
    if (move.x !== 0 || move.y !== 0) {
      const len = Math.hypot(move.x, move.y);
      const nx = (move.x / len) * speed * dt;
      const ny = (move.y / len) * speed * dt;
      const moved = resolveMove(player.x, player.y, THIEF.radius, nx, ny);
      player.x = moved.x;
      player.y = moved.y;
      player.facing = Math.atan2(move.y, move.x);
    }
    if (player.smoked > 0) player.smoked -= dt;

    // Loot: close enough to a case or plinth lifts the piece off it.
    if (!harmless) {
      for (const item of loot) {
        if (item.taken) continue;
        const dx = player.x - item.x;
        const dy = player.y - item.y;
        if (dx * dx + dy * dy < LOOT_REACH * LOOT_REACH) events |= takeLoot(item);
      }
    }

    // Smoke clouds fade where they were popped.
    for (let i = state.smokeClouds.length - 1; i >= 0; i -= 1) {
      state.smokeClouds[i].left -= dt;
      if (state.smokeClouds[i].left <= 0) state.smokeClouds.splice(i, 1);
    }
    for (let i = state.lures.length - 1; i >= 0; i -= 1) {
      state.lures[i].left -= dt;
      if (state.lures[i].left <= 0) state.lures.splice(i, 1);
    }

    // Guards and cameras watch. A smoked thief is invisible to both. On the title
    // screen's backdrop the thief is nowhere to be seen, so the guards just patrol.
    const thiefView = harmless
      ? { x: -9999, y: -9999, sneaking: false, smoked: true }
      : {
          x: player.x,
          y: player.y,
          sneaking: player.sneaking,
          smoked: player.smoked > 0,
        };
    const guardEvents = [];
    for (const guard of guards) stepGuard(guard, dt, thiefView, { lockdownLeft: state.lockdownLeft }, guardEvents);
    let cameraAlarm = 0;
    for (const camera of cameras) cameraAlarm += stepCamera(camera, dt, thiefView);

    // The alarm: rises while seen, chased or spotted; cools while hidden.
    if (!harmless) {
      if (state.lockdownLeft > 0) {
        state.lockdownLeft -= dt;
        state.alarm = 100;
        if (state.lockdownLeft <= 0) {
          state.alarm = ALARM.afterLockdown;
          setNotice('Lockdown lifted — but they are on edge now.');
        }
      } else {
        let rise = cameraAlarm;
        if (anyChasing(guards)) rise += ALARM.chaseRate;
        else if (anyAlerted(guards)) rise += ALARM.guardRate;
        if (rise > 0) state.alarm = Math.min(100, state.alarm + rise * dt);
        else state.alarm = Math.max(0, state.alarm - ALARM.decayRate * dt);
        if (state.alarm >= 100) {
          state.lockdownLeft = ALARM.lockdownSeconds;
          events |= EVENT_LOCKDOWN;
          setNotice('LOCKDOWN! Every guard is coming for you!');
        }
      }
    }

    // Spotted flash: a camera has the thief in frame right now.
    if (!harmless && anySpotting(cameras)) events |= EVENT_SPOTTED;

    // Caught: a chasing guard closes in.
    if (!harmless && !state.won) {
      const catcher = guardTouching(guards, player.x, player.y);
      if (catcher) {
        events |= getCaught(catcher);
        if (state.lives <= 0) {
          state.over = true;
          return events;
        }
      }
    }

    // The getaway: Star in hand, back at the entry door.
    if (!harmless && state.starTaken && !state.won) {
      const dx = player.x - EXIT.x;
      const dy = player.y - EXIT.y;
      if (dx * dx + dy * dy < EXIT_REACH * EXIT_REACH) events |= win();
    }

    return events;
  }

  reset();
  return {
    state,
    reset,
    step,
    throwLure,
    useSmoke,
    useEmp,
    /** Highest guard detection right now (0..1). */
    maxDetection() {
      return maxDetection(guards);
    },
    /** Loot pieces taken so far. */
    lootTaken() {
      return loot.filter((item) => item.taken).length;
    },
    lootTotal() {
      return loot.length;
    },
  };
}

/** Step the world with the same signature the starter's shots used (kept for clarity). */
export function stepWorld(world, dt, move, sneaking, tool, toolAt, harmless) {
  return world.step(dt, move, sneaking, tool, toolAt, harmless);
}

export { GUARD, STEP };
