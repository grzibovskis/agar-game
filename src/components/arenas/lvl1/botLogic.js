import { WORLD_WIDTH, WORLD_HEIGHT } from "@/components/cell/logic/constants";
import { blobArea, radiusFromArea } from "@/components/cell/logic/math";
import { canEatCircle } from "./movementAttackLogic";

// ─── Constants ────────────────────────────────────────────────────────────────
export const BOT_NAMES = [
  "Bot_Gabe", "Bot_Mint", "Bot_Bob", "Bot_Dave", "Bot_Sam",
  "Bot_Olivia", "Bot_Emma", "Bot_Amelia", "Bot_Karen", "Bot_Ted",
];

const BOT_COLORS = [
  "#f97316", "#a78bfa", "#fb7185", "#38bdf8", "#fbbf24",
  "#e879f9", "#4ade80", "#c084fc", "#f472b6", "#34d399",
];

const SPEED_BASE        = 2.8;
const FOOD_SENSE_RADIUS = 300;
const ATTACK_SENSE_R    = 600;
const ATTACK_DURATION   = 10_000;
const STATE_MIN         = 3_000;
const STATE_MAX         = 9_000;
const SPLIT_MIN         = 22_000;
const SPLIT_MAX         = 70_000;
const MIN_SPLIT_R       = 30;
const PVP_ADV           = 1.1;
const PVP_OVERLAP       = 0.5;

let _uid = 800_000;
function uid() { return ++_uid; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }
function d2(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function randomPos() {
  return { x: rnd(250, WORLD_WIDTH - 250), y: rnd(250, WORLD_HEIGHT - 250) };
}

function centroid(blobs) {
  if (!blobs.length) return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  const ta = blobs.reduce((s, b) => s + blobArea(b.radius), 0);
  return {
    x: blobs.reduce((s, b) => s + b.x * blobArea(b.radius), 0) / ta,
    y: blobs.reduce((s, b) => s + b.y * blobArea(b.radius), 0) / ta,
  };
}

function combinedRadius(blobs) {
  return radiusFromArea(blobs.reduce((s, b) => s + blobArea(b.radius), 0));
}

// ─── Create ───────────────────────────────────────────────────────────────────
export function createBots(now) {
  return BOT_NAMES.map((name, i) => {
    const pos = randomPos();
    return {
      id: `bot-${i}`,
      name,
      color: BOT_COLORS[i],
      blobs: [{ id: uid(), x: pos.x, y: pos.y, radius: 22, vx: 0, vy: 0 }],
      state: "wander",
      stateEndAt: now + rnd(STATE_MIN, STATE_MAX),
      wanderTarget: randomPos(),
      attackTargetId: null,
      nextSplitAt: now + rnd(SPLIT_MIN, SPLIT_MAX),
      score: 0,
      active: false,
    };
  });
}

// ─── AI helpers ───────────────────────────────────────────────────────────────
function nearestFood(cx, cy, food, skip) {
  let best = null, bestD = FOOD_SENSE_RADIUS;
  for (let i = 0; i < food.length; i++) {
    if (skip.has(i)) continue;
    const dist = d2(cx, cy, food[i].x, food[i].y);
    if (dist < bestD) { bestD = dist; best = food[i]; }
  }
  return best;
}

function findTarget(cx, cy, cr, localBlobs, remotePlayers) {
  for (const b of localBlobs) {
    if (b.radius * PVP_ADV < cr && d2(cx, cy, b.x, b.y) < ATTACK_SENSE_R)
      return { id: "local", x: b.x, y: b.y };
  }
  for (const r of remotePlayers.values()) {
    if (r.radius * PVP_ADV < cr && d2(cx, cy, r.x, r.y) < ATTACK_SENSE_R)
      return { id: r.sessionId, x: r.x, y: r.y };
  }
  return null;
}

function attackPos(id, localBlobs, remotePlayers) {
  if (id === "local") return localBlobs.length ? { x: localBlobs[0].x, y: localBlobs[0].y } : null;
  const r = remotePlayers.get(id);
  return r ? { x: r.x, y: r.y } : null;
}

function moveBlobs(blobs, target) {
  return blobs.map(b => {
    const dx = target.x - b.x, dy = target.y - b.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = SPEED_BASE / Math.sqrt(Math.max(b.radius, 1));
    const vx = b.vx * 0.82 + (dx / dist) * speed * 0.18;
    const vy = b.vy * 0.82 + (dy / dist) * speed * 0.18;
    return {
      ...b,
      x: Math.max(b.radius, Math.min(WORLD_WIDTH  - b.radius, b.x + vx)),
      y: Math.max(b.radius, Math.min(WORLD_HEIGHT - b.radius, b.y + vy)),
      vx, vy,
    };
  });
}

function splitBlobs(blobs) {
  const out = [];
  for (const b of blobs) {
    if (b.radius >= MIN_SPLIT_R * Math.SQRT2) {
      const r = b.radius / Math.SQRT2;
      const a = Math.random() * Math.PI * 2;
      out.push({ ...b, radius: r });
      out.push({ id: uid(), x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r, radius: r, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6 });
    } else {
      out.push(b);
    }
  }
  return out;
}

function tryMergeBlobs(blobs) {
  if (blobs.length <= 1) return blobs;
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const dist = d2(blobs[i].x, blobs[i].y, blobs[j].x, blobs[j].y);
      if (dist < (blobs[i].radius + blobs[j].radius) * 0.45) {
        const a = blobs[i], b = blobs[j];
        const aA = blobArea(a.radius), bA = blobArea(b.radius), tA = aA + bA;
        const merged = {
          id: a.id,
          x: (a.x * aA + b.x * bA) / tA,
          y: (a.y * aA + b.y * bA) / tA,
          radius: radiusFromArea(tA),
          vx: (a.vx + b.vx) / 2,
          vy: (a.vy + b.vy) / 2,
        };
        return [...blobs.filter((_, k) => k !== i && k !== j), merged];
      }
    }
  }
  return blobs;
}

