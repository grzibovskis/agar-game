import { FOOD_TARGET } from "@/components/cell/logic/constants";

function isInsideRestrictedZone(x, y, radius, restrictedZones) {
  return restrictedZones.some((zone) => {
    const dx = x - zone.x;
    const dy = y - zone.y;
    return Math.hypot(dx, dy) < radius + zone.radius;
  });
}

export function createFood(count, worldWidth, worldHeight, restrictedZones = []) {
  const colors = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb7185"];
  const nextFood = [];

  for (let i = 0; i < count; i += 1) {
    let created = null;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const radius = 5 + Math.random() * 5;
      const x = radius + Math.random() * (worldWidth - radius * 2);
      const y = radius + Math.random() * (worldHeight - radius * 2);

      if (isInsideRestrictedZone(x, y, radius, restrictedZones)) {
        continue;
      }

      created = {
        x,
        y,
        radius,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
      break;
    }

    if (created) {
      nextFood.push(created);
    }
  }

  return nextFood;
}

export function replenishFood(food, worldWidth, worldHeight, restrictedZones = [], targetCount = FOOD_TARGET) {
  const nextFood = food.filter(
    (point) => !isInsideRestrictedZone(point.x, point.y, point.radius, restrictedZones)
  );

  while (nextFood.length < targetCount) {
    const created = createFood(1, worldWidth, worldHeight, restrictedZones);

    if (!created.length) {
      break;
    }

    nextFood.push(...created);
  }

  return nextFood;
}

export function drawGrid(ctx, camera, width, height, gridSize, gridColor = "rgba(148, 163, 184, 0.2)") {
  const left = camera.x - width / 2;
  const top = camera.y - height / 2;
  const right = left + width;
  const bottom = top + height;

  ctx.strokeStyle = gridColor;
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
