const PLAYER_PALETTE = ["#22c55e", "#3b82f6", "#f97316", "#f43f5e", "#14b8a6", "#eab308"];

export function colorFromId(id) {
  if (!id) {
    return PLAYER_PALETTE[0];
  }

  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }

  return PLAYER_PALETTE[Math.abs(hash) % PLAYER_PALETTE.length];
}

export function drawCircle(ctx, x, y, radius, color, strokeColor) {
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

export function drawRemotePlayer(ctx, remote) {
  drawCircle(ctx, remote.x, remote.y, remote.radius, remote.color || "#3b82f6", "#dbeafe");
  ctx.fillStyle = "white";
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";
  ctx.fillText(remote.username || "Player", remote.x, remote.y + 4);
}

export function drawLocalBlob(ctx, blob, username, color) {
  drawCircle(ctx, blob.x, blob.y, blob.radius, color, "#bbf7d0");
  ctx.fillStyle = "white";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(username || "YOU", blob.x, blob.y + 5);
}
