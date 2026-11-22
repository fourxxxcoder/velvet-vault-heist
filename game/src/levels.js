// The Meridian Gallery: one floor, three ways in. The thief enters at the bottom-left,
// the Aurora Star sits in the vault top-right, and between them are the north hall, the
// central hall and the vault corridor — three routes, each watched differently. Walls and
// display cases block both movement and sight; pillars block sight and movement; velvet
// ropes are decoration only, the thief steps over them.
//
// Geometry here is data: every rectangle is {x, y, w, h}, every circle {x, y, r}. The
// helpers below answer the two questions the rest of the game asks: can a circle stand
// here, and can two points see each other.

export const ENTRY = { x: 100, y: 660 };
export const EXIT = { x: 100, y: 690 };

/** Outer walls and the vault partition (door gap left open). */
export const WALLS = [
  { x: 0, y: 0, w: 1280, h: 20 }, // top
  { x: 0, y: 700, w: 1280, h: 20 }, // bottom
  { x: 0, y: 0, w: 20, h: 720 }, // left
  { x: 1260, y: 0, w: 20, h: 720 }, // right
  // Vault partition: the vault chamber is x 980..1260, y 20..300; the door is y 210..270.
  { x: 960, y: 20, w: 20, h: 190 },
  { x: 960, y: 270, w: 20, h: 30 },
  // Central partition between the north and south halls; the doorway is x 330..410.
  { x: 20, y: 380, w: 310, h: 20 },
  { x: 410, y: 380, w: 550, h: 20 },
];

/** Display cases: glass-topped plinths that block movement and sight. */
export const CASES = [
  { x: 300, y: 120, w: 140, h: 60, label: 'gold bars' },
  { x: 560, y: 120, w: 140, h: 60, label: 'jade statue' },
  { x: 150, y: 470, w: 160, h: 60, label: 'painting' },
  { x: 600, y: 500, w: 160, h: 60, label: 'necklace' },
  { x: 1020, y: 60, w: 70, h: 70, label: 'tiara' },
];

/** Pillars: round cover in the open halls. */
export const PILLARS = [
  { x: 480, y: 260, r: 26 },
  { x: 820, y: 260, r: 26 },
  { x: 480, y: 560, r: 26 },
  { x: 820, y: 560, r: 26 },
];

/** Velvet ropes: pure decoration, drawn as sagging red lines between brass posts. */
export const ROPES = [
  { x1: 280, y1: 210, x2: 460, y2: 210 },
  { x1: 540, y1: 210, x2: 720, y2: 210 },
  { x1: 130, y1: 560, x2: 330, y2: 560 },
  { x1: 580, y1: 590, x2: 780, y2: 590 },
];

/** The vault: a glowing pedestal at the back of the vault chamber. */
export const VAULT = { x: 1140, y: 120, w: 90, h: 60 };

/** Loot on the floor plan. `at` is the case or pedestal it sits on; the diamond is the job. */
export const LOOT_SPOTS = [
  { id: 'goldBars', name: 'Gold bars', value: 300, x: 370, y: 150, kind: 'goldBars' },
  { id: 'jadeStatue', name: 'Jade statue', value: 400, x: 630, y: 150, kind: 'jadeStatue' },
  { id: 'painting', name: 'Duchess portrait', value: 350, x: 230, y: 500, kind: 'painting' },
  { id: 'necklace', name: 'Ruby necklace', value: 450, x: 680, y: 530, kind: 'necklace' },
  { id: 'coinChest', name: 'Coin chest', value: 300, x: 900, y: 620, kind: 'coinChest' },
  { id: 'tiara', name: 'Sapphire tiara', value: 500, x: 1055, y: 95, kind: 'tiara' },
  { id: 'auroraStar', name: 'The Aurora Star', value: 5000, x: 1185, y: 150, kind: 'auroraStar' },
];

/** Guard patrols: named guards, each walking a loop of waypoints. */
export const GUARD_PATROLS = [
  {
    name: 'Marco',
    waypoints: [
      { x: 250, y: 310 },
      { x: 700, y: 310 },
      { x: 700, y: 200 },
      { x: 250, y: 200 },
    ],
  },
  {
    name: 'Vera',
    waypoints: [
      { x: 900, y: 450 },
      { x: 900, y: 620 },
      { x: 1150, y: 620 },
      { x: 1150, y: 450 },
    ],
  },
  {
    name: 'Otto',
    waypoints: [
      { x: 120, y: 450 },
      { x: 420, y: 450 },
      { x: 420, y: 560 },
      { x: 120, y: 560 },
    ],
  },
];

