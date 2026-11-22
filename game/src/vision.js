// Seeing: what a guard or a camera can spot. A watcher sees the thief when the thief is
// inside its cone (range and angle) and nothing blocks the line of sight. This module
// knows nothing about guards or cameras — it just answers "can this watcher see that
// point, and how clearly", so guards, cameras and the autopilot all read the same truth.

import { blocksSight } from './levels.js';

/** Smallest absolute difference between two angles, in radians. */
export function angleDifference(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/**
 * How clearly watcher (x, y, facing, range, halfAngle) sees point (tx, ty): 0 when the
 * point is out of range, outside the cone or behind cover, otherwise 1 at point-blank
 * fading to 0 at the edge of the range. `smoked` hides the point entirely.
 */
export function visibility(x, y, facing, range, halfAngle, tx, ty, smoked) {
  if (smoked) return 0;
  const dx = tx - x;
  const dy = ty - y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return 0;
  if (dist > 1 && angleDifference(Math.atan2(dy, dx), facing) > halfAngle) return 0;
  if (blocksSight(x, y, tx, ty)) return 0;
  return 1 - dist / range;
}

/** The cone's outline as a polygon, for drawing: apex, arc points, back to apex. */
export function conePolygon(x, y, facing, range, halfAngle, steps = 14) {
  const points = [{ x, y }];
  for (let i = 0; i <= steps; i += 1) {
    const angle = facing - halfAngle + (2 * halfAngle * i) / steps;
    points.push({ x: x + Math.cos(angle) * range, y: y + Math.sin(angle) * range });
  }
  return points;
}
