import {
  MAX_BLOBS,
  MIN_SPLIT_RADIUS,
  SPIKE_BOUNDARY_PADDING,
  SPIKE_CORNER_PADDING,
  SPIKE_MOVE_INTERVAL_MS,
  SPIKE_RADIUS,
  SPIKE_WARNING_DURATION_MS,
  SPIKE_WARNING_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@/components/cell/logic/constants";
import { clamp } from "@/components/cell/logic/math";

const REPOSITION_RETRY_MS = 5_000;
const POSITION_ATTEMPTS = 120;
const OVERLAP_PADDING = 12;

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function overlaps(a, b, padding = 0) {
  return distance(a.x, a.y, b.x, b.y) < a.radius + b.radius + padding;
}

function isFarFromCornersAndWalls(x, y, radius, worldWidth, worldHeight) {
  const minX = SPIKE_BOUNDARY_PADDING + radius;
  const maxX = worldWidth - SPIKE_BOUNDARY_PADDING - radius;
  const minY = SPIKE_BOUNDARY_PADDING + radius;
  const maxY = worldHeight - SPIKE_BOUNDARY_PADDING - radius;

  if (x < minX || x > maxX || y < minY || y > maxY) {
    return false;
  }

  const corners = [
    { x: 0, y: 0 },
    { x: worldWidth, y: 0 },
    { x: 0, y: worldHeight },
    { x: worldWidth, y: worldHeight },
  ];

  return corners.every((corner) => distance(x, y, corner.x, corner.y) >= SPIKE_CORNER_PADDING + radius);
}

function findValidPosition({ worldWidth, worldHeight, radius, restricted }) {
  for (let attempt = 0; attempt < POSITION_ATTEMPTS; attempt += 1) {
    const x = radius + Math.random() * (worldWidth - radius * 2);
    const y = radius + Math.random() * (worldHeight - radius * 2);
    const candidate = { x, y, radius };

    if (!isFarFromCornersAndWalls(x, y, radius, worldWidth, worldHeight)) {
      continue;
    }

    if (restricted.some((item) => overlaps(candidate, item, OVERLAP_PADDING))) {
      continue;
    }

    return { x, y };
  }

  return null;
}

export function getRestrictedZones(spikes, warnings) {
  const spikeZones = spikes.map((spike) => ({ x: spike.x, y: spike.y, radius: spike.radius }));
  const warningZones = warnings.map((warning) => ({
    x: warning.x,
    y: warning.y,
    radius: warning.radius,
  }));

  return [...spikeZones, ...warningZones];
}

export function createInitialSpikes(count, now, worldWidth = WORLD_WIDTH, worldHeight = WORLD_HEIGHT) {
  const spikes = [];

  for (let i = 0; i < count; i += 1) {
    const restricted = spikes.map((spike) => ({ x: spike.x, y: spike.y, radius: spike.radius }));
    const position = findValidPosition({
      worldWidth,
      worldHeight,
      radius: SPIKE_RADIUS,
      restricted,
    });

    if (!position) {
      break;
    }

    spikes.push({
      id: `spike-${i + 1}`,
      x: position.x,
      y: position.y,
      radius: SPIKE_RADIUS,
      nextRelocateAt: now + SPIKE_MOVE_INTERVAL_MS,
    });
  }

  return spikes;
}

export function updateSpikesAndWarnings({
  spikes,
  warnings,
  now,
  worldWidth = WORLD_WIDTH,
  worldHeight = WORLD_HEIGHT,
}) {
  let nextSpikes = spikes.map((spike) => ({ ...spike }));
  const nextWarnings = [];

  for (const warning of warnings) {
    if (warning.spawnAt > now) {
      nextWarnings.push(warning);
      continue;
    }

    const spikeIndex = nextSpikes.findIndex((spike) => spike.id === warning.spikeId);

    if (spikeIndex >= 0) {
      nextSpikes[spikeIndex] = {
        ...nextSpikes[spikeIndex],
        x: warning.x,
        y: warning.y,
        radius: SPIKE_RADIUS,
        nextRelocateAt: now + SPIKE_MOVE_INTERVAL_MS,
      };
    }
  }

  const pendingBySpikeId = new Set(nextWarnings.map((warning) => warning.spikeId));

  nextSpikes = nextSpikes.map((spike) => {
    if (pendingBySpikeId.has(spike.id) || spike.nextRelocateAt > now) {
      return spike;
    }

    const restricted = [
      ...nextSpikes
        .filter((other) => other.id !== spike.id)
        .map((other) => ({ x: other.x, y: other.y, radius: other.radius })),
      ...nextWarnings.map((warning) => ({ x: warning.x, y: warning.y, radius: warning.radius })),
    ];

    const position = findValidPosition({
      worldWidth,
      worldHeight,
      radius: SPIKE_WARNING_RADIUS,
      restricted,
    });

    if (!position) {
      return {
        ...spike,
        nextRelocateAt: now + REPOSITION_RETRY_MS,
      };
    }

    nextWarnings.push({
      id: `warning-${spike.id}-${now}`,
      spikeId: spike.id,
      x: position.x,
      y: position.y,
      radius: SPIKE_WARNING_RADIUS,
      spawnAt: now + SPIKE_WARNING_DURATION_MS,
    });

    return {
      ...spike,
      nextRelocateAt: now + SPIKE_WARNING_DURATION_MS + SPIKE_MOVE_INTERVAL_MS,
    };
  });

  return {
    spikes: nextSpikes,
    warnings: nextWarnings,
  };
}

export function keepBlobsOutsideWarnings(blobs, warnings) {
  let changed = false;

  for (const blob of blobs) {
    for (const warning of warnings) {
      const dx = blob.x - warning.x;
      const dy = blob.y - warning.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const minDist = warning.radius + blob.radius + 4;

      if (dist >= minDist) {
        continue;
      }

      const nx = dx / dist;
      const ny = dy / dist;

      blob.x = clamp(warning.x + nx * minDist, blob.radius, WORLD_WIDTH - blob.radius);
      blob.y = clamp(warning.y + ny * minDist, blob.radius, WORLD_HEIGHT - blob.radius);
      blob.vx += nx * 0.5;
      blob.vy += ny * 0.5;
      changed = true;
    }
  }

  return changed;
}

export function findSpikeCollision(blobs, spikes) {
  for (const blob of blobs) {
    for (const spike of spikes) {
      if (distance(blob.x, blob.y, spike.x, spike.y) < blob.radius + spike.radius) {
        return spike;
      }
    }
  }

  return null;
}

export function splitToMaxCells(blobs, createBlob, origin = null) {
  const minRadiusToSplit = MIN_SPLIT_RADIUS * Math.sqrt(2);
  let current = [...blobs];

  for (let round = 0; round < 8; round += 1) {
    if (current.length >= MAX_BLOBS) {
      break;
    }

    const next = [];
    let splitOccurred = false;

    for (let i = 0; i < current.length; i += 1) {
      const blob = current[i];
      const remaining = current.length - i - 1;
      const canSplit =
        blob.radius >= minRadiusToSplit &&
        next.length + 2 + remaining <= MAX_BLOBS;

      if (!canSplit) {
        next.push(blob);
        continue;
      }

      const newRadius = blob.radius / Math.sqrt(2);
      const fromX = origin?.x ?? blob.x;
      const fromY = origin?.y ?? blob.y;
      const baseAngle = Math.atan2(blob.y - fromY, blob.x - fromX) || (Math.PI * 2 * i) / current.length;
      const angleA = baseAngle + 0.35;
      const angleB = baseAngle - 0.35;
      const spacing = newRadius * 1.4;

      const aX = clamp(blob.x + Math.cos(angleA) * spacing, newRadius, WORLD_WIDTH - newRadius);
      const aY = clamp(blob.y + Math.sin(angleA) * spacing, newRadius, WORLD_HEIGHT - newRadius);
      const bX = clamp(blob.x + Math.cos(angleB) * spacing, newRadius, WORLD_WIDTH - newRadius);
      const bY = clamp(blob.y + Math.sin(angleB) * spacing, newRadius, WORLD_HEIGHT - newRadius);

      next.push(createBlob(aX, aY, newRadius, Math.cos(angleA) * 7, Math.sin(angleA) * 7));
      next.push(createBlob(bX, bY, newRadius, Math.cos(angleB) * 12, Math.sin(angleB) * 12));
      splitOccurred = true;
    }

    current = next;

    if (!splitOccurred) {
      break;
    }
  }

  return current;
}

export function drawSpikeBalls(ctx, spikes) {
  for (const spike of spikes) {
    const spikesCount = 14;
    const innerRadius = spike.radius * 0.72;

    ctx.beginPath();

    for (let i = 0; i < spikesCount * 2; i += 1) {
      const ratio = i % 2 === 0 ? spike.radius : innerRadius;
      const angle = (Math.PI * i) / spikesCount;
      const px = spike.x + Math.cos(angle) * ratio;
      const py = spike.y + Math.sin(angle) * ratio;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.closePath();
    ctx.fillStyle = "#16a34a";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#dcfce7";
    ctx.stroke();
  }
}

export function drawWarningZones(ctx, warnings, now) {
  for (const warning of warnings) {
    const timeLeft = Math.max(0, warning.spawnAt - now);
    const t = timeLeft / SPIKE_WARNING_DURATION_MS;
    const pulse = 0.75 + 0.25 * (Math.sin(now / 220) + 1) / 2;
    const radius = warning.radius * (0.92 + pulse * 0.16);
    const alpha = 0.28 + (1 - t) * 0.25;

    ctx.beginPath();
    ctx.arc(warning.x, warning.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(248, 113, 113, 0.9)";
    ctx.stroke();
  }
}

