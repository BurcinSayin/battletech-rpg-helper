// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { emptyDraft } from "@/lib/btcc";
import type { SaveResult } from "@/app/(app)/characters/actions";

// Stub the server action so jsdom never pulls server-only modules, and so we can
// assert exactly how many arguments the save is called with.
const { saveCharacter, refresh, realtime } = vi.hoisted(() => ({
  saveCharacter: vi.fn(),
  refresh: vi.fn(),
  realtime: { deliver: null as ((version: number) => void) | null },
}));
vi.mock("@/app/(app)/characters/actions", () => ({ saveCharacter }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
// Model the hook's version filter without opening a websocket. Each render
// replaces the delivery callback, just as the real hook updates its refs.
vi.mock("./use-character-realtime", () => ({
  useCharacterRealtime: ({
    version,
    onRemoteVersion,
  }: {
    version: number;
    onRemoteVersion: (version: number) => void;
  }) => {
    realtime.deliver = (next) => {
      if (next > version) onRemoteVersion(next);
    };
  },
}));

import { CharacterEditor } from "./editor-client";

const CAMP = {
  id: "a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3",
  name: "Wolf's Dragoons",
};

const CAMP_B = {
  id: "b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4",
  name: "Kell Hounds",
};

beforeEach(() => {
  saveCharacter.mockResolvedValue({ ok: true, version: 2 });
});

afterEach(() => {
  cleanup();
  saveCharacter.mockReset();
  refresh.mockReset();
  realtime.deliver = null;
});

function renderEditor(props: {
  campaigns?: { id: string; name: string }[];
  campaignId?: string | null;
  isOwner?: boolean;
}) {
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
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const restored = within(
      screen.getByDisplayValue("Career/Soldier").parentElement!,
    );
    expect(
      (restored.getByRole("spinbutton", { name: "XP" }) as HTMLInputElement)
        .value,
    ).toBe("80");
    expect(screen.getByDisplayValue("Art")).toBeTruthy();
    const restoredTrait = within(
      screen.getByDisplayValue("Slow Learner").parentElement!,
    );
    expect(
      (
        restoredTrait.getByRole("spinbutton", {
          name: "XP",
        }) as HTMLInputElement
      ).value,
    ).toBe("-200");
  });
});

type EditorProps = Parameters<typeof CharacterEditor>[0];

function namedDraft(name: string) {
  const draft = emptyDraft();
  draft.scalars.name = name;
  return draft;
}

function renderSnapshot(overrides: Partial<EditorProps> = {}) {
  let props: EditorProps = {
    id: "c1",
    version: 1,
    draft: namedDraft("Stored Pilot"),
    campaigns: [CAMP, CAMP_B],
    campaignId: CAMP.id,
    isOwner: true,
    ...overrides,
  };
  const view = render(<CharacterEditor {...props} />);
  return {
    receive(version: number, name: string, next: Partial<EditorProps> = {}) {
      props = { ...props, version, draft: namedDraft(name), ...next };
      view.rerender(<CharacterEditor {...props} />);
    },
  };
}

