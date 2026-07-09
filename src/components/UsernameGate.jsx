"use client";

import { useEffect, useState } from "react";

export default function UsernameGate({
  open,
  title,
  message,
  defaultName = "",
  busy = false,
  onSubmit,
}) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (open) {
      setName(defaultName);
    }
  }, [defaultName, open]);

  if (!open) {
    return null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim().slice(0, 18);

    if (!trimmed || busy || typeof onSubmit !== "function") {
      return;
    }

    console.info("[UsernameGate] submit", { username: trimmed });
    onSubmit(trimmed);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm pointer-events-auto">
      <div className="relative z-[91] w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl pointer-events-auto">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-300">{message}</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block text-sm text-slate-300" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            value={name}
            maxLength={18}
            onChange={(event) => setName(event.target.value)}
            placeholder="Type your player name"
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-400 focus:border-emerald-400"
            autoFocus
          />

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy || !name.trim()}
          >
            {busy ? "Connecting..." : "Start Game"}
          </button>
        </form>
      </div>
    </div>
  );
}
