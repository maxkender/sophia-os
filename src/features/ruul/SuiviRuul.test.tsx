import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: m.rpc } }));

import { SuiviRuul } from "./SuiviRuul";
import { canalNudge } from "./suivi";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><SuiviRuul /></QueryClientProvider>);
}

describe("Suivi Ruul — 21/11 (point 8)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("alertes en haut, et la ligne : étape, email non livré, nudge bandeau seul, paie et pourquoi", async () => {
    m.rpc.mockResolvedValue({
      data: {
        alertes: { emails_refuses: 2, emails_refuses_7j: 5, sans_email: 0, aucun_canal: 0, jamais_trouves: 1 },
        posteurs: [{
          poster_id: "p1", nom: "Poster Test", handle: "test.handle", etape: "identite", identite_refusee: false, adresse: "x@example.com",
          dernier_email: { objet: "Finish your Ruul setup", at: "2026-11-19T09:00:00Z", destinataire: "x@example.com", statut: "hardBounces", livre: false },
          dernier_nudge: { at: "2026-11-19T10:00:00Z", envoye: false, canaux: ["dashboard"], erreur: "aucun canal" },
          stop_at: null, paie: { semaine: "2026-11-16", montant: 10, statut: "reporte", pourquoi: "pas encore READY" },
          jamais_trouve: true, slack_ok: false,
        }],
      },
      error: null,
    });
    rendu();
    expect(await screen.findByTestId("suivi-ruul-ligne")).toBeTruthy();
    expect(m.rpc).toHaveBeenCalledWith("ruul_suivi");
    expect(screen.getAllByTestId("alerte-ruul")).toHaveLength(5);
    expect(screen.getByText(/non livré \(hardBounces\)/)).toBeTruthy();
    expect(screen.getByText(/bandeau seulement/)).toBeTruthy();
    expect(screen.getByText(/pas encore READY/)).toBeTruthy();
    expect(screen.getByText(/jamais trouvé sur TikTok/)).toBeTruthy();
  });

  it("canal du nudge : jamais « envoyé » pour le bandeau seul", () => {
    expect(canalNudge({ at: "x", envoye: true, canaux: ["dashboard", "email"], erreur: null })).toBe("email + bandeau");
    expect(canalNudge({ at: "x", envoye: false, canaux: ["dashboard"], erreur: null })).toBe("bandeau seulement (non envoyé)");
    expect(canalNudge(null)).toBe("—");
  });
});
