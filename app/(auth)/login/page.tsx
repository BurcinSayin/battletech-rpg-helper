import { LoginForm } from "@/components/auth/login-form";
import { PageContainer } from "@/components/layout/page-container";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;

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
        <LoginForm />
      </PageContainer>
    </main>
  );
}
