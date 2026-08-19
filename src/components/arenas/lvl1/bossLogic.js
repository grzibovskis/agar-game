import { getBlobCentroid } from "@/components/cell/logic/blobLogic";
import { clamp } from "@/components/cell/logic/math";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@/components/cell/logic/constants";

export const BOSS_TRIGGER_MS = 180_000;
export const BOSS_INTERVAL_MS = 240_000;
export const BOSS_TRANSITION_MS = 6_000;
export const BOSS_PLAYER_RADIUS = 34;
export const BOSS_RADIUS = 180;
export const BOSS_MAX_HEALTH = 500;
export const BOSS_PROJECTILE_RADIUS = 9;
export const BOSS_PROJECTILE_SPEED = 36;
export const BOSS_PROJECTILE_TTL_MS = 1_600;
export const BOSS_SPIKE_RADIUS = 15;
export const BOSS_SPIKE_SPEED = 8;
export const BOSS_SPIKE_TTL_MS = 5_000;
export const BOSS_SPIKE_INTERVAL_MS = 2_600;
export const BOSS_HIT_SCORE_DAMAGE = 5;
export const BOSS_MOVE_SPEED = 1.2;
export const BOSS_PLAYER_GAP = 26;
export const BOSS_SPIKE_VOLLEY_COUNT = 3;
export const BOSS_RADIAL_VOLLEY_COUNT = 14;

let pickupId = 1;
let projectileId = 1;
let spikeId = 1;

function nextPickupId(prefix) {
  const id = `${prefix}-${pickupId}`;
  pickupId += 1;
  return id;
}

function nextProjectileId() {
  const id = `boss-shot-${projectileId}`;
  projectileId += 1;
  return id;
}

function nextSpikeId() {
  const id = `boss-spike-${spikeId}`;
  spikeId += 1;
  return id;
}

function polarOffset(center, angle, distance) {
  return {
    x: center.x + Math.cos(angle) * distance,
    y: center.y + Math.sin(angle) * distance,
  };
}

export function isBossModePhase(phase) {
  return phase === "transition" || phase === "active" || phase === "defeated";
}

export function getBossCenter() {
  return {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
  };
}

export function createEmptyBossState() {
  return {
    phase: "inactive",
    transitionStartedAt: 0,
    activatedAt: 0,
    updatedAt: 0,
    resetAt: 0,
    boss: null,
    bonusPoints: [],
    playerShots: [],
    bossSpikes: [],
    rewardDropped: false,
  };
}

export function createBossTransitionState(target = null, now = Date.now()) {
  return createBossTransitionStateNearTarget(target, now);
}

export function getLargestHumanTarget(localBlobs, localPlayer, remotePlayers) {
  const candidates = [];

  if (localBlobs?.length) {
    const centroid = getBlobCentroid(localBlobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    candidates.push({
      sessionId: localPlayer?.sessionId || "local",
      x: centroid.x,
      y: centroid.y,
      radius: localPlayer?.radius || 22,
      score: localPlayer?.score || 0,
      isLocal: true,
    });
  }

  for (const remote of remotePlayers?.values?.() || []) {
    candidates.push({
      sessionId: remote.sessionId,
      x: remote.x,
      y: remote.y,
      radius: remote.radius || 22,
      score: remote.score || 0,
      isLocal: false,
    });
  }

  if (!candidates.length) {
    return {
      sessionId: "fallback",
      ...getBossCenter(),
      radius: 22,
      score: 0,
      isLocal: false,
    };
  }

  return candidates.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) {
      return (b.score || 0) - (a.score || 0);
    }

    if ((b.radius || 0) !== (a.radius || 0)) {
      return (b.radius || 0) - (a.radius || 0);
    }

    const center = getBossCenter();
    const distA = Math.hypot(a.x - center.x, a.y - center.y);
    const distB = Math.hypot(b.x - center.x, b.y - center.y);
    return distA - distB;
  })[0];
}

