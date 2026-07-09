"use client";

import { useEffect, useRef, useState } from "react";
import UsernameGate from "@/components/UsernameGate";
import EducationArena from "@/components/education/EducationArena";
import {
  FOOD_TARGET,
  GRID_SIZE,
  MERGE_INTERVAL_MS,
  REMOTE_STALE_MS,
  SPIKE_MAX_COUNT,
  STATE_BROADCAST_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@/components/education/logic/constants";
import { clamp } from "@/components/education/logic/math";
import {
  createBlobFactory,
  getBlobCentroid,
  getCombinedRadius,
  mergeClosestPairsOnce,
} from "@/components/education/logic/blobLogic";
import { createFood, drawGrid, replenishFood } from "@/components/education/logic/arenaLogic";
import {
  consumeFood,
  resolvePvpCombat,
  separateOverlappingBlobs,
  splitAndJump,
  updateBlobMovement,
} from "@/components/education/logic/movementAttackLogic";
import { colorFromId, drawCircle, drawLocalBlob, drawRemotePlayer } from "@/components/education/logic/playerAppearance";
import {
  createInitialSpikes,
  drawSpikeBalls,
  drawWarningZones,
  findSpikeCollision,
  getRestrictedZones,
  keepBlobsOutsideWarnings,
  splitToMaxCells,
  updateSpikesAndWarnings,
} from "@/components/education/logic/spikeLogic";
import EducationHeader from "@/components/layout/EducationHeader";
import EducationFooter from "@/components/layout/EducationFooter";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session-${Math.random().toString(36).slice(2, 12)}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function serializeBlobs(blobs) {
  return blobs.map((blob) => [round1(blob.x), round1(blob.y), round1(blob.radius)]);
}

export default function AgarEducation() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const rafReadyRef = useRef(false);
  const blobIdRef = useRef(1);
  const sessionIdRef = useRef(createSessionId());
  const channelRef = useRef(null);
  const remotePlayersRef = useRef(new Map());
  const scoreRef = useRef(0);
  const isAliveRef = useRef(false);
  const educationStartedRef = useRef(false);
  const spikeLogicStartedLoggedRef = useRef(false);
  const playerNameRef = useRef("");
  const playerColorRef = useRef("#22c55e");
  const lastBroadcastRef = useRef(0);
  const leaveSentRef = useRef(false);

  const mouseTargetRef = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
  const cameraRef = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
  const blobsRef = useRef([]);
  const mergeStateRef = useRef({ nextMergeAt: null });
  const foodRef = useRef([]);
  const spikesRef = useRef([]);
  const warningZonesRef = useRef([]);

  const [score, setScore] = useState(0);
  const [size, setSize] = useState(22);
  const [parts, setParts] = useState(1);
  const [showGate, setShowGate] = useState(true);
  const [educationStarted, setEducationStarted] = useState(false);
  const [deathReason, setDeathReason] = useState("");
  const [username, setUsername] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [onlinePlayers, setOnlinePlayers] = useState(1);

  const createBlob = createBlobFactory(blobIdRef);

  function setEducationStartedValue(next) {
    educationStartedRef.current = next;
    setEducationStarted(next);
  }

  useEffect(() => {
    console.info("[AgarEducation] educationStarted state changed", { educationStarted });
  }, [educationStarted]);

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
          alive: true,
          updatedAt: now,
        },
      });
    } catch (error) {
      console.error("[AgarEducation] failed to send player_state", error);
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
      console.error("[AgarEducation] failed to send player_left", error);
    }
  }

  function sendPlayerDeath(victimSessionId, killerSessionId, killerName) {
    const channel = channelRef.current;

    if (!channel) {
      return;
    }

    try {
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
    } catch (error) {
      console.error("[AgarEducation] failed to send player_dead", error);
    }
  }

  function clearRemotePlayer(sessionId) {
    const deleted = remotePlayersRef.current.delete(sessionId);

    if (deleted) {
      setOnlinePlayers(remotePlayersRef.current.size + 1);
    }
  }

  function resetEducation({ includeObstacles = true } = {}) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;
    if (includeObstacles) {
      const now = Date.now();
      spikesRef.current = createInitialSpikes(SPIKE_MAX_COUNT, now, WORLD_WIDTH, WORLD_HEIGHT);
      warningZonesRef.current = [];
    } else {
      spikesRef.current = [];
      warningZonesRef.current = [];
    }

    blobsRef.current = [createBlob(centerX, centerY, 22)];
    foodRef.current = includeObstacles
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
    setEducationStartedValue(false);
    spikeLogicStartedLoggedRef.current = false;
    sendPlayerLeave("dead");
    setDeathReason(`You were eaten by ${killerName}.`);
    setShowGate(true);
    resetEducation({ includeObstacles: false });
  }

  function startRunWithUsername(name) {
    const safeName = name.trim().slice(0, 18);

    if (!safeName) {
      return;
    }

    console.info("[AgarEducation] Start button clicked", { safeName });

    try {
      leaveSentRef.current = false;
      playerNameRef.current = safeName;
      playerColorRef.current = colorFromId(`${sessionIdRef.current}-${safeName}`);
      isAliveRef.current = true;
      spikeLogicStartedLoggedRef.current = false;
      setUsername(safeName);
      setDeathReason("");
      resetEducation({ includeObstacles: true });

      setEducationStartedValue(true);
      setShowGate(false);
      console.info("[AgarEducation] Education started", { safeName });

      const channel = channelRef.current;
      if (channel && typeof channel.track === "function") {
        try {
          channel.track({
            sessionId: sessionIdRef.current,
            username: safeName,
          });
        } catch (error) {
          console.error("[AgarEducation] failed to track presence", error);
        }
      }

      sendPlayerState(true);
    } catch (error) {
      isAliveRef.current = false;
      setEducationStartedValue(false);
      console.error("[AgarEducation] failed to start education", error);
      setDeathReason("Failed to start education. Please try again.");
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

      target.x = clamp(camera.x - canvas.clientWidth / 2 + viewX, 0, WORLD_WIDTH);
      target.y = clamp(camera.y - canvas.clientHeight / 2 + viewY, 0, WORLD_HEIGHT);
    }

    function handleKeyDown(event) {
      if (!isAliveRef.current || !educationStartedRef.current) {
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
        mergeStateRef.current.nextMergeAt = Date.now() + MERGE_INTERVAL_MS;
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

    function educationLoop() {
      if (!rafReadyRef.current) {
        animationRef.current = requestAnimationFrame(educationLoop);
        return;
      }

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0b1325";
      ctx.fillRect(0, 0, width, height);

      let blobs = blobsRef.current;
      const now = Date.now();

      if (educationStartedRef.current && isAliveRef.current) {
        if (!spikeLogicStartedLoggedRef.current) {
          spikeLogicStartedLoggedRef.current = true;
          console.info("[AgarEducation] Spike logic started");
        }

        const spikeState = updateSpikesAndWarnings({
          spikes: spikesRef.current,
          warnings: warningZonesRef.current,
          now,
          worldWidth: WORLD_WIDTH,
          worldHeight: WORLD_HEIGHT,
        });

        spikesRef.current = spikeState.spikes;
        warningZonesRef.current = spikeState.warnings;
      }

      if (isAliveRef.current && educationStartedRef.current) {
        updateBlobMovement(blobs, mouseTargetRef.current);
        separateOverlappingBlobs(blobs);

        keepBlobsOutsideWarnings(blobs, warningZonesRef.current);

        const hitSpike = findSpikeCollision(blobs, spikesRef.current);

        if (hitSpike) {
          const beforeCount = blobs.length;
          const splitToMax = splitToMaxCells(blobs, createBlob, hitSpike);
          const didSplit = splitToMax.length > beforeCount;
          blobsRef.current = splitToMax;
          blobs = splitToMax;

          if (didSplit) {
            mergeStateRef.current.nextMergeAt = Date.now() + MERGE_INTERVAL_MS;
            updateHudFromBlobs(splitToMax);
            sendPlayerState(true);
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
      smoothRemotePlayers();

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

      if (educationStartedRef.current) {
        drawWarningZones(ctx, warningZonesRef.current, now);
        drawSpikeBalls(ctx, spikesRef.current);
      }

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
      animationRef.current = requestAnimationFrame(educationLoop);
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

            const next = {
              sessionId: payload.sessionId,
              username: payload.username || "Player",
              color: payload.color || colorFromId(payload.sessionId),
              x: payload.x,
              y: payload.y,
              radius: payload.radius,
              parts: payload.parts || 1,
              updatedAt: payload.updatedAt || Date.now(),
              renderX: previous?.renderX ?? payload.x,
              renderY: previous?.renderY ?? payload.y,
              renderRadius: previous?.renderRadius ?? payload.radius,
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
    console.info("[AgarEducation] App mounted");
    resetEducation({ includeObstacles: false });
    setupRealtime();

    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    educationLoop();

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
        <EducationHeader score={score} size={size} parts={parts} onlinePlayers={onlinePlayers} />
        <EducationArena canvasRef={canvasRef} isActive={educationStarted} />
        <EducationFooter
          onRestart={() => resetEducation({ includeObstacles: educationStartedRef.current })}
          username={username}
          connectionStatus={connectionStatus}
        />
      </div>

      <UsernameGate
        open={showGate}
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
