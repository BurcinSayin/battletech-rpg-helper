import { SignupForm } from "@/components/auth/signup-form";
import { PageContainer } from "@/components/layout/page-container";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center py-8">
      <PageContainer width="narrow" className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <SignupForm />
      </PageContainer>
    </main>
  );
}
