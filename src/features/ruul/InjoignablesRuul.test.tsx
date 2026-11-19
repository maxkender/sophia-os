import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: m.rpc } }));

import { InjoignablesRuul } from "./InjoignablesRuul";
import { raisonLisible } from "./injoignables";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><InjoignablesRuul /></QueryClientProvider>);
}

describe("Injoignable par email — 19/11", () => {
  beforeEach(() => vi.clearAllMocks());

  it("liste le posteur, sa HM, l'adresse essayée et la raison en clair", async () => {
    m.rpc.mockResolvedValue({
      data: [{
        poster_id: "p1", nom: "Poster Test", handle: "test.handle", pays: "TR", hm_nom: "HM Test", onboarding: "PENDING_KYC",
        adresses: [{ adresse: "x@example.com", statut: "hardBounces", raison: "550 5.1.1 User unknown", at: "2026-11-19T09:00:00Z" }],
        bandeau_at: "2026-11-19T10:00:00Z", bandeau_vu_at: null,
      }],
      error: null,
    });
    rendu();
    expect(await screen.findByTestId("injoignable")).toBeTruthy();
    expect(m.rpc).toHaveBeenCalledWith("ruul_injoignables");
    expect(screen.getByTestId("injoignable-hm").textContent).toBe("HM Test");
    expect(screen.getByText(/adresse inexistante/)).toBeTruthy();
    expect(screen.getByText(/posé le 19\/11, pas encore vu/)).toBeTruthy();
  });

  it("dit clairement quand personne n'est injoignable", async () => {
    m.rpc.mockResolvedValue({ data: [], error: null });
    rendu();
    expect(await screen.findByTestId("injoignables-vide")).toBeTruthy();
  });

  it("raisons Brevo en clair", () => {
    expect(raisonLisible({ statut: "blocked", raison: null })).toBe("bloquée par Brevo (déjà revenue)");
    expect(raisonLisible({ statut: "hardBounces", raison: "550 5.4.1 Access denied" })).toBe("refusée par la boîte (hard bounce)");
    expect(raisonLisible({ statut: "spam", raison: null })).toBe("plainte (marqué spam)");
    expect(raisonLisible({ statut: null, raison: null })).toBe("jamais écrit");
  });
});
