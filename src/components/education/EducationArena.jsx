export default function EducationArena({ canvasRef, isActive = false }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-2">
      <canvas
        ref={canvasRef}
        className={`h-[78vh] w-full rounded-xl ${isActive ? "pointer-events-auto" : "pointer-events-none"}`}
      />
    </div>
  );
}
