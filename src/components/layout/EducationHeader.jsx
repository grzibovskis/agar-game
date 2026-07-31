"use client";

import { useState } from "react";
import SkinPicker from "@/components/education/SkinPicker";

function PlayerRow({ rank, player }) {
  if (!player) {
    return <div className="h-6" />;
  }
  return (
    <div
      className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
        player.isLocal ? "bg-emerald-900/40" : ""
      }`}
    >
      <span className="w-4 shrink-0 text-slate-500">{rank}.</span>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: player.color }}
      />
      <span className="min-w-0 flex-1 truncate font-medium text-white">
        {player.username}
        {player.isLocal && (
          <span className="ml-1 text-[10px] text-emerald-400">(you)</span>
        )}
      </span>
      <span className="shrink-0 font-mono text-slate-400">{player.score}</span>
    </div>
  );
}

export default function EducationHeader({
  score,
  size,
  parts,
  onlinePlayers,
  leaderboardPlayers = [],
  currentSkin = null,
  onSelectSkin,
}) {
  const [showAll, setShowAll] = useState(false);

  const sorted = [...leaderboardPlayers].sort((a, b) => b.score - a.score);
  // Always-visible: top 6 split into two columns of 3
  const left  = [sorted[0], sorted[1], sorted[2]];
  const right = [sorted[3], sorted[4], sorted[5]];

  const cards = [
    { label: "Score",  value: score },
    { label: "Size",   value: size  },
    { label: "Parts",  value: parts },
    { label: "Online", value: onlinePlayers },
  ];

  return (
    <div className="relative rounded-2xl bg-slate-900 p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">

        {/* ── Game title ── */}
        <div className="shrink-0">
          <h1 className="text-2xl font-bold md:text-3xl">Eat me!</h1>
          <p className="text-sm text-slate-300">
            Move mouse to travel. Press Space to jump-split.
          </p>
        </div>

        {/* ── Skins button ── */}
        <SkinPicker
          score={score}
          currentSkin={currentSkin}
          onSelectSkin={onSelectSkin}
        />

        {/* ── Leaderboard box ── */}
        <div className="min-w-[280px] rounded-xl border border-slate-700 bg-slate-800/60">
          {/* Header row */}
          <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
              Leaderboard
            </span>
            <button
              onClick={() => setShowAll((v) => !v)}
              className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-600 hover:text-white"
            >
              {showAll ? "Close ▲" : "View More ▼"}
            </button>
          </div>

          {/* Two-column grid — 3 rows each */}
          <div className="grid grid-cols-2 gap-x-2 px-2 py-1.5">
            <div className="space-y-0.5">
              {left.map((p, i) => (
                <PlayerRow key={p?.sessionId ?? `l${i}`} rank={i + 1} player={p} />
              ))}
            </div>
            <div className="space-y-0.5">
              {right.map((p, i) => (
                <PlayerRow key={p?.sessionId ?? `r${i}`} rank={i + 4} player={p} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="flex shrink-0 gap-2 md:gap-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl bg-slate-800 px-4 py-3 text-center"
            >
              <div className="text-xs text-slate-400">{card.label}</div>
              <div className="text-xl font-bold">{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Full leaderboard dropdown (overlays the arena) ── */}
      {showAll && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-700 bg-slate-900/96 shadow-2xl backdrop-blur-sm">
          <div className="p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Full Leaderboard
            </p>
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {sorted.length === 0 ? (
                <p className="py-2 text-xs text-slate-500">No players yet</p>
              ) : (
                sorted.map((player, i) => (
                  <div
                    key={player.sessionId}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      player.isLocal ? "bg-emerald-900/30" : "hover:bg-slate-800"
                    }`}
                  >
                    <span className="w-5 shrink-0 font-mono text-xs text-slate-500">
                      {i + 1}
                    </span>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: player.color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-white">
                      {player.username}
                      {player.isLocal && (
                        <span className="ml-1 text-[10px] text-emerald-400">(you)</span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-emerald-400">
                      {player.score}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

