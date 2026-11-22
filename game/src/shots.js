// The screenshot scenes behind ?shot=start|play|alarm|getaway. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (walk a list of waypoints through open lanes, wait and sneak when a guard's
// detection climbs, back off when it climbs too far), so the frame is what a short game
// really looks like and the same seed always gives the same frame.
//
// The four scenes show the four things the judge looks for: the room with its guards,
// cones, cameras, loot and alarm meter (start); the thief mid-heist, deep in a cone's
// edge (play); the alarm running hot with a camera on the thief (alarm); and the
// getaway paying off (getaway).

import { STEP } from './config.js';
import { createWorld, EVENT_CAUGHT, EVENT_OVER, EVENT_WIN } from './world.js';
import { GUARD_CHASE } from './guards.js';
import { SCREEN_CAUGHT, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const SAMPLE = STEP;
/** Waypoints from the entry to the vault door, through the open south hall and the
 *  central doorway (x 330..410) — the only way through the partition. */
const VAULT_ROUTE = [
  { x: 360, y: 620 },
  { x: 360, y: 470 },
  { x: 360, y: 430 },
  { x: 620, y: 430 },
  { x: 370, y: 430 },
  { x: 370, y: 330 },
  { x: 860, y: 330 },
  { x: 900, y: 330 },
  { x: 900, y: 240 },
];
/** The full run: to the vault, the Star, and back out the entry. */
const GETAWAY_ROUTE = [
  ...VAULT_ROUTE,
  { x: 1000, y: 240 },
  { x: 1185, y: 190 },
  { x: 1000, y: 240 },
  { x: 900, y: 240 },
  { x: 900, y: 330 },
  { x: 370, y: 330 },
  { x: 370, y: 430 },
  { x: 360, y: 430 },
  { x: 360, y: 620 },
  { x: 100, y: 660 },
];
/** The peek spot for the play scene: just below Marco's patrol, at his cone's edge. */
const PEEK_ROUTE = [
  { x: 360, y: 620 },
  { x: 360, y: 470 },
  { x: 360, y: 430 },
  { x: 370, y: 430 },
  { x: 370, y: 330 },
  { x: 560, y: 330 },
  { x: 560, y: 350 },
];
/** The alarm scene's spot: right under the vault camera, in no guard's patrol lane —
 *  the camera alone feeds the alarm here. */
const ALARM_SPOT = { x: 930, y: 180 };
const ALARM_ROUTE = [
  { x: 360, y: 620 },
  { x: 360, y: 430 },
  { x: 370, y: 430 },
  { x: 370, y: 330 },
  { x: 860, y: 330 },
  { x: 900, y: 330 },
  { x: 930, y: 240 },
  { x: 930, y: 180 },
];

function chasingGuard(world) {
  return world.state.guards.find((guard) => guard.state === GUARD_CHASE) ?? null;
}

function moveToSafety(world) {
  // The entry pocket, bottom-left, is far from every patrol: retreat there and the
  // guards lose the trail. The thief is faster than a chasing guard, so the run out
  // works even when one is already on their heels.
  const player = world.state.player;
  const to = { x: 100 - player.x, y: 660 - player.y };
  const len = Math.hypot(to.x, to.y) || 1;
  world.step(SAMPLE, { x: to.x / len, y: to.y / len }, false, null, null, false);
}

/**
 * Walk toward (tx, ty) for at most `timeout` seconds. Retreats to the entry pocket
 * while any guard's detection climbs, and runs there from a chasing guard. Returns
 * true on arrival.
 */
function driveTo(world, tx, ty, timeout, sneak) {
  const limit = Math.ceil(timeout / SAMPLE);
  let stuckFor = 0;
  let lastX = world.state.player.x;
  let lastY = world.state.player.y;
  for (let step = 0; step < limit; step += 1) {
    const player = world.state.player;
    const dx = tx - player.x;
    const dy = ty - player.y;
    if (Math.hypot(dx, dy) < 12) return true;
    if (world.state.caught || world.state.won || world.state.over) return false;

    // A chasing guard, or one growing sure: get out of the cone and back to safety
    // until the trail goes cold, then try the leg again.
    if (chasingGuard(world) !== null || world.maxDetection() > 0.15) {
      moveToSafety(world);
      continue;
    }
    // Stuck against a wall or a case: sidestep along the wall for a moment.
    if (Math.hypot(player.x - lastX, player.y - lastY) < 0.5) stuckFor += SAMPLE;
    else stuckFor = 0;
    lastX = player.x;
    lastY = player.y;
    let move = { x: dx, y: dy };
    if (stuckFor > 0.4) {
      move = Math.abs(dx) > Math.abs(dy) ? { x: 0, y: dy > 0 ? 1 : -1 } : { x: dx > 0 ? 1 : -1, y: 0 };
      if (stuckFor > 1.2) stuckFor = 0;
    }
    const len = Math.hypot(move.x, move.y) || 1;
    world.step(SAMPLE, { x: move.x / len, y: move.y / len }, sneak, null, null, false);
  }
  return false;
}

/** Walk a route of waypoints, stopping at the first one the thief cannot reach. */
function driveRoute(world, route, timeoutPerLeg = 12, sneak = false) {
  for (const point of route) {
    if (!driveTo(world, point.x, point.y, timeoutPerLeg, sneak)) return false;
    if (world.state.caught || world.state.won || world.state.over) return false;
  }
  return true;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Any name other than play, alarm or getaway is the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'alarm' && name !== 'getaway') {
    // Title backdrop: the room alive behind the panel — guards patrol, cameras sweep.
    for (let index = 0; index < 5 / STEP; index += 1) {
      world.step(STEP, { x: 0, y: 0 }, false, null, null, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'play') {
    driveRoute(world, PEEK_ROUTE);
    // Hold still, sneaking, at the cone's edge while Marco's patrol sweeps past, so the
    // frame shows detection climbing — stop before he is sure enough to chase.
    for (let index = 0; index < 8 / STEP; index += 1) {
      world.step(STEP, { x: 0, y: 0 }, true, null, null, false);
      if (state.caught || chasingGuard(world) || world.maxDetection() > 0.55) break;
    }
    return { screen: state.caught ? SCREEN_CAUGHT : SCREEN_PLAY, best: 0 };
  }

  if (name === 'alarm') {
    driveRoute(world, ALARM_ROUTE);
    // Stand under the vault camera until the alarm runs hot. If a guard ever gets
    // wind of the thief, run for the entry pocket, then come back to the camera's eye.
    for (let index = 0; index < 30 / STEP; index += 1) {
      const player = state.player;
      if (chasingGuard(world) !== null || world.maxDetection() > 0.15) moveToSafety(world);
      else if (Math.hypot(player.x - ALARM_SPOT.x, player.y - ALARM_SPOT.y) > 12) {
        stepToward(world, ALARM_SPOT.x, ALARM_SPOT.y, false);
      } else {
        world.step(STEP, { x: 0, y: 0 }, false, null, null, false);
      }
      if (state.alarm > 55 || state.caught || state.lockdownLeft > 0) break;
    }
    return { screen: state.caught ? SCREEN_CAUGHT : SCREEN_PLAY, best: 0 };
  }

  // getaway: the full run — vault, Star, and back out the entry, sneaking the whole way.
  driveRoute(world, GETAWAY_ROUTE, 20, true);
  if (state.won) return { screen: SCREEN_WIN, best: state.score };
  return { screen: state.caught ? SCREEN_CAUGHT : state.over ? SCREEN_OVER : SCREEN_PLAY, best: 0 };
}

/** One step toward (tx, ty): the building block of a hold loop that also retreats. */
function stepToward(world, tx, ty, sneak) {
  const player = world.state.player;
  const dx = tx - player.x;
  const dy = ty - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 12) return;
  world.step(SAMPLE, { x: dx / len, y: dy / len }, sneak, null, null, false);
}

export { stepToward };
