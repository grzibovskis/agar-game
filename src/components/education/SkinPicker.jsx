"use client";

import { useState } from "react";
import { SKINS, SKIN_UNLOCK_SCORE } from "@/components/education/logic/skinData";

export default function SkinPicker({ score = 0, currentSkin = null, onSelectSkin }) {
  const [open, setOpen] = useState(false);
  const anyUnlocked = score >= SKIN_UNLOCK_SCORE;
  const nextLock = SKINS.find((s) => score < s.unlockScore);

  function handleSelect(skinId) {
    if (typeof onSelectSkin === "function") onSelectSkin(skinId);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0">
      {/* Trigger button */}
      <button
        onClick={() => anyUnlocked && setOpen((v) => !v)}
        title={
          anyUnlocked
            ? "Choose a skin"
            : `Reach ${SKIN_UNLOCK_SCORE} score to unlock skins`
        }
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
          anyUnlocked
            ? "border-emerald-500/50 bg-slate-800 text-white hover:bg-slate-700"
            : "cursor-not-allowed border-slate-700 bg-slate-800/50 text-slate-500"
        }`}
      >
        <span className="text-base">{anyUnlocked ? "🎨" : "🔒"}</span>
        <span>Skins</span>
        {!anyUnlocked && (
          <span className="text-xs text-slate-500">
            {score}/{SKIN_UNLOCK_SCORE}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && anyUnlocked && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[348px] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
            <span className="text-sm font-bold text-white">Choose Skin</span>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 transition hover:text-white"
              aria-label="Close skins"
            >
              ✕
            </button>
          </div>

          {/* Next unlock hint */}
          {nextLock && (
            <p className="border-b border-slate-800 px-4 py-1.5 text-xs text-slate-400">
              Next unlock: <span className="font-semibold text-slate-200">{nextLock.name}</span> at{" "}
              <span className="font-semibold text-emerald-400">{nextLock.unlockScore} pts</span>
            </p>
          )}

          {/* Grid */}
          <div className="max-h-80 overflow-y-auto p-3">
            <div className="grid grid-cols-3 gap-2">
              {SKINS.map((skin) => {
                const isLocked   = score < skin.unlockScore;
                const selected   = currentSkin === skin.id;
                return (
                  <button
                    key={skin.id}
                    onClick={() => !isLocked && handleSelect(skin.id)}
                    title={
                      isLocked
                        ? `Unlocks at ${skin.unlockScore} pts`
                        : skin.name
                    }
                    style={{ width: 100, height: 100 }}
                    className={`relative overflow-hidden rounded-lg border-2 transition focus:outline-none ${
                      isLocked
                        ? "cursor-not-allowed border-slate-700 opacity-50"
                        : selected
                        ? "border-emerald-400 ring-2 ring-emerald-400/40"
                        : "border-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {/* Gradient fallback */}
                    <div
                      className="absolute inset-0"
                      style={{ background: skin.gradient }}
                    />

                    {/* Real image on top */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={skin.src}
                      alt={skin.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />

                    {/* Locked overlay */}
                    {isLocked && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/70">
                        <span className="text-xl">🔒</span>
                        <span className="mt-0.5 text-[10px] font-semibold text-slate-300">
                          {skin.unlockScore} pts
                        </span>
                      </div>
                    )}

                    {/* Name overlay (unlocked) */}
                    {!isLocked && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-1">
                        <p className="truncate text-center text-[10px] font-medium text-white">
                          {skin.name}
                        </p>
                      </div>
                    )}

                    {/* Selected tick */}
                    {selected && (
                      <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[10px] text-slate-900">
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
