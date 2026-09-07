import { PageContainer } from "@/components/layout/page-container";
import { WizardClient } from "./wizard-client";

// Lifepath wizard shell (build step #12a). Auth is guarded by the (app)
// layout; all navigation state lives client-side in the wizard reducer.
export default function NewCharacterWizardPage() {
  return (
    <PageContainer width="content">
      <div className="rounded-xl border border-hud-line bg-hud-bg p-4 text-hud-text">
        <WizardClient />
      </div>
    </PageContainer>
  );
}
