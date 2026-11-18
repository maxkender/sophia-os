import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ lignes: [] as unknown[], maj: vi.fn() }));
vi.mock("@/lib/supabase/client", () => {
  const chaine: Record<string, unknown> = {};
  for (const k of ["select", "order"]) chaine[k] = () => chaine;
  chaine.limit = () => Promise.resolve({ data: m.lignes, error: null });
  chaine.update = (v: unknown) => ({ eq: (_c: string, id: string) => { m.maj(id, v); return Promise.resolve({ error: null }); } });
  return { supabase: { from: () => chaine, auth: { getUser: () => Promise.resolve({ data: { user: { id: "max" } } }) } } };
});

import { PageUpworkAAjouter } from "./PageUpworkAAjouter";

describe("À ajouter sur Upwork – nouvelle cohorte (17/11)", () => {
  it("colonnes, lien du profil, statut modifiable ; les liens attendus à part", async () => {
    m.lignes = [
      { id: "u1", poster_id: "p1", nom: "Ana Test", email: "ana@test.zz", pays: "RS", cohorte: "2026-11-16", profil_url: "https://www.upwork.com/freelancers/~01abc",
        demande_at: "2026-11-17T10:00:00Z", source: "help", statut: "a_inviter" },
      { id: "u2", poster_id: "p2", nom: "Bo Test", email: null, pays: "HU", cohorte: null, profil_url: null, demande_at: "2026-11-17T11:00:00Z", source: "slack", statut: "lien_attendu" },
    ];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><PageUpworkAAjouter /></QueryClientProvider>);
    await screen.findByText("ana@test.zz");
    const ligne = document.querySelector("[data-ligne='u1']") as HTMLElement;
    expect(ligne.textContent).toContain("ana@test.zz");
    expect(within(ligne).getByRole("link", { name: /Profil/ }).getAttribute("href")).toBe("https://www.upwork.com/freelancers/~01abc");
    expect(document.querySelector("[data-ligne='u2']")).toBeNull();
    expect(screen.getByTestId("upwork-a-ajouter").textContent).toContain("En attente de leur lien : Bo Test");
    fireEvent.change(within(ligne).getByLabelText("Statut de Ana Test"), { target: { value: "invite" } });
    await waitFor(() => expect(m.maj).toHaveBeenCalledWith("u1", expect.objectContaining({ statut: "invite", maj_par: "max" })));
  });
});
