export default function EducationHeader({ score, size, parts, onlinePlayers }) {
  const cards = [
    { label: "Score", value: score },
    { label: "Size", value: size },
    { label: "Parts", value: parts },
    { label: "Online", value: onlinePlayers },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 p-4 shadow-xl">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Agar Education</h1>
        <p className="text-slate-300">Move mouse to travel. Press Space to jump-split side-by-side.</p>
      </div>

      <div className="flex gap-2 md:gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-slate-800 px-4 py-3 text-center">
            <div className="text-xs text-slate-400">{card.label}</div>
            <div className="text-xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
