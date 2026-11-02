/** Prompt 25 MAJ, 7b : Start warmup demande le @ exact. */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const moteur = vi.hoisted(() => ({ demarrerWarmup: vi.fn() }));
vi.mock("@/features/moteur/api", () => moteur);

import { StartWarmupHandle } from "./StartWarmupHandle";

function rendu(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
}

describe("Start warmup : le @ exact, lu sur TikTok", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("pré-rempli ; trouvé : « ✓ Account found » et le @ envoyé tel que tapé", async () => {
    moteur.demarrerWarmup.mockResolvedValue({ ok: true, verification: { statut: "trouve", handle: "sara.studio746" } });
    rendu(<StartWarmupHandle compteId="c1" handle="sara.studie746" onFerme={() => undefined} />);
    const champ = screen.getByRole("textbox", { name: "Your TikTok @, exactly as on TikTok:" });
    expect(champ).toHaveValue("sara.studie746");
    fireEvent.change(champ, { target: { value: "sara.studio746" } });
    fireEvent.click(screen.getByRole("button", { name: "Start warmup" }));
    expect(await screen.findByRole("status")).toHaveTextContent("✓ Account found: @sara.studio746.");
    expect(moteur.demarrerWarmup).toHaveBeenCalledWith("c1", "sara.studio746");
  });

  it("introuvable : « check the spelling », le warm-up ne démarre pas (le bouton reste)", async () => {
    moteur.demarrerWarmup.mockResolvedValue({ ok: false, error: "compte_introuvable", handle: "sara.studie746" });
    rendu(<StartWarmupHandle compteId="c1" handle="sara.studie746" onFerme={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Start warmup" }));
    expect(await screen.findByRole("status")).toHaveTextContent("We can't find this account (@sara.studie746), check the spelling.");
    expect(screen.getByRole("button", { name: "Start warmup" })).toBeInTheDocument();
  });
});
