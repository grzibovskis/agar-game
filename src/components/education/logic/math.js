export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function blobArea(radius) {
  return Math.PI * radius * radius;
}

export function radiusFromArea(area) {
  return Math.sqrt(area / Math.PI);
}
