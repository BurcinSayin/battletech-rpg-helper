// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const { deleteCampaign, leaveCampaign } = vi.hoisted(() => ({
  deleteCampaign: vi.fn(),
  leaveCampaign: vi.fn(),
}));
vi.mock("@/app/(app)/campaigns/actions", () => ({ deleteCampaign, leaveCampaign }));

import { CampaignControls } from "./campaign-controls";

const CAMP = "a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3";
const CODE = "A1B2C3D4";

afterEach(() => {
  cleanup();
  deleteCampaign.mockReset();
  leaveCampaign.mockReset();
});

describe("CampaignControls — GM (AC 12)", () => {
  it("shows the invite code and Delete, and no Leave", () => {
    render(<CampaignControls campaignId={CAMP} inviteCode={CODE} isGm />);
    expect((screen.getByLabelText("Invite code") as HTMLInputElement).value).toBe(CODE);
    expect(screen.getByRole("button", { name: "Delete campaign" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave campaign" })).toBeNull();
  });

  it("confirms in-page before deleting, and says characters are detached not deleted", async () => {
    deleteCampaign.mockResolvedValue(undefined);
    render(<CampaignControls campaignId={CAMP} inviteCode={CODE} isGm />);

    fireEvent.click(screen.getByRole("button", { name: "Delete campaign" }));
    expect(screen.getByText(/detached, not deleted/)).toBeTruthy();
    expect(deleteCampaign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(deleteCampaign).toHaveBeenCalledWith(CAMP));
    expect(leaveCampaign).not.toHaveBeenCalled();
  });

  it("can be backed out of without deleting", () => {
    render(<CampaignControls campaignId={CAMP} inviteCode={CODE} isGm />);
    fireEvent.click(screen.getByRole("button", { name: "Delete campaign" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Delete campaign" })).toBeTruthy();
    expect(deleteCampaign).not.toHaveBeenCalled();
  });
});

describe("CampaignControls — player (AC 12)", () => {
  it("shows Leave, and neither the invite code nor Delete", () => {
    render(<CampaignControls campaignId={CAMP} inviteCode={CODE} isGm={false} />);
    expect(screen.getByRole("button", { name: "Leave campaign" })).toBeTruthy();
    expect(screen.queryByLabelText("Invite code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete campaign" })).toBeNull();
    // The code is a GM affordance; it must not be reachable as text either.
    expect(screen.queryByDisplayValue(CODE)).toBeNull();
  });

  it("confirms, then leaves", async () => {
    leaveCampaign.mockResolvedValue(undefined);
    render(<CampaignControls campaignId={CAMP} inviteCode={CODE} isGm={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Leave campaign" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm leave" }));
    await waitFor(() => expect(leaveCampaign).toHaveBeenCalledWith(CAMP));
    expect(deleteCampaign).not.toHaveBeenCalled();
  });

  it("surfaces a refusal from the server action instead of swallowing it", async () => {
    leaveCampaign.mockResolvedValue({
      ok: false,
      message: "You're the GM of this campaign. Delete it instead of leaving.",
    });
    render(<CampaignControls campaignId={CAMP} inviteCode={CODE} isGm={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Leave campaign" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm leave" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Delete it instead of leaving"),
    );
  });
});
