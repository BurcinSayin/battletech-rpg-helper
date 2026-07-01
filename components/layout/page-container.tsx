import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Responsive width tiers — the single knob for page width across the app.
// Mobile-first: each tier starts narrow and grows at larger breakpoints.
const widths = {
  narrow: "max-w-sm", // auth forms — stays narrow at every size
  content: "max-w-2xl lg:max-w-5xl", // editor / character detail / landing
  wide: "max-w-2xl md:max-w-4xl xl:max-w-6xl", // dashboards & card grids
} as const;

/** Centers page content and applies a responsive max-width by tier. */
export function PageContainer({
  width = "content",
  className,
  children,
}: {
  width?: keyof typeof widths;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4", widths[width], className)}>
      {children}
    </div>
  );
}
