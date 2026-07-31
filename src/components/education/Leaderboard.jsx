"use client";

import { useState } from "react";

const ALWAYS_VISIBLE = 5;

export default function Leaderboard({ players }) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const hasMore = sorted.length > ALWAYS_VISIBLE;
  const visibleRows = expanded ? sorted : sorted.slice(0, ALWAYS_VISIBLE);

  return (
    <div className="absolute right-3 top-3 z-50 w-44 rounded-xl border border-slate-700 bg-slate-900/90 shadow-xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
          Leaderboard
        </span>
        {hasMore && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-slate-400 transition hover:text-white"
            aria-label={expanded ? "Collapse leaderboard" : "Expand leaderboard"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* Rows */}
      <div className={expanded ? "max-h-64 overflow-y-auto" : ""}>
        {visibleRows.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">No players yet</p>
        ) : (
          visibleRows.map((player, index) => (
            <div
              key={player.sessionId}
              className={`flex items-center gap-2 px-3 py-1.5 ${
                player.isLocal ? "bg-emerald-900/30" : ""
              }`}
            >
              <span className="w-3 shrink-0 text-xs text-slate-500">{index + 1}</span>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: player.color }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">
                {player.username}
                {player.isLocal && (
                  <span className="ml-1 text-emerald-400 text-[10px]">(you)</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-xs text-emerald-400">{player.score}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
