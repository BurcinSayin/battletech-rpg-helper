import { PageContainer } from "@/components/layout/page-container";
import { ImportClient } from "./import-client";

// Import a `.btcc` desktop file as a new character. Auth is guarded by the
// (app) layout; the client component handles file read + parse + preview and
// calls the `importCharacter` server action to commit.
export default function ImportCharacterPage() {
  return (
    <PageContainer width="content">
      <div className="rounded-xl border border-hud-line bg-hud-bg p-4 text-hud-text">
        <ImportClient />
      </div>
    </PageContainer>
  );
}
