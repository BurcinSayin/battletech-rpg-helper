import { PageContainer } from "@/components/layout/page-container";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center py-8">
      <PageContainer width="content" className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold">BattleTech RPG Helper</h1>
        <p className="text-muted-foreground">
          A mobile-friendly web port of the BattleTech Character Creator. Cloud
          save, GM oversight, and <code>.btcc</code> import/export.
        </p>
        <p className="text-sm">
          This is an early scaffold. See <code>docs/PLAN.md</code> for the build
          roadmap.
        </p>
      </PageContainer>
    </main>
  );
}
