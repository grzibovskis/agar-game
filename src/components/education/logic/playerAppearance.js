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
  if (remote.blobs?.length) {
    let labelBlob = remote.blobs[0];

    for (const blob of remote.blobs) {
      const blobX = blob.renderX ?? blob.x;
      const blobY = blob.renderY ?? blob.y;
      const blobRadius = blob.renderRadius ?? blob.radius;

      drawCircle(ctx, blobX, blobY, blobRadius, remote.color || "#3b82f6", "#dbeafe");

      const labelRadius = labelBlob.renderRadius ?? labelBlob.radius;
      if (blobRadius > labelRadius) {
        labelBlob = blob;
      }
    }

    ctx.fillStyle = "white";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      remote.username || "Player",
      labelBlob.renderX ?? labelBlob.x,
      (labelBlob.renderY ?? labelBlob.y) + 4
    );
    return;
  }

  const x = remote.renderX ?? remote.x;
  const y = remote.renderY ?? remote.y;
  const radius = remote.renderRadius ?? remote.radius;

  drawCircle(ctx, x, y, radius, remote.color || "#3b82f6", "#dbeafe");
  ctx.fillStyle = "white";
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";
  ctx.fillText(remote.username || "Player", x, y + 4);
}

export function drawLocalBlob(ctx, blob, username, color) {
  let displayRadius = blob.radius;

  if (blob.mergeAnimStart) {
    const elapsed = Date.now() - blob.mergeAnimStart;
    const duration = blob.mergeAnimDuration || 450;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - (1 - t) * (1 - t); // ease-out quad
    displayRadius = blob.mergeAnimFromRadius + (blob.radius - blob.mergeAnimFromRadius) * eased;

    if (t >= 1) {
      delete blob.mergeAnimStart;
      delete blob.mergeAnimFromRadius;
      delete blob.mergeAnimDuration;
    }
  }

  drawCircle(ctx, blob.x, blob.y, displayRadius, color, "#bbf7d0");
  ctx.fillStyle = "white";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(username || "YOU", blob.x, blob.y + 5);
}
