// Guard AI: three named guards walk their patrol loops, watch with vision cones, and
// react in four states. PATROL walks the loop. SUSPICIOUS stops, stares at the last seen
// spot and walks toward it. CHASE runs the thief down. INVESTIGATE walks to a lure's
// landing spot and looks around. Detection fills while the thief is seen and drains while
// hidden; a guard that loses the thief hunts the last seen spot, then walks back to patrol.

import { GUARD } from './config.js';
import { GUARD_PATROLS, resolveMove } from './levels.js';
import { angleDifference, visibility } from './vision.js';

export const GUARD_PATROL = 'patrol';
export const GUARD_SUSPICIOUS = 'suspicious';
export const GUARD_CHASE = 'chase';
export const GUARD_INVESTIGATE = 'investigate';

export function createGuards() {
  return GUARD_PATROLS.map((patrol, index) => {
    const start = patrol.waypoints[0];
    return {
      name: patrol.name,
      x: start.x,
      y: start.y,
      facing: Math.PI / 2,
      waypointIndex: 1,
      waypoints: patrol.waypoints,
      state: GUARD_PATROL,
      /** 0..1: how sure this guard is that someone is there. */
      detection: 0,
      /** Where the guard last saw (or heard) the thief. */
      lastSeen: null,
      huntLeft: 0,
      investigateLeft: 0,
      lookLeft: 0,
      lookFrom: 0,
      lookTo: 0,
      index,
    };
  });
}

function angleTo(fromX, fromY, toX, toY) {
  return Math.atan2(toY - fromY, toX - fromX);
}

function turnToward(guard, targetAngle, dt, rate) {
  let diff = targetAngle - guard.facing;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  guard.facing += step;
}

function moveToward(guard, tx, ty, speed, dt) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return true;
  const step = Math.min(dist, speed * dt);
  const moved = resolveMove(guard.x, guard.y, GUARD.radius, (dx / dist) * step, (dy / dist) * step);
  guard.x = moved.x;
  guard.y = moved.y;
  guard.facing = angleTo(guard.x, guard.y, tx, ty);
  return dist - step < 6;
}

/**
 * One guard, one step. `thief` is {x, y, sneaking, smoked}; `alarm` is the world's alarm
 * object (only its lockdown flag is read here); `events` collects what happened.
 * Returns nothing; the guard's state is mutated in place.
 */