export function createBossTransitionStateNearTarget(target = null, now = Date.now()) {
  const anchor = target || { ...getBossCenter(), radius: 22, sessionId: "fallback" };
  const center = getBossCenter();
  const dx = anchor.x - center.x;
  const dy = anchor.y - center.y;
  const baseAngle = Math.atan2(dy, dx) || Math.PI / 3;
  const spawnDistance = BOSS_RADIUS + (anchor.radius || 22) + 110;
  const spawn = polarOffset(anchor, baseAngle + Math.PI / 4, spawnDistance);
  const x = clamp(spawn.x, BOSS_RADIUS, WORLD_WIDTH - BOSS_RADIUS);
  const y = clamp(spawn.y, BOSS_RADIUS, WORLD_HEIGHT - BOSS_RADIUS);

  return {
    phase: "transition",
    transitionStartedAt: now,
    activatedAt: now + BOSS_TRANSITION_MS,
    updatedAt: now,
    resetAt: 0,
    boss: {
      id: "raid-boss",
      x,
      y,
      radius: BOSS_RADIUS,
      health: BOSS_MAX_HEALTH,
      maxHealth: BOSS_MAX_HEALTH,
      lastSpikeAt: now,
      vx: 0,
      vy: 0,
      targetSessionId: anchor.sessionId || "fallback",
    },
    bonusPoints: [],
    playerShots: [],
    bossSpikes: [],
    rewardDropped: false,
  };
}

export function activateBossState(state, now = Date.now()) {
  const nextBoss = {
    ...(state.boss || createBossTransitionState(now).boss),
    lastSpikeAt: now,
  };

  return {
    ...state,
    phase: "active",
    updatedAt: now,
    boss: nextBoss,
    bonusPoints: state.bonusPoints,
  };
}

export function normalizeBlobsForBoss(blobs, createBlob) {
  const centroid = getBlobCentroid(blobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  const x = clamp(centroid.x, BOSS_PLAYER_RADIUS, WORLD_WIDTH - BOSS_PLAYER_RADIUS);
  const y = clamp(centroid.y, BOSS_PLAYER_RADIUS, WORLD_HEIGHT - BOSS_PLAYER_RADIUS);
  return [createBlob(x, y, BOSS_PLAYER_RADIUS)];
}

export function moveBossTowardTarget(boss, target, speedMultiplier = 1) {
  if (!boss || !target) {
    return boss;
  }

  const dx = target.x - boss.x;
  const dy = target.y - boss.y;
  const distance = Math.hypot(dx, dy) || 1;
  const moveSpeed = BOSS_MOVE_SPEED * speedMultiplier;
  const nextVx = (boss.vx || 0) * 0.88 + (dx / distance) * moveSpeed * 0.12;
  const nextVy = (boss.vy || 0) * 0.88 + (dy / distance) * moveSpeed * 0.12;

  return {
    ...boss,
    vx: nextVx,
    vy: nextVy,
    x: clamp(boss.x + nextVx, boss.radius, WORLD_WIDTH - boss.radius),
    y: clamp(boss.y + nextVy, boss.radius, WORLD_HEIGHT - boss.radius),
    targetSessionId: target.sessionId || boss.targetSessionId,
  };
}

export function keepBossGap(blobs, boss, padding = BOSS_PLAYER_GAP) {
  if (!boss || !blobs?.length) {
    return blobs;
  }

  for (const blob of blobs) {
    const dx = blob.x - boss.x;
    const dy = blob.y - boss.y;
    const distance = Math.hypot(dx, dy) || 0.0001;
    const minDistance = blob.radius + boss.radius + padding;

    if (distance >= minDistance) {
      continue;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    blob.x = clamp(boss.x + nx * minDistance, blob.radius, WORLD_WIDTH - blob.radius);
    blob.y = clamp(boss.y + ny * minDistance, blob.radius, WORLD_HEIGHT - blob.radius);
  }

  return blobs;
}

export function createBossBonusPoints(boss, count = 4) {
  const center = boss || { ...getBossCenter(), radius: BOSS_RADIUS };
  const distance = center.radius + 180;

  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count + Math.PI / 4;
    const pos = polarOffset(center, angle, distance);

    return {
      id: nextPickupId("bonus"),
      x: pos.x,
      y: pos.y,
      radius: 34,
      value: 500,
      color: "#f59e0b",
      glow: "rgba(245, 158, 11, 0.45)",
      kind: "bonus",
    };
  });
}

