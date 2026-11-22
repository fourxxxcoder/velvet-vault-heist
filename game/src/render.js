// The renderer: everything the player sees, painted on one canvas. The museum at night —
// dark floor, warm pools of light under the cases, velvet ropes, the vault glowing
// top-right — with the danger drawn plainly on top of it: guard cones in amber, camera
// cones in red, the thief in pale cream with a gold trim, the loot in gold, the Aurora
// Star in cyan. The layout is a 56px HUD strip across the top and the 1280x720 playfield
// scaled to fit beneath it, so nothing the game needs is ever hidden under the HUD. The
// HUD shows the alarm meter (the number that matters most), the loot taken, the tools
// left, the lives left and the clock. Every screen — title, play, paused, caught, win,
// game over — is drawn here from the same world, so a screenshot of any of them is the
// game itself.

import { FIELD, FONT, GUARD, PALETTE, THIEF } from './config.js';
import { CASES, ENTRY, EXIT, PILLARS, ROPES, VAULT, WALLS } from './levels.js';
import { conePolygon } from './vision.js';
import { cameraAngle } from './cameras.js';
import { GUARD_CHASE, GUARD_INVESTIGATE, GUARD_SUSPICIOUS } from './guards.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const HUD_HEIGHT = 56;
/** The playfield is scaled to fit under the HUD; this is its scale and x offset. */
const WORLD_SCALE = (FIELD.height - HUD_HEIGHT) / FIELD.height;
const WORLD_OFFSET_X = (FIELD.width - FIELD.width * WORLD_SCALE) / 2;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDiamond(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.7, -size * 0.2);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.7, -size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-size * 0.7, -size * 0.2);
  ctx.lineTo(size * 0.7, -size * 0.2);
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  ctx.stroke();
  ctx.restore();
}

