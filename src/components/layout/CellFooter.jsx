export default function CellFooter({ onRestart, username, connectionStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={onRestart}
        className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 hover:bg-green-400"
      >
        Restart
      </button>

      <p className="text-sm text-slate-300">Player: {username || "Not joined"} | Supabase: {connectionStatus}</p>
    </div>
  );
}
