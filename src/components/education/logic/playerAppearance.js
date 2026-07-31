const PLAYER_PALETTE = ["#22c55e", "#3b82f6", "#f97316", "#f43f5e", "#14b8a6", "#eab308"];
const VISUAL_TYPES = ["wave", "spiky", "bacteria"];

// Deterministic pseudo-random from a numeric seed
function seededRandom(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

// Build the path for a local blob (wave / spiky / bacteria shape)
function buildBlobPath(ctx, x, y, radius, seed, type, now) {
  const POINTS = 72;
  ctx.beginPath();
  for (let i = 0; i <= POINTS; i++) {
    const angle = (i / POINTS) * Math.PI * 2;
    let r = radius;

    if (type === "wave") {
      r += Math.max(2, radius * 0.045) * Math.sin(angle * 6 + now * 0.0026);
      r += Math.max(1, radius * 0.022) * Math.sin(angle * 3 - now * 0.0014 + 1.1);
    } else if (type === "spiky") {
      const numSpikes = 5 + Math.floor(seededRandom(seed) * 5);
      for (let s = 0; s < numSpikes; s++) {
        const sa = seededRandom(seed * 17 + s * 11) * Math.PI * 2;
        const sh = Math.max(5, radius * 0.22) * (0.6 + seededRandom(seed + s * 3) * 0.7);
        const hw = 0.14;
        const diff = ((angle - sa) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const nd = Math.min(diff, Math.PI * 2 - diff);
        if (nd < hw) r += sh * Math.pow(1 - nd / hw, 2);
      }
    } else { // bacteria
      r += Math.max(2, radius * 0.13) * Math.sin(angle * 3 + seededRandom(seed)       * 6.28 + now * 0.0017);
      r += Math.max(1, radius * 0.08) * Math.sin(angle * 5 + seededRandom(seed + 1)   * 6.28 + now * 0.0011);
      r += Math.max(1, radius * 0.05) * Math.sin(angle * 8 + seededRandom(seed + 2)   * 6.28);
    }

    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

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

// now = Date.now() value passed in from the game loop for animation
export function drawLocalBlob(ctx, blob, username, color, now = 0) {
  let displayRadius = blob.radius;

  if (blob.mergeAnimStart) {
    const elapsed = (now || Date.now()) - blob.mergeAnimStart;
    const duration = blob.mergeAnimDuration || 450;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - (1 - t) * (1 - t);
    displayRadius = blob.mergeAnimFromRadius + (blob.radius - blob.mergeAnimFromRadius) * eased;

    if (t >= 1) {
      delete blob.mergeAnimStart;
      delete blob.mergeAnimFromRadius;
      delete blob.mergeAnimDuration;
    }
  }

  // Fill
  ctx.beginPath();
  ctx.arc(blob.x, blob.y, displayRadius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Crisp border
  ctx.beginPath();
  ctx.arc(blob.x, blob.y, displayRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Label
  ctx.fillStyle = "white";
  ctx.font = `bold ${Math.max(10, Math.min(16, Math.round(displayRadius * 0.38)))}px Arial`;
  ctx.textAlign = "center";
  ctx.fillText(username || "YOU", blob.x, blob.y + 5);
}

// Bot blobs: bacteria shape so they look distinct from human players
export function drawBotPlayer(ctx, bot, now) {
  if (!bot.blobs?.length) return;

  let labelBlob = bot.blobs[0];

  for (const blob of bot.blobs) {
    // Each bot blob has a fixed seed derived from its id for a stable bacteria outline
    const seed = typeof blob.id === "number" ? blob.id : 1;

    // Glowing bacteria fill
    ctx.save();
    ctx.shadowColor = bot.color;
    ctx.shadowBlur = 18;
    buildBlobPath(ctx, blob.x, blob.y, blob.radius, seed, "bacteria", now);
    ctx.fillStyle = bot.color;
    ctx.fill();
    ctx.restore();

    // Crisp bacteria outline
    buildBlobPath(ctx, blob.x, blob.y, blob.radius, seed, "bacteria", now);
    ctx.strokeStyle = "rgba(255,255,255,0.30)";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (blob.radius > (labelBlob.radius || 0)) labelBlob = blob;
  }

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(bot.name, labelBlob.x, labelBlob.y + 4);
}
