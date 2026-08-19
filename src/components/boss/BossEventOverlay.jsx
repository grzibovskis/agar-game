"use client";

import { useEffect, useState } from "react";

function getPhaseCopy(phase, secondsLeft) {
  if (phase === "transition") {
    return {
      title: "Boss Event Incoming",
      detail: `Fog is rolling in. Arena inversion in ${secondsLeft}s.`,
    };
  }

  if (phase === "active") {
    return {
      title: "Boss Raid Active",
      detail: "Press E to launch red shots. Each hit removes 1 HP.",
    };
  }

  return {
    title: "Boss Defeated",
    detail: "Collect the scattered score drops.",
  };
}

export default function BossEventOverlay({
  phase = "inactive",
  health = 0,
  maxHealth = 200,
  activatedAt = 0,
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (phase === "inactive") {
      return undefined;
    }

    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [phase]);

  if (phase === "inactive") {
    return null;
  }

  const secondsLeft = Math.max(0, Math.ceil((activatedAt - now) / 1000));
  const copy = getPhaseCopy(phase, secondsLeft);
  const percent = maxHealth > 0 ? Math.max(0, Math.min(100, (health / maxHealth) * 100)) : 0;

  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 z-30 flex justify-center">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700/70 bg-slate-950/78 px-5 py-4 text-white shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">
              Raid Phase
            </p>
            <h2 className="text-xl font-bold">{copy.title}</h2>
            <p className="text-sm text-slate-200">{copy.detail}</p>
          </div>

          {phase !== "transition" && (
            <div className="min-w-56 flex-1">
              <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-slate-200">
                <span>Boss Health</span>
                <span>{health} / {maxHealth}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800/90">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300 transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}