export function stepGuard(guard, dt, thief, alarm, events) {
  const seen = visibility(
    guard.x,
    guard.y,
    guard.facing,
    GUARD.visionRange,
    GUARD.visionHalfAngle,
    thief.x,
    thief.y,
    thief.smoked,
  );
  const sneakFactor = thief.sneaking ? 0.5 : 1;
  if (seen > 0) {
    guard.detection = Math.min(1, guard.detection + seen * GUARD.detectRate * sneakFactor * dt);
    guard.lastSeen = { x: thief.x, y: thief.y };
    guard.huntLeft = GUARD.huntSeconds;
  } else {
    guard.detection = Math.max(0, guard.detection - GUARD.forgetRate * dt);
    if (guard.huntLeft > 0) guard.huntLeft -= dt;
  }

  const lockdown = alarm.lockdownLeft > 0;

  if (guard.state === GUARD_INVESTIGATE) {
    guard.investigateLeft -= dt;
    if (guard.lastSeen) {
      const arrived = moveToward(guard, guard.lastSeen.x, guard.lastSeen.y, GUARD.patrolSpeed, dt);
      if (arrived || guard.investigateLeft <= 0) {
        guard.state = GUARD_PATROL;
        guard.lookLeft = 1.2;
        guard.lookFrom = guard.facing - 1.1;
        guard.lookTo = guard.facing + 1.1;
      }
    }
    if (guard.detection >= 1) guard.state = GUARD_CHASE;
    return;
  }

  if (lockdown || guard.detection >= 1) {
    if (guard.state !== GUARD_CHASE) events.push({ type: 'chase', guard: guard.name });
    guard.state = GUARD_CHASE;
    const target = guard.lastSeen ?? { x: thief.x, y: thief.y };
    const speed = lockdown ? GUARD.lockdownSpeed : GUARD.chaseSpeed;
    moveToward(guard, target.x, target.y, speed, dt);
    if (guard.detection < 0.25 && guard.huntLeft <= 0 && !lockdown) {
      guard.state = GUARD_SUSPICIOUS;
      guard.lookLeft = 1.5;
      guard.lookFrom = guard.facing - 1.2;
      guard.lookTo = guard.facing + 1.2;
    }
    return;
  }

  if (guard.detection >= GUARD.suspiciousAt) {
    if (guard.state !== GUARD_SUSPICIOUS) events.push({ type: 'suspicious', guard: guard.name });
    guard.state = GUARD_SUSPICIOUS;
    if (guard.lastSeen) {
      turnToward(guard, angleTo(guard.x, guard.y, guard.lastSeen.x, guard.lastSeen.y), dt, 6);
      const arrived = moveToward(guard, guard.lastSeen.x, guard.lastSeen.y, GUARD.suspiciousSpeed, dt);
      if (arrived) {
        guard.lookLeft = 1.5;
        guard.lookFrom = guard.facing - 1.2;
        guard.lookTo = guard.facing + 1.2;
        guard.lastSeen = null;
      }
    }
    return;
  }

  // Patrol: walk the loop, pausing at each waypoint to look around.
  guard.state = GUARD_PATROL;
  if (guard.lookLeft > 0) {
    guard.lookLeft -= dt;
    const t = 1 - Math.max(0, guard.lookLeft) / 1.5;
    guard.facing = guard.lookFrom + (guard.lookTo - guard.lookFrom) * (t < 0.5 ? t * 2 : 2 - t * 2);
    return;
  }
  const target = guard.waypoints[guard.waypointIndex];
  const arrived = moveToward(guard, target.x, target.y, GUARD.patrolSpeed, dt);
  if (arrived) {
    guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
    guard.lookLeft = 1.1;
    guard.lookFrom = guard.facing - 0.9;
    guard.lookTo = guard.facing + 0.9;
  }
}

/** Send a guard to investigate a sound at (x, y): only guards that hear it go. */
export function sendToInvestigate(guard, x, y, seconds) {
  if (guard.state === GUARD_CHASE) return;
  guard.state = GUARD_INVESTIGATE;
  guard.lastSeen = { x, y };
  guard.investigateLeft = seconds;
  guard.detection = Math.max(guard.detection, 0.3);
}

/** Put every guard back on patrol, detection cleared (a fresh start, or after a catch). */
export function resetGuards(guards) {
  for (const guard of guards) {
    const start = guard.waypoints[0];
    guard.x = start.x;
    guard.y = start.y;
    guard.facing = Math.PI / 2;
    guard.waypointIndex = 1;
    guard.state = GUARD_PATROL;
    guard.detection = 0;
    guard.lastSeen = null;
    guard.huntLeft = 0;
    guard.investigateLeft = 0;
    guard.lookLeft = 0;
  }
}

/** Highest detection across the guards: the number the HUD's "eyes on you" bar shows. */
export function maxDetection(guards) {
  let top = 0;
  for (const guard of guards) top = Math.max(top, guard.detection);
  return top;
}

/** True when any guard is close enough to grab the thief. */
export function guardTouching(guards, x, y) {
  for (const guard of guards) {
    if (guard.state !== GUARD_CHASE) continue;
    const dx = guard.x - x;
    const dy = guard.y - y;
    if (dx * dx + dy * dy < GUARD.catchRadius * GUARD.catchRadius) return guard;
  }
  return null;
}

/** True when any guard is chasing (used by the alarm and the HUD). */
export function anyChasing(guards) {
  return guards.some((guard) => guard.state === GUARD_CHASE);
}

/** True when any guard is suspicious or worse. */
export function anyAlerted(guards) {
  return guards.some((guard) => guard.state !== GUARD_PATROL && guard.state !== GUARD_INVESTIGATE);
}

export { angleDifference };
