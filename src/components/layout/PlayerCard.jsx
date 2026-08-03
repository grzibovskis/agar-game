"use client";

import { useEffect, useRef, useState } from "react";
import SkinPicker from "@/components/layout/SkinPicker";
import { getSkinById } from "@/components/cell/logic/skinData";

// Animated circle with face — minimal breathing, drawn on canvas
function PlayerCircle({ color, currentSkin }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const imgRef    = useRef(null);
  const frameRef  = useRef(0);

  useEffect(() => {
    imgRef.current = null;
    if (!currentSkin) return;
    const def = getSkinById(currentSkin);
    if (!def) return;
    const img = new Image();
    img.src = def.src;
    img.onload = () => { imgRef.current = img; };
  }, [currentSkin]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext("2d");
    const DPR  = window.devicePixelRatio || 1;
    const SIZE = 84;

    canvas.width  = SIZE * DPR;
    canvas.height = SIZE * DPR;
    canvas.style.width  = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    ctx.scale(DPR, DPR);

    function draw() {
      const t  = frameRef.current;
      const cx = SIZE / 2;
      const cy = SIZE / 2;
      // Very subtle pulse — ±0.6 px only
      const r  = SIZE * 0.38 + Math.sin(t * 0.018) * 0.6;

      ctx.clearRect(0, 0, SIZE, SIZE);

      // Soft glow (barely changes)
      ctx.shadowColor = color;
      ctx.shadowBlur  = 9 + Math.sin(t * 0.018) * 1.5;

      // Body
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Skin image clipped to body
      if (imgRef.current) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(imgRef.current, cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
      }

      // Specular highlight
      ctx.beginPath();
      ctx.arc(cx - r * 0.24, cy - r * 0.24, r * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      ctx.fill();

      // ── Eyes ──
      const eyeY   = cy - r * 0.16;
      const eyeOff = r * 0.28;
      const eyeR   = r * 0.14;
      const pupilR = r * 0.075;

      for (const ex of [cx - eyeOff, cx + eyeOff]) {
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ex + eyeR * 0.12, eyeY + eyeR * 0.1, pupilR, 0, Math.PI * 2);
        ctx.fillStyle = "#0f172a";
        ctx.fill();
      }

      // ── Serious straight mouth ──
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.26, cy + r * 0.36);
      ctx.lineTo(cx + r * 0.26, cy + r * 0.36);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth   = Math.max(1.5, r * 0.07);
      ctx.lineCap     = "round";
      ctx.stroke();

      frameRef.current += 1;
      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}

const STATS = [
  { key: "score",  label: "Score"  },
  { key: "size",   label: "Size"   },
  { key: "parts",  label: "Parts"  },
  { key: "online", label: "Online" },
];

export default function PlayerCard({
  playerColor   = "#22c55e",
  currentSkin   = null,
  onSelectSkin,
  score         = 0,
  size          = 22,
  parts         = 1,
  onlinePlayers = 1,
  username      = "",
}) {
  const [open,      setOpen]      = useState(false);
  const [skinsOpen, setSkinsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const statValues = { score, size, parts, online: onlinePlayers };

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setSkinsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleToggle() {
    setOpen((v) => {
      if (v) setSkinsOpen(false);
      return !v;
    });
  }

  return (
    <div ref={wrapperRef} className="flex items-center gap-3">
      {/* ── Circle card button ── */}
      <div className="relative">
        <button
          onClick={handleToggle}
          aria-label="Player options"
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 shadow-inner transition-colors hover:border-slate-500 hover:bg-slate-700/80"
        >
          <PlayerCircle color={playerColor} currentSkin={currentSkin} />
          <span className="max-w-[96px] truncate text-center text-[11px] font-semibold tracking-wide text-slate-300">
            {username || "Guest"}
          </span>
        </button>

        {/* ── Dropdown ── */}
        {open && (
          <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <button
              onClick={() => setSkinsOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-t-xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <span className="flex items-center gap-2"><span className="text-base">🎨</span> Skins</span>
              <span className="text-[10px] text-slate-500">{skinsOpen ? "▲" : "▼"}</span>
            </button>

            {skinsOpen && (
              <div className="border-t border-slate-800">
                <SkinPicker
                  inline
                  score={score}
                  currentSkin={currentSkin}
                  onSelectSkin={(id) => {
                    onSelectSkin?.(id);
                    setOpen(false);
                    setSkinsOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Stats: vertical list ── */}
      <div className="flex flex-col gap-[3px]">
        {STATS.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-5 rounded-lg bg-slate-800/60 px-3 py-[5px]"
          >
            <span className="text-[9px] font-medium uppercase tracking-widest text-slate-500">
              {label}
            </span>
            <span className="text-[13px] font-bold tabular-nums leading-none text-white">
              {statValues[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
