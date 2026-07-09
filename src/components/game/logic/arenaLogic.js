import { FOOD_TARGET } from "./constants";

export function createFood(count, worldWidth, worldHeight) {
  const colors = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb7185"];

  return Array.from({ length: count }, () => ({
    x: Math.random() * worldWidth,
    y: Math.random() * worldHeight,
    radius: 5 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
}

export function replenishFood(food, worldWidth, worldHeight) {
  const nextFood = [...food];

  while (nextFood.length < FOOD_TARGET) {
    nextFood.push(...createFood(1, worldWidth, worldHeight));
  }

  return nextFood;
}

export function drawGrid(ctx, camera, width, height, gridSize) {
  const left = camera.x - width / 2;
  const top = camera.y - height / 2;
  const right = left + width;
  const bottom = top + height;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
  ctx.lineWidth = 1;

  const startX = Math.floor(left / gridSize) * gridSize;
  const endX = Math.ceil(right / gridSize) * gridSize;

  for (let x = startX; x <= endX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  const startY = Math.floor(top / gridSize) * gridSize;
  const endY = Math.ceil(bottom / gridSize) * gridSize;

  for (let y = startY; y <= endY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
}
