// Velvet Vault — every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends on
// the screen size. The museum is one floor: entry at the bottom-left, the vault holding
// the Aurora Star top-right, three guards and three cameras between them.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const THIEF = {
  radius: 13,
  walkSpeed: 175,
  sneakSpeed: 88,
  /** Seconds a caught thief is frozen on the caught screen before play resumes. */
  caughtFreeze: 1.6,
};

export const LIVES = 3;

export const GUARD = {
  radius: 14,
  patrolSpeed: 72,
  suspiciousSpeed: 105,
  chaseSpeed: 152,
  lockdownSpeed: 172,
  /** Vision range and half-angle of the cone. */
  visionRange: 245,
  visionHalfAngle: Math.PI / 5.2,
  /** Detection fills 0..1 this fast at point-blank range; it scales with closeness. */
  detectRate: 1.35,
  /** Detection drains this fast while the thief is unseen. */
  forgetRate: 0.45,
  /** At this alert a guard stops and stares; at 1 it chases. */
  suspiciousAt: 0.55,
  /** Catch radius: closer than this while chasing and the thief is caught. */
  catchRadius: 26,
  /** Seconds a guard keeps hunting the last seen spot before giving up. */
  huntSeconds: 3.5,
};

export const CAMERA = {
  visionRange: 285,
  visionHalfAngle: Math.PI / 6.4,
  /** Alarm points per second while a camera watches the thief. */
  alarmRate: 15,
  /** Seconds a camera stays dead after an EMP pulse. */
  empOffSeconds: 10,
};

export const ALARM = {
  /** Points per second while any guard is suspicious or worse. */
  guardRate: 7,
  /** Points per second while any guard chases. */
  chaseRate: 11,
  /** Points per second the alarm cools down while nobody sees the thief. */
  decayRate: 2.5,
  /** Alarm added the moment an EMP pulse fires (it is loud). */
  empSpike: 8,
  /** Seconds a full alarm locks the museum down before it eases off. */
  lockdownSeconds: 6,
  /** Alarm the meter drops to when a lockdown ends. */
  afterLockdown: 55,
  /** Alarm the meter is set to after the thief is caught. */
  afterCaught: 45,
};

/** The thief's tools, each with a cost in count, not in score: use them or lose them. */
export const TOOLS = {
  lures: 3,
  smoke: 2,
  emp: 1,
  /** Seconds a thrown lure holds a guard's attention at the landing spot. */
  lureSeconds: 4,
  /** How far a lure's clink carries: guards inside this radius come to look. */
  lureHearing: 320,
  /** Seconds a smoke pellet hides the thief. */
  smokeSeconds: 3.5,
  /** Radius of the smoke cloud. */
  smokeRadius: 72,
};

/** Loot values in dollars. The Aurora Star is the job; the rest is gravy. */
export const LOOT_VALUES = {
  goldBars: 300,
  jadeStatue: 400,
  painting: 350,
  necklace: 450,
  coinChest: 300,
  tiara: 500,
  auroraStar: 5000,
};

/** Win bonus: up to this many dollars for a fast, clean getaway. */
export const WIN_BONUS = { timeParSeconds: 300, perSecond: 10, perToolLeft: 150, perLifeLeft: 500 };

export const PALETTE = {
  backdrop: '#0d0f14',
  floor: '#1a1d27',
  floorTile: '#20242f',
  floorTileAlt: '#1d212c',
  carpet: '#3a2330',
  carpetEdge: '#6b3a4a',
  wall: '#2e3442',
  wallTop: '#3d4557',
  caseGlass: '#7fb3d5',
  caseFrame: '#8a6d3b',
  caseGlow: '#ffd97a',
  pillar: '#4a5162',
  rope: '#a33348',
  ropePost: '#c9a227',
  vaultDoor: '#5a4632',
  vaultGlow: '#9be7ff',
  thief: '#e8e4d8',
  thiefTrim: '#c9a227',
  guard: '#5b7fa6',
  guardAlert: '#e5534b',
  cone: '#f2c94c',
  coneHot: '#e5534b',
  camera: '#8b93a3',
  cameraCone: '#e5534b',
  loot: '#ffd97a',
  diamond: '#9be7ff',
  exit: '#58b368',
  smoke: '#9aa3b2',
  text: '#eef1f5',
  muted: '#9aa3b2',
  panel: '#171a22',
  alarmLow: '#58b368',
  alarmMid: '#f2c94c',
  alarmHigh: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best getaway score is kept between visits (this browser only). */
export const BEST_KEY = 'velvet-vault.best';
