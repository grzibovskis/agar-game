import { WORLD_HEIGHT, WORLD_WIDTH } from "@/components/cell/logic/constants";

export const MAIN_TO_LAB_PORTAL = {
  x: WORLD_WIDTH - 190,
  y: WORLD_HEIGHT / 2,
  radius: 56,
};

const LAB_BOUNDS = {
  x: 420,
  y: 420,
  w: 2500,
  h: 1600,
};

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wallRect(x, y, w, h) {
  return { x, y, w, h };
}

function movingWall(x, y, w, h, cycleMs, closedMs, phaseMs, dangerousPenalty = 0) {
  return {
    rect: wallRect(x, y, w, h),
    cycleMs,
    closedMs,
    phaseMs,
    dangerousPenalty,
  };
}

export function createLabyrinthState() {
  const B = LAB_BOUNDS;
  const t = 34;

  return {
    bounds: B,
    start: { x: B.x + 120, y: B.y + B.h / 2 },
    returnPos: { x: WORLD_WIDTH - 340, y: WORLD_HEIGHT / 2 },
    endPortals: [
      { id: "to-main", x: B.x + B.w - 130, y: B.y + B.h * 0.32, radius: 46, label: "Main" },
      { id: "to-next", x: B.x + B.w - 130, y: B.y + B.h * 0.68, radius: 46, label: "Next" },
    ],
    staticWalls: [
      wallRect(B.x, B.y, B.w, t),
      wallRect(B.x, B.y + B.h - t, B.w, t),
      wallRect(B.x, B.y, t, B.h),
      wallRect(B.x + B.w - t, B.y, t, B.h),

      wallRect(B.x + 240, B.y + 160, 34, 1180),
      wallRect(B.x + 520, B.y + 60, 34, 980),
      wallRect(B.x + 820, B.y + 520, 34, 1040),
      wallRect(B.x + 1120, B.y + 60, 34, 920),
      wallRect(B.x + 1420, B.y + 520, 34, 1040),
      wallRect(B.x + 1720, B.y + 60, 34, 920),
      wallRect(B.x + 2020, B.y + 520, 34, 1040),

      wallRect(B.x + 300, B.y + 310, 470, 30),
      wallRect(B.x + 920, B.y + 300, 390, 30),
      wallRect(B.x + 1540, B.y + 310, 330, 30),

      wallRect(B.x + 300, B.y + 1170, 390, 30),
      wallRect(B.x + 840, B.y + 1090, 470, 30),
      wallRect(B.x + 1520, B.y + 1170, 390, 30),
    ],
    movingWalls: [
      movingWall(B.x + 690, B.y + 700, 280, 28, 5_600, 3_800, 0, 5),
      movingWall(B.x + 1280, B.y + 890, 28, 300, 5_200, 3_500, 1_500, 4),
      movingWall(B.x + 1880, B.y + 700, 280, 28, 6_100, 4_100, 900, 6),
    ],
  };
}

function isMovingWallClosed(wall, now) {
  const phase = (now + wall.phaseMs) % wall.cycleMs;
  return phase < wall.closedMs;
}

function resolveCircleVsRect(blob, rect) {
  const closestX = clampValue(blob.x, rect.x, rect.x + rect.w);
  const closestY = clampValue(blob.y, rect.y, rect.y + rect.h);
  const dx = blob.x - closestX;
  const dy = blob.y - closestY;
  const distSq = dx * dx + dy * dy;
  const r = blob.radius;

  if (distSq >= r * r) {
    return false;
  }

  if (distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    const overlap = r - dist;
    blob.x += (dx / dist) * overlap;
    blob.y += (dy / dist) * overlap;
    return true;
  }

  const left = Math.abs(blob.x - rect.x);
  const right = Math.abs(rect.x + rect.w - blob.x);
  const top = Math.abs(blob.y - rect.y);
  const bottom = Math.abs(rect.y + rect.h - blob.y);
  const minDist = Math.min(left, right, top, bottom);

  if (minDist === left) blob.x = rect.x - r;
  else if (minDist === right) blob.x = rect.x + rect.w + r;
  else if (minDist === top) blob.y = rect.y - r;
  else blob.y = rect.y + rect.h + r;

  return true;
}

export function applyLabyrinthCollisions(blobs, labyrinthState, now) {
  let dangerPenalty = 0;

  for (const blob of blobs) {
    for (const rect of labyrinthState.staticWalls) {
      resolveCircleVsRect(blob, rect);
    }

    for (const wall of labyrinthState.movingWalls) {
      if (!isMovingWallClosed(wall, now)) {
        continue;
      }

      const collided = resolveCircleVsRect(blob, wall.rect);
      if (collided && wall.dangerousPenalty > 0) {
        dangerPenalty += wall.dangerousPenalty;
      }
    }
  }

  return { dangerPenalty };
}

export function isCircleInPortal(circle, portal) {
  const dx = circle.x - portal.x;
  const dy = circle.y - portal.y;
  return Math.hypot(dx, dy) <= circle.radius + portal.radius;
}

export function drawPortal(ctx, portal, now, label = "") {
  const pulse = 1 + Math.sin(now * 0.006) * 0.08;
  const outerR = portal.radius * pulse;
  const innerR = outerR * 0.72;

  ctx.save();
  ctx.shadowColor = "rgba(255,255,255,0.9)";
  ctx.shadowBlur = 18;

  ctx.beginPath();
  ctx.arc(portal.x, portal.y, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(portal.x, portal.y, innerR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(226,232,240,0.75)";
  ctx.lineWidth = 3;
  ctx.stroke();

  const spin = now * 0.0034;
  for (let i = 0; i < 14; i += 1) {
    const a = spin + (i / 14) * Math.PI * 2;
    const r = innerR * (0.2 + (i % 5) * 0.12);
    const x = portal.x + Math.cos(a) * r;
    const y = portal.y + Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  if (label) {
    ctx.font = "bold 14px Arial";
    ctx.fillStyle = "rgba(241,245,249,0.95)";
    ctx.textAlign = "center";
    ctx.fillText(label, portal.x, portal.y + outerR + 22);
  }
  ctx.restore();
}

export function drawLabyrinthArena(ctx, labyrinthState, now) {
  const B = labyrinthState.bounds;

  ctx.save();
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(B.x, B.y, B.w, B.h);

  ctx.strokeStyle = "rgba(148,163,184,0.35)";
  ctx.lineWidth = 2;
  for (let x = B.x + 40; x < B.x + B.w; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, B.y);
    ctx.lineTo(x, B.y + B.h);
    ctx.stroke();
  }
  for (let y = B.y + 40; y < B.y + B.h; y += 80) {
    ctx.beginPath();
    ctx.moveTo(B.x, y);
    ctx.lineTo(B.x + B.w, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#334155";
  for (const rect of labyrinthState.staticWalls) {
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  for (const wall of labyrinthState.movingWalls) {
    const closed = isMovingWallClosed(wall, now);
    if (!closed) {
      continue;
    }

    if (wall.dangerousPenalty > 0) {
      ctx.save();
      ctx.shadowColor = "rgba(248,113,113,0.75)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(wall.rect.x, wall.rect.y, wall.rect.w, wall.rect.h);
      ctx.restore();
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(wall.rect.x, wall.rect.y, wall.rect.w, wall.rect.h);
    }
  }

  ctx.restore();

  for (const portal of labyrinthState.endPortals) {
    drawPortal(ctx, portal, now, portal.label);
  }
}
