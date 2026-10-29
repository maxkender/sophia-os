/** Prompt 25 MAJ, 7b-c : Start warmup demande le @ exact ; « Warm-up done » avec capture. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const moteur = vi.hoisted(() => ({ demarrerWarmup: vi.fn() }));
vi.mock("@/features/moteur/api", () => moteur);
const sb = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: { rpc: sb.rpc, storage: { from: () => ({ upload: sb.upload }) } },
}));

import { StartWarmupHandle } from "./StartWarmupHandle";
import { WarmupFiniCapture } from "./WarmupFiniCapture";

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

describe("Warm-up done avec une capture", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("rien si le warm-up est vu fini, ou si le compte n'a jamais été trouvé", async () => {
    sb.rpc.mockResolvedValue({ data: [{ statut: null, declare_at: null, decide_at: null, trouve_une_fois: true, pret: true }], error: null });
    rendu(<WarmupFiniCapture compteId="c1" uid="u1" />);
    await waitFor(() => expect(sb.rpc).toHaveBeenCalled());
    expect(screen.queryByTestId("warmup-fini-capture")).toBeNull();
  });

  it("trouvé une fois, pas fini : la capture part dans son dossier, puis « Screenshot received »", async () => {
    let declare = false;
    sb.rpc.mockImplementation(async (nom: string) => {
      if (nom === "warmup_declarer") {
        declare = true;
        return { data: { ok: true, id: "d1" }, error: null };
      }
      return { data: [{ statut: declare ? "a_verifier" : null, declare_at: null, decide_at: null, trouve_une_fois: true, pret: false }], error: null };
    });
    rendu(<WarmupFiniCapture compteId="c1" uid="u1" />);
    const fichier = new File(["x"], "profil.png", { type: "image/png" });
    fireEvent.change(await screen.findByLabelText("Screenshot of your TikTok profile"), { target: { files: [fichier] } });
    expect(await screen.findByText("Screenshot received: our team is checking it.")).toBeInTheDocument();
    const chemin = (sb.upload.mock.calls[0] as unknown[])[0] as string;
    expect(chemin).toMatch(/^u1\/warmup\/c1-\d+\.png$/);
    expect(sb.rpc).toHaveBeenCalledWith("warmup_declarer", { p_compte: "c1", p_capture: chemin });
  });
});
