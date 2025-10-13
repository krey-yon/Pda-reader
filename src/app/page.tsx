import PdaTool from "../components/PdaTool";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white/60 to-sky-50 dark:from-black/40 dark:to-zinc-900 p-6 sm:p-10">
      <main className="max-w-6xl mx-auto grid gap-8">
        <header className="pt-6">
          <h1 className="text-3xl font-extrabold">PDA Reader</h1>
          <p className="text-sm text-neutral-500">
            Inspect program-derived accounts on Solana Devnet
          </p>
        </header>

        <PdaTool />

        <section className="p-6 rounded-xl bg-white/60 dark:bg-black/40 shadow-md">
          <h3 className="text-lg font-semibold">
            Placeholder for other dapp features
          </h3>
          <p className="text-sm text-neutral-500">
            Space reserved for additional UI elements like transactions,
            instruction builders, or account explorers.
          </p>
        </section>
      </main>
    </div>
  );
}
