"use client";

export function DeleteCharacterButton({
  name,
  deleteAction,
}: {
  name: string;
  deleteAction: () => Promise<void>;
}) {
  return (
    <form
      action={deleteAction}
      onSubmit={(event) => {
        if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        aria-label={`Delete ${name}`}
        className="h-8 w-8 shrink-0 rounded border border-hud-line text-hud-muted transition hover:border-hud-red hover:text-hud-red"
      >
        ✕
      </button>
    </form>
  );
}
