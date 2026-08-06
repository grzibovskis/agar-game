"use client";

import { useEffect, useState } from "react";

function formatSecondsLeft(expiresAt, now) {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

export default function ItemInventory({
  items = [],
  activeItem = null,
  onActivateItem,
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  if (!items.length) {
    return (
      <p className="text-xs text-slate-500">Collect boss drops to show them here.</p>
    );
  }

  const hasActive = !!(activeItem && activeItem.expiresAt > now);

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        const isThisActive = hasActive && activeItem.itemType === item.itemType;
        const disabled = hasActive && !isThisActive;
        const secondsLeft = isThisActive ? formatSecondsLeft(activeItem.expiresAt, now) : 0;

        return (
          <div
            key={item.itemType}
            className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-800/70"
            style={{ width: 100, height: 116 }}
            title={`${item.itemName} x${item.count}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {item.iconSrc ? (
              <img
                src={item.iconSrc}
                alt={item.itemName}
                className="absolute inset-x-0 top-0 h-[84px] w-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : null}

            <div className="absolute inset-x-0 top-0 h-[84px] bg-gradient-to-t from-black/70 to-transparent" />

            <div className="absolute right-1 top-1 rounded-full bg-emerald-400 px-1.5 py-[1px] text-[10px] font-bold text-slate-900">
              {item.count}
            </div>

            {isThisActive && (
              <div className="absolute left-1 top-1 rounded bg-cyan-400/95 px-1.5 py-[1px] text-[10px] font-bold text-slate-900">
                {secondsLeft}s
              </div>
            )}

            <div className="absolute inset-x-0 bottom-7 bg-black/60 px-1 py-1">
              <p className="truncate text-center text-[10px] font-medium text-white">
                {item.itemName}
              </p>
            </div>

            <button
              onClick={() => onActivateItem?.(item.itemType)}
              disabled={disabled || isThisActive}
              className={`absolute inset-x-1 bottom-1 rounded px-2 py-1 text-[10px] font-semibold transition ${
                isThisActive
                  ? "bg-cyan-500 text-slate-950"
                  : disabled
                    ? "cursor-not-allowed bg-slate-700 text-slate-400"
                    : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              }`}
            >
              {isThisActive ? "Active" : "Activate"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
