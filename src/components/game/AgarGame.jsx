"use client";

import { useEffect, useRef, useState } from "react";
import UsernameGate from "@/components/UsernameGate";
import GameArena from "@/components/game/GameArena";
import {
  FOOD_TARGET,
  GRID_SIZE,
  MERGE_INTERVAL_MS,
  REMOTE_STALE_MS,
  STATE_BROADCAST_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@/components/game/logic/constants";
import { clamp } from "@/components/game/logic/math";
import {
  createBlobFactory,
  getBlobCentroid,
  getCombinedRadius,
  mergeClosestPairsOnce,
} from "@/components/game/logic/blobLogic";
import { createFood, drawGrid, replenishFood } from "@/components/game/logic/arenaLogic";
import {
  consumeFood,
  resolvePvpCombat,
  separateOverlappingBlobs,
  splitAndJump,
  updateBlobMovement,
} from "@/components/game/logic/movementAttackLogic";
import { colorFromId, drawCircle, drawLocalBlob, drawRemotePlayer } from "@/components/game/logic/playerAppearance";
import GameHeader from "@/components/layout/GameHeader";
import GameFooter from "@/components/layout/GameFooter";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session-${Math.random().toString(36).slice(2, 12)}`;
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
  const mergeStateRef = useRef({ nextMergeAt: null });
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

  const createBlob = createBlobFactory(blobIdRef);

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
      ...getBlobCentroid(blobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2),
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

  function resetGame() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;

    blobsRef.current = [createBlob(centerX, centerY, 22)];
    foodRef.current = createFood(FOOD_TARGET, WORLD_WIDTH, WORLD_HEIGHT);

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

      target.x = clamp(camera.x - canvas.clientWidth / 2 + viewX, 0, WORLD_WIDTH);
      target.y = clamp(camera.y - canvas.clientHeight / 2 + viewY, 0, WORLD_HEIGHT);
    }

    function handleKeyDown(event) {
      if (event.code !== "Space") {
        return;
      }

      event.preventDefault();

      const splitBlobs = splitAndJump(blobsRef.current, mouseTargetRef.current, createBlob);
      blobsRef.current = splitBlobs;
      mergeStateRef.current.nextMergeAt = Date.now() + MERGE_INTERVAL_MS;
      updateHudFromBlobs(splitBlobs);
      sendPlayerState(true);
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

      if (isAliveRef.current) {
        updateBlobMovement(blobs, mouseTargetRef.current);
        separateOverlappingBlobs(blobs);

        const { gainedScore, remainingFood } = consumeFood(blobs, foodRef.current);
        foodRef.current = replenishFood(remainingFood, WORLD_WIDTH, WORLD_HEIGHT);

        if (gainedScore > 0) {
          setScoreValue(scoreRef.current + gainedScore);
          updateHudFromBlobs(blobs);
        }

        resolvePvpCombat(blobs, [...remotePlayersRef.current.values()], {
          onLocalEatRemote(remote) {
            clearRemotePlayer(remote.sessionId);
            setScoreValue(scoreRef.current + Math.max(10, Math.round(remote.radius)));
            updateHudFromBlobs(blobs);
            sendPlayerDeath(remote.sessionId, sessionIdRef.current, playerNameRef.current || "Unknown");
            sendPlayerState(true);
          },
          onRemoteEatLocal(remote) {
            sendPlayerDeath(
              sessionIdRef.current,
              remote.sessionId,
              remote.username || "Another player"
            );
            handleDefeat(remote.username || "Another player");
          },
        });
      }

      pruneStaleRemotePlayers();

      const centroid = getBlobCentroid(blobs, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

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

      drawGrid(ctx, camera, width, height, GRID_SIZE);

      ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
      ctx.lineWidth = 5;
      ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      for (const point of foodRef.current) {
        drawCircle(ctx, point.x, point.y, point.radius, point.color);
      }

      for (const remote of remotePlayersRef.current.values()) {
        drawRemotePlayer(ctx, remote);
      }

      for (const blob of blobs) {
        drawLocalBlob(ctx, blob, username, playerColorRef.current);
      }

      ctx.restore();

      if (mergeStateRef.current.nextMergeAt && Date.now() >= mergeStateRef.current.nextMergeAt) {
        const merged = mergeClosestPairsOnce(blobsRef.current, createBlob);
        blobsRef.current = merged;

        if (blobsRef.current.length > 1) {
          mergeStateRef.current.nextMergeAt = Date.now() + MERGE_INTERVAL_MS;
        } else {
          mergeStateRef.current.nextMergeAt = null;
        }

        updateHudFromBlobs(blobsRef.current);
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

    function handleBeforeUnload() {
      sendPlayerLeave("closed");
    }

    function handlePageHide() {
      sendPlayerLeave("hidden");
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
        <GameHeader score={score} size={size} parts={parts} onlinePlayers={onlinePlayers} />
        <GameArena canvasRef={canvasRef} />
        <GameFooter onRestart={resetGame} username={username} connectionStatus={connectionStatus} />
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
