import { WORLD_HEIGHT, WORLD_WIDTH } from "./constants";
import { blobArea, radiusFromArea } from "./math";

const MERGE_ANIM_DURATION_MS = 450;
const MAX_COMBINED_BLOB_RADIUS = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.1;
const MAX_COMBINED_BLOB_AREA = blobArea(MAX_COMBINED_BLOB_RADIUS);

function getCombinedArea(blobs) {
  return blobs.reduce((acc, blob) => acc + blobArea(blob.radius), 0);
}

export function createBlobFactory(blobIdRef) {
  return function createBlob(x, y, radius, vx = 0, vy = 0) {
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
  };
}

export function getCombinedRadius(blobs) {
  const totalArea = Math.min(getCombinedArea(blobs), MAX_COMBINED_BLOB_AREA);
  return Math.round(radiusFromArea(totalArea));
}

export function growBlobWithinGroup(blobs, blob, addedArea) {
  const currentBlobArea = blobArea(blob.radius);
  const otherBlobArea = getCombinedArea(blobs) - currentBlobArea;
  const maxBlobArea = Math.max(currentBlobArea, MAX_COMBINED_BLOB_AREA - otherBlobArea);
  const nextBlobArea = Math.min(currentBlobArea + addedArea, maxBlobArea);

  blob.radius = radiusFromArea(nextBlobArea);
  return blob.radius;
}

export function getBlobCentroid(blobs, fallbackX, fallbackY) {
  if (!blobs.length) {
    return { x: fallbackX, y: fallbackY };
  }

  const totalArea = getCombinedArea(blobs);

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

export function mergeClosestPairsOnce(blobs, createBlob) {
  if (blobs.length <= 1) {
    return blobs;
  }

  const source = [...blobs];
  const used = new Set();
  const merged = [];

  for (let i = 0; i < source.length; i += 1) {
    if (used.has(source[i].id)) {
      continue;
    }

    let bestIndex = -1;
    let bestDistance = Infinity;

    for (let j = i + 1; j < source.length; j += 1) {
      if (used.has(source[j].id)) {
        continue;
      }

      const dx = source[i].x - source[j].x;
      const dy = source[i].y - source[j].y;
      const distance = dx * dx + dy * dy;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = j;
      }
    }

    if (bestIndex === -1) {
      merged.push(source[i]);
      used.add(source[i].id);
      continue;
    }

    const a = source[i];
    const b = source[bestIndex];
    used.add(a.id);
    used.add(b.id);

    const areaA = blobArea(a.radius);
    const areaB = blobArea(b.radius);
    const totalArea = areaA + areaB;

    const x = (a.x * areaA + b.x * areaB) / totalArea;
    const y = (a.y * areaA + b.y * areaB) / totalArea;
    const mergedRadius = radiusFromArea(Math.min(totalArea, MAX_COMBINED_BLOB_AREA));

    const newBlob = createBlob(x, y, mergedRadius);
    newBlob.mergeAnimStart = Date.now();
    newBlob.mergeAnimFromRadius = Math.min(a.radius, b.radius);
    newBlob.mergeAnimDuration = MERGE_ANIM_DURATION_MS;
    merged.push(newBlob);
  }

  return merged;
}
