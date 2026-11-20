import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ roleReel: "poster" }) }));
vi.mock("@/features/questionnaire/api", () => ({ lireMonPopup: vi.fn().mockResolvedValue(null) }));

import { OffreCommentMasterPopup } from "./OffreCommentMasterPopup";

const OFFRE = {
  id: "o1", langue: "pl", role: "titulaire", tarif: 0.35,
  textes: { titre: "Zostań Comment Masterem", texte: "TEKST 0.35 $", accepter: "Akceptuj", refuser: "Nie, dziękuję", merci_oui: "Super!", merci_non: "OK, dzięki!" },
};

function rendu() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OffreCommentMasterPopup />
    </QueryClientProvider>,
  );
}

describe("Offre Comment Master (20/11)", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation((nom: string) => Promise.resolve({ data: nom === "comment_master_offre_mienne" ? OFFRE : { ok: true }, error: null }));
  });

  it("pop-up traduit ; « Accepter » répond oui et affiche le merci", async () => {
    rendu();
    expect(await screen.findByText("Zostań Comment Masterem")).toBeTruthy();
    expect(screen.getByText("TEKST 0.35 $")).toBeTruthy();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("comment_master_offre_vue", { p_id: "o1" }));
    fireEvent.click(screen.getByTestId("offre-cm-accepter"));
    expect(await screen.findByText("Super!")).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("comment_master_offre_repondre", { p_id: "o1", p_accepte: true });
  });

  it("« Non merci » répond non (le candidat suivant est sollicité côté base)", async () => {
    rendu();
    fireEvent.click(await screen.findByTestId("offre-cm-refuser"));
    expect(await screen.findByText("OK, dzięki!")).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("comment_master_offre_repondre", { p_id: "o1", p_accepte: false });
  });
});