/** CCTV cameras: fixed to a wall, sweeping a cone between two angles (radians). */
export const CAMERA_SPOTS = [
  { name: 'Vault cam', x: 930, y: 40, baseAngle: Math.PI / 2, sweep: 0.9, speed: 0.45 },
  { name: 'Hall cam', x: 640, y: 34, baseAngle: Math.PI / 2, sweep: 1.1, speed: 0.35 },
  { name: 'West cam', x: 34, y: 430, baseAngle: 0, sweep: 1.0, speed: 0.5 },
];

/** Every solid rectangle: walls and cases together. */
export const SOLIDS = [...WALLS, ...CASES];

/** Every sight-blocking shape: solids plus pillars. */
export function blocksSight(x1, y1, x2, y2) {
  for (const rect of SOLIDS) {
    if (segmentHitsRect(x1, y1, x2, y2, rect)) return true;
  }
  for (const pillar of PILLARS) {
    if (segmentHitsCircle(x1, y1, x2, y2, pillar)) return true;
  }
  return false;
}

/** Can a circle of radius `r` stand at (x, y) without overlapping a solid or a pillar? */
export function standsFree(x, y, r) {
  for (const rect of SOLIDS) {
    if (circleHitsRect(x, y, r, rect)) return false;
  }
  for (const pillar of PILLARS) {
    const dx = x - pillar.x;
    const dy = y - pillar.y;
    if (dx * dx + dy * dy < (r + pillar.r) * (r + pillar.r)) return false;
  }
  return true;
}

/** Push a circle out of every solid it overlaps, one axis at a time (slide along walls). */
export function resolveMove(x, y, r, dx, dy) {
  let nx = x + dx;
  if (standsFree(nx, y, r)) x = nx;
  else {
    // Try sliding: nudge along x in smaller steps so corners do not snag.
    const step = dx > 0 ? 1 : -1;
    while (dx !== 0 && standsFree(x + step, y, r)) {
      x += step;
      dx -= step;
    }
  }
  let ny = y + dy;
  if (standsFree(x, ny, r)) y = ny;
  else {
    const step = dy > 0 ? 1 : -1;
    while (dy !== 0 && standsFree(x, y + step, r)) {
      y += step;
      dy -= step;
    }
  }
  return { x, y };
}

function circleHitsRect(cx, cy, r, rect) {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < r * r;
}

function segmentHitsRect(x1, y1, x2, y2, rect) {
  // Trivial reject: both ends on one outside side.
  if (x1 < rect.x && x2 < rect.x) return false;
  if (x1 > rect.x + rect.w && x2 > rect.x + rect.w) return false;
  if (y1 < rect.y && y2 < rect.y) return false;
  if (y1 > rect.y + rect.h && y2 > rect.y + rect.h) return false;
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
  return (
    segmentsCross(x1, y1, x2, y2, rect.x, rect.y, rect.x + rect.w, rect.y) ||
    segmentsCross(x1, y1, x2, y2, rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h) ||
    segmentsCross(x1, y1, x2, y2, rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h) ||
    segmentsCross(x1, y1, x2, y2, rect.x, rect.y + rect.h, rect.x, rect.y)
  );
}

function segmentHitsCircle(x1, y1, x2, y2, circle) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ox = x1 - circle.x;
    const oy = y1 - circle.y;
    return ox * ox + oy * oy < circle.r * circle.r;
  }
  let t = ((circle.x - x1) * dx + (circle.y - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx - circle.x;
  const py = y1 + t * dy - circle.y;
  return px * px + py * py < circle.r * circle.r;
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = side(dx, dy, cx, cy, ax, ay);
  const d2 = side(dx, dy, cx, cy, bx, by);
  const d3 = side(bx, by, ax, ay, cx, cy);
  const d4 = side(bx, by, ax, ay, dx, dy);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function side(px, py, qx, qy, rx, ry) {
  return (rx - px) * (qy - py) - (ry - py) * (qx - px);
}
