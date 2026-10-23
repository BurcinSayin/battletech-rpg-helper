import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { PageContainer } from "@/components/layout/page-container";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center py-8">
      <PageContainer width="narrow" className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Enter your email address and we&apos;ll send you a link to reset your
            password.
          </p>
        </div>
        <ForgotPasswordForm />
      </PageContainer>
    </main>
  );
}

