import {
  MIN_SPLIT_RADIUS,
  PVP_OVERLAP_RATIO,
  PVP_SIZE_ADVANTAGE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@/components/cell/logic/constants";
import { growBlobWithinGroup } from "@/components/cell/logic/blobLogic";
import { blobArea, clamp } from "@/components/cell/logic/math";

export function canEatCircle(biggerRadius, smallerRadius, distance) {
  if (biggerRadius <= smallerRadius * PVP_SIZE_ADVANTAGE) {
    return false;
  }

  const overlapDepth = biggerRadius + smallerRadius - distance;
  return overlapDepth >= smallerRadius * PVP_OVERLAP_RATIO;
}

export function splitAndJump(blobs, mouseTarget, createBlob) {
  if (!blobs.length) {
    return blobs;
  }

  const next = [];

  for (const blob of blobs) {
    // Only split if radius strictly above the minimum — children will be below it and won't re-split
    const canSplit = blob.radius > MIN_SPLIT_RADIUS;

    if (!canSplit) {
      next.push(blob);
      continue;
    }

    const dx = mouseTarget.x - blob.x;
    const dy = mouseTarget.y - blob.y;
    const distance = Math.hypot(dx, dy) || 1;
    const dirX = dx / distance;
    const dirY = dy / distance;
    const perpX = -dirY;
    const perpY = dirX;

    const newRadius = blob.radius / Math.sqrt(2);
    const jumpDistance = blob.radius;
    const sideSpacing = newRadius * 1.35;

    const anchorX = clamp(blob.x + perpX * sideSpacing, newRadius, WORLD_WIDTH - newRadius);
    const anchorY = clamp(blob.y + perpY * sideSpacing, newRadius, WORLD_HEIGHT - newRadius);

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

    const anchor = createBlob(anchorX, anchorY, newRadius, dirX * 3, dirY * 3);
    const launched = createBlob(launchedX, launchedY, newRadius, dirX * 15, dirY * 15);

    next.push(anchor);
    next.push(launched);
  }

  return next;
}

export function updateBlobMovement(blobs, target, speedMultiplier = 1) {
  for (const blob of blobs) {
    const dx = target.x - blob.x;
    const dy = target.y - blob.y;
    const distance = Math.hypot(dx, dy);

    const chaseSpeed = Math.max(0.9, 5 - blob.radius * 0.05) * speedMultiplier;

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
}

export function separateOverlappingBlobs(blobs) {
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

export function consumeFood(blobs, food) {
  let gainedScore = 0;

  const remainingFood = food.filter((point) => {
    for (const blob of blobs) {
      const dx = blob.x - point.x;
      const dy = blob.y - point.y;
      const distance = Math.hypot(dx, dy);

      if (distance < blob.radius + point.radius) {
        growBlobWithinGroup(blobs, blob, blobArea(point.radius) * 0.6);
        gainedScore += 1;
        return false;
      }
    }

    return true;
  });

  return {
    gainedScore,
    remainingFood,
  };
}

export function resolvePvpCombat(localBlobs, remotes, handlers) {
  const { onLocalEatRemoteBlob } = handlers;

  for (const remote of remotes) {
    const remoteBlobs = Array.isArray(remote.blobs) && remote.blobs.length
      ? remote.blobs
      : [{ x: remote.x, y: remote.y, radius: remote.radius }];

    for (let localIndex = 0; localIndex < localBlobs.length; localIndex += 1) {
      const localBlob = localBlobs[localIndex];

      for (let remoteIndex = 0; remoteIndex < remoteBlobs.length; remoteIndex += 1) {
        const remoteBlob = remoteBlobs[remoteIndex];
        const dx = localBlob.x - remoteBlob.x;
        const dy = localBlob.y - remoteBlob.y;
        const distance = Math.hypot(dx, dy);

        if (canEatCircle(localBlob.radius, remoteBlob.radius, distance)) {
          growBlobWithinGroup(localBlobs, localBlob, blobArea(remoteBlob.radius) * 0.9);

          if (typeof onLocalEatRemoteBlob === "function") {
            onLocalEatRemoteBlob(remote, remoteIndex, remoteBlob, localIndex, localBlob);
          }

          return;
        }

      }
    }
  }
}
