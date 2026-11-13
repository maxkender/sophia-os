import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ lireProblemes: vi.fn(), lireModeProblemes: vi.fn() }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
vi.mock("./CarteUnique", () => ({ CarteUnique: ({ p }: { p: { id: string } }) => <div data-testid="carte-unique">{p.id}</div> }));
vi.mock("@/features/support/Conversation", () => ({ ConversationPosteur: ({ posterId }: { posterId: string }) => <div data-testid="conversation">{posterId}</div> }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc } }));

import type { Probleme } from "./api";
import { actionProposee, depuis, PageProblemesClaire, sections } from "./PageProblemesClaire";

const p = (o: Partial<Probleme>): Probleme => ({
  id: "x", poster_id: "poster", contrat_id: null, nom: "Ana T.", hm: null, cohorte: null, actif: true, categorie: "paie", niveau: "samedi",
  resume: "Paid less than expected", sources: [], proprietaire: "pay_bot", proposition_reponse: null, canal_reponse: "upwork",
  proposition_action: null, propose_par: null, propose_at: null, statut: "ouvert", ferme_raison: null, ferme_at: null,
  created_at: "2026-11-13T10:00:00Z", maj_at: "2026-11-13T10:00:00Z", slack_relie: false, compte_id: null, ...o,
});

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><PageProblemesClaire /></MemoryRouter></QueryClientProvider>);
}

describe("Page Problèmes (13/11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.lireModeProblemes.mockResolvedValue("test");
    rpc.mockResolvedValue({ data: { b1: 3, b2: 0 }, error: null });
  });

  it("logique : 3 sections, samedi groupé par type (le plus nombreux d'abord), depuis quand, action proposée", () => {
    const s = sections([
      p({ id: "u1", niveau: "urgent", categorie: "stop" }), p({ id: "b1", niveau: "bots" }),
      p({ id: "s1", categorie: "paie" }), p({ id: "s2", categorie: "login" }), p({ id: "s3", categorie: "paie" }),
    ]);
    expect([s.urgent.length, s.bots.length]).toEqual([1, 1]);
    expect(s.samedi.map((g) => [g.categorie, g.liste.length])).toEqual([["paie", 2], ["login", 1]]);
    expect(depuis("2026-11-13T10:00:00Z", Date.parse("2026-11-13T13:00:00Z"))).toBe("depuis 3 h");
    expect(depuis("2026-11-10T10:00:00Z", Date.parse("2026-11-13T10:00:00Z"))).toBe("depuis 3 j");
    expect(actionProposee(p({ proposition_reponse: "Your milestone is funded." }))).toBe("Répondre : « Your milestone is funded. »");
    expect(actionProposee(p({ proposition_action: "pay_check" }))).toBe("pay_check");
    expect(actionProposee(p({ proposition_action: "none" }))).toBeNull();
  });

  it("écran : urgent, chez les bots avec passage n/2 (au plus 2), samedi groupé ; Régler ouvre la carte et la conversation", async () => {
    api.lireProblemes.mockResolvedValue([
      p({ id: "u1", niveau: "urgent", categorie: "stop", resume: "Wants to stop", nom: "Leo M." }),
      p({ id: "b1", niveau: "bots", proprietaire: "control_bot", categorie: "question_bloquante" }),
      p({ id: "b2", niveau: "bots", proprietaire: "new_cohort_bot", categorie: "login" }),
      p({ id: "s1", categorie: "paie" }), p({ id: "s2", categorie: "paie" }),
    ]);
    rendu();
    const urgent = await screen.findByTestId("section-urgent");
    expect(urgent).toHaveTextContent("Leo M.");
    expect(urgent).toHaveTextContent("Wants to stop");
    const bots = screen.getByTestId("section-bots");
    expect(await within(bots).findByText("control_bot · passage 2/2")).toBeTruthy();
    expect(within(bots).getByText("new_cohort_bot · passage 0/2")).toBeTruthy();
    expect(screen.getByTestId("section-samedi")).toHaveTextContent("(2)");
    fireEvent.click(within(urgent).getByTestId("regler"));
    expect(within(urgent).getByTestId("carte-unique")).toHaveTextContent("u1");
    expect(within(urgent).getByTestId("conversation")).toHaveTextContent("poster");
  });
});
