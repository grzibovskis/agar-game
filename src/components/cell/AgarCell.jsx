"use client";

import { useEffect, useRef, useState } from "react";
import CellArena from "@/components/arenas/lvl1/CellArena";
import {
  FOOD_TARGET,
  GRID_SIZE,
  REMOTE_STALE_MS,
  SPIKE_MAX_COUNT,
  STATE_BROADCAST_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@/components/cell/logic/constants";
import { blobArea, clamp, radiusFromArea } from "@/components/cell/logic/math";
import {
  getBlobCentroid,
  getCombinedRadius,
  growBlobWithinGroup,
  mergeClosestPairsOnce,
} from "@/components/cell/logic/blobLogic";
import { createFood, drawGrid, replenishFood } from "@/components/arenas/lvl1/arenaLogic";
import {
  consumeFood,
  resolvePvpCombat,
  separateOverlappingBlobs,
  splitAndJump,
  updateBlobMovement,
} from "@/components/arenas/lvl1/movementAttackLogic";
import { colorFromId, drawCircle, drawLocalBlob, drawRemotePlayer, drawBotPlayer, preloadSkin } from "@/components/cell/logic/playerAppearance";
import { SKINS, getSkinById } from "@/components/cell/logic/skinData";
import {
  createBots,
  updateBots,
  resolveBotVsLocal,
} from "@/components/arenas/lvl1/botLogic";
import {
  createInitialSpikes,
  drawSpikeBalls,
  drawWarningZones,
  findSpikeCollision,
  getRestrictedZones,
  keepBlobsOutsideWarnings,
  splitToMaxCells,
  updateSpikesAndWarnings,
} from "@/components/arenas/lvl1/spikeLogic";
import {
  BOSS_HIT_SCORE_DAMAGE,
  BOSS_MAX_HEALTH,
  BOSS_PLAYER_RADIUS,
  BOSS_SPIKE_INTERVAL_MS,
  BOSS_TRANSITION_MS,
  activateBossState,
  advanceLinearProjectile,
  createBossRadialVolley,
  createBossRewardDrops,
  createBossSpecialItems,
  createBossTransitionState,
  createEmptyBossState,
  createPlayerBossShot,
  getLargestHumanTarget,
  isBossModePhase,
  keepBossGap,
  moveBossTowardTarget,
  normalizeBlobsForBoss,
} from "@/components/arenas/lvl1/bossLogic";
import CellHeader from "@/components/layout/CellHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { sanitizeUsername } from "@/lib/sanitize";

// Returns merge delay in ms based on number of blobs currently in play.
// 2 blobs (1 split) → 60s, 3 blobs → 45s, 4 blobs → 30s, 5+ blobs → 20s.
function getMergeDelayMs(blobCount) {
  if (blobCount >= 5) return 20_000;
  if (blobCount === 4) return 30_000;
  if (blobCount === 3) return 45_000;
  return 60_000;
}

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session-${Math.random().toString(36).slice(2, 12)}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function radiusFromScore(score) {
  const baseRadius = 22;
  const maxRadius = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.1;
  const normalizedScore = Math.max(0, score);
  const totalArea = blobArea(baseRadius) + normalizedScore * SCORE_AREA_PER_POINT;
  return clamp(radiusFromArea(totalArea), baseRadius, maxRadius);
}

function getCachedImage(cache, src) {
  if (!src) {
    return null;
  }

  if (cache.has(src)) {
    return cache.get(src);
  }

  const image = new Image();
  image.src = src;
  cache.set(src, image);
  return image;
}

const ITEM_EFFECT_DURATION_MS = 30_000;
const MAP_PAN_STEP = 220;
const ITEM_SHIELD_PADDING = 90;
const SCORE_AREA_PER_POINT = 65;
const BOSS_SPAWN_SEQUENCE_MS = [10 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];
const WORLD_ITEM_RADIUS = 22;
const WORLD_ITEM_MAX_ACTIVE = 8;
const WORLD_ITEM_SPAWN_MIN_MS = 12_000;
const WORLD_ITEM_SPAWN_MAX_MS = 28_000;
const MAGNET_MIN_RANGE = 720;
const MAGNET_VISIBLE_RANGE_RATIO = 3.6;
const MAGNET_PULL_FOOD = 0.18;
const MAGNET_PULL_EJECTED = 0.14;
const MAGNET_PULL_BOT = 0.12;
const TELEPORT_MIN_GAP = 36;
const WORLD_ITEM_DEFS = [
  {
    itemType: "map",
    itemName: "Map",
    probability: 50,
    iconSrc: "/items/map.png",
    color: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.55)",
  },
  {
    itemType: "shield",
    itemName: "Shield",
    probability: 15,
    iconSrc: "/items/shield.png",
    color: "#22c55e",
    glow: "rgba(34, 197, 94, 0.55)",
  },
  {
    itemType: "cloak",
    itemName: "Invisibility",
    probability: 3,
    iconSrc: "/items/cloak.png",
    color: "#a78bfa",
    glow: "rgba(167, 139, 250, 0.55)",
  },
  {
    itemType: "teleport",
    itemName: "Teleport",
    probability: 5,
    iconSrc: "/items/teleport.png",
    color: "#f43f5e",
    glow: "rgba(244, 63, 94, 0.55)",
  },
  {
    itemType: "magnet",
    itemName: "Magnet",
    probability: 23,
    iconSrc: "/items/magnet.png",
    color: "#facc15",
    glow: "rgba(250, 204, 21, 0.55)",
  },
];

function randomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeightedWorldItemDef(defs = WORLD_ITEM_DEFS) {
  const pool = Array.isArray(defs) && defs.length ? defs : WORLD_ITEM_DEFS;
  const total = pool.reduce((sum, item) => sum + item.probability, 0);
  const roll = Math.random() * total;
  let threshold = 0;

  for (const item of pool) {
    threshold += item.probability;
    if (roll <= threshold) {
      return item;
    }
  }

  return pool[0];
}

function serializeBlobs(blobs) {
  return blobs.map((blob) => [round1(blob.x), round1(blob.y), round1(blob.radius)]);
}

function summarizeBlobs(blobs, fallbackX = WORLD_WIDTH / 2, fallbackY = WORLD_HEIGHT / 2) {
  if (!blobs.length) {
    return {
      x: fallbackX,
      y: fallbackY,
      radius: 22,
      parts: 0,
    };
  }

  return {
    ...getBlobCentroid(blobs, fallbackX, fallbackY),
    radius: getCombinedRadius(blobs),
    parts: blobs.length,
  };
}