describe("CharacterEditor — trait XP and displayed levels", () => {
  function traitXp(name: string) {
    const panel = screen
      .getByRole("heading", { name: "// Traits" })
      .closest("section")!;
    const row = within(panel).getByDisplayValue(name).parentElement!;
    return within(row).getByRole("spinbutton", {
      name: "XP",
    }) as HTMLInputElement;
  }

  function expectTraitLevels() {
    const panel = screen
      .getByRole("heading", { name: "// Traits" })
      .closest("section")!;
    const rank = within(panel).getByText("Rank").closest("li")!;
    const compulsion = within(panel).getByText("Compulsion").closest("li")!;
    expect(within(rank).getByText("+2 TP", { exact: true })).toBeTruthy();
    expect(within(compulsion).getByText("-1 TP", { exact: true })).toBeTruthy();
  }

  it("retains exact signed XP when entering edit and canceling pristine or changed traits", () => {
    const draft = namedDraft("Trait Pilot");
    draft.traits = [
      { name: "Rank", xp: 270 },
      { name: "Compulsion", xp: -125 },
    ];
    renderSnapshot({ draft });
    expectTraitLevels();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(traitXp("Rank").value).toBe("270");
    expect(traitXp("Compulsion").value).toBe("-125");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectTraitLevels();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(traitXp("Rank").value).toBe("270");
    expect(traitXp("Compulsion").value).toBe("-125");

    fireEvent.change(traitXp("Rank"), { target: { value: "299" } });
    fireEvent.change(traitXp("Compulsion"), { target: { value: "-199" } });
    expect(traitXp("Rank").value).toBe("299");
    expect(traitXp("Compulsion").value).toBe("-199");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectTraitLevels();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(traitXp("Rank").value).toBe("270");
    expect(traitXp("Compulsion").value).toBe("-125");
    expect(saveCharacter).not.toHaveBeenCalled();
  });

  it("saves exact signed XP and preserves it after the refreshed snapshot displays TP", async () => {
    const draft = namedDraft("Trait Pilot");
    draft.traits = [
      { name: "Rank", xp: 100 },
      { name: "Compulsion", xp: -100 },
    ];
    const editor = renderSnapshot({ draft });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(traitXp("Rank"), { target: { value: "270" } });
    fireEvent.change(traitXp("Compulsion"), { target: { value: "-125" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("button", { name: "Refreshing…" });
    expect(saveCharacter).toHaveBeenCalledTimes(1);
    expect(saveCharacter).toHaveBeenCalledWith(
      "c1",
      1,
      expect.objectContaining({
        traits: [
          { name: "Rank", xp: 270 },
          { name: "Compulsion", xp: -125 },
        ],
      }),
      { id: CAMP.id },
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();

    const savedDraft = namedDraft("Trait Pilot");
    savedDraft.traits = [
      { name: "Rank", xp: 270 },
      { name: "Compulsion", xp: -125 },
    ];
    editor.receive(2, "Trait Pilot", { draft: savedDraft });
    expectTraitLevels();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(traitXp("Rank").value).toBe("270");
    expect(traitXp("Compulsion").value).toBe("-125");
  });
});

function changeName(name: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: name },
  });
}

function expectName(name: string) {
  expect(
    (
      screen.getByRole("textbox", {
        name: "Name",
      }) as HTMLInputElement
    ).value,
  ).toBe(name);
}

function selectCampaign(id: string) {
  fireEvent.change(screen.getByLabelText("Campaign"), {
    target: { value: id },
  });
}

function expectCampaign(id: string) {
  expect((screen.getByLabelText("Campaign") as HTMLSelectElement).value).toBe(
    id,
  );
}

function deliverRealtime(version: number) {
  act(() => {
    if (!realtime.deliver)
      throw new Error("Realtime subscription is not mounted");
    realtime.deliver(version);
  });
}

function deferredSave() {
  let resolve!: (result: SaveResult) => void;
  const promise = new Promise<SaveResult>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describe("CharacterEditor — edit snapshots", () => {
  it("preserves local fields, campaign and save version when newer props arrive, including after conflict Keep editing", async () => {
    saveCharacter.mockResolvedValue({ ok: false, kind: "conflict" });
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Unsaved Pilot");
    selectCampaign(CAMP_B.id);

    editor.receive(2, "Remote Pilot", { campaignId: CAMP.id });
    expectName("Unsaved Pilot");
    expectCampaign(CAMP_B.id);
    expect(screen.getByRole("status").textContent).toContain(
      "updated elsewhere",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("dialog", { name: "Remote changes" });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(saveCharacter).toHaveBeenLastCalledWith(
      "c1",
      1,
      expect.objectContaining({
        scalars: expect.objectContaining({ name: "Unsaved Pilot" }),
      }),
      { id: CAMP_B.id },
    );
    expectName("Unsaved Pilot");
    expectCampaign(CAMP_B.id);

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expectName("Unsaved Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCharacter).toHaveBeenCalledTimes(2));
    expect(saveCharacter.mock.calls[1][1]).toBe(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("protects even a pristine edit and ignores equal-version replacements and older props", () => {
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    editor.receive(1, "Equal-version Pilot", { campaignId: CAMP_B.id });
    editor.receive(0, "Older Pilot");
    expectName("Stored Pilot");
    expectCampaign(CAMP.id);
    expect(screen.queryByRole("status")).toBeNull();

    editor.receive(2, "Remote Pilot", { campaignId: CAMP_B.id });
    expectName("Stored Pilot");
    expectCampaign(CAMP.id);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("Cancel adopts the highest queued version and the next edit saves from that version", async () => {
    saveCharacter.mockResolvedValue({ ok: false, kind: "conflict" });
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Discarded Pilot");
    editor.receive(3, "Newest Pilot", { campaignId: CAMP_B.id });
    editor.receive(2, "Older Remote Pilot", { campaignId: CAMP.id });
    expectName("Discarded Pilot");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Newest Pilot" })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expectName("Newest Pilot");
    expectCampaign(CAMP_B.id);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCharacter).toHaveBeenCalled());
    expect(saveCharacter.mock.calls[0][1]).toBe(3);
  });

  it("Cancel refreshes for a dismissed realtime-only update, preserving the maximum announced version", () => {
    renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Discarded Pilot");
    deliverRealtime(3);
    deliverRealtime(2);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Stored Pilot" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expectName("Stored Pilot");
  });

  it("Cancel adopts queued data but still refreshes when a dismissed realtime notice is further ahead", () => {
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    editor.receive(3, "Available Pilot");
    deliverRealtime(4);
    deliverRealtime(3);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("heading", { name: "Available Pilot" }),
    ).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("dismisses only that version; equal props stay quiet and a newer version reopens the notice for Reload", () => {
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Unsaved Pilot");
    selectCampaign(CAMP_B.id);
    editor.receive(2, "Remote Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    editor.receive(2, "Remote Pilot");
    expect(screen.queryByRole("status")).toBeNull();
    expectName("Unsaved Pilot");
    expectCampaign(CAMP_B.id);

    editor.receive(3, "Newest Pilot", { campaignId: CAMP.id });
    expect(screen.getByRole("status")).toBeTruthy();
    expectName("Unsaved Pilot");
    fireEvent.click(
      within(screen.getByRole("status")).getByRole("button", {
        name: "Reload",
      }),
    );
    expect(screen.getByRole("heading", { name: "Newest Pilot" })).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expectName("Newest Pilot");
    expectCampaign(CAMP.id);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("conflict-dialog Reload discards the edit and adopts the newest queued snapshot", async () => {
    saveCharacter.mockResolvedValue({ ok: false, kind: "conflict" });
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Unsaved Pilot");
    editor.receive(3, "Newest Pilot", { campaignId: CAMP_B.id });
    editor.receive(2, "Older Pilot", { campaignId: CAMP.id });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Remote changes",
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expectName("Unsaved Pilot");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reload" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Newest Pilot" })).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expectName("Newest Pilot");
    expectCampaign(CAMP_B.id);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("blocks a new edit after save until matching props arrive, ignores older responses, and saves the new base on reentry", async () => {
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Saved Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const refreshing = (await screen.findByRole("button", {
      name: "Refreshing…",
    })) as HTMLButtonElement;
    expect(refreshing.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Stored Pilot" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Saved Pilot" })).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);

    editor.receive(1, "Delayed Pilot");
    editor.receive(0, "Older Pilot");
    expect(
      (screen.getByRole("button", { name: "Refreshing…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refreshing…" }));
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();

    editor.receive(2, "Saved Pilot", { campaignId: CAMP_B.id });
    expect(screen.getByRole("heading", { name: "Saved Pilot" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refreshing…" })).toBeNull();
    editor.receive(1, "Stored Pilot", { campaignId: CAMP.id });
    editor.receive(2, "Equal-version Replacement", { campaignId: CAMP.id });
    expect(screen.getByRole("heading", { name: "Saved Pilot" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expectName("Saved Pilot");
    expectCampaign(CAMP_B.id);
    saveCharacter.mockResolvedValue({ ok: false, kind: "conflict" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCharacter).toHaveBeenCalledTimes(2));
    expect(saveCharacter.mock.calls[1][1]).toBe(2);
  });

  it("adopts an already queued newer snapshot when a pending save succeeds at an intermediate version", async () => {
    const save = deferredSave();
    saveCharacter.mockReturnValueOnce(save.promise);
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Submitted Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Saving…" });
    editor.receive(3, "Newest Pilot", { campaignId: CAMP_B.id });
    expectName("Submitted Pilot");
    await act(async () => {
      save.resolve({ ok: true, version: 2 });
      await save.promise;
    });

    expect(screen.getByRole("heading", { name: "Newest Pilot" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refreshing…" })).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    editor.receive(2, "Submitted Pilot", { campaignId: CAMP.id });
    expect(screen.getByRole("heading", { name: "Newest Pilot" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expectName("Newest Pilot");
    expectCampaign(CAMP_B.id);
    expect(screen.queryByRole("status")).toBeNull();
    deliverRealtime(3);
    expect(screen.queryByRole("status")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    saveCharacter.mockResolvedValue({ ok: false, kind: "conflict" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCharacter).toHaveBeenCalledTimes(2));
    expect(saveCharacter.mock.calls[1][1]).toBe(3);
  });

  it.each(["error", "forbidden"] as const)(
    "retains the local edit and original version after an ordinary %s failure",
    async (kind) => {
      const message =
        kind === "forbidden" ? "Campaign access denied" : "Save failed";
      saveCharacter.mockResolvedValue({ ok: false, kind, message });
      const editor = renderSnapshot();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      changeName("Unsaved Pilot");
      selectCampaign(CAMP_B.id);
      editor.receive(2, "Remote Pilot", { campaignId: CAMP.id });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByText(message);
      await waitFor(() =>
        expect(
          (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      );
      expectName("Unsaved Pilot");
      expectCampaign(CAMP_B.id);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(refresh).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(saveCharacter).toHaveBeenCalledTimes(2));
      expect(saveCharacter).toHaveBeenLastCalledWith(
        "c1",
        1,
        expect.objectContaining({
          scalars: expect.objectContaining({ name: "Unsaved Pilot" }),
        }),
        { id: CAMP_B.id },
      );
    },
  );

  it("ignores acknowledged own-save echoes but refreshes or announces genuinely newer realtime events", async () => {
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Saved Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Refreshing…" });
    deliverRealtime(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    deliverRealtime(3);
    expect(refresh).toHaveBeenCalledTimes(2);

    editor.receive(3, "Remote Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Next Unsaved Pilot");
    deliverRealtime(3);
    expect(screen.queryByRole("status")).toBeNull();
    deliverRealtime(4);
    expect(screen.getByRole("status")).toBeTruthy();
    expectName("Next Unsaved Pilot");
    expect(refresh).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    deliverRealtime(4);
    expect(screen.queryByRole("status")).toBeNull();
    deliverRealtime(5);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it.each(["Cancel", "Reload"])(
    "queues a delayed response from an earlier %s instead of overwriting a new edit",
    async (exit) => {
      saveCharacter.mockResolvedValue({ ok: false, kind: "conflict" });
      const editor = renderSnapshot();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      changeName("First Unsaved Pilot");
      deliverRealtime(2);
      fireEvent.click(screen.getByRole("button", { name: exit }));
      expect(refresh).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      changeName("Second Unsaved Pilot");
      selectCampaign(CAMP_B.id);

      editor.receive(2, "Delayed Remote Pilot", { campaignId: CAMP.id });
      expectName("Second Unsaved Pilot");
      expectCampaign(CAMP_B.id);
      expect(screen.getByRole("status")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByRole("dialog", { name: "Remote changes" });
      expect(saveCharacter).toHaveBeenLastCalledWith(
        "c1",
        1,
        expect.objectContaining({
          scalars: expect.objectContaining({ name: "Second Unsaved Pilot" }),
        }),
        { id: CAMP_B.id },
      );
      expectName("Second Unsaved Pilot");
    },
  );

  it("does not discard a pending submission through the remote notice Reload control", async () => {
    const save = deferredSave();
    saveCharacter.mockReturnValueOnce(save.promise);
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Submitting Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Saving…" });
    editor.receive(2, "Remote Pilot");
    const reload = within(screen.getByRole("status")).getByRole("button", {
      name: "Reload",
    });
    fireEvent.click(reload);
    expectName("Submitting Pilot");
    expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    expect(saveCharacter.mock.calls[0][1]).toBe(1);

    await act(async () => {
      save.resolve({ ok: false, kind: "conflict" });
      await save.promise;
    });
    const dialog = screen.getByRole("dialog", { name: "Remote changes" });
    expectName("Submitting Pilot");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reload" }));
    expect(screen.getByRole("heading", { name: "Remote Pilot" })).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      reason: "ownership is revoked",
      permissions: { isOwner: false },
      explanation: "Only the character’s owner can change its campaign.",
    },
    {
      reason: "the live campaign becomes unreadable",
      permissions: { campaignId: CAMP.id, campaigns: [CAMP_B] },
      explanation: "You’re no longer in this character’s campaign.",
    },
  ])(
    "keeps permissions live when $reason without resetting the selected campaign",
    async ({ permissions, explanation }) => {
      saveCharacter.mockResolvedValue({
        ok: false,
        kind: "forbidden",
        message: "Access denied",
      });
      const editor = renderSnapshot();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      changeName("Unsaved Pilot");
      selectCampaign(CAMP_B.id);
      editor.receive(2, "Remote Pilot", permissions);
      expectName("Unsaved Pilot");
      expectCampaign(CAMP_B.id);
      expect(
        (screen.getByLabelText("Campaign") as HTMLSelectElement).disabled,
      ).toBe(true);
      expect(screen.getByText(explanation)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(saveCharacter).toHaveBeenCalled());
      expect(saveCharacter.mock.calls[0]).toHaveLength(3);
      expect(saveCharacter.mock.calls[0][1]).toBe(1);
    },
  );
});

describe("CharacterEditor — pending remote notices", () => {
  it("retains a still-newer realtime update across save success until its data is synchronized", async () => {
    const save = deferredSave();
    saveCharacter.mockReturnValueOnce(save.promise);
    const editor = renderSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    changeName("Saved Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Saving…" });
    deliverRealtime(3);
    expect(screen.getByRole("status")).toBeTruthy();

    await act(async () => {
      save.resolve({ ok: true, version: 2 });
      await save.promise;
    });
    expect(
      (screen.getByRole("button", { name: "Refreshing…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    deliverRealtime(2);
    expect(refresh).toHaveBeenCalledTimes(1);

    editor.receive(2, "Saved Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expectName("Saved Pilot");
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(refresh).toHaveBeenCalledTimes(2);
    editor.receive(3, "Newest Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expectName("Newest Pilot");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
