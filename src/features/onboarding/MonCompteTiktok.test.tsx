/** 0444 : « My TikTok account » sur le dashboard ; un autre @ n'est enregistré que s'il est trouvé. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const moteur = vi.hoisted(() => ({ invoke: vi.fn<(fn: string, body: Record<string, unknown>) => Promise<unknown>>() }));
vi.mock("@/features/moteur/api", () => moteur);

import { MonCompteTiktok } from "./MonCompteTiktok";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MonCompteTiktok compteId="c1" handle="sara.studie746" />
    </QueryClientProvider>,
  );
}

function proposer(handle: string) {
  fireEvent.click(screen.getByRole("button", { name: "My account has a different name" }));
  fireEvent.change(screen.getByRole("textbox", { name: "My exact TikTok @" }), { target: { value: handle } });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
}

describe("My TikTok account (0444)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("le @ attendu ; trouvé : « Thanks, we found @… »", async () => {
    moteur.invoke.mockResolvedValue({ ok: true, statut: "trouve", handle: "sara.studio746", message: "Thanks, we found @sara.studio746." });
    rendu();
    expect(screen.getByText("@sara.studie746")).toBeInTheDocument();
    proposer("@sara.studio746");
    expect(await screen.findByRole("status")).toHaveTextContent("Thanks, we found @sara.studio746.");
    expect(moteur.invoke).toHaveBeenCalledWith("ckd", { action: "handle_proposer", handle: "@sara.studio746", compte_id: "c1" });
  });

  it("introuvable : « please check the spelling » ; TikTok illisible : relu dans l'heure", async () => {
    moteur.invoke.mockResolvedValueOnce({ ok: true, statut: "introuvable", handle: "sara.studia746", message: "We still can't find @sara.studia746, please check the spelling." });
    rendu();
    proposer("sara.studia746");
    expect(await screen.findByRole("status")).toHaveTextContent("please check the spelling");
    moteur.invoke.mockResolvedValueOnce({ ok: true, statut: "illisible", handle: "sara.studio746", message: null });
    fireEvent.change(screen.getByRole("textbox", { name: "My exact TikTok @" }), { target: { value: "sara.studio746" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("We'll check @sara.studio746 within the hour."));
  });
});