export default function AgarCell() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const rafReadyRef = useRef(false);
  const blobIdRef = useRef(1);
  const sessionIdRef = useRef(createSessionId());
  const channelRef = useRef(null);
  const remotePlayersRef = useRef(new Map());
  const scoreRef = useRef(0);
  const isAliveRef = useRef(false);
  const cellStartedRef = useRef(false);
  const spikeLogicStartedLoggedRef = useRef(false);
  const playerNameRef = useRef("");
  const playerColorRef = useRef("#22c55e");
  const lastBroadcastRef = useRef(0);
  const leaveSentRef = useRef(false);
  const startCountdownTimerRef = useRef(null);
  const lastLeaderboardUpdateRef = useRef(0);

  const mouseTargetRef = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
  const cameraRef = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
  const zoomRef = useRef(1);
  const blobsRef = useRef([]);
  const mergeStateRef = useRef({ nextMergeAt: null });
  const foodRef = useRef([]);
  const spikesRef = useRef([]);
  const warningZonesRef = useRef([]);
  const botsRef = useRef([]);
  const spikeEpochRef = useRef(0);
  const lastSpikeBroadcastRef  = useRef(0);
  const spikeImmunityUntilRef  = useRef(0); // ms timestamp until spike immunity expires
  const ejectedFoodRef         = useRef([]);
  const ejectedIdRef           = useRef(0);
  const runStartedAtRef = useRef(0);
  const nextBossAtRef = useRef(0);
  const nextBossStageRef = useRef(0);
  const bossStateRef = useRef(createEmptyBossState());
  const lastBossBroadcastRef = useRef(0);
  const specialItemImageCacheRef = useRef(new Map());
  const activeItemRef = useRef(null);
  const freeViewOffsetRef = useRef({ x: 0, y: 0 });
  const worldItemsRef = useRef([]);
  const worldItemIdRef = useRef(1);
  const nextWorldItemSpawnAtRef = useRef(0);

  const [score, setScore] = useState(0);
  const [size, setSize] = useState(22);
  const [parts, setParts] = useState(1);
  const [showGate, setShowGate] = useState(true);
  const [guestName, setGuestName] = useState("");
  const [cellStarted, setCellStarted] = useState(false);
  const [deathReason, setDeathReason] = useState("");
  const [username, setUsername] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [onlinePlayers, setOnlinePlayers] = useState(1);
  const [startCountdown, setStartCountdown] = useState(0);
  const [leaderboardPlayers, setLeaderboardPlayers] = useState([]);
  const [currentSkin, setCurrentSkin] = useState(null);
  const currentSkinRef = useRef(null);
  const [playerColor, setPlayerColor] = useState("#22c55e");
  const [faceExpression, setFaceExpression] = useState("serious");
  const [bossUi, setBossUi] = useState({
    phase: "inactive",
    health: 0,
    maxHealth: BOSS_MAX_HEALTH,
    activatedAt: 0,
  });
  const [collectedBossItems, setCollectedBossItems] = useState([]);
  const [activeBossItem, setActiveBossItem] = useState(null);
  const lastScoreIncreaseTimeRef = useRef(Date.now());
  const prevScoreForFaceRef = useRef(0);

  function createBlob(x, y, radius, vx = 0, vy = 0) {
    const id = blobIdRef.current;
    blobIdRef.current += 1;

    return {
      id,
      x,
      y,
      radius,
      vx,
      vy,
    };
  }

  // Eject a glowing blue food piece toward the mouse (press E)
  function ejectFood() {
    if (!isAliveRef.current || !cellStartedRef.current) return;
    const blobs = blobsRef.current;
    if (!blobs.length) return;
    const value = Math.max(1, Math.floor(scoreRef.current / 100));
    if (scoreRef.current < value) return;
    const centroid = getBlobCentroid(blobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    const mouse    = mouseTargetRef.current;
    const dx = mouse.x - centroid.x;
    const dy = mouse.y - centroid.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const launchSpeed = 18;
    const combinedR   = getCombinedRadius(blobs);
    const piece = {
      id: `${sessionIdRef.current}-${ejectedIdRef.current++}`,
      ownerSessionId: sessionIdRef.current,
      x: centroid.x + nx * (combinedR + 6),
      y: centroid.y + ny * (combinedR + 6),
      vx: nx * launchSpeed,
      vy: ny * launchSpeed,
      value,
      radius: 3,
      createdAt: Date.now(),
    };

    ejectedFoodRef.current.push(piece);
    setScoreValue(Math.max(0, scoreRef.current - value));
    applyBlobAreaDeltaFromScore(-value);
    sendEjectedFood(piece);
    sendPlayerState(true);
  }

  function setCellStartedValue(next) {
    cellStartedRef.current = next;
    setCellStarted(next);
  }

  // Face expression: smile on eat, surprise on milestone, serious after 10s idle
  useEffect(() => {
    if (score > prevScoreForFaceRef.current) {
      lastScoreIncreaseTimeRef.current = Date.now();
      const crossedMilestone =
        Math.floor(score / 10) > Math.floor(prevScoreForFaceRef.current / 10);
      prevScoreForFaceRef.current = score;
      if (crossedMilestone) {
        setFaceExpression("surprise");
        setTimeout(() => setFaceExpression("smile"), 1_500);
      } else {
        setFaceExpression("smile");
      }
    }
  }, [score]);

  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastScoreIncreaseTimeRef.current > 10_000) {
        setFaceExpression((cur) => (cur === "serious" ? cur : "serious"));
      }
    }, 2_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    console.info("[AgarCell] educationStarted state changed", { cellStarted });
  }, [cellStarted]);

  function updateHudFromBlobs(blobs) {
    setParts(blobs.length);
    setSize(getCombinedRadius(blobs));
  }

  function applyBlobAreaDeltaFromScore(pointsDelta) {
    if (!pointsDelta) {
      return;
    }

    const blobs = blobsRef.current;

    if (!Array.isArray(blobs) || !blobs.length) {
      return;
    }

    const areaDelta = pointsDelta * SCORE_AREA_PER_POINT;

    if (!areaDelta) {
      return;
    }

    const minBlobRadius = 8;
    const currentTotalArea = blobs.reduce((sum, blob) => sum + blobArea(blob.radius), 0);

    if (currentTotalArea <= 0) {
      return;
    }

    const minTotalArea = blobs.reduce(
      (sum, blob) => sum + blobArea(Math.min(blob.radius, minBlobRadius)),
      0
    );
    const targetTotalArea = Math.max(minTotalArea, currentTotalArea + areaDelta);
    const scale = Math.sqrt(targetTotalArea / currentTotalArea);

    blobsRef.current = blobs.map((blob) => {
      const nextRadius = Math.max(minBlobRadius, blob.radius * scale);

      return {
        ...blob,
        radius: nextRadius,
        x: clamp(blob.x, nextRadius, WORLD_WIDTH - nextRadius),
        y: clamp(blob.y, nextRadius, WORLD_HEIGHT - nextRadius),
      };
    });

    updateHudFromBlobs(blobsRef.current);
  }

  function setScoreValue(next) {
    scoreRef.current = next;
    setScore(next);
  }

  function getActiveItem(now = Date.now()) {
    const current = activeItemRef.current;

    if (!current || now >= current.expiresAt) {
      return null;
    }

    return current;
  }

  function isItemActive(itemType, now = Date.now()) {
    const current = getActiveItem(now);
    return !!(current && current.itemType === itemType);
  }

  function consumeCollectedItem(itemType) {
    if (!itemType) {
      return;
    }

    setCollectedBossItems((prev) => prev
      .map((item) => (
        item.itemType === itemType
          ? { ...item, count: Math.max(0, item.count - 1) }
          : item
      ))
      .filter((item) => item.count > 0)
    );
  }

  function clearActiveItemEffect(consumedType = null) {
    activeItemRef.current = null;
    setActiveBossItem(null);
    freeViewOffsetRef.current = { x: 0, y: 0 };

    if (consumedType) {
      consumeCollectedItem(consumedType);
    }
  }

  function applyMagnetEffect(localBlobs, visibleRange) {
    if (!localBlobs.length) {
      return;
    }

    const center = getBlobCentroid(localBlobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    const magnetRange = Math.max(MAGNET_MIN_RANGE, visibleRange * MAGNET_VISIBLE_RANGE_RATIO);

    foodRef.current = foodRef.current.map((point) => {
      const dx = center.x - point.x;
      const dy = center.y - point.y;
      const distance = Math.hypot(dx, dy) || 0.0001;

      if (distance > magnetRange) {
        return point;
      }

      const pullScale = (1 - distance / magnetRange) * MAGNET_PULL_FOOD;
      return {
        ...point,
        x: clamp(point.x + (dx / distance) * pullScale * 18, point.radius, WORLD_WIDTH - point.radius),
        y: clamp(point.y + (dy / distance) * pullScale * 18, point.radius, WORLD_HEIGHT - point.radius),
      };
    });

    ejectedFoodRef.current = ejectedFoodRef.current.map((piece) => {
      const dx = center.x - piece.x;
      const dy = center.y - piece.y;
      const distance = Math.hypot(dx, dy) || 0.0001;

      if (distance > magnetRange) {
        return piece;
      }

      const pullScale = (1 - distance / magnetRange) * MAGNET_PULL_EJECTED;
      return {
        ...piece,
        vx: piece.vx + (dx / distance) * pullScale * 1.25,
        vy: piece.vy + (dy / distance) * pullScale * 1.25,
      };
    });

    for (const bot of botsRef.current) {
      if (!bot.active || !Array.isArray(bot.blobs) || !bot.blobs.length) {
        continue;
      }

      for (const botBlob of bot.blobs) {
        const dx = center.x - botBlob.x;
        const dy = center.y - botBlob.y;
        const distance = Math.hypot(dx, dy) || 0.0001;

        if (distance > magnetRange) {
          continue;
        }

        const pullScale = (1 - distance / magnetRange) * MAGNET_PULL_BOT;
        botBlob.x = clamp(
          botBlob.x + (dx / distance) * pullScale * 10,
          botBlob.radius,
          WORLD_WIDTH - botBlob.radius
        );
        botBlob.y = clamp(
          botBlob.y + (dy / distance) * pullScale * 10,
          botBlob.radius,
          WORLD_HEIGHT - botBlob.radius
        );
      }
    }
  }

  function isTeleportTargetAllowed(targetX, targetY, localRadius) {
    const targetTouchesBot = botsRef.current.some((bot) => (
      bot.active &&
      Array.isArray(bot.blobs) &&
      bot.blobs.some((blob) => (
        Math.hypot(targetX - blob.x, targetY - blob.y) <= localRadius + blob.radius + TELEPORT_MIN_GAP
      ))
    ));

    const targetTouchesPoint =
      foodRef.current.some((point) => (
        Math.hypot(targetX - point.x, targetY - point.y) <= localRadius + point.radius + TELEPORT_MIN_GAP
      )) ||
      ejectedFoodRef.current.some((point) => (
        Math.hypot(targetX - point.x, targetY - point.y) <= localRadius + point.radius + TELEPORT_MIN_GAP
      ));

    if (!targetTouchesBot && !targetTouchesPoint) {
      return false;
    }

    const tooCloseToPlayer = [...remotePlayersRef.current.values()].some((remote) => (
      Math.hypot(targetX - remote.x, targetY - remote.y) <= localRadius + remote.radius + TELEPORT_MIN_GAP
    ));

    return !tooCloseToPlayer;
  }

  function activateCollectedItem(itemType) {
    if (!itemType || !isAliveRef.current || !cellStartedRef.current) {
      return false;
    }

    const now = Date.now();

    if (getActiveItem(now)) {
      return false;
    }

    const item = collectedBossItems.find((entry) => entry.itemType === itemType && entry.count > 0);

    if (!item) {
      return false;
    }

    const nextActive = {
      itemType: item.itemType,
      itemName: item.itemName,
      iconSrc: item.iconSrc,
      startedAt: now,
      expiresAt: now + ITEM_EFFECT_DURATION_MS,
    };

    activeItemRef.current = nextActive;
    setActiveBossItem(nextActive);
    freeViewOffsetRef.current = { x: 0, y: 0 };
    sendPlayerState(true);
    return true;
  }

  function applyShieldPushback(localBlobs) {
    if (!localBlobs.length) {
      return;
    }

    const center = getBlobCentroid(localBlobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    const shieldRadius = getCombinedRadius(localBlobs) + ITEM_SHIELD_PADDING;

    for (const remote of remotePlayersRef.current.values()) {
      const dx = remote.x - center.x;
      const dy = remote.y - center.y;
      const distance = Math.hypot(dx, dy) || 0.0001;
      const minDistance = shieldRadius + remote.radius;

      if (distance >= minDistance) {
        continue;
      }

      const nx = dx / distance;
      const ny = dy / distance;
      const push = minDistance - distance;
      const nextX = clamp(remote.x + nx * push, remote.radius, WORLD_WIDTH - remote.radius);
      const nextY = clamp(remote.y + ny * push, remote.radius, WORLD_HEIGHT - remote.radius);
      const moveDx = nextX - remote.x;
      const moveDy = nextY - remote.y;

      remote.x = nextX;
      remote.y = nextY;

      if (Array.isArray(remote.blobs) && remote.blobs.length) {
        remote.blobs = remote.blobs.map((blob) => ({
          ...blob,
          x: clamp(blob.x + moveDx, blob.radius, WORLD_WIDTH - blob.radius),
          y: clamp(blob.y + moveDy, blob.radius, WORLD_HEIGHT - blob.radius),
        }));
      }
    }

    for (const bot of botsRef.current) {
      if (!bot.active || !Array.isArray(bot.blobs) || !bot.blobs.length) {
        continue;
      }

      for (const blob of bot.blobs) {
        const dx = blob.x - center.x;
        const dy = blob.y - center.y;
        const distance = Math.hypot(dx, dy) || 0.0001;
        const minDistance = shieldRadius + blob.radius;

        if (distance >= minDistance) {
          continue;
        }

        const nx = dx / distance;
        const ny = dy / distance;
        blob.x = clamp(center.x + nx * minDistance, blob.radius, WORLD_WIDTH - blob.radius);
        blob.y = clamp(center.y + ny * minDistance, blob.radius, WORLD_HEIGHT - blob.radius);
      }
    }
  }

  function registerCollectedBossItems(items) {
    if (!Array.isArray(items) || !items.length) {
      return;
    }

    setCollectedBossItems((prev) => {
      const next = [...prev];

      for (const item of items) {
        const type = item.itemType || "unknown";
        const existingIndex = next.findIndex((entry) => entry.itemType === type);

        if (existingIndex >= 0) {
          next[existingIndex] = {
            ...next[existingIndex],
            count: next[existingIndex].count + 1,
            iconSrc: item.iconSrc || next[existingIndex].iconSrc,
            itemName: item.itemName || next[existingIndex].itemName,
          };
          continue;
        }

        next.push({
          itemType: type,
          itemName: item.itemName || type,
          iconSrc: item.iconSrc || "",
          count: 1,
        });
      }

      return next;
    });
  }

  function scheduleNextWorldItemSpawn(anchorMs = Date.now()) {
    nextWorldItemSpawnAtRef.current =
      anchorMs + randomIntBetween(WORLD_ITEM_SPAWN_MIN_MS, WORLD_ITEM_SPAWN_MAX_MS);
  }

  function createWorldItem(now = Date.now()) {
    const finalItemDef = pickWeightedWorldItemDef();
    const padding = WORLD_ITEM_RADIUS + 140;
    const x = clamp(
      padding + Math.random() * (WORLD_WIDTH - padding * 2),
      WORLD_ITEM_RADIUS,
      WORLD_WIDTH - WORLD_ITEM_RADIUS
    );
    const y = clamp(
      padding + Math.random() * (WORLD_HEIGHT - padding * 2),
      WORLD_ITEM_RADIUS,
      WORLD_HEIGHT - WORLD_ITEM_RADIUS
    );

    return {
      id: `world-item-${worldItemIdRef.current++}`,
      x,
      y,
      radius: WORLD_ITEM_RADIUS,
      itemType: finalItemDef.itemType,
      itemName: finalItemDef.itemName,
      iconSrc: finalItemDef.iconSrc,
      color: finalItemDef.color,
      glow: finalItemDef.glow,
      spawnedAt: now,
    };
  }

  function maybeSpawnWorldItem(now = Date.now()) {
    if (!isAliveRef.current || !cellStartedRef.current) {
      return;
    }

    if (!nextWorldItemSpawnAtRef.current) {
      scheduleNextWorldItemSpawn(now);
      return;
    }

    if (now < nextWorldItemSpawnAtRef.current) {
      return;
    }

    if (worldItemsRef.current.length < WORLD_ITEM_MAX_ACTIVE) {
      worldItemsRef.current.push(createWorldItem(now));
    }

    scheduleNextWorldItemSpawn(now);
  }

  function syncBossUi() {
    const state = bossStateRef.current;
    setBossUi({
      phase: state.phase,
      health: state.boss?.health ?? 0,
      maxHealth: state.boss?.maxHealth ?? BOSS_MAX_HEALTH,
      activatedAt: state.activatedAt || 0,
    });
  }

  function hasAnyJoinedPlayers() {
    return isAliveRef.current || remotePlayersRef.current.size > 0;
  }

  function getBossSpawnIntervalForStage(stage) {
    if (stage < 0) {
      return BOSS_SPAWN_SEQUENCE_MS[0];
    }

    if (stage >= BOSS_SPAWN_SEQUENCE_MS.length) {
      return BOSS_SPAWN_SEQUENCE_MS[BOSS_SPAWN_SEQUENCE_MS.length - 1];
    }

    return BOSS_SPAWN_SEQUENCE_MS[stage];
  }

  function scheduleNextBossFrom(anchorMs) {
    const interval = getBossSpawnIntervalForStage(nextBossStageRef.current);
    nextBossAtRef.current = anchorMs + interval;
    nextBossStageRef.current = Math.min(
      nextBossStageRef.current + 1,
      BOSS_SPAWN_SEQUENCE_MS.length - 1
    );
  }

  function maybeResetBossStateIfIdle() {
    if (hasAnyJoinedPlayers()) {
      return;
    }

    nextBossAtRef.current = 0;
    nextBossStageRef.current = 0;
    bossStateRef.current = createEmptyBossState();
    syncBossUi();
  }

  function clearStandardArenaForBoss() {
    spikesRef.current = [];
    warningZonesRef.current = [];
    botsRef.current = [];
    foodRef.current = [];
    ejectedFoodRef.current = [];
    mergeStateRef.current.nextMergeAt = null;
  }

  function normalizeLocalForBoss({ broadcast = true } = {}) {
    const current = blobsRef.current.length
      ? blobsRef.current
      : [createBlob(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 22)];
    const next = normalizeBlobsForBoss(current, createBlob);
    blobsRef.current = next;
    updateHudFromBlobs(next);

    if (broadcast) {
      sendPlayerState(true);
    }
  }

  function restoreNormalArenaAfterBoss() {
    const now = Date.now();
    const centroid = getBlobCentroid(blobsRef.current, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    const radius = radiusFromScore(scoreRef.current);
    const x = clamp(centroid.x, radius, WORLD_WIDTH - radius);
    const y = clamp(centroid.y, radius, WORLD_HEIGHT - radius);

    spikeEpochRef.current = now;
    spikesRef.current = createInitialSpikes(SPIKE_MAX_COUNT, now, WORLD_WIDTH, WORLD_HEIGHT);
    warningZonesRef.current = [];
    botsRef.current = createBots(now);
    spikeImmunityUntilRef.current = 0;
    ejectedFoodRef.current = [];
    mergeStateRef.current.nextMergeAt = null;
    blobsRef.current = [createBlob(x, y, radius)];
    foodRef.current = createFood(
      FOOD_TARGET,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      getRestrictedZones(spikesRef.current, warningZonesRef.current)
    );
    updateHudFromBlobs(blobsRef.current);
    sendSpikeState(true);
    sendPlayerState(true);
  }

  function sendBossState(force = false) {
    const channel = channelRef.current;

    if (!channel) {
      return;
    }

    const hasBossPhase = isBossModePhase(bossStateRef.current.phase);
    const hasSchedule = nextBossAtRef.current > 0;

    if (!hasBossPhase && !force && !hasSchedule) {
      return;
    }

    const now = Date.now();

    if (!force && now - lastBossBroadcastRef.current < 1_500) {
      return;
    }

    lastBossBroadcastRef.current = now;
    bossStateRef.current.updatedAt = now;

    const bossPayload = {
      sessionId: sessionIdRef.current,
      phase: bossStateRef.current.phase,
      transitionStartedAt: bossStateRef.current.transitionStartedAt,
      activatedAt: bossStateRef.current.activatedAt,
      updatedAt: now,
      resetAt: bossStateRef.current.resetAt || 0,
      nextBossAt: nextBossAtRef.current || 0,
      nextBossStage: nextBossStageRef.current,
      rewardDropped: bossStateRef.current.rewardDropped,
      boss: bossStateRef.current.boss,
      bonusPoints: bossStateRef.current.bonusPoints,
      specialItems: bossStateRef.current.specialItems,
    };

    try {
      channel.send({
        type: "broadcast",
        event: "boss_state",
        payload: bossPayload,
      });
    } catch (error) {
      console.error("[AgarCell] failed to send boss_state", error);
    }
  }

  function enterBossTransition(startedAt = Date.now(), shouldBroadcast = true) {
    const current = bossStateRef.current;

    if (
      isBossModePhase(current.phase) &&
      current.transitionStartedAt &&
      current.transitionStartedAt <= startedAt
    ) {
      return;
    }

    const target = getLargestHumanTarget(
      blobsRef.current,
      {
        sessionId: sessionIdRef.current,
        radius: getCombinedRadius(blobsRef.current),
        score: scoreRef.current,
      },
      remotePlayersRef.current
    );

    bossStateRef.current = createBossTransitionState(target, startedAt);
    scheduleNextBossFrom(startedAt);
    clearStandardArenaForBoss();

    if (isAliveRef.current) {
      normalizeLocalForBoss({ broadcast: false });
      sendPlayerState(true);
    }

    syncBossUi();

    if (shouldBroadcast) {
      sendBossState(true);
    }
  }

  function activateBossBattle(now = Date.now(), shouldBroadcast = true) {
    if (bossStateRef.current.phase !== "transition") {
      return;
    }

    bossStateRef.current = activateBossState(bossStateRef.current, now);
    clearStandardArenaForBoss();

    if (isAliveRef.current) {
      normalizeLocalForBoss({ broadcast: false });
      sendPlayerState(true);
    }

    syncBossUi();

    if (shouldBroadcast) {
      sendBossState(true);
    }
  }

  function defeatBoss(now = Date.now(), shouldBroadcast = true) {
    if (!bossStateRef.current.boss || bossStateRef.current.rewardDropped) {
      return;
    }

    bossStateRef.current = {
      ...bossStateRef.current,
      phase: "defeated",
      updatedAt: now,
      rewardDropped: true,
      boss: {
        ...bossStateRef.current.boss,
        health: 0,
      },
      playerShots: [],
      bossSpikes: [],
      bonusPoints: [
        ...bossStateRef.current.bonusPoints,
        ...createBossRewardDrops(bossStateRef.current.boss),
      ],
      specialItems: [
        ...bossStateRef.current.specialItems,
        ...createBossSpecialItems(bossStateRef.current.boss),
      ],
    };

    syncBossUi();

    if (shouldBroadcast) {
      sendBossState(true);
    }
  }

  function restoreNormalModeFromBoss(now = Date.now(), shouldBroadcast = true) {
    bossStateRef.current = {
      ...createEmptyBossState(),
      updatedAt: now,
      resetAt: now,
    };
    if (!hasAnyJoinedPlayers()) {
      nextBossAtRef.current = 0;
      nextBossStageRef.current = 0;
    } else if (!nextBossAtRef.current) {
      scheduleNextBossFrom(now);
    }
    syncBossUi();

    if (isAliveRef.current) {
      restoreNormalArenaAfterBoss();
    }

    if (shouldBroadcast) {
      sendBossState(true);
    }
  }

  function adoptBossState(payload) {
    if (!payload) {
      return;
    }

    if (payload.phase === "inactive") {
      if ((payload.resetAt || 0) >= (bossStateRef.current.updatedAt || 0)) {
        nextBossAtRef.current = payload.nextBossAt || 0;
        nextBossStageRef.current = payload.nextBossStage || 0;
        const wasBossMode = isBossModePhase(bossStateRef.current.phase);
        bossStateRef.current = {
          ...createEmptyBossState(),
          updatedAt: payload.updatedAt || Date.now(),
          resetAt: payload.resetAt || 0,
        };
        syncBossUi();

        if (wasBossMode && isAliveRef.current) {
          restoreNormalArenaAfterBoss();
        }
      }
      return;
    }

    if (!isBossModePhase(payload.phase)) {
      return;
    }

    const current = bossStateRef.current;
    const incomingStart = payload.transitionStartedAt || 0;
    const currentStart = current.transitionStartedAt || Number.POSITIVE_INFINITY;
    const incomingHealth = payload.boss?.health ?? Number.POSITIVE_INFINITY;
    const currentHealth = current.boss?.health ?? Number.POSITIVE_INFINITY;
    const shouldAdopt =
      !isBossModePhase(current.phase) ||
      incomingStart < currentStart ||
      (incomingStart === currentStart && payload.phase === "defeated" && current.phase !== "defeated") ||
      (incomingStart === currentStart && incomingHealth < currentHealth) ||
      (incomingStart === currentStart && (payload.updatedAt || 0) >= (current.updatedAt || 0));

    if (!shouldAdopt) {
      return;
    }

    bossStateRef.current = {
      ...createEmptyBossState(),
      ...payload,
      playerShots: current.playerShots,
      bossSpikes: current.bossSpikes,
    };
    nextBossAtRef.current = payload.nextBossAt || nextBossAtRef.current || 0;
    nextBossStageRef.current = payload.nextBossStage ?? nextBossStageRef.current;

    clearStandardArenaForBoss();
    syncBossUi();

    if (isAliveRef.current) {
      normalizeLocalForBoss({ broadcast: false });
      sendPlayerState(true);
    }

    if (
      payload.phase === "defeated" &&
      Array.isArray(payload.bonusPoints) &&
      payload.bonusPoints.length === 0 &&
      Array.isArray(payload.specialItems) &&
      payload.specialItems.length === 0
    ) {
      restoreNormalModeFromBoss(payload.updatedAt || Date.now(), false);
    }
  }

  function getLocalCentroidAndRadius() {
    const blobs = blobsRef.current;

    if (!blobs.length) {
      return {
        x: WORLD_WIDTH / 2,
        y: WORLD_HEIGHT / 2,
        radius: 22,
      };
    }

    return {
      ...getBlobCentroid(blobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2),
      radius: getCombinedRadius(blobs),
    };
  }

  function sendSpikeState(force = false) {
    const channel = channelRef.current;

    if (!channel || !isAliveRef.current) {
      return;
    }

    const now = Date.now();

    if (!force && now - lastSpikeBroadcastRef.current < 2_000) {
      return;
    }

    lastSpikeBroadcastRef.current = now;

    try {
      channel.send({
        type: "broadcast",
        event: "spike_state",
        payload: {
          sessionId: sessionIdRef.current,
          spikes: spikesRef.current,
          warnings: warningZonesRef.current,
          generatedAt: spikeEpochRef.current,
          sentAt: now,
        },
      });
    } catch (error) {
      console.error("[AgarCell] failed to send spike_state", error);
    }
  }

  function sendPlayerState(force = false) {
    const channel = channelRef.current;

    if (!channel || !isAliveRef.current || !playerNameRef.current) {
      return;
    }

    const now = Date.now();

    if (!force && now - lastBroadcastRef.current < STATE_BROADCAST_MS) {
      return;
    }

    lastBroadcastRef.current = now;

    const local = getLocalCentroidAndRadius();
    const activeItem = getActiveItem(now);

    try {
      channel.send({
        type: "broadcast",
        event: "player_state",
        payload: {
          sessionId: sessionIdRef.current,
          username: playerNameRef.current,
          color: playerColorRef.current,
          x: local.x,
          y: local.y,
          radius: local.radius,
          parts: blobsRef.current.length,
          blobs: serializeBlobs(blobsRef.current),
          score: scoreRef.current,
          skin: currentSkinRef.current,
          activeItem: activeItem
            ? {
                itemType: activeItem.itemType,
                itemName: activeItem.itemName,
                iconSrc: activeItem.iconSrc,
                expiresAt: activeItem.expiresAt,
              }
            : null,
          alive: true,
          updatedAt: now,
        },
      });
    } catch (error) {
      console.error("[AgarCell] failed to send player_state", error);
    }
  }

  function sendPlayerLeave(reason = "left") {
    const channel = channelRef.current;

    if (!channel || leaveSentRef.current) {
      return;
    }

    leaveSentRef.current = true;

    try {
      channel.send({
        type: "broadcast",
        event: "player_left",
        payload: {
          sessionId: sessionIdRef.current,
          reason,
          at: Date.now(),
        },
      });

      channel.untrack();
    } catch (error) {
      console.error("[AgarCell] failed to send player_left", error);
    }
  }

  function sendParticipantDisconnected(victimSessionId, sourceSessionId, sourceName) {
    const channel = channelRef.current;

    if (!channel) {
      return;
    }

    try {
      channel.send({
        type: "broadcast",
        event: "participant_inactive",
        payload: {
          victimSessionId,
          sourceSessionId,
          sourceName,
          at: Date.now(),
        },
      });
    } catch (error) {
      console.error("[AgarCell] failed to send participant_inactive", error);
    }
  }

  function sendParticipantStateReduced(victimSessionId, sourceSessionId, sourceName, affectedBlob) {
    const channel = channelRef.current;

    if (!channel || !affectedBlob) {
      return;
    }

    try {
      channel.send({
        type: "broadcast",
        event: "participant_state_reduced",
        payload: {
          victimSessionId,
          sourceSessionId,
          sourceName,
          blob: {
            x: round1(affectedBlob.x),
            y: round1(affectedBlob.y),
            radius: round1(affectedBlob.radius),
          },
          at: Date.now(),
        },
      });
    } catch (error) {
      console.error("[AgarCell] failed to send participant_state_reduced", error);
    }
  }

  function sendEjectedFood(piece) {
    const channel = channelRef.current;

    if (!channel || !piece) {
      return;
    }

    try {
      channel.send({
        type: "broadcast",
        event: "ejected_food",
        payload: {
          ...piece,
          at: Date.now(),
        },
      });
    } catch (error) {
      console.error("[AgarCell] failed to send ejected_food", error);
    }
  }

  function sendEjectedFoodConsumed(pieceId) {
    const channel = channelRef.current;

    if (!channel || !pieceId) {
      return;
    }

    try {
      channel.send({
        type: "broadcast",
        event: "ejected_food_consumed",
        payload: {
          pieceId,
          consumerSessionId: sessionIdRef.current,
          at: Date.now(),
        },
      });
    } catch (error) {
      console.error("[AgarCell] failed to send ejected_food_consumed", error);
    }
  }

  function clearRemotePlayer(sessionId) {
    const deleted = remotePlayersRef.current.delete(sessionId);

    if (deleted) {
      setOnlinePlayers(remotePlayersRef.current.size + 1);
      setLeaderboardPlayers((prev) => prev.filter((p) => p.sessionId !== sessionId));
      maybeResetBossStateIfIdle();
    }
  }

  function handleSessionEnd(sourceName = "Another participant") {
    if (!isAliveRef.current) {
      return;
    }

    isAliveRef.current = false;
    setCellStartedValue(false);
    setStartCountdown(0);
    spikeLogicStartedLoggedRef.current = false;
    sendPlayerLeave("dead");
    setLeaderboardPlayers((prev) => prev.filter((p) => !p.isLocal));
    currentSkinRef.current = null;
    setCurrentSkin(null);
    setDeathReason(`Session ended after interaction with ${sourceName}.`);
    setShowGate(true);
    setGuestName("");
    setFaceExpression("serious");
    prevScoreForFaceRef.current = 0;
    resetCell({ includeObstacles: false });
    maybeResetBossStateIfIdle();
  }

  function applyLocalBlobLoss(eatenBlobSnapshot = null) {
    if (!isAliveRef.current) {
      return;
    }

    const current = blobsRef.current;

    if (!current.length) {
      return;
    }

    let removeIndex = current.length - 1;

    if (eatenBlobSnapshot) {
      let bestScore = Infinity;

      for (let i = 0; i < current.length; i += 1) {
        const blob = current[i];
        const dx = blob.x - eatenBlobSnapshot.x;
        const dy = blob.y - eatenBlobSnapshot.y;
        const distScore = Math.hypot(dx, dy);
        const radiusScore = Math.abs(blob.radius - eatenBlobSnapshot.radius) * 4;
        const totalScore = distScore + radiusScore;

        if (totalScore < bestScore) {
          bestScore = totalScore;
          removeIndex = i;
        }
      }
    }

    const next = current.filter((_, index) => index !== removeIndex);
    blobsRef.current = next;

    // Deduct score proportional to the lost blob's size.
    const lostBlob = current[removeIndex];
    if (lostBlob) {
      const penalty = Math.max(3, Math.round(lostBlob.radius * 0.6));
      setScoreValue(Math.max(0, scoreRef.current - penalty));
    }

    if (!next.length) {
      return;
    }

    updateHudFromBlobs(next);

    if (next.length > 1 && !mergeStateRef.current.nextMergeAt) {
      mergeStateRef.current.nextMergeAt = Date.now() + getMergeDelayMs(next.length);
    }

    sendPlayerState(true);
  }

  function applyRemoteBlobLoss(remoteSessionId, remoteBlobIndex, remoteBlobSnapshot = null) {
    const remote = remotePlayersRef.current.get(remoteSessionId);

    if (!remote) {
      return null;
    }

    const blobs = Array.isArray(remote.blobs) ? remote.blobs : [];

    if (!blobs.length) {
      clearRemotePlayer(remoteSessionId);
      return null;
    }

    let safeIndex = Math.max(0, Math.min(remoteBlobIndex, blobs.length - 1));

    if (remoteBlobSnapshot) {
      let bestScore = Infinity;

      for (let i = 0; i < blobs.length; i += 1) {
        const blob = blobs[i];
        const dx = blob.x - remoteBlobSnapshot.x;
        const dy = blob.y - remoteBlobSnapshot.y;
        const distScore = Math.hypot(dx, dy);
        const radiusScore = Math.abs(blob.radius - remoteBlobSnapshot.radius) * 4;
        const totalScore = distScore + radiusScore;

        if (totalScore < bestScore) {
          bestScore = totalScore;
          safeIndex = i;
        }
      }
    }

    const eatenBlob = blobs[safeIndex];
    const nextBlobs = blobs.filter((_, index) => index !== safeIndex);

    if (!nextBlobs.length) {
      clearRemotePlayer(remoteSessionId);
      return eatenBlob;
    }

    const summary = summarizeBlobs(nextBlobs, remote.x, remote.y);

    remotePlayersRef.current.set(remoteSessionId, {
      ...remote,
      x: summary.x,
      y: summary.y,
      radius: summary.radius,
      parts: summary.parts,
      blobs: nextBlobs,
      updatedAt: Date.now(),
    });

    return eatenBlob;
  }

  // Returns a spawn position that is clear of spikes, warning zones, other players and bots.
  function findSafeSpawnPos() {
    const SPAWN_R    = 22;   // starting radius
    const PADDING    = 180;  // distance from world edge
    const MAX_TRIES  = 120;

    const obstacles = [
      ...spikesRef.current.map((s) => ({ x: s.x, y: s.y, r: s.radius + SPAWN_R + 80 })),
      ...warningZonesRef.current.map((w) => ({ x: w.x, y: w.y, r: w.radius + SPAWN_R + 50 })),
      ...[...remotePlayersRef.current.values()].map((p) => ({ x: p.x, y: p.y, r: p.radius + SPAWN_R + 70 })),
      ...botsRef.current
        .filter((b) => b.active && b.blobs.length > 0)
        .flatMap((b) => b.blobs.map((bl) => ({ x: bl.x, y: bl.y, r: bl.radius + SPAWN_R + 70 }))),
    ];

    for (let i = 0; i < MAX_TRIES; i += 1) {
      const x = PADDING + Math.random() * (WORLD_WIDTH  - PADDING * 2);
      const y = PADDING + Math.random() * (WORLD_HEIGHT - PADDING * 2);
      if (obstacles.every((o) => Math.hypot(x - o.x, y - o.y) >= o.r)) {
        return { x, y };
      }
    }

    // Fallback: centre of world (shouldn't normally be reached)
    return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  }

  function resetCell({ includeObstacles = true } = {}) {
    const canvas = canvasRef.current;
    const bossMode = isBossModePhase(bossStateRef.current.phase);

    if (!canvas) {
      return;
    }

    if (includeObstacles && !bossMode) {
      const now = Date.now();
      spikeEpochRef.current = now;
      spikesRef.current = createInitialSpikes(SPIKE_MAX_COUNT, now, WORLD_WIDTH, WORLD_HEIGHT);
      warningZonesRef.current = [];
      botsRef.current = createBots(now);
    } else {
      spikesRef.current = [];
      warningZonesRef.current = [];
      botsRef.current = [];
    }
    spikeImmunityUntilRef.current = 0;
    ejectedFoodRef.current = [];
    worldItemsRef.current = [];
    nextWorldItemSpawnAtRef.current = 0;

    // Pick a safe spawn that avoids spikes and other players.
    const { x: centerX, y: centerY } = findSafeSpawnPos();

    blobsRef.current = bossMode
      ? normalizeBlobsForBoss([createBlob(centerX, centerY, 22)], createBlob)
      : [createBlob(centerX, centerY, 22)];
    foodRef.current = includeObstacles && !bossMode
      ? createFood(
          FOOD_TARGET,
          WORLD_WIDTH,
          WORLD_HEIGHT,
          getRestrictedZones(spikesRef.current, warningZonesRef.current)
        )
      : [];

    const viewWidth = canvas.clientWidth || 1280;
    const viewHeight = canvas.clientHeight || 720;

    const cameraX = clamp(centerX, viewWidth / 2, WORLD_WIDTH - viewWidth / 2);
    const cameraY = clamp(centerY, viewHeight / 2, WORLD_HEIGHT - viewHeight / 2);

    cameraRef.current = {
      x: cameraX,
      y: cameraY,
    };
    zoomRef.current = 1;

    mouseTargetRef.current = {
      x: centerX,
      y: centerY,
    };

    mergeStateRef.current = {
      nextMergeAt: null,
    };

    setScoreValue(0);
    updateHudFromBlobs(blobsRef.current);
  }

  function beginCellRun(safeName) {
    leaveSentRef.current = false;
    playerNameRef.current = safeName;
    playerColorRef.current = colorFromId(`${sessionIdRef.current}-${safeName}`);
    setPlayerColor(playerColorRef.current);
    isAliveRef.current = true;
    runStartedAtRef.current = Date.now();
    nextBossAtRef.current = 0;
    spikeLogicStartedLoggedRef.current = false;
    setUsername(safeName);
    setDeathReason("");
    resetCell({ includeObstacles: true });
    bossStateRef.current = createEmptyBossState();
    worldItemsRef.current = [];
    scheduleNextWorldItemSpawn(runStartedAtRef.current);

    setCellStartedValue(true);
    setShowGate(false);
    console.info("[AgarCell] Education started", { safeName });
    sendSpikeState(true);

    const channel = channelRef.current;
    if (channel && typeof channel.track === "function") {
      try {
        channel.track({
          sessionId: sessionIdRef.current,
          username: safeName,
        });
      } catch (error) {
        console.error("[AgarCell] failed to track presence", error);
      }
    }

    sendPlayerState(true);
  }

  function startRunWithUsername(name) {
    const safeName = sanitizeUsername(name);

    if (!safeName) {
      return;
    }

    try {
      setUsername(safeName);
      setDeathReason("");
      setShowGate(false);

      if (startCountdownTimerRef.current) {
        clearInterval(startCountdownTimerRef.current);
      }

      setCellStartedValue(false);
      setStartCountdown(3);
      resetCell({ includeObstacles: false });

      startCountdownTimerRef.current = setInterval(() => {
        setStartCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(startCountdownTimerRef.current);
            startCountdownTimerRef.current = null;
            beginCellRun(safeName);
            return 0;
          }

          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      isAliveRef.current = false;
      setCellStartedValue(false);
      setStartCountdown(0);
      console.error("[AgarCell] failed to start education", error);
      setDeathReason("Failed to start cell. Please try again.");
      setShowGate(true);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    let isDisposed = false;

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      rafReadyRef.current = true;
    }

    function handleMouseMove(event) {
      const target = mouseTargetRef.current;
      const rect = canvas.getBoundingClientRect();
      const viewX = event.clientX - rect.left;
      const viewY = event.clientY - rect.top;
      const camera = cameraRef.current;

      const zoom = zoomRef.current;
      target.x = clamp(camera.x + (viewX - canvas.clientWidth / 2) / zoom, 0, WORLD_WIDTH);
      target.y = clamp(camera.y + (viewY - canvas.clientHeight / 2) / zoom, 0, WORLD_HEIGHT);
    }

    function handleCanvasClick(event) {
      if (!isAliveRef.current || !cellStartedRef.current) {
        return;
      }

      if (!isItemActive("teleport")) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const viewX = event.clientX - rect.left;
      const viewY = event.clientY - rect.top;
      const camera = cameraRef.current;
      const zoom = zoomRef.current;
      const targetX = clamp(camera.x + (viewX - canvas.clientWidth / 2) / zoom, 0, WORLD_WIDTH);
      const targetY = clamp(camera.y + (viewY - canvas.clientHeight / 2) / zoom, 0, WORLD_HEIGHT);

      const current = blobsRef.current;
      if (!current.length) {
        return;
      }

      const localRadius = getCombinedRadius(current);

      if (!isTeleportTargetAllowed(targetX, targetY, localRadius)) {
        return;
      }

      const centroid = getBlobCentroid(current, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
      const dx = targetX - centroid.x;
      const dy = targetY - centroid.y;

      blobsRef.current = current.map((blob) => ({
        ...blob,
        x: clamp(blob.x + dx, blob.radius, WORLD_WIDTH - blob.radius),
        y: clamp(blob.y + dy, blob.radius, WORLD_HEIGHT - blob.radius),
      }));

      sendPlayerState(true);
    }

    function handleKeyDown(event) {
      if (!isAliveRef.current || !cellStartedRef.current) {
        return;
      }

      const activeItem = getActiveItem();

      if (activeItem && (activeItem.itemType === "map" || activeItem.itemType === "teleport")) {
        if (event.code === "ArrowUp") {
          event.preventDefault();
          freeViewOffsetRef.current.y -= MAP_PAN_STEP;
          return;
        }
        if (event.code === "ArrowDown") {
          event.preventDefault();
          freeViewOffsetRef.current.y += MAP_PAN_STEP;
          return;
        }
        if (event.code === "ArrowLeft") {
          event.preventDefault();
          freeViewOffsetRef.current.x -= MAP_PAN_STEP;
          return;
        }
        if (event.code === "ArrowRight") {
          event.preventDefault();
          freeViewOffsetRef.current.x += MAP_PAN_STEP;
          return;
        }
      }

      if (event.code === "KeyE") {
        event.preventDefault();
        ejectFood();
        return;
      }

      if (isBossModePhase(bossStateRef.current.phase)) {
        return;
      }

      if (event.code !== "Space") {
        return;
      }

      event.preventDefault();

      const beforeCount = blobsRef.current.length;
      const splitBlobs = splitAndJump(blobsRef.current, mouseTargetRef.current, createBlob);
      const didSplit = splitBlobs.length > beforeCount;

      blobsRef.current = splitBlobs;
      updateHudFromBlobs(splitBlobs);

      if (didSplit) {
        mergeStateRef.current.nextMergeAt = Date.now() + getMergeDelayMs(splitBlobs.length);
        sendPlayerState(true);
      }
    }

    function pruneStaleRemotePlayers() {
      const now = Date.now();
      let removedAny = false;

      for (const [sessionId, player] of remotePlayersRef.current.entries()) {
        if (now - player.updatedAt > REMOTE_STALE_MS) {
          remotePlayersRef.current.delete(sessionId);
          removedAny = true;
        }
      }

      if (removedAny) {
        setOnlinePlayers(remotePlayersRef.current.size + 1);
      }
    }

    function smoothRemotePlayers() {
      const lerp = 0.24;

      for (const remote of remotePlayersRef.current.values()) {
        if (typeof remote.renderX !== "number") {
          remote.renderX = remote.x;
          remote.renderY = remote.y;
          remote.renderRadius = remote.radius;
        }

        remote.renderX += (remote.x - remote.renderX) * lerp;
        remote.renderY += (remote.y - remote.renderY) * lerp;
        remote.renderRadius += (remote.radius - remote.renderRadius) * lerp;

        if (!remote.blobs?.length) {
          continue;
        }

        remote.blobs = remote.blobs.map((blob) => {
          const next = { ...blob };

          if (typeof next.renderX !== "number") {
            next.renderX = next.x;
            next.renderY = next.y;
            next.renderRadius = next.radius;
          }

          next.renderX += (next.x - next.renderX) * lerp;
          next.renderY += (next.y - next.renderY) * lerp;
          next.renderRadius += (next.radius - next.renderRadius) * lerp;

          return next;
        });
      }
    }

    function cellLoop() {
      if (!rafReadyRef.current) {
        animationRef.current = requestAnimationFrame(cellLoop);
        return;
      }

      try {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const now = Date.now();
      const bossPhase = "inactive";
      const backgroundColor = "#0b1325";

      if (bossStateRef.current.phase !== "inactive") {
        bossStateRef.current = createEmptyBossState();
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      let blobs = blobsRef.current;
      let activeItem = getActiveItem(now);

      if (activeItemRef.current && !activeItem) {
        const consumedType = activeItemRef.current.itemType;
        clearActiveItemEffect(consumedType);
        sendPlayerState(true);
      }

      activeItem = getActiveItem(now);
      const cloakActive = activeItem?.itemType === "cloak";
      const mapScoutActive = activeItem?.itemType === "map";
      const teleportActive = activeItem?.itemType === "teleport";
      const shieldActive = activeItem?.itemType === "shield";
      const magnetActive = activeItem?.itemType === "magnet";

      let bossMode = false;

      if (cellStartedRef.current && isAliveRef.current && !bossMode) {
        maybeSpawnWorldItem(now);

        if (!spikeLogicStartedLoggedRef.current) {
          spikeLogicStartedLoggedRef.current = true;
          console.info("[AgarCell] Spike logic started");
        }

        const prevSpikeHash = spikesRef.current.map((s) => `${s.id}:${Math.round(s.x)},${Math.round(s.y)}`).join("|") + "/" + warningZonesRef.current.length;
        const spikeState = updateSpikesAndWarnings({
          spikes: spikesRef.current,
          warnings: warningZonesRef.current,
          now,
          worldWidth: WORLD_WIDTH,
          worldHeight: WORLD_HEIGHT,
        });

        spikesRef.current = spikeState.spikes;
        warningZonesRef.current = spikeState.warnings;

        const nextSpikeHash = spikeState.spikes.map((s) => `${s.id}:${Math.round(s.x)},${Math.round(s.y)}`).join("|") + "/" + spikeState.warnings.length;
        if (prevSpikeHash !== nextSpikeHash) {
          sendSpikeState();
        }
      }

      if (isAliveRef.current && cellStartedRef.current) {
        updateBlobMovement(blobs, mouseTargetRef.current, bossMode ? 3 : 1);
        separateOverlappingBlobs(blobs);
        bossMode = isBossModePhase(bossStateRef.current.phase);

        if (shieldActive) {
          applyShieldPushback(blobs);
        }

        if (bossMode) {
          clearStandardArenaForBoss();

          if (
            blobs.length !== 1 ||
            Math.abs((blobs[0]?.radius || 0) - BOSS_PLAYER_RADIUS) > 0.5
          ) {
            normalizeLocalForBoss({ broadcast: false });
            blobs = blobsRef.current;
          }

          let bossNeedsBroadcast = false;
          let localScoreDelta = 0;

          if (bossStateRef.current.phase === "active" && bossStateRef.current.boss) {
            const activeTarget = getLargestHumanTarget(
              blobs,
              {
                sessionId: sessionIdRef.current,
                radius: getCombinedRadius(blobs),
                score: scoreRef.current,
              },
              remotePlayersRef.current
            );
            bossStateRef.current.boss = moveBossTowardTarget(bossStateRef.current.boss, activeTarget);
            const boss = bossStateRef.current.boss;
            keepBossGap(blobs, boss);
            const activeShots = [];
            let nextHealth = boss.health;

            for (const shot of bossStateRef.current.playerShots) {
              if (now >= shot.expiresAt) {
                continue;
              }

              const nextShot = advanceLinearProjectile(shot);
              const distanceToBoss = Math.hypot(nextShot.x - boss.x, nextShot.y - boss.y);

              if (distanceToBoss <= boss.radius + nextShot.radius) {
                nextHealth = Math.max(0, nextHealth - 1);
                bossNeedsBroadcast = true;
                continue;
              }

              activeShots.push(nextShot);
            }

            bossStateRef.current.playerShots = activeShots;

            if (nextHealth !== boss.health) {
              boss.health = nextHealth;
              syncBossUi();

              if (nextHealth <= 0) {
                defeatBoss(now, false);
                bossNeedsBroadcast = true;
              }
            }

            if (bossStateRef.current.phase === "active") {
              if (now - (boss.lastSpikeAt || 0) >= BOSS_SPIKE_INTERVAL_MS) {
                bossStateRef.current.bossSpikes.push(...createBossRadialVolley(boss, 14, now));
                boss.lastSpikeAt = now;
              }

              let wasHitBySpike = false;

              bossStateRef.current.bossSpikes = bossStateRef.current.bossSpikes.filter((spike) => {
                if (now >= spike.expiresAt) {
                  return false;
                }

                const nextSpike = advanceLinearProjectile(spike);
                const collided = blobs.some(
                  (blob) => Math.hypot(blob.x - nextSpike.x, blob.y - nextSpike.y) <= blob.radius + nextSpike.radius
                );

                if (collided) {
                  wasHitBySpike = true;
                  return false;
                }

                spike.x = nextSpike.x;
                spike.y = nextSpike.y;
                return true;
              });

              if (wasHitBySpike) {
                const nextScore = Math.max(0, scoreRef.current - BOSS_HIT_SCORE_DAMAGE);
                setScoreValue(nextScore);
                sendPlayerState(true);

                if (nextScore <= 0) {
                  handleSessionEnd("the raid boss");
                  animationRef.current = requestAnimationFrame(cellLoop);
                  return;
                }
              }
            }
          }

          if (!cloakActive && blobs.length) {
            const localBlob = blobs[0];

            for (const remote of remotePlayersRef.current.values()) {
              const remoteCloakActive =
                remote.activeItem?.itemType === "cloak" && remote.activeItem.expiresAt > now;

              if (remoteCloakActive) {
                continue;
              }

              const remoteBlob = remote.blobs?.[0] || {
                x: remote.x,
                y: remote.y,
                radius: remote.radius,
              };
              const distance = Math.hypot(localBlob.x - remoteBlob.x, localBlob.y - remoteBlob.y);
              const overlapDepth = localBlob.radius + remoteBlob.radius - distance;

              if (overlapDepth < remoteBlob.radius * 0.55) {
                continue;
              }

              const remoteScore = typeof remote.score === "number" ? remote.score : 0;
              const localWins =
                scoreRef.current > remoteScore ||
                (scoreRef.current === remoteScore && sessionIdRef.current.localeCompare(remote.sessionId) < 0);

              if (localWins) {
                const eatenBlob = applyRemoteBlobLoss(remote.sessionId, 0, remoteBlob) || remoteBlob;
                setScoreValue(scoreRef.current + Math.max(6, Math.round((eatenBlob?.radius || 0) * 0.9)));
                sendParticipantStateReduced(
                  remote.sessionId,
                  sessionIdRef.current,
                  playerNameRef.current || "Unknown",
                  eatenBlob
                );
                sendPlayerState(true);
              } else {
                sendParticipantDisconnected(
                  sessionIdRef.current,
                  remote.sessionId,
                  remote.username || "Another participant"
                );
                handleSessionEnd(remote.username || "Another participant");
                animationRef.current = requestAnimationFrame(cellLoop);
                return;
              }

              break;
            }
          }

          if (bossStateRef.current.bonusPoints.length) {
            bossStateRef.current.bonusPoints = bossStateRef.current.bonusPoints.filter((pickup) => {
              const collected = blobs.some(
                (blob) => Math.hypot(blob.x - pickup.x, blob.y - pickup.y) <= blob.radius + pickup.radius
              );

              if (!collected) {
                return true;
              }

              localScoreDelta += pickup.value;
              bossNeedsBroadcast = true;
              return false;
            });
          }

          if (bossStateRef.current.specialItems.length) {
            const pickedSpecialItems = [];

            bossStateRef.current.specialItems = bossStateRef.current.specialItems.filter((item) => {
              const collected = blobs.some(
                (blob) => Math.hypot(blob.x - item.x, blob.y - item.y) <= blob.radius + item.radius
              );

              if (collected) {
                pickedSpecialItems.push(item);
                bossNeedsBroadcast = true;
                return false;
              }

              return true;
            });

            if (pickedSpecialItems.length) {
              registerCollectedBossItems(pickedSpecialItems);
            }
          }

          if (
            bossStateRef.current.phase === "defeated" &&
            bossStateRef.current.rewardDropped &&
            bossStateRef.current.bonusPoints.length === 0 &&
            bossStateRef.current.specialItems.length === 0
          ) {
            restoreNormalModeFromBoss(now, true);
            bossMode = false;
            blobs = blobsRef.current;
          }

          if (localScoreDelta > 0) {
            setScoreValue(scoreRef.current + localScoreDelta);
            sendPlayerState(true);
          }

          if (bossNeedsBroadcast) {
            sendBossState(true);
          }
        } else {
          if (magnetActive) {
            const currentZoom = Math.max(0.08, zoomRef.current || 1);
            const visibleRange = Math.min(width, height) / (2 * currentZoom);
            applyMagnetEffect(blobs, visibleRange);
          }

          // Skip warning avoidance + collision while immune; immune player passes through freely
          const isSpImmune = now < spikeImmunityUntilRef.current || shieldActive;
          if (!isSpImmune) {
            keepBlobsOutsideWarnings(blobs, warningZonesRef.current);

            const hitSpike = findSpikeCollision(blobs, spikesRef.current);
            if (hitSpike && getCombinedRadius(blobs) >= 20) {
              const beforeCount = blobs.length;
              const splitToMax = splitToMaxCells(blobs, createBlob, hitSpike, 16);
              const didSplit = splitToMax.length > beforeCount;
              blobsRef.current = splitToMax;
              blobs = splitToMax;
              spikeImmunityUntilRef.current = now + 10_000;
              if (didSplit) {
                mergeStateRef.current.nextMergeAt = now + getMergeDelayMs(splitToMax.length);
                updateHudFromBlobs(splitToMax);
                sendPlayerState(true);
              }
            }
          }

          const { gainedScore, remainingFood } = consumeFood(blobs, foodRef.current);
          foodRef.current = replenishFood(
            remainingFood,
            WORLD_WIDTH,
            WORLD_HEIGHT,
            getRestrictedZones(spikesRef.current, warningZonesRef.current)
          );

          if (gainedScore > 0) {
            setScoreValue(scoreRef.current + gainedScore);
            updateHudFromBlobs(blobs);
          }

          if (worldItemsRef.current.length) {
            const pickedSpecialItems = [];

            worldItemsRef.current = worldItemsRef.current.filter((item) => {
              const collected = blobs.some(
                (blob) => Math.hypot(blob.x - item.x, blob.y - item.y) <= blob.radius + item.radius
              );

              if (!collected) {
                return true;
              }

              pickedSpecialItems.push(item);
              return false;
            });

            if (pickedSpecialItems.length) {
              registerCollectedBossItems(pickedSpecialItems);
            }
          }

          ejectedFoodRef.current = ejectedFoodRef.current
            .filter((p) => now - p.createdAt < 30_000)
            .map((p) => ({
              ...p,
              x: clamp(p.x + p.vx, p.radius, WORLD_WIDTH - p.radius),
              y: clamp(p.y + p.vy, p.radius, WORLD_HEIGHT - p.radius),
              vx: p.vx * 0.92,
              vy: p.vy * 0.92,
            }));

          if (ejectedFoodRef.current.length) {
            let gained = 0;
            const eaten = new Set();
            for (const piece of ejectedFoodRef.current) {
              for (const blob of blobs) {
                if (!eaten.has(piece.id) && blob.radius >= 3 &&
                    Math.hypot(blob.x - piece.x, blob.y - piece.y) < blob.radius) {
                  eaten.add(piece.id);
                  gained += piece.value;
                  growBlobWithinGroup(blobs, blob, piece.value * SCORE_AREA_PER_POINT);
                  sendEjectedFoodConsumed(piece.id);
                }
              }
            }
            if (eaten.size) {
              ejectedFoodRef.current = ejectedFoodRef.current.filter((p) => !eaten.has(p.id));
              if (gained > 0) {
                setScoreValue(scoreRef.current + gained);
                updateHudFromBlobs(blobs);
                sendPlayerState(true);
              }
            }
          }

          {
            const totalHumans = 1 + remotePlayersRef.current.size;
            const maxActive = Math.max(0, 10 - totalHumans);
            const botResult = updateBots({
              bots: botsRef.current,
              now,
              food: foodRef.current,
              maxActive,
              localBlobs: blobs,
              remotePlayers: remotePlayersRef.current,
            });
            botsRef.current = botResult.bots;
            foodRef.current = foodRef.current.filter((_, i) => !botResult.consumedFoodIndices.has(i));

            const { updatedBots, nextLocalBlobs, botAteLocal, eatenLocalBlobs } = resolveBotVsLocal(botsRef.current, blobs);
            if (botAteLocal && !cloakActive) {
              botsRef.current = updatedBots;
              blobs = nextLocalBlobs;
              blobsRef.current = nextLocalBlobs;
              const penalty = eatenLocalBlobs.reduce(
                (sum, b) => sum + Math.max(3, Math.round(b.radius * 0.6)), 0
              );
              setScoreValue(Math.max(0, scoreRef.current - penalty));
              updateHudFromBlobs(nextLocalBlobs);
              sendPlayerState(true);
              if (!nextLocalBlobs.length) {
                handleSessionEnd("an automated participant");
                animationRef.current = requestAnimationFrame(cellLoop);
                return;
              }
            }
          }

          const botRemotes = botsRef.current
            .filter(b => b.active && b.blobs.length > 0)
            .map(b => ({
              sessionId: b.id,
              id: b.id,
              username: b.name,
              color: b.color,
              x: b.blobs[0].x,
              y: b.blobs[0].y,
              radius: b.blobs[0].radius,
              blobs: b.blobs,
              isBot: true,
            }));

          const pvpTargets = [...remotePlayersRef.current.values(), ...botRemotes].filter((target) => {
            const tActive = target.activeItem;
            return !(tActive?.itemType === "cloak" && tActive.expiresAt > now);
          });

          if (!cloakActive) {
            resolvePvpCombat(blobs, pvpTargets, {
            onLocalEatRemoteBlob(remote, remoteBlobIndex, remoteBlob) {
              if (remote.isBot) {
                botsRef.current = botsRef.current.map(bot =>
                  bot.id === remote.id
                    ? { ...bot, blobs: bot.blobs.filter((_, i) => i !== remoteBlobIndex) }
                    : bot
                );
                setScoreValue(scoreRef.current + Math.max(6, Math.round((remoteBlob?.radius || 0) * 0.9)));
                updateHudFromBlobs(blobs);
                sendPlayerState(true);
                return;
              }
              const eatenBlob =
                applyRemoteBlobLoss(remote.sessionId, remoteBlobIndex, remoteBlob) || remoteBlob;
              setScoreValue(scoreRef.current + Math.max(6, Math.round((eatenBlob?.radius || 0) * 0.9)));
              updateHudFromBlobs(blobs);
              sendParticipantStateReduced(
                remote.sessionId,
                sessionIdRef.current,
                playerNameRef.current || "Unknown",
                eatenBlob
              );

              sendPlayerState(true);
            },
            });
          }
        }
      }

      pruneStaleRemotePlayers();
      smoothRemotePlayers();

      const centroid = getBlobCentroid(blobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
      const scoutCameraActive = !bossMode && (mapScoutActive || teleportActive);
      const cameraFocusX = scoutCameraActive
        ? centroid.x + freeViewOffsetRef.current.x
        : centroid.x;
      const cameraFocusY = scoutCameraActive
        ? centroid.y + freeViewOffsetRef.current.y
        : centroid.y;

      // Dynamic zoom: larger player sees more of the arena.
      const combinedRadius = blobs.length ? getCombinedRadius(blobs) : 22;
      const baseZoom = clamp(Math.pow(60 / Math.max(combinedRadius, 1), 0.5), 0.25, 1.0);
      const targetZoom = scoutCameraActive
        ? clamp(baseZoom / 4, 0.08, 0.35)
        : bossMode
          ? clamp(baseZoom / 4, 0.08, 0.35)
          : baseZoom;
      zoomRef.current += (targetZoom - zoomRef.current) * 0.05;
      const zoom = zoomRef.current;

      const halfViewW = width / (2 * zoom);
      const halfViewH = height / (2 * zoom);
      cameraRef.current.x = clamp(cameraFocusX, halfViewW, Math.max(halfViewW, WORLD_WIDTH - halfViewW));
      cameraRef.current.y = clamp(cameraFocusY, halfViewH, Math.max(halfViewH, WORLD_HEIGHT - halfViewH));

      const camera = cameraRef.current;

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camera.x, -camera.y);

      drawGrid(
        ctx,
        camera,
        width / zoom,
        height / zoom,
        GRID_SIZE,
        bossMode ? "rgba(15, 23, 42, 0.12)" : "rgba(148, 163, 184, 0.2)"
      );

      ctx.strokeStyle = bossMode ? "rgba(15, 23, 42, 0.35)" : "rgba(148, 163, 184, 0.55)";
      ctx.lineWidth = 5;
      ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      if (cellStartedRef.current && !bossMode) {
        drawWarningZones(ctx, warningZonesRef.current, now);
        drawSpikeBalls(ctx, spikesRef.current);
      }

      for (const point of foodRef.current) {
        drawCircle(ctx, point.x, point.y, point.radius, point.color);
      }

      // ── Ejected food: glowing blue circles ──
      if (ejectedFoodRef.current.length) {
        ctx.save();
        ctx.shadowColor = "#60a5fa";
        ctx.shadowBlur  = 10;
        for (const piece of ejectedFoodRef.current) {
          ctx.beginPath();
          ctx.arc(piece.x, piece.y, piece.radius, 0, Math.PI * 2);
          ctx.fillStyle = "#3b82f6";
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      if (bossStateRef.current.bonusPoints.length) {
        ctx.save();
        for (const pickup of bossStateRef.current.bonusPoints) {
          ctx.shadowColor = pickup.glow;
          ctx.shadowBlur = pickup.kind === "bonus" ? 18 : 12;
          drawCircle(ctx, pickup.x, pickup.y, pickup.radius, pickup.color);
        }
        ctx.restore();
      }

      const visibleWorldItems = worldItemsRef.current.length
        ? worldItemsRef.current
        : bossStateRef.current.specialItems;

      if (visibleWorldItems.length) {
        ctx.save();
        for (const item of visibleWorldItems) {
          const itemImage = getCachedImage(specialItemImageCacheRef.current, item.iconSrc);

          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fillStyle = item.color || "#22d3ee";
          ctx.shadowColor = item.glow || "rgba(34, 211, 238, 0.5)";
          ctx.shadowBlur = 24;
          ctx.fill();

          if (itemImage && itemImage.complete && itemImage.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(
              itemImage,
              item.x - item.radius,
              item.y - item.radius,
              item.radius * 2,
              item.radius * 2
            );
            ctx.restore();
          } else {
            const initial = (item.itemName || item.itemType || "?").slice(0, 1).toUpperCase();
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 14px system-ui";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(initial, item.x, item.y + 0.5);
          }

          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius - 3, 0, Math.PI * 2);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "rgba(255,255,255,0.92)";
          ctx.stroke();

          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(2, 6, 23, 0.8)";
          ctx.stroke();
        }
        ctx.restore();
      }

      if (bossStateRef.current.boss) {
        const boss = bossStateRef.current.boss;
        const bossOpacity = bossPhase === "transition"
          ? clamp(transitionElapsed / BOSS_TRANSITION_MS, 0.25, 1)
          : bossPhase === "defeated"
            ? 0.38
            : 1;

        ctx.save();
        ctx.globalAlpha = bossOpacity;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y, boss.radius, 0, Math.PI * 2);
        ctx.fillStyle = bossPhase === "defeated" ? "#cbd5e1" : "#f8fafc";
        ctx.shadowColor = bossPhase === "transition" ? "rgba(15,23,42,0.95)" : "rgba(248,250,252,0.9)";
        ctx.shadowBlur = bossPhase === "transition" ? 70 : 28;
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = bossPhase === "defeated" ? "#94a3b8" : "#1e293b";
        ctx.stroke();

        if (bossPhase !== "defeated") {
          ctx.beginPath();
          ctx.arc(boss.x, boss.y, boss.radius * 0.36, 0, Math.PI * 2);
          ctx.fillStyle = "#dc2626";
          ctx.fill();
        }
        ctx.restore();
      }

      if (bossStateRef.current.playerShots.length) {
        ctx.save();
        ctx.shadowColor = "rgba(220, 38, 38, 0.6)";
        ctx.shadowBlur = 14;
        for (const shot of bossStateRef.current.playerShots) {
          drawCircle(ctx, shot.x, shot.y, shot.radius, shot.color);
        }
        ctx.restore();
      }

      if (bossStateRef.current.bossSpikes.length) {
        ctx.save();
        for (const spike of bossStateRef.current.bossSpikes) {
          ctx.beginPath();
          ctx.arc(spike.x, spike.y, spike.radius, 0, Math.PI * 2);
          ctx.fillStyle = spike.color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#ef4444";
          ctx.stroke();
        }
        ctx.restore();
      }

      for (const remote of remotePlayersRef.current.values()) {
        const remoteCloakActive = remote.activeItem?.itemType === "cloak" && remote.activeItem.expiresAt > now;
        if (remoteCloakActive) {
          continue;
        }
        drawRemotePlayer(ctx, remote);
      }

      for (const bot of botsRef.current) {
        if (bot.active && bot.blobs.length) drawBotPlayer(ctx, bot, now);
      }

      for (const blob of blobs) {
        drawLocalBlob(ctx, blob, username, playerColorRef.current, now, currentSkinRef.current);
      }

      if (shieldActive && blobs.length) {
        const center = getBlobCentroid(blobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
        const shieldRadius = getCombinedRadius(blobs) + ITEM_SHIELD_PADDING;
        ctx.beginPath();
        ctx.arc(center.x, center.y, shieldRadius, 0, Math.PI * 2);
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(34, 197, 94, 0.85)";
        ctx.stroke();
      }

      if (activeItem && blobs.length) {
        const center = getBlobCentroid(blobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
        const itemIconRadius = 13;
        const iconY = center.y - combinedRadius - 28;
        const iconX = center.x;
        const remainingSeconds = Math.max(0, Math.ceil((activeItem.expiresAt - now) / 1000));
        const iconImage = getCachedImage(specialItemImageCacheRef.current, activeItem.iconSrc);

        ctx.save();
        ctx.beginPath();
        ctx.arc(iconX, iconY, itemIconRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
        ctx.fill();

        if (iconImage && iconImage.complete && iconImage.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(iconX, iconY, itemIconRadius, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(
            iconImage,
            iconX - itemIconRadius,
            iconY - itemIconRadius,
            itemIconRadius * 2,
            itemIconRadius * 2
          );
          ctx.restore();
        } else {
          const initial = (activeItem.itemName || activeItem.itemType || "?").slice(0, 1).toUpperCase();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 12px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(initial, iconX, iconY);
        }

        ctx.beginPath();
        ctx.arc(iconX, iconY, itemIconRadius, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,0.92)";
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${remainingSeconds}s`, iconX, iconY - 22);
        ctx.restore();
      }

      ctx.restore();

      if (mergeStateRef.current.nextMergeAt && Date.now() >= mergeStateRef.current.nextMergeAt) {
        const merged = mergeClosestPairsOnce(blobsRef.current, createBlob);
        blobsRef.current = merged;

        if (blobsRef.current.length > 1) {
          mergeStateRef.current.nextMergeAt = Date.now() + getMergeDelayMs(blobsRef.current.length);
        } else {
          mergeStateRef.current.nextMergeAt = null;
        }

        updateHudFromBlobs(blobsRef.current);
        sendPlayerState(true);
      }

      sendPlayerState();

      // Throttled leaderboard refresh (~2× per second).
      if (now - lastLeaderboardUpdateRef.current >= 500) {
        lastLeaderboardUpdateRef.current = now;
        const remote = [...remotePlayersRef.current.values()].map((p) => ({
          sessionId: p.sessionId,
          username: p.username,
          score: p.score ?? 0,
          color: p.color,
          isLocal: false,
        }));
        const botPlayers = botsRef.current
          .filter(b => b.active && b.blobs.length > 0)
          .map(b => ({
            sessionId: b.id,
            username: b.name,
            score: b.score,
            color: b.color,
            isLocal: false,
          }));
        const local = isAliveRef.current
          ? [{
              sessionId: sessionIdRef.current,
              username: playerNameRef.current || "You",
              score: scoreRef.current,
              color: playerColorRef.current,
              isLocal: true,
            }]
          : [];
        setLeaderboardPlayers([...local, ...remote, ...botPlayers]);
      }

      } catch (err) {
        // Never let a single bad frame kill the animation loop.
        console.error("[cellLoop] uncaught frame error — loop continues", err);
      }

      animationRef.current = requestAnimationFrame(cellLoop);
    }

    async function setupRealtime() {
      try {
        const supabase = getSupabaseBrowserClient();

        const channel = supabase.channel("agar-realtime-room", {
          config: {
            broadcast: {
              self: false,
            },
            presence: {
              key: sessionIdRef.current,
            },
          },
        });

        channel
          .on("broadcast", { event: "player_state" }, ({ payload }) => {
            if (!payload || payload.sessionId === sessionIdRef.current) {
              return;
            }

            const incomingBlobs = Array.isArray(payload.blobs)
              ? payload.blobs
                  .map((entry) => {
                    if (!Array.isArray(entry) || entry.length < 3) {
                      return null;
                    }

                    return {
                      x: entry[0],
                      y: entry[1],
                      radius: entry[2],
                    };
                  })
                  .filter(Boolean)
              : [];

            const previous = remotePlayersRef.current.get(payload.sessionId);
            const fallbackRadius = payload.radius;

            const next = {
              sessionId: payload.sessionId,
              username: payload.username || "Participant",
              color: payload.color || colorFromId(payload.sessionId),
              x: payload.x,
              y: payload.y,
              radius: fallbackRadius,
              score: typeof payload.score === "number" ? payload.score : (previous?.score ?? 0),
              skin: payload.skin ?? previous?.skin ?? null,
              activeItem: payload.activeItem ?? previous?.activeItem ?? null,
              parts: payload.parts || 1,
              updatedAt: payload.updatedAt || Date.now(),
              renderX: previous?.renderX ?? payload.x,
              renderY: previous?.renderY ?? payload.y,
              renderRadius: previous?.renderRadius ?? fallbackRadius,
              blobs: incomingBlobs.map((blob, index) => {
                const prevBlob = previous?.blobs?.[index];
                return {
                  x: blob.x,
                  y: blob.y,
                  radius: blob.radius,
                  renderX: prevBlob?.renderX ?? blob.x,
                  renderY: prevBlob?.renderY ?? blob.y,
                  renderRadius: prevBlob?.renderRadius ?? blob.radius,
                };
              }),
            };

            remotePlayersRef.current.set(payload.sessionId, next);

            // Preload skin image if present
            if (payload.skin) {
              const skinDef = getSkinById(payload.skin);
              if (skinDef) preloadSkin(skinDef.id, skinDef.src);
            }

            setOnlinePlayers(remotePlayersRef.current.size + 1);
          })
          .on("broadcast", { event: "participant_inactive" }, ({ payload }) => {
            if (!payload) {
              return;
            }

            clearRemotePlayer(payload.victimSessionId);

            if (payload.victimSessionId === sessionIdRef.current) {
              handleSessionEnd(payload.sourceName || "Another participant");
            }
          })
          .on("broadcast", { event: "participant_state_reduced" }, ({ payload }) => {
            if (!payload || payload.victimSessionId !== sessionIdRef.current || !isAliveRef.current) {
              return;
            }

            const localCountBefore = blobsRef.current.length;
            applyLocalBlobLoss(payload.blob);

            if (localCountBefore <= 1 || !blobsRef.current.length) {
              sendParticipantDisconnected(
                sessionIdRef.current,
                payload.sourceSessionId,
                payload.sourceName || "Another participant"
              );
              handleSessionEnd(payload.sourceName || "Another participant");
            }
          })
          .on("broadcast", { event: "participant_damage" }, ({ payload }) => {
            if (!payload || payload.victimSessionId !== sessionIdRef.current || !isAliveRef.current) {
              return;
            }

            const nextScore = Math.max(0, scoreRef.current - (payload.points || 0));
            setScoreValue(nextScore);

            if (nextScore <= 0) {
              handleSessionEnd(payload.sourceName || "Another participant");
            }
          })
          .on("broadcast", { event: "ejected_food" }, ({ payload }) => {
            if (!payload || !payload.id) {
              return;
            }

            const exists = ejectedFoodRef.current.some((piece) => piece.id === payload.id);

            if (exists) {
              return;
            }

            ejectedFoodRef.current.push({
              id: payload.id,
              ownerSessionId: payload.ownerSessionId || payload.sessionId || null,
              x: payload.x,
              y: payload.y,
              vx: payload.vx,
              vy: payload.vy,
              value: payload.value,
              radius: payload.radius,
              createdAt: payload.createdAt || Date.now(),
            });
          })
          .on("broadcast", { event: "ejected_food_consumed" }, ({ payload }) => {
            if (!payload || !payload.pieceId) {
              return;
            }

            ejectedFoodRef.current = ejectedFoodRef.current.filter((piece) => piece.id !== payload.pieceId);
          })
          .on("broadcast", { event: "player_left" }, ({ payload }) => {
            if (!payload || payload.sessionId === sessionIdRef.current) {
              return;
            }

            clearRemotePlayer(payload.sessionId);
          })
          .on("broadcast", { event: "spike_state" }, ({ payload }) => {
            if (!payload || payload.sessionId === sessionIdRef.current) {
              return;
            }

            // Adopt spike positions from the player who has been in the game longest
            // (earliest generatedAt means they spawned first and are the authority)
            if (
              !spikesRef.current.length ||
              (Array.isArray(payload.spikes) && payload.spikes.length > 0 && payload.generatedAt < spikeEpochRef.current)
            ) {
              spikeEpochRef.current = payload.generatedAt;
              spikesRef.current = payload.spikes || [];
              warningZonesRef.current = payload.warnings || [];
            }
          })
          .on("presence", { event: "sync" }, () => {
            const state = channel.presenceState();
            const members = Object.keys(state).length;
            setOnlinePlayers(Math.max(members, remotePlayersRef.current.size + 1));
          });

        channel.subscribe((status) => {
          if (isDisposed) {
            return;
          }

          setConnectionStatus(status.toLowerCase());

          if (status === "SUBSCRIBED") {
            channel.track({
              sessionId: sessionIdRef.current,
              username: playerNameRef.current || "Guest",
              joinedAt: Date.now(),
            });
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            // Auto-reconnect after a short back-off so broadcasts resume.
            setTimeout(() => {
              if (isDisposed) return;
              console.info("[AgarCell] Channel dropped (", status, "), reconnecting…");
              try { channelRef.current?.unsubscribe(); } catch (_) {}
              channelRef.current = null;
              setupRealtime();
            }, 3_000);
          }
        });

        channelRef.current = channel;
      } catch {
        if (!isDisposed) {
          setConnectionStatus("error");
        }
      }
    }

    function handleBeforeUnload() {
      sendPlayerLeave("closed");
    }

    function handlePageHide() {
      sendPlayerLeave("hidden");
    }

    resizeCanvas();
    console.info("[AgarCell] App mounted");
    resetCell({ includeObstacles: false });
    setupRealtime();

    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("click", handleCanvasClick);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    cellLoop();

    return () => {
      if (startCountdownTimerRef.current) {
        clearInterval(startCountdownTimerRef.current);
        startCountdownTimerRef.current = null;
      }

      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleCanvasClick);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      cancelAnimationFrame(animationRef.current);

      isDisposed = true;
      sendPlayerLeave("cleanup");

      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
    // This effect intentionally runs once to initialize canvas systems and listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 p-3 text-white md:p-4" data-arena="main">
      <div className="mx-auto max-w-[1600px] space-y-3">
        <CellHeader
          score={score}
          size={size}
          parts={parts}
          onlinePlayers={onlinePlayers}
          leaderboardPlayers={leaderboardPlayers}
          currentSkin={currentSkin}
          collectedBossItems={collectedBossItems}
          activeBossItem={activeBossItem}
          onActivateBossItem={(itemType) => activateCollectedItem(itemType)}
          playerColor={playerColor}
          faceExpression={faceExpression}
          username={username}
          onSelectSkin={(skinId) => {
            currentSkinRef.current = skinId;
            setCurrentSkin(skinId);
            const def = getSkinById(skinId);
            if (def) preloadSkin(def.id, def.src);
          }}
        />

        {/* Arena wrapper — blurred + overlay when gate is open */}
        <div className="relative">
          <div className={showGate ? "pointer-events-none select-none blur-sm" : ""}>
            <CellArena canvasRef={canvasRef} isActive={cellStarted} />
          </div>

          {showGate && (
            <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
              <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/95 p-8 shadow-2xl backdrop-blur-sm">
                {deathReason ? (
                  <>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-2xl">💀</span>
                      <h2 className="text-xl font-bold text-white">Session Ended</h2>
                    </div>
                    <p className="mb-6 text-sm text-slate-400">{deathReason}</p>
                  </>
                ) : (
                  <>
                    <h2 className="mb-1 text-2xl font-bold text-white">Start Arena Session</h2>
                    <p className="mb-6 text-sm text-slate-400">
                      Enter a display name to continue.
                    </p>
                  </>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = guestName.trim().slice(0, 18);
                    if (name) startRunWithUsername(name);
                  }}
                  className="space-y-3"
                >
                  <label className="block text-sm font-medium text-slate-300">
                    Display name
                  </label>
                  <input
                    autoFocus
                    type="text"
                    maxLength={18}
                    placeholder="Type your name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={!guestName.trim()}
                    className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Start Arena
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {!showGate && !cellStarted && startCountdown > 0 ? (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/90 px-6 py-5 text-center shadow-xl backdrop-blur-sm">
            <p className="text-sm uppercase tracking-wide text-slate-300">Starting In</p>
            <p className="text-4xl font-bold text-white">{startCountdown}</p>
            <p className="mt-2 text-sm text-slate-300">
              Connecting shared session in background: {connectionStatus}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
