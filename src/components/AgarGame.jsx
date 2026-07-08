
"use client";

import { useEffect, useRef, useState } from "react";
import UsernameGate from "@/components/UsernameGate";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const WORLD_WIDTH = 4200;
const WORLD_HEIGHT = 4200;
const FOOD_TARGET = 260;
const GRID_SIZE = 90;
const MERGE_INTERVAL_MS = 60_000;
const MAX_BLOBS = 4;
const STATE_BROADCAST_MS = 90;
const REMOTE_STALE_MS = 8_000;
const PVP_SIZE_ADVANTAGE = 1.1;
const PVP_OVERLAP_RATIO = 0.5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function blobArea(radius) {
  return Math.PI * radius * radius;
}

function radiusFromArea(area) {
  return Math.sqrt(area / Math.PI);
}

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session-${Math.random().toString(36).slice(2, 12)}`;
}

function colorFromId(id) {
  const palette = ["#22c55e", "#3b82f6", "#f97316", "#f43f5e", "#14b8a6", "#eab308"];

  if (!id) {
    return palette[0];
  }

  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }

  return palette[Math.abs(hash) % palette.length];
}

function canEatCircle(biggerRadius, smallerRadius, distance) {
  if (biggerRadius <= smallerRadius * PVP_SIZE_ADVANTAGE) {
    return false;
  }

  const overlapDepth = biggerRadius + smallerRadius - distance;
  return overlapDepth >= smallerRadius * PVP_OVERLAP_RATIO;
}

export default function AgarGame() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const rafReadyRef = useRef(false);
  const blobIdRef = useRef(1);
  const sessionIdRef = useRef(createSessionId());
  const channelRef = useRef(null);
  const remotePlayersRef = useRef(new Map());
  const scoreRef = useRef(0);
  const isAliveRef = useRef(false);
  const playerNameRef = useRef("");
  const playerColorRef = useRef("#22c55e");
  const lastBroadcastRef = useRef(0);
  const leaveSentRef = useRef(false);

  const mouseTargetRef = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });

  const cameraRef = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });

  const blobsRef = useRef([]);

  const mergeStateRef = useRef({
    nextMergeAt: null,
  });

  const foodRef = useRef([]);

  const [score, setScore] = useState(0);
  const [size, setSize] = useState(22);
  const [parts, setParts] = useState(1);
  const [showGate, setShowGate] = useState(true);
  const [gateBusy, setGateBusy] = useState(false);
  const [deathReason, setDeathReason] = useState("");
  const [username, setUsername] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [onlinePlayers, setOnlinePlayers] = useState(1);

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

  function createFood(count) {
    const colors = [
      "#60a5fa",
      "#34d399",
      "#fbbf24",
      "#f472b6",
      "#a78bfa",
      "#fb7185",
    ];

    return Array.from({ length: count }, () => ({
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      radius: 5 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }

  function getCombinedRadius(blobs) {
    const totalArea = blobs.reduce((acc, blob) => acc + blobArea(blob.radius), 0);
    return Math.round(radiusFromArea(totalArea));
  }

  function getBlobCentroid(blobs) {
    if (!blobs.length) {
      return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    }

    const totalArea = blobs.reduce((acc, blob) => acc + blobArea(blob.radius), 0);

    if (totalArea <= 0) {
      return { x: blobs[0].x, y: blobs[0].y };
    }

    const weighted = blobs.reduce(
      (acc, blob) => {
        const area = blobArea(blob.radius);
        acc.x += blob.x * area;
        acc.y += blob.y * area;
        return acc;
      },
      { x: 0, y: 0 }
    );

    return {
      x: weighted.x / totalArea,
      y: weighted.y / totalArea,
    };
  }

  function updateHudFromBlobs(blobs) {
    setParts(blobs.length);
    setSize(getCombinedRadius(blobs));
  }

  function setScoreValue(next) {
    scoreRef.current = next;
    setScore(next);
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
      ...getBlobCentroid(blobs),
      radius: getCombinedRadius(blobs),
    };
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
        alive: true,
        updatedAt: now,
      },
    });
  }

  function sendPlayerLeave(reason = "left") {
    const channel = channelRef.current;

    if (!channel || leaveSentRef.current) {
      return;
    }

    leaveSentRef.current = true;

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
  }

  function sendPlayerDeath(victimSessionId, killerSessionId, killerName) {
    const channel = channelRef.current;

    if (!channel) {
      return;
    }

    channel.send({
      type: "broadcast",
      event: "player_dead",
      payload: {
        victimSessionId,
        killerSessionId,
        killerName,
        at: Date.now(),
      },
    });
  }

  function clearRemotePlayer(sessionId) {
    const deleted = remotePlayersRef.current.delete(sessionId);

    if (deleted) {
      setOnlinePlayers(remotePlayersRef.current.size + 1);
    }
  }

  function handleDefeat(killerName = "Another player") {
    if (!isAliveRef.current) {
      return;
    }

    isAliveRef.current = false;
    sendPlayerLeave("dead");
    setDeathReason(`You were eaten by ${killerName}.`);
    setShowGate(true);
    setGateBusy(false);
    resetGame();
  }

  function startRunWithUsername(name) {
    const safeName = name.trim().slice(0, 18);

    if (!safeName) {
      return;
    }

    setGateBusy(true);
    leaveSentRef.current = false;
    playerNameRef.current = safeName;
    playerColorRef.current = colorFromId(`${sessionIdRef.current}-${safeName}`);
    isAliveRef.current = true;
    setUsername(safeName);
    setDeathReason("");
    resetGame();

    const channel = channelRef.current;
    if (channel) {
      channel.track({
        sessionId: sessionIdRef.current,
        username: safeName,
      });
    }

    sendPlayerState(true);
    setShowGate(false);
    setGateBusy(false);
  }

  function resetGame() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;

    blobsRef.current = [createBlob(centerX, centerY, 22)];
    foodRef.current = createFood(FOOD_TARGET);

    const viewWidth = canvas.clientWidth || 1280;
    const viewHeight = canvas.clientHeight || 720;

    const cameraX = clamp(centerX, viewWidth / 2, WORLD_WIDTH - viewWidth / 2);
    const cameraY = clamp(centerY, viewHeight / 2, WORLD_HEIGHT - viewHeight / 2);

    cameraRef.current = {
      x: cameraX,
      y: cameraY,
    };

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

    function drawCircle(x, y, radius, color, strokeColor) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (strokeColor) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
      }
    }

    function drawGrid() {
      const camera = cameraRef.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const left = camera.x - width / 2;
      const top = camera.y - height / 2;
      const right = left + width;
      const bottom = top + height;

      ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
      ctx.lineWidth = 1;

      const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
      const endX = Math.ceil(right / GRID_SIZE) * GRID_SIZE;

      for (let x = startX; x <= endX; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }

      const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;
      const endY = Math.ceil(bottom / GRID_SIZE) * GRID_SIZE;

      for (let y = startY; y <= endY; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
      }
    }

    function mergeClosestPairsOnce() {
      const blobs = [...blobsRef.current];

      if (blobs.length <= 1) {
        return;
      }

      const used = new Set();
      const merged = [];

      for (let i = 0; i < blobs.length; i += 1) {
        if (used.has(blobs[i].id)) {
          continue;
        }

        let bestIndex = -1;
        let bestDistance = Infinity;

        for (let j = i + 1; j < blobs.length; j += 1) {
          if (used.has(blobs[j].id)) {
            continue;
          }

          const dx = blobs[i].x - blobs[j].x;
          const dy = blobs[i].y - blobs[j].y;
          const distance = dx * dx + dy * dy;

          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = j;
          }
        }

        if (bestIndex === -1) {
          merged.push(blobs[i]);
          used.add(blobs[i].id);
          continue;
        }

        const a = blobs[i];
        const b = blobs[bestIndex];
        used.add(a.id);
        used.add(b.id);

        const areaA = blobArea(a.radius);
        const areaB = blobArea(b.radius);
        const totalArea = areaA + areaB;

        const x = (a.x * areaA + b.x * areaB) / totalArea;
        const y = (a.y * areaA + b.y * areaB) / totalArea;

        merged.push(createBlob(x, y, radiusFromArea(totalArea)));
      }

      blobsRef.current = merged;
      updateHudFromBlobs(merged);
    }

    function splitAndJump() {
      const blobs = blobsRef.current;

      if (!blobs.length || blobs.length >= MAX_BLOBS) {
        return;
      }

      const next = [];
      const target = mouseTargetRef.current;

      for (const blob of blobs) {
        if (next.length >= MAX_BLOBS) {
          next.push(blob);
          continue;
        }

        const canSplit = blob.radius > 10 && next.length + 2 <= MAX_BLOBS;

        if (!canSplit) {
          next.push(blob);
          continue;
        }

        const dx = target.x - blob.x;
        const dy = target.y - blob.y;
        const distance = Math.hypot(dx, dy) || 1;
        const dirX = dx / distance;
        const dirY = dy / distance;
        const perpX = -dirY;
        const perpY = dirX;

        const newRadius = blob.radius / Math.sqrt(2);
        const jumpDistance = blob.radius;
        const sideSpacing = newRadius * 1.35;

        const anchorX = clamp(
          blob.x + perpX * sideSpacing,
          newRadius,
          WORLD_WIDTH - newRadius
        );
        const anchorY = clamp(
          blob.y + perpY * sideSpacing,
          newRadius,
          WORLD_HEIGHT - newRadius
        );

        const launchedX = clamp(
          blob.x - perpX * sideSpacing + dirX * jumpDistance,
          newRadius,
          WORLD_WIDTH - newRadius
        );
        const launchedY = clamp(
          blob.y - perpY * sideSpacing + dirY * jumpDistance,
          newRadius,
          WORLD_HEIGHT - newRadius
        );

        const anchor = createBlob(
          anchorX,
          anchorY,
          newRadius,
          dirX * 3,
          dirY * 3
        );

        const launched = createBlob(
          launchedX,
          launchedY,
          newRadius,
          dirX * 15,
          dirY * 15
        );

        next.push(anchor);
        next.push(launched);
      }

      blobsRef.current = next;
      mergeStateRef.current.nextMergeAt = Date.now() + MERGE_INTERVAL_MS;
      updateHudFromBlobs(next);
      sendPlayerState(true);
    }

    function handleMouseMove(event) {
      const target = mouseTargetRef.current;

      const rect = canvas.getBoundingClientRect();
      const viewX = event.clientX - rect.left;
      const viewY = event.clientY - rect.top;
      const camera = cameraRef.current;

      target.x = clamp(camera.x - canvas.clientWidth / 2 + viewX, 0, WORLD_WIDTH);
      target.y = clamp(camera.y - canvas.clientHeight / 2 + viewY, 0, WORLD_HEIGHT);
    }

    function handleKeyDown(event) {
      if (event.code === "Space") {
        event.preventDefault();
        splitAndJump();
      }
    }

    function separateOverlappingBlobs(blobs) {
      for (let i = 0; i < blobs.length; i += 1) {
        for (let j = i + 1; j < blobs.length; j += 1) {
          const a = blobs[i];
          const b = blobs[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 0.0001;
          const minDistance = a.radius + b.radius;

          if (distance >= minDistance) {
            continue;
          }

          const overlap = minDistance - distance;
          const nx = dx / distance;
          const ny = dy / distance;

          a.x = clamp(a.x - nx * (overlap / 2), a.radius, WORLD_WIDTH - a.radius);
          a.y = clamp(a.y - ny * (overlap / 2), a.radius, WORLD_HEIGHT - a.radius);
          b.x = clamp(b.x + nx * (overlap / 2), b.radius, WORLD_WIDTH - b.radius);
          b.y = clamp(b.y + ny * (overlap / 2), b.radius, WORLD_HEIGHT - b.radius);

          a.vx -= nx * 0.2;
          a.vy -= ny * 0.2;
          b.vx += nx * 0.2;
          b.vy += ny * 0.2;
        }
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

    function resolvePvpCombat() {
      if (!isAliveRef.current) {
        return;
      }

      const localBlobs = blobsRef.current;
      const remotes = [...remotePlayersRef.current.values()];

      for (const remote of remotes) {
        for (const blob of localBlobs) {
          const dx = blob.x - remote.x;
          const dy = blob.y - remote.y;
          const distance = Math.hypot(dx, dy);

          if (canEatCircle(blob.radius, remote.radius, distance)) {
            blob.radius = radiusFromArea(blobArea(blob.radius) + blobArea(remote.radius) * 0.9);
            clearRemotePlayer(remote.sessionId);
            setScoreValue(scoreRef.current + Math.max(10, Math.round(remote.radius)));
            updateHudFromBlobs(localBlobs);
            sendPlayerDeath(remote.sessionId, sessionIdRef.current, playerNameRef.current || "Unknown");
            sendPlayerState(true);
            break;
          }

          if (canEatCircle(remote.radius, blob.radius, distance)) {
            sendPlayerDeath(
              sessionIdRef.current,
              remote.sessionId,
              remote.username || "Another player"
            );
            handleDefeat(remote.username || "Another player");
            return;
          }
        }
      }
    }

    function gameLoop() {
      if (!rafReadyRef.current) {
        animationRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0b1325";
      ctx.fillRect(0, 0, width, height);

      const blobs = blobsRef.current;
      const target = mouseTargetRef.current;

      if (isAliveRef.current) {
        for (const blob of blobs) {
          const dx = target.x - blob.x;
          const dy = target.y - blob.y;
          const distance = Math.hypot(dx, dy);

          const chaseSpeed = Math.max(0.9, 5 - blob.radius * 0.05);

          if (distance > 2) {
            blob.vx += (dx / distance) * chaseSpeed * 0.075;
            blob.vy += (dy / distance) * chaseSpeed * 0.075;
          }

          blob.vx *= 0.9;
          blob.vy *= 0.9;

          blob.x += blob.vx;
          blob.y += blob.vy;

          blob.x = clamp(blob.x, blob.radius, WORLD_WIDTH - blob.radius);
          blob.y = clamp(blob.y, blob.radius, WORLD_HEIGHT - blob.radius);
        }

        separateOverlappingBlobs(blobs);

        let gainedScore = 0;

        foodRef.current = foodRef.current.filter((food) => {
          for (const blob of blobs) {
            const dx = blob.x - food.x;
            const dy = blob.y - food.y;
            const distance = Math.hypot(dx, dy);

            if (distance < blob.radius + food.radius) {
              const nextArea = blobArea(blob.radius) + blobArea(food.radius) * 0.6;
              blob.radius = radiusFromArea(nextArea);
              gainedScore += 1;
              return false;
            }
          }

          return true;
        });

        if (gainedScore > 0) {
          setScoreValue(scoreRef.current + gainedScore);
          updateHudFromBlobs(blobs);
        }

        while (foodRef.current.length < FOOD_TARGET) {
          foodRef.current.push(...createFood(1));
        }

        resolvePvpCombat();
      }

      pruneStaleRemotePlayers();

      const centroid = getBlobCentroid(blobs);

      cameraRef.current.x = clamp(
        centroid.x,
        width / 2,
        Math.max(width / 2, WORLD_WIDTH - width / 2)
      );
      cameraRef.current.y = clamp(
        centroid.y,
        height / 2,
        Math.max(height / 2, WORLD_HEIGHT - height / 2)
      );

      const camera = cameraRef.current;

      ctx.save();
      ctx.translate(width / 2 - camera.x, height / 2 - camera.y);

      drawGrid();

      ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
      ctx.lineWidth = 5;
      ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      for (const food of foodRef.current) {
        drawCircle(food.x, food.y, food.radius, food.color);
      }

      for (const remote of remotePlayersRef.current.values()) {
        drawCircle(remote.x, remote.y, remote.radius, remote.color || "#3b82f6", "#dbeafe");
        ctx.fillStyle = "white";
        ctx.font = "bold 13px Arial";
        ctx.textAlign = "center";
        ctx.fillText(remote.username || "Player", remote.x, remote.y + 4);
      }

      for (const blob of blobs) {
        drawCircle(blob.x, blob.y, blob.radius, playerColorRef.current, "#bbf7d0");
        ctx.fillStyle = "white";
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(username || "YOU", blob.x, blob.y + 5);
      }

      ctx.restore();

      if (mergeStateRef.current.nextMergeAt && Date.now() >= mergeStateRef.current.nextMergeAt) {
        mergeClosestPairsOnce();

        if (blobsRef.current.length > 1) {
          mergeStateRef.current.nextMergeAt = Date.now() + MERGE_INTERVAL_MS;
        } else {
          mergeStateRef.current.nextMergeAt = null;
        }

        sendPlayerState(true);
      }

      sendPlayerState();

      animationRef.current = requestAnimationFrame(gameLoop);
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

            remotePlayersRef.current.set(payload.sessionId, {
              sessionId: payload.sessionId,
              username: payload.username || "Player",
              color: payload.color || colorFromId(payload.sessionId),
              x: payload.x,
              y: payload.y,
              radius: payload.radius,
              parts: payload.parts || 1,
              updatedAt: payload.updatedAt || Date.now(),
            });

            setOnlinePlayers(remotePlayersRef.current.size + 1);
          })
          .on("broadcast", { event: "player_dead" }, ({ payload }) => {
            if (!payload) {
              return;
            }

            clearRemotePlayer(payload.victimSessionId);

            if (payload.victimSessionId === sessionIdRef.current) {
              handleDefeat(payload.killerName || "Another player");
            }
          })
          .on("broadcast", { event: "player_left" }, ({ payload }) => {
            if (!payload || payload.sessionId === sessionIdRef.current) {
              return;
            }

            clearRemotePlayer(payload.sessionId);
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
          }
        });

        channelRef.current = channel;
      } catch {
        if (!isDisposed) {
          setConnectionStatus("error");
        }
      }
    }

    resizeCanvas();
    resetGame();
    setupRealtime();

    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    gameLoop();

    function handleBeforeUnload() {
      sendPlayerLeave("closed");
    }

    function handlePageHide() {
      sendPlayerLeave("hidden");
    }

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("mousemove", handleMouseMove);
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
    <div className="min-h-screen bg-slate-950 p-3 text-white md:p-4">
      <div className="mx-auto max-w-[1600px] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 p-4 shadow-xl">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Agar Game</h1>
            <p className="text-slate-300">
              Move mouse to travel. Press Space to jump-split side-by-side.
            </p>
          </div>

          <div className="flex gap-2 md:gap-3">
            <div className="rounded-xl bg-slate-800 px-4 py-3 text-center">
              <div className="text-xs text-slate-400">Score</div>
              <div className="text-xl font-bold">{score}</div>
            </div>

            <div className="rounded-xl bg-slate-800 px-4 py-3 text-center">
              <div className="text-xs text-slate-400">Size</div>
              <div className="text-xl font-bold">{size}</div>
            </div>

            <div className="rounded-xl bg-slate-800 px-4 py-3 text-center">
              <div className="text-xs text-slate-400">Parts</div>
              <div className="text-xl font-bold">{parts}</div>
            </div>

            <div className="rounded-xl bg-slate-800 px-4 py-3 text-center">
              <div className="text-xs text-slate-400">Online</div>
              <div className="text-xl font-bold">{onlinePlayers}</div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-2">
          <canvas
            ref={canvasRef}
            className="h-[78vh] w-full rounded-xl"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={resetGame}
            className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 hover:bg-green-400"
          >
            Restart Game
          </button>

          <p className="text-sm text-slate-300">
            Player: {username || "Not joined"} | Supabase: {connectionStatus}
          </p>
        </div>
      </div>

      <UsernameGate
        open={showGate}
        busy={gateBusy}
        defaultName={username}
        title={deathReason ? "You Were Eaten" : "Join Multiplayer Arena"}
        message={
          deathReason ||
          "Enter your username to start. Other players can join the same arena and play live."
        }
        onSubmit={startRunWithUsername}
      />
    </div>
  );
}
