import ProjectNav from "@/components/layout2/ProjectNav";

export const metadata = {
  title: "Blockchain — AgarCell",
};

export default function BlockchainPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <ProjectNav />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="mb-4 text-4xl font-bold">Blockchain</h1>
        <p className="text-lg text-slate-300 leading-relaxed">
          This is the Blockchain page. Future features will integrate on-chain
          rewards, verifiable scores, and NFT skins powered by blockchain technology.
        </p>
      </main>
    </div>
  );
}
