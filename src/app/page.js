
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-3xl font-bold">Educational Story About Animals in Europe</h1>

        <p className="text-base leading-7 text-slate-200">
          In a quiet valley between the Alps and a deep green forest, a young red fox met many
          travelers of Europe. First came a stork from the wetlands of Poland, who taught the fox
          how rivers connect villages, farms, and wild places. Then a brown bear from the Carpathian
          Mountains showed how old forests protect life by giving shelter to insects, birds, and
          small mammals. Near a rocky coast, a gray seal explained that clean seas matter for fish,
          people, and animals together. In the north, a reindeer spoke about long winters and how
          changing weather can affect migration paths. In Spain, an Iberian lynx taught the fox that
          protecting one species often protects many others. By the end of the journey, the fox
          understood one big lesson: Europe is a shared home where nature, people, and animals depend
          on each other, and small actions like protecting habitats, reducing waste, and respecting
          wildlife can make a very big difference for the future.
        </p>

        <Link
          href="/education"
          className="inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          Go Here
        </Link>
      </div>
    </main>
  );
}
