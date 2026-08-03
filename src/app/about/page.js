import ProjectNav from "@/components/layout2/ProjectNav";

export const metadata = {
  title: "About Game — AgarCell",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <ProjectNav />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="mb-4 text-4xl font-bold">About the Game</h1>
        <p className="text-lg text-slate-300 leading-relaxed">
          I like KFC
        </p>
      </main>
    </div>
  );
}
