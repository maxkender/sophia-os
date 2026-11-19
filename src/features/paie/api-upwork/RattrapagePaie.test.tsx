import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), role: "admin" }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@/features/moteur/api", () => ({ invoke: m.invoke }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: m.role }) }));

import { RattrapagePaie } from "./RattrapagePaie";
import { type LigneRattrapage, recap } from "./rattrapage";

const base = { semaine: "2026-11-09", poster_id: "p", contrat_id: "c", jalon_etat: "Active", prevus: 14, statut: "propose", resultat: null, montant_paye: null, message_statut: null, decide_at: null };
const LIGNES = [
  { ...base, id: "1", poster_nom: "Posteur A", action: "approuver", jalon_nom: "Week 45", jalon_etat: "Submitted", jalon_montant: 15, du: 14, faits: 7, proposition: "Week 45 financée = sa semaine du 9/11" },
  { ...base, id: "2", poster_nom: "Posteur B", action: "marquer_payee", jalon_nom: "Week 45", jalon_etat: "Paid", jalon_montant: 10, du: 10, faits: 14, proposition: "déjà payée à la main" },
  { ...base, id: "3", poster_nom: "Posteur C", action: "garder", jalon_nom: "Week 46", jalon_montant: 14, du: 0, faits: 0, proposition: "0 post" },
  { ...base, id: "4", poster_nom: "Posteur D", action: "financer_main", jalon_nom: null, jalon_etat: null, jalon_montant: null, du: 10, faits: 14, proposition: "créer et financer Week 46" },
] as unknown as LigneRattrapage[];

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RattrapagePaie /></QueryClientProvider>);
}

describe("Paie bloquée par le nom de la semaine — 19/11", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.role = "admin";
    m.rpc.mockResolvedValue({ data: LIGNES, error: null });
    m.invoke.mockResolvedValue({ ok: true, faits: 3, messages: 2, reste: 0, erreurs: [] });
  });

  it("récap : seuls l'approbation et le paiement direct font partir de l'argent", () => {
    const r = recap(LIGNES);
    expect([r.a_payer, r.montant, r.deja_payees, r.gardees, r.a_la_main, r.executables]).toEqual([2, 25, 1, 1, 0, 4]);
  });

  it("liste les lignes ; rien ne part avant la confirmation de Max, puis un seul appel", async () => {
    rendu();
    expect(await screen.findAllByTestId("rattrapage-ligne")).toHaveLength(4);
    expect(screen.getByText(/« Week 45 » · Submitted · 15 \$/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("rattrapage-approuver"));
    expect(m.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("rattrapage-confirmer"));
    await waitFor(() => expect(m.invoke).toHaveBeenCalledWith("upwork", { action: "rattrapage_executer", semaine: "2026-11-09", confirmer: true }));
    expect(await screen.findByTestId("rattrapage-bilan")).toBeTruthy();
  });

  it("pas de bouton pour une HM", async () => {
    m.role = "head_of_ops";
    rendu();
    await screen.findAllByTestId("rattrapage-ligne");
    expect(screen.queryByTestId("rattrapage-approuver")).toBeNull();
  });
});
