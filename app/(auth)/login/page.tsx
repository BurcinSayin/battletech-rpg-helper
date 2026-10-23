import { LoginForm } from "@/components/auth/login-form";
import { PageContainer } from "@/components/layout/page-container";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { notice, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center py-8">
      <PageContainer width="narrow" className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Sign in</h1>
        {notice === "check-email" && (
          <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Account created. Check your email to confirm your address, then sign
            in.
          </p>
        )}
        {notice === "password-reset-success" && (
          <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Your password has been updated. Please sign in with your new
            password.
          </p>
        )}
        {error === "invalid-reset-link" && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            This password reset link is invalid or has expired. Please request a
            new one.
          </p>
        )}
        <LoginForm />
      </PageContainer>
    </main>
  );
}
