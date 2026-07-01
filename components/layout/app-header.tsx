import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { PageContainer } from "./page-container";

/** Responsive top header for the authed app shell. */
export function AppHeader({ email }: { email?: string }) {
  return (
    <header className="border-b border-foreground/10">
      <PageContainer
        width="wide"
        className="flex items-center justify-between py-3"
      >
        <Link href="/dashboard" className="text-sm font-medium">
          BattleTech RPG Helper
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {email && (
            <span className="hidden text-foreground/70 sm:inline">{email}</span>
          )}
          <form action={signOut}>
            <button type="submit" className="underline">
              Sign out
            </button>
          </form>
        </div>
      </PageContainer>
    </header>
  );
}
