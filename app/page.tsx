export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">BattleTech RPG Helper</h1>
      <p className="text-muted-foreground">
        A mobile-friendly web port of the BattleTech Character Creator. Cloud
        save, GM oversight, and <code>.btcc</code> import/export.
      </p>
      <p className="text-sm">
        This is an early scaffold. See <code>docs/PLAN.md</code> for the build
        roadmap.
      </p>
    </main>
  );
}
