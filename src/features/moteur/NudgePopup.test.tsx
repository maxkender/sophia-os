import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import i18n from "@/locales";

const mesNudges = vi.fn();
const marquerNudgeLu = vi.fn();
let roleReel = "poster";

vi.mock("@/features/moteur/api", () => ({
  mesNudges: () => mesNudges(),
  marquerNudgeLu: (id: string) => marquerNudgeLu(id),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ roleReel }) }));

import { NudgePopup } from "./NudgePopup";

const NUDGE = {
  id: "n1",
  compte_id: "c1",
  titre: "1,000 followers 🎉",
  corps: "Congrats, @lea.klarheit just passed 1,000 followers! … taap.it/sophia",
  lien: "taap.it/sophia",
  created_at: "2026-10-26T08:17:00Z",
  lu_at: null,
};

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NudgePopup />
    </QueryClientProvider>,
  );
}

describe("NudgePopup", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    roleReel = "poster";
    mesNudges.mockResolvedValue([NUDGE]);
    marquerNudgeLu.mockResolvedValue(undefined);
    await i18n.changeLanguage("fr");
  });

  it("montre le message et un bouton pour copier le lien", async () => {
    const ecrire = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: ecrire } });
    rendre();
    expect(await screen.findByText("1,000 followers 🎉")).toBeInTheDocument();
    expect(screen.getByText("taap.it/sophia", { selector: "code" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Copier le lien/ }));
    await waitFor(() => expect(ecrire).toHaveBeenCalledWith("taap.it/sophia"));
    expect(await screen.findByRole("button", { name: /Lien copié/ })).toBeInTheDocument();
  });

  it("pas de bouton copier pour un nudge sans lien", async () => {
    mesNudges.mockResolvedValue([{ ...NUDGE, lien: null }]);
    rendre();
    await screen.findByText("1,000 followers 🎉");
    expect(screen.queryByRole("button", { name: /Copier le lien/ })).toBeNull();
  });

  it("ne s'affiche jamais pour un admin ou un Head of Ops qui ouvre un post", async () => {
    for (const role of ["admin", "head_of_ops"]) {
      roleReel = role;
      const { unmount } = rendre();
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByText("1,000 followers 🎉")).toBeNull();
      unmount();
    }
    expect(mesNudges).not.toHaveBeenCalled();
  });
});
