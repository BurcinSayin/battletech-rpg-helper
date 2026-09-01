import { AppIcon } from "@/lib/branding/icon";

// force-static is a requirement, not an optimization: precache install is
// all-or-nothing (PrecacheStrategy._handleInstall throws on a non-cacheable
// response and fails the whole install event, /offline included), so a transient
// error from an on-demand render would cost every offline capability. Prerendering
// moves that failure to build time.
export const dynamic = "force-static";

export function GET() {
  return AppIcon({ size: 512, inset: 0.1 });
}
