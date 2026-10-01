// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { emptyDraft } from "@/lib/btcc";

// Stub the server action so jsdom never pulls server-only modules, and so we can
// assert exactly how many arguments the save is called with.
const { saveCharacter } = vi.hoisted(() => ({ saveCharacter: vi.fn() }));
vi.mock("@/app/(app)/characters/actions", () => ({ saveCharacter }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Keep the realtime hook from opening a channel.
vi.mock("./use-character-realtime", () => ({ useCharacterRealtime: vi.fn() }));

import { CharacterEditor } from "./editor-client";

const CAMP = {
  id: "a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3",
  name: "Wolf's Dragoons",
};

afterEach(() => {
  cleanup();
  saveCharacter.mockReset();
});

function renderEditor(props: {
  campaigns?: { id: string; name: string }[];
  campaignId?: string | null;
  isOwner?: boolean;
}) {
  saveCharacter.mockResolvedValue({ ok: true, version: 2 });
  // `scalars.name` is required (lib/characters/schema.ts:20); without it
  // react-hook-form rejects the submit and the action is never reached.
  const draft = emptyDraft();
  draft.scalars.name = "Test Pilot";
  render(
    <CharacterEditor
      id="c1"
      version={1}
      draft={draft}
      campaigns={props.campaigns ?? [CAMP]}
      campaignId={props.campaignId ?? null}
      isOwner={props.isOwner ?? true}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
}

describe("CharacterEditor — campaign select", () => {
  it("disables the select and explains why when the viewer is not the owner (AC 31)", () => {
    renderEditor({ isOwner: false, campaignId: CAMP.id });
    expect(
      (screen.getByLabelText("Campaign") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      screen.getByText("Only the character’s owner can change its campaign."),
    ).toBeTruthy();
  });

  it("sends NO campaign argument when the viewer is not the owner (AC 31)", async () => {
    renderEditor({ isOwner: false, campaignId: CAMP.id });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCharacter).toHaveBeenCalled());
    expect(saveCharacter.mock.calls[0]).toHaveLength(3);
  });

  it("enables the select for the owner and passes the selection on save (AC 16)", async () => {
    renderEditor({ isOwner: true, campaignId: CAMP.id });
    const select = screen.getByLabelText("Campaign") as HTMLSelectElement;
    expect(select.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCharacter).toHaveBeenCalled());
    const call = saveCharacter.mock.calls[0];
    expect(call).toHaveLength(4);
    expect(call[3]).toEqual({ id: CAMP.id });
  });

  it("locks the select when the character sits in a campaign the viewer cannot see", async () => {
    renderEditor({ isOwner: true, campaigns: [], campaignId: CAMP.id });
    expect(
      (screen.getByLabelText("Campaign") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      screen.getByText("You’re no longer in this character’s campaign."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCharacter).toHaveBeenCalled());
    expect(saveCharacter.mock.calls[0]).toHaveLength(3);
  });
});

describe("CharacterEditor — skill levels", () => {
  it("updates read-only levels with XP and learner traits, preserving row identity after removal", () => {
    const draft = emptyDraft();
    draft.scalars.name = "Test Pilot";
    draft.skills = [
      { name: "Art", xp: 30 },
      { name: "Career/Soldier", xp: 80 },
    ];
    draft.traits = [{ name: "Slow Learner", xp: -200 }];
    render(
      <CharacterEditor
        id="c1"
        version={1}
        draft={draft}
        campaigns={[]}
        campaignId={null}
        isOwner
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const artRow = screen.getByDisplayValue("Art").parentElement!;
    const soldierRow =
      screen.getByDisplayValue("Career/Soldier").parentElement!;
    expect(within(artRow).getByText("Level 1")).toBeTruthy();
    expect(within(soldierRow).getByText("Level 3")).toBeTruthy();
    const traitRow = screen.getByDisplayValue("Slow Learner").parentElement!;
    expect(within(traitRow).queryByText(/Level/)).toBeNull();
    fireEvent.change(within(traitRow).getByRole("spinbutton", { name: "XP" }), {
      target: { value: "-300" },
    });
    expect(within(artRow).getByText("Level 0")).toBeTruthy();
    expect(within(soldierRow).getByText("Level 2")).toBeTruthy();
    fireEvent.change(
      within(soldierRow).getByRole("spinbutton", { name: "XP" }),
      {
        target: { value: "144" },
      },
    );
    expect(within(soldierRow).getByText("Level 4")).toBeTruthy();
    fireEvent.click(within(artRow).getByRole("button", { name: "Remove" }));
    expect(screen.queryByDisplayValue("Art")).toBeNull();
    expect(within(soldierRow).getByText("Level 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const restored = within(screen.getByText("Career/Soldier").closest("li")!);
    expect(restored.getByText("Level 3")).toBeTruthy();
    expect(restored.getByText("80 XP")).toBeTruthy();
  });
});
