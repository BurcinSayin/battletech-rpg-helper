import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { PageContainer } from "@/components/layout/page-container";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=invalid-reset-link");
  }

  return (
    <main className="flex min-h-screen items-center justify-center py-8">
      <PageContainer width="narrow" className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Please choose a new password for your account.
          </p>
        </div>
        <ResetPasswordForm />
      </PageContainer>
    </main>
  );
}