function drawStar(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    const radius = i % 2 === 0 ? r : r * 0.35;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let lastScale = 1;
  let lastOffsetX = 0;
  let lastOffsetY = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }

  /** Set the transform so logical coordinates are the 1280x720 field. */
  function frame() {
    resize();
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const offsetX = (canvas.width - FIELD.width * scale) / 2;
    const offsetY = (canvas.height - FIELD.height * scale) / 2;
    lastScale = scale;
    lastOffsetX = offsetX;
    lastOffsetY = offsetY;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  }

  /** Convert a point in canvas CSS pixels to playfield coordinates, or null in the HUD. */
  function toWorld(cssX, cssY) {
    const rect = canvas.getBoundingClientRect();
    const logicalX = ((cssX - rect.left) / rect.width) * FIELD.width;
    const logicalY = ((cssY - rect.top) / rect.height) * FIELD.height;
    if (logicalY < HUD_HEIGHT) return null;
    return {
      x: (logicalX - WORLD_OFFSET_X) / WORLD_SCALE,
      y: (logicalY - HUD_HEIGHT) / WORLD_SCALE,
    };
  }

  function drawFloor(time) {
    const tile = 80;
    for (let y = 0; y < FIELD.height; y += tile) {
      for (let x = 0; x < FIELD.width; x += tile) {
        ctx.fillStyle = ((x + y) / tile) % 2 === 0 ? PALETTE.floorTile : PALETTE.floorTileAlt;
        ctx.fillRect(x, y, tile, tile);
      }
    }
    ctx.fillStyle = PALETTE.carpet;
    ctx.fillRect(600, 20, 80, 680);
    ctx.strokeStyle = PALETTE.carpetEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(600, 20, 80, 680);
    // The vault chamber's floor is colder and brighter.
    ctx.fillStyle = 'rgba(155,231,255,0.05)';
    ctx.fillRect(980, 20, 280, 280);
  }

  function drawWalls() {
    for (const wall of WALLS) {
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.fillStyle = PALETTE.wallTop;
      ctx.fillRect(wall.x, wall.y, wall.w, 4);
    }
    // Vault chamber door frame.
    ctx.fillStyle = PALETTE.vaultDoor;
    ctx.fillRect(956, 206, 28, 68);
    ctx.fillStyle = PALETTE.vaultGlow;
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('VAULT', 1140, 44);
  }

  function drawCases(time) {
    for (const c of CASES) {
      ctx.fillStyle = PALETTE.caseFrame;
      ctx.fillRect(c.x - 3, c.y - 3, c.w + 6, c.h + 6);
      ctx.fillStyle = 'rgba(127,179,213,0.22)';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = 'rgba(255,217,122,0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
      // A glint travelling across the glass.
      const glintX = c.x + ((time * 40 + c.x) % (c.w + 40)) - 20;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(glintX, c.y + 4, 8, c.h - 8);
    }
    // The vault pedestal.
    ctx.fillStyle = PALETTE.caseFrame;
    ctx.fillRect(VAULT.x - 3, VAULT.y - 3, VAULT.w + 6, VAULT.h + 6);
    ctx.fillStyle = 'rgba(155,231,255,0.18)';
    ctx.fillRect(VAULT.x, VAULT.y, VAULT.w, VAULT.h);
    ctx.strokeStyle = PALETTE.vaultGlow;
    ctx.lineWidth = 2;
    ctx.strokeRect(VAULT.x + 0.5, VAULT.y + 0.5, VAULT.w - 1, VAULT.h - 1);
  }

  function drawPillarsAndRopes() {
    for (const pillar of PILLARS) {
      ctx.fillStyle = PALETTE.pillar;
      ctx.beginPath();
      ctx.arc(pillar.x, pillar.y, pillar.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(pillar.x - 7, pillar.y - 7, pillar.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const rope of ROPES) {
      ctx.strokeStyle = PALETTE.rope;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(rope.x1, rope.y1);
      ctx.quadraticCurveTo((rope.x1 + rope.x2) / 2, Math.max(rope.y1, rope.y2) + 14, rope.x2, rope.y2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.ropePost;
      for (const [px, py] of [
        [rope.x1, rope.y1],
        [rope.x2, rope.y2],
      ]) {
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawExit(state, time) {
    const open = state.starTaken;
    const pulse = open ? 0.55 + 0.45 * Math.sin(time * 5) : 0.25;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = PALETTE.exit;
    ctx.fillRect(30, 664, 140, 30);
    ctx.restore();
    ctx.strokeStyle = PALETTE.exit;
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 664, 140, 30);
    ctx.fillStyle = PALETTE.exit;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(open ? 'EXIT — GO!' : 'EXIT', 100, 686);
  }

  function drawLoot(state, time) {
    for (const item of state.loot) {
      if (item.taken) continue;
      const bob = Math.sin(time * 2.4 + item.x) * 2;
      if (item.kind === 'auroraStar') {
        const glow = 0.5 + 0.3 * Math.sin(time * 3);
        ctx.save();
        ctx.globalAlpha = glow;
        ctx.fillStyle = PALETTE.diamond;
        ctx.beginPath();
        ctx.arc(item.x, item.y + bob, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawDiamond(ctx, item.x, item.y + bob, 16, PALETTE.diamond);
        drawStar(ctx, item.x - 22, item.y - 18 + bob, 5, '#ffffff');
        drawStar(ctx, item.x + 24, item.y + 14 + bob, 4, '#ffffff');
        ctx.fillStyle = PALETTE.diamond;
        ctx.font = `bold 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('AURORA STAR', item.x, item.y + 34 + bob);
      } else {
        drawDiamond(ctx, item.x, item.y + bob, 9, PALETTE.loot);
        ctx.fillStyle = PALETTE.loot;
        ctx.font = `11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`$${item.value}`, item.x, item.y + 24 + bob);
      }
    }
  }

  function drawCones(state) {
    for (const guard of state.guards) {
      const hot = guard.state === GUARD_CHASE || guard.state === GUARD_SUSPICIOUS;
      const poly = conePolygon(guard.x, guard.y, guard.facing, GUARD.visionRange, GUARD.visionHalfAngle);
      ctx.fillStyle = hot ? 'rgba(229,83,75,0.30)' : 'rgba(242,201,76,0.20)';
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = hot ? 'rgba(229,83,75,0.65)' : 'rgba(242,201,76,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const camera of state.cameras) {
      if (camera.offLeft > 0) continue;
      const angle = cameraAngle(camera);
      const poly = conePolygon(camera.x, camera.y, angle, 285, Math.PI / 6.4);
      ctx.fillStyle = camera.spotted > 0.4 ? 'rgba(229,83,75,0.38)' : 'rgba(229,83,75,0.16)';
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      ctx.strokeStyle = '#dfe6f2';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(guard.x, guard.y);
      ctx.lineTo(guard.x + Math.cos(guard.facing) * 20, guard.y + Math.sin(guard.facing) * 20);
      ctx.stroke();
      ctx.fillStyle = guard.state === GUARD_CHASE ? PALETTE.guardAlert : PALETTE.guard;
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, GUARD.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0d0f14';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#2c3444';
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, GUARD.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(guard.name, guard.x, guard.y - GUARD.radius - 8);
      if (guard.state === GUARD_CHASE) {
        ctx.fillStyle = PALETTE.guardAlert;
        ctx.font = `bold 13px ${FONT}`;
        ctx.fillText('!', guard.x, guard.y - GUARD.radius - 22);
      } else if (guard.state === GUARD_SUSPICIOUS || guard.state === GUARD_INVESTIGATE) {
        ctx.fillStyle = PALETTE.cone;
        ctx.font = `bold 13px ${FONT}`;
        ctx.fillText('?', guard.x, guard.y - GUARD.radius - 22);
      }
      if (guard.detection > 0.05) {
        ctx.strokeStyle = guard.detection > 0.8 ? PALETTE.guardAlert : PALETTE.cone;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(guard.x, guard.y, GUARD.radius + 6, -Math.PI / 2, -Math.PI / 2 + guard.detection * Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawCameras(state, time) {
    for (const camera of state.cameras) {
      const angle = cameraAngle(camera);
      const blink = camera.spotted > 0.4 ? (Math.sin(time * 12) > 0 ? 1 : 0.3) : 1;
      ctx.save();
      ctx.globalAlpha = camera.offLeft > 0 ? 0.4 : blink;
      ctx.translate(camera.x, camera.y);
      ctx.rotate(angle);
      ctx.fillStyle = PALETTE.camera;
      roundRect(ctx, -4, -6, 18, 12, 3);
      ctx.fill();
      ctx.fillStyle = camera.spotted > 0.4 ? PALETTE.guardAlert : '#222';
      ctx.beginPath();
      ctx.arc(16, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (camera.offLeft > 0) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `bold 10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('OFF', camera.x, camera.y + 24);
      }
    }
  }

  function drawThief(state) {
    const player = state.player;
    for (const cloud of state.smokeClouds) {
      ctx.fillStyle = 'rgba(154,163,178,0.35)';
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, 72, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const lure of state.lures) {
      ctx.strokeStyle = PALETTE.loot;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lure.x, lure.y, 8 + (1 - lure.left / 4) * 14, 0, Math.PI * 2);
      ctx.stroke();
      drawDiamond(ctx, lure.x, lure.y, 6, PALETTE.loot);
    }
    ctx.save();
    if (player.smoked > 0) ctx.globalAlpha = 0.55;
    ctx.fillStyle = PALETTE.thief;
    ctx.beginPath();
    ctx.arc(player.x, player.y, THIEF.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.thiefTrim;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = '#22242c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.facing) * (THIEF.radius + 4), player.y + Math.sin(player.facing) * (THIEF.radius + 4));
    ctx.stroke();
    ctx.fillStyle = '#22242c';
    ctx.fillRect(player.x - 8, player.y - 4, 16, 5);
    ctx.restore();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(player.sneaking ? 'Wren (sneaking)' : 'Wren', player.x, player.y - THIEF.radius - 8);
  }

  function drawHud(state, screen) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, FIELD.width, HUD_HEIGHT);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, HUD_HEIGHT - 1, FIELD.width, 1);

    const alarm = state.alarm;
    const alarmColor = alarm < 40 ? PALETTE.alarmLow : alarm < 75 ? PALETTE.alarmMid : PALETTE.alarmHigh;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('ALARM', 24, 24);
    ctx.fillStyle = '#0a0c10';
    roundRect(ctx, 24, 30, 260, 14, 7);
    ctx.fill();
    ctx.fillStyle = alarmColor;
    if (alarm > 0) {
      roundRect(ctx, 24, 30, Math.max(14, (260 * alarm) / 100), 14, 7);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(`${Math.round(alarm)}%`, 292, 43);
    if (state.lockdownLeft > 0) {
      ctx.fillStyle = PALETTE.alarmHigh;
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText('LOCKDOWN!', 340, 43);
    }

    const taken = state.loot.filter((item) => item.taken).length;
    ctx.fillStyle = PALETTE.loot;
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`$${state.score.toLocaleString('en-US')}`, 470, 26);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText(`loot ${taken}/${state.loot.length}${state.starTaken ? '  ★ STAR SECURED' : ''}`, 470, 44);

    ctx.fillStyle = PALETTE.text;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`Lures ${state.tools.lures}   Smoke ${state.tools.smoke}   EMP ${state.tools.emp}`, 760, 26);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `11px ${FONT}`;
    ctx.fillText('click/Q lure · E smoke · F EMP · Shift sneak', 760, 44);

    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`Lives ${state.lives}/3`, 1180, 26);
    const minutes = Math.floor(state.elapsed / 60);
    const seconds = Math.floor(state.elapsed % 60);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`${minutes}:${String(seconds).padStart(2, '0')}`, 1180, 44);
    ctx.textAlign = 'left';

    if (state.noticeLeft > 0 && screen === SCREEN_PLAY) {
      ctx.fillStyle = 'rgba(13,15,20,0.8)';
      const width = ctx.measureText(state.notice).width + 24;
      roundRect(ctx, (FIELD.width - width) / 2, HUD_HEIGHT + 8, width, 26, 13);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(state.notice, FIELD.width / 2, HUD_HEIGHT + 26);
      ctx.textAlign = 'left';
    }
  }

  function drawPanel(title, lines, accent) {
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, 340, 170, 600, 380, 16);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    roundRect(ctx, 340, 170, 600, 380, 16);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = `bold 44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, FIELD.width / 2, 235);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `17px ${FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, 278 + i * 28));
    ctx.textAlign = 'left';
  }

  function drawTitle(state, best) {
    drawPanel(
      'VELVET VAULT',
      [
        'One thief. One night. One diamond.',
        'Lift the Aurora Star from the Meridian Gallery',
        'and walk out the way you came in.',
        '',
        'WASD / arrows — move    Shift — sneak    Click / Q — throw a lure',
        'E — smoke pellet    F — EMP (kills cameras, feeds the alarm)',
        'Dodge the amber cones. Red cones are cameras. Fill the alarm and',
        'the museum locks down — every guard runs you down.',
        '',
        'Press SPACE to begin the heist',
      ],
      PALETTE.loot,
    );
    if (best > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`Best getaway so far: $${best.toLocaleString('en-US')}`, FIELD.width / 2, 530);
      ctx.textAlign = 'left';
    }
  }

  function drawPaused() {
    drawPanel('PAUSED', ['The gallery waits. The guards do not — quite.', '', 'Press P or SPACE to keep going'], PALETTE.muted);
  }

  function drawCaught(state) {
    drawPanel(
      'CAUGHT!',
      [state.notice, '', state.lives > 0 ? 'You slip the cuffs and duck back to the entry…' : '', state.lives > 0 ? 'The night goes on.' : ''],
      PALETTE.guardAlert,
    );
  }

  function drawWin(state, best) {
    const breakdown = state.winBreakdown ?? { timeBonus: 0, toolBonus: 0, lifeBonus: 0 };
    drawPanel(
      'CLEAN GETAWAY!',
      [
        'The Aurora Star is yours. Wren vanishes into the night',
        'with the Meridian Gallery none the wiser.',
        '',
        `Loot  $${state.score.toLocaleString('en-US')}  (time +$${breakdown.timeBonus}, tools +$${breakdown.toolBonus}, lives +$${breakdown.lifeBonus})`,
        `Best getaway: $${Math.max(best, state.score).toLocaleString('en-US')}`,
        '',
        'Press SPACE to run it again',
      ],
      PALETTE.exit,
    );
  }

  function drawOver(state, best) {
    drawPanel(
      'THE NIGHT IS OVER',
      [
        'Three times caught, three times the cuffs clicked shut.',
        'The Aurora Star stays in its case — this time.',
        '',
        `Loot kept: $${state.score.toLocaleString('en-US')}   Best: $${best.toLocaleString('en-US')}`,
        '',
        'Press SPACE to try again',
      ],
      PALETTE.guardAlert,
    );
  }

  /** Paint the world on `screen`, with `best` for the title and end screens. */
  function draw(state, screen, best, time) {
    frame();
    ctx.save();
    ctx.translate(WORLD_OFFSET_X, HUD_HEIGHT);
    ctx.scale(WORLD_SCALE, WORLD_SCALE);
    ctx.beginPath();
    ctx.rect(0, 0, FIELD.width, FIELD.height);
    ctx.clip();
    drawFloor(time);
    drawWalls();
    drawCases(time);
    drawPillarsAndRopes();
    drawExit(state, time);
    drawCones(state);
    drawLoot(state, time);
    drawCameras(state, time);
    drawGuards(state);
    drawThief(state);
    ctx.restore();
    drawHud(state, screen);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_CAUGHT) drawCaught(state);
    else if (screen === SCREEN_WIN) drawWin(state, best);
    else if (screen === SCREEN_OVER) drawOver(state, best);
  }

  return { draw, frame, toWorld };
}
