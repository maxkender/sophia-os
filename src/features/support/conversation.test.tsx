import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const c = vi.hoisted(() => ({ lireConversation: vi.fn(), repondreCanal: vi.fn() }));
vi.mock("./conversation", async (orig) => ({ ...(await orig<typeof import("./conversation")>()), ...c }));

import { ConversationPosteur } from "./Conversation";
import { canalDefaut } from "./conversation";

function rendu(props: { demandeId?: string | null; source?: string | null } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ConversationPosteur posterId="p1" {...props} /></QueryClientProvider>);
}

describe("Conversation complète (13/11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    c.repondreCanal.mockResolvedValue({ ok: true, envoi: "upwork" });
    c.lireConversation.mockResolvedValue({
      fiche: { poster_id: "p1", nom: "Gina D.", plateforme: "upwork", debut: "2026-11-16", premiere_connexion: null, slack_relie: false, tiktok: "gina.x",
        ruul: null, contrat_upwork: "1", parrainages: null, derniere_paie: null, manque: ["warmup"] },
      canaux: { slack: false, upwork: true, email: true, plateforme: "upwork" },
      fil: [
        { at: "2026-11-12T10:00:00Z", sens: "out", canal: "upwork", qui: "OS", texte: "Welcome to Vik Studios!", type: "message" },
        { at: "2026-11-13T15:09:00Z", sens: "in", canal: "upwork", qui: "posteur", texte: "I'll do it tonight", type: "message", vu: true },
        { at: "2026-11-13T15:10:00Z", sens: "action", canal: "os", qui: "control_bot", texte: "Réglé par control_bot : relance", type: "action" },
      ],
    });
  });

  it("canal par défaut : celui de la demande", () => {
    expect(canalDefaut("upwork")).toBe("upwork");
    expect(canalDefaut("slack_salon", { slack: true, upwork: false, email: true, plateforme: "upwork" })).toBe("slack");
    expect(canalDefaut("email")).toBe("email");
    expect(canalDefaut("help")).toBe("help");
    expect(canalDefaut(null, { slack: false, upwork: false, email: true, plateforme: "ruul" })).toBe("email");
  });

  it("le fil dans l'ordre (envoyé, réponse « vu », action), la fiche, et la réponse sur Upwork", async () => {
    rendu({ source: "upwork", demandeId: "d1" });
    const fil = await screen.findByTestId("fil-conversation");
    const elements = within(fil).getAllByTestId("element-fil");
    expect(elements.map((e) => e.getAttribute("data-sens"))).toEqual(["out", "in", "action"]);
    expect(within(elements[1]!).getByTestId("vu")).toBeTruthy();
    expect(screen.getByTestId("fiche-conversation")).toHaveTextContent("manque : warmup");
    fireEvent.change(screen.getByLabelText("Répondre au posteur"), { target: { value: "Great, thanks!" } });
    fireEvent.click(screen.getByTestId("envoyer-conversation"));
    await waitFor(() => expect(c.repondreCanal).toHaveBeenCalledWith({ poster_id: "p1", canal: "upwork", texte: "Great, thanks!", demande_id: "d1" }));
  });
});
