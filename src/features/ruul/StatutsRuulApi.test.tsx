import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@/features/moteur/api", () => ({ invoke: m.invoke }));

import { croiser, StatutsRuulApi } from "./StatutsRuulApi";

const LIGNES = [
  { cohorte: "2026-11-16", onboarding: "READY", posteurs: 40, actifs: 39, ont_poste: 34 },
  { cohorte: "2026-11-16", onboarding: "PENDING_KYC", posteurs: 10, actifs: 10, ont_poste: 6 },
  { cohorte: "2026-11-23", onboarding: "NOT_REGISTERED", posteurs: 20, actifs: 20, ont_poste: 0 },
  { cohorte: "2026-11-23", onboarding: "READY", posteurs: 5, actifs: 5, ont_poste: 0 },
];

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><StatutsRuulApi /></QueryClientProvider>);
}

describe("Statuts Ruul (API) — 17/11", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.rpc.mockImplementation((fn: string) => Promise.resolve(fn === "ruul_onboarding_tableau"
      ? { data: LIGNES, error: null }
      : { data: { env: "prod", company_id: 42, connect_actif: false, derniere_lecture: { at: "2026-11-17T10:12:00Z", env: "prod", lus: 80 }, derniere_erreur: null, non_relies: 2 }, error: null }));
    m.invoke.mockResolvedValue({ ok: true, lus: 81 });
  });

  it("croise cohortes et statuts (actifs seulement), la plus récente d'abord", () => {
    const x = croiser(LIGNES);
    expect(x.cohortes).toEqual(["2026-11-23", "2026-11-16"]);
    expect(x.n("2026-11-16", "READY")).toBe(39);
    expect(x.total("READY")).toBe(44);
  });

  it("affiche le tableau, la dernière lecture, et relit à la demande", async () => {
    rendu();
    expect(await screen.findByText("23/11")).toBeTruthy();
    expect(screen.getByText("READY (payable)")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("statuts-ruul-api").textContent).toContain("80 personnes chez Ruul"));
    expect(screen.getByTestId("statuts-ruul-api").textContent).toContain("2 chez Ruul sans fiche");
    fireEvent.click(screen.getByTestId("statuts-ruul-relire"));
    await waitFor(() => expect(m.invoke).toHaveBeenCalledWith("ruul-api", { action: "sync" }));
    expect(await screen.findByText("81 personnes lues chez Ruul")).toBeTruthy();
  });
});
