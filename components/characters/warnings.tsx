import type { CatalogWarnings } from "@/lib/characters";

/**
 * Non-blocking notice for names not found in the static rules catalog. `.btcc`
 * names are version-drifted (backticks, plural "Interests", "MedTech"), so these
 * are kept verbatim for desktop round-trip — warned, never rejected.
 */
export function CatalogWarningBanner({ warnings }: { warnings: CatalogWarnings }) {
  const names = [...warnings.skills, ...warnings.traits];
  if (names.length === 0) return null;

  return (
    <div className="rounded-md border border-hud-amber/40 bg-hud-amber/10 p-3 text-sm">
      <p className="font-medium text-hud-amber">
        ⚠ {names.length} name{names.length === 1 ? "" : "s"} not in catalog
      </p>
      <p className="mt-1 text-hud-muted">
        Kept as-is, not rejected. {names.join(", ")}
      </p>
    </div>
  );
}
