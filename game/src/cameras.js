// CCTV cameras: fixed to a wall, sweeping a cone back and forth. A camera never chases
// and never catches — it watches, and while it watches the thief the alarm climbs. An EMP
// pulse knocks every camera out for a while; a camera that is off sweeps nothing and sees
// nothing. `spotted` is the fraction of a second the camera has had eyes on the thief,
// which the renderer flashes red.

import { CAMERA } from './config.js';
import { CAMERA_SPOTS } from './levels.js';
import { visibility } from './vision.js';

export function createCameras() {
  return CAMERA_SPOTS.map((spot) => ({
    name: spot.name,
    x: spot.x,
    y: spot.y,
    baseAngle: spot.baseAngle,
    sweep: spot.sweep,
    speed: spot.speed,
    /** -1..1: where the sweep is now; the angle is base + phase * sweep. */
    phase: -1,
    phaseDirection: 1,
    /** Seconds left switched off by an EMP (0 means live). */
    offLeft: 0,
    /** 0..1: how steadily this camera has the thief in frame. */
    spotted: 0,
  }));
}

export function cameraAngle(camera) {
  return camera.baseAngle + camera.phase * camera.sweep;
}

/**
 * One camera, one step. Returns the alarm points per second this camera adds while it
 * has the thief in frame (0 when it cannot see the thief or is switched off).
 */
export function stepCamera(camera, dt, thief) {
  if (camera.offLeft > 0) {
    camera.offLeft = Math.max(0, camera.offLeft - dt);
    camera.spotted = 0;
    return 0;
  }
  camera.phase += camera.phaseDirection * camera.speed * dt;
  if (camera.phase > 1) {
    camera.phase = 1;
    camera.phaseDirection = -1;
  } else if (camera.phase < -1) {
    camera.phase = -1;
    camera.phaseDirection = 1;
  }
  const seen = visibility(
    camera.x,
    camera.y,
    cameraAngle(camera),
    CAMERA.visionRange,
    CAMERA.visionHalfAngle,
    thief.x,
    thief.y,
    thief.smoked,
  );
  if (seen > 0) {
    camera.spotted = Math.min(1, camera.spotted + dt * 2);
    return CAMERA.alarmRate * seen;
  }
  camera.spotted = Math.max(0, camera.spotted - dt * 2);
  return 0;
}

/** Switch every camera off for `seconds` (the EMP pulse). */
export function switchOffAll(cameras, seconds) {
  for (const camera of cameras) {
    camera.offLeft = seconds;
    camera.spotted = 0;
  }
}

/** True while any camera has the thief in frame. */
export function anySpotting(cameras) {
  return cameras.some((camera) => camera.spotted > 0.4);
}

/** Put every camera back to its starting sweep, switched on. */
export function resetCameras(cameras) {
  for (const camera of cameras) {
    camera.phase = -1;
    camera.phaseDirection = 1;
    camera.offLeft = 0;
    camera.spotted = 0;
  }
}
