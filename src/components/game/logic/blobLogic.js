import { blobArea, radiusFromArea } from "./math";

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
  const totalArea = blobs.reduce((acc, blob) => acc + blobArea(blob.radius), 0);
  return Math.round(radiusFromArea(totalArea));
}

export function getBlobCentroid(blobs, fallbackX, fallbackY) {
  if (!blobs.length) {
    return { x: fallbackX, y: fallbackY };
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

    merged.push(createBlob(x, y, radiusFromArea(totalArea)));
  }

  return merged;
}