// ─── Main update ──────────────────────────────────────────────────────────────
export function updateBots({ bots, now, food, maxActive, localBlobs, remotePlayers }) {
  const consumedFoodIndices = new Set();

  const updated = bots.map((bot, idx) => {
    // Activate / deactivate
    if (idx >= maxActive) return { ...bot, active: false };

    let b = { ...bot, active: true };

    // Respawn if all blobs eaten
    if (!b.blobs.length) {
      const pos = randomPos();
      b = { ...b, blobs: [{ id: uid(), x: pos.x, y: pos.y, radius: 22, vx: 0, vy: 0 }], score: 0 };
    }

    const c  = centroid(b.blobs);
    const cr = combinedRadius(b.blobs);

    // State machine
    let { state, stateEndAt, wanderTarget, attackTargetId } = b;

    if (now >= stateEndAt) {
      const roll = Math.random();
      if (roll < 0.22) {
        const t = findTarget(c.x, c.y, cr, localBlobs, remotePlayers);
        if (t) { state = "attack"; attackTargetId = t.id; stateEndAt = now + ATTACK_DURATION; }
        else   { state = "chase_food"; stateEndAt = now + rnd(STATE_MIN, STATE_MAX); }
      } else if (roll < 0.55) {
        state = "chase_food"; stateEndAt = now + rnd(STATE_MIN, STATE_MAX);
      } else {
        state = "wander"; wanderTarget = randomPos(); stateEndAt = now + rnd(STATE_MIN, STATE_MAX);
      }
    }

    // Move target
    let moveTarget = wanderTarget;
    if (state === "chase_food") {
      const nf = nearestFood(c.x, c.y, food, consumedFoodIndices);
      moveTarget = nf || wanderTarget;
      if (!nf) state = "wander";
    } else if (state === "attack") {
      const pos = attackPos(attackTargetId, localBlobs, remotePlayers);
      if (pos) { moveTarget = pos; }
      else { state = "wander"; attackTargetId = null; moveTarget = wanderTarget; stateEndAt = now + rnd(STATE_MIN, STATE_MAX); }
    }

    if (state === "wander" && d2(c.x, c.y, wanderTarget.x, wanderTarget.y) < 100)
      wanderTarget = randomPos();

    // Move
    let blobs = moveBlobs(b.blobs, moveTarget);

    // Eat food
    let score = b.score;
    for (let fi = 0; fi < food.length; fi++) {
      if (consumedFoodIndices.has(fi)) continue;
      const f = food[fi];
      for (const blob of blobs) {
        if (d2(blob.x, blob.y, f.x, f.y) < blob.radius) {
          consumedFoodIndices.add(fi);
          blob.radius = radiusFromArea(blobArea(blob.radius) + blobArea(f.radius) * 0.6);
          score += 1;
          break;
        }
      }
    }

    // Random split
    let { nextSplitAt } = b;
    if (now >= nextSplitAt && blobs.length < 4 && cr >= MIN_SPLIT_R * Math.SQRT2) {
      blobs = splitBlobs(blobs);
      nextSplitAt = now + rnd(SPLIT_MIN, SPLIT_MAX);
    }

    blobs = tryMergeBlobs(blobs);

    return { ...b, blobs, state, stateEndAt, wanderTarget, attackTargetId, nextSplitAt, score };
  });

  return { bots: updated, consumedFoodIndices };
}

// ─── Bot eats local player ────────────────────────────────────────────────────
export function resolveBotVsLocal(bots, localBlobs) {
  if (!localBlobs.length) return { updatedBots: bots, nextLocalBlobs: localBlobs, botAteLocal: false, eatenLocalBlobs: [] };

  let localArr = [...localBlobs];
  let botAteLocal = false;
  const eatenLocalBlobs = [];
  const updatedBots = bots.map(bot => {
    if (!bot.active) return bot;
    const newBlobs = bot.blobs.map(bb => ({ ...bb }));
    let scoreGain = 0;
    for (const bb of newBlobs) {
      for (let li = localArr.length - 1; li >= 0; li--) {
        const lb = localArr[li];
        const dist = d2(bb.x, bb.y, lb.x, lb.y);
        if (canEatCircle(bb.radius, lb.radius, dist)) {
          bb.radius = radiusFromArea(blobArea(bb.radius) + blobArea(lb.radius) * 0.9);
          scoreGain += Math.max(6, Math.round(lb.radius * 0.9));
          eatenLocalBlobs.push(lb);
          localArr.splice(li, 1);
          botAteLocal = true;
          break;
        }
      }
    }
    return { ...bot, blobs: newBlobs, score: (bot.score || 0) + scoreGain };
  });

  return { updatedBots, nextLocalBlobs: localArr, botAteLocal, eatenLocalBlobs };
}