export function createBossRewardDrops(boss, totalValue = 500, shardCount = 10) {
  const center = boss || { ...getBossCenter(), radius: BOSS_RADIUS };
  const shardValue = Math.max(1, Math.floor(totalValue / shardCount));

  return Array.from({ length: shardCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / shardCount;
    const distance = 48 + (index % 3) * 18;
    const pos = polarOffset(center, angle, distance);

    return {
      id: nextPickupId("reward"),
      x: pos.x,
      y: pos.y,
      radius: 20,
      value: shardValue,
      color: "#f97316",
      glow: "rgba(249, 115, 22, 0.4)",
      kind: "reward",
    };
  });
}

export function createPlayerBossShot(blobs, mouseTarget, ownerId, now = Date.now()) {
  const centroid = getBlobCentroid(blobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  const dx = mouseTarget.x - centroid.x;
  const dy = mouseTarget.y - centroid.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;

  return {
    id: nextProjectileId(),
    ownerId,
    x: centroid.x + nx * (BOSS_PLAYER_RADIUS + 14),
    y: centroid.y + ny * (BOSS_PLAYER_RADIUS + 14),
    vx: nx * BOSS_PROJECTILE_SPEED,
    vy: ny * BOSS_PROJECTILE_SPEED,
    radius: BOSS_PROJECTILE_RADIUS,
    createdAt: now,
    expiresAt: now + BOSS_PROJECTILE_TTL_MS,
    color: "#dc2626",
  };
}

export function advanceLinearProjectile(projectile, radius = projectile.radius) {
  return {
    ...projectile,
    x: clamp(projectile.x + projectile.vx, radius, WORLD_WIDTH - radius),
    y: clamp(projectile.y + projectile.vy, radius, WORLD_HEIGHT - radius),
  };
}

export function createBossSpikeShot(boss, target, now = Date.now()) {
  const dx = target.x - boss.x;
  const dy = target.y - boss.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;

  return {
    id: nextSpikeId(),
    x: boss.x + nx * (boss.radius + 18),
    y: boss.y + ny * (boss.radius + 18),
    vx: nx * BOSS_SPIKE_SPEED,
    vy: ny * BOSS_SPIKE_SPEED,
    radius: BOSS_SPIKE_RADIUS,
    createdAt: now,
    expiresAt: now + BOSS_SPIKE_TTL_MS,
    color: "#111827",
  };
}

export function createBossSpikeVolley(boss, target, count = BOSS_SPIKE_VOLLEY_COUNT, now = Date.now()) {
  if (!boss || !target) {
    return [];
  }

  const dx = target.x - boss.x;
  const dy = target.y - boss.y;
  const baseAngle = Math.atan2(dy, dx) || 0;
  const spread = 0.22;
  const centerIndex = (count - 1) / 2;

  return Array.from({ length: count }, (_, index) => {
    const angle = baseAngle + (index - centerIndex) * spread;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);

    return {
      id: nextSpikeId(),
      x: boss.x + nx * (boss.radius + 18),
      y: boss.y + ny * (boss.radius + 18),
      vx: nx * BOSS_SPIKE_SPEED,
      vy: ny * BOSS_SPIKE_SPEED,
      radius: BOSS_SPIKE_RADIUS,
      createdAt: now,
      expiresAt: now + BOSS_SPIKE_TTL_MS,
      color: "#111827",
    };
  });
}

export function createBossRadialVolley(boss, count = BOSS_RADIAL_VOLLEY_COUNT, now = Date.now()) {
  if (!boss || count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);

    return {
      id: nextSpikeId(),
      x: boss.x + nx * (boss.radius + 18),
      y: boss.y + ny * (boss.radius + 18),
      vx: nx * BOSS_SPIKE_SPEED,
      vy: ny * BOSS_SPIKE_SPEED,
      radius: BOSS_SPIKE_RADIUS,
      createdAt: now,
      expiresAt: now + BOSS_SPIKE_TTL_MS,
      color: "#111827",
    };
  });
}
