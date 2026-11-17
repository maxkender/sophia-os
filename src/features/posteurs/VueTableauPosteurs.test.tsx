import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ brouillons: vi.fn(), lignes: [] as unknown[] }));
vi.mock("@/features/ckd/decisions/semaineComptes", async (orig) => ({
  ...(await orig<typeof import("@/features/ckd/decisions/semaineComptes")>()),
  lireBrouillonsSamedi: m.brouillons,
}));
vi.mock("@/lib/supabase/client", () => {
  const chaine: Record<string, unknown> = {};
  for (const k of ["select", "eq", "neq", "order"]) chaine[k] = () => chaine;
  chaine.range = () => Promise.resolve({ data: m.lignes, error: null });
  return { supabase: { from: () => chaine } };
});

import { type CompteTableau, filtrer, grille, VueTableauPosteurs } from "./VueTableauPosteurs";

const C = (o: Partial<CompteTableau>): CompteTableau => ({
  compte_id: "c", poster_id: "p", nom: "Ana B", handle: "ana.b", pays: "FR", labels: [{ id: "l1", nom: "smart_girl" }],
  classement: "passable", cohorte: "2026-11-16", canal: "upwork", ...o,
});
const COMPTES = [
  C({ compte_id: "c1", poster_id: "p1", handle: "star.fr", classement: "star" }),
  C({ compte_id: "c2", poster_id: "p2", handle: "faible.fr", classement: "mauvaises_vues", cohorte: "2026-11-09" }),
  C({ compte_id: "c3", poster_id: "p3", handle: "ruul.de", pays: "DE", canal: "ruul" }),
  C({ compte_id: "c4", poster_id: "p4", handle: "alpha.fr", labels: [{ id: "l2", nom: "alpha_male" }] }),
];

describe("Posteurs → vue tableau (17/11)", () => {
  it("grille : labels en lignes, pays en colonnes, star d'abord dans la case", () => {
    const g = grille(COMPTES);
    expect(g.labels.map((l) => l.nom)).toEqual(["smart_girl", "alpha_male"]);
    expect(g.pays.map((p) => p.code)).toEqual(["FR", "DE"]);
    expect(g.dans("l1", "FR").map((c) => c.handle)).toEqual(["star.fr", "faible.fr"]);
    expect(g.dans("l2", "DE")).toEqual([]);
  });

  it("filtres : cohorte, paie, classement, recherche", () => {
    const f = { cohorte: "", canal: "" as const, classement: "" as const, recherche: "" };
    expect(filtrer(COMPTES, { ...f, cohorte: "2026-11-09" }).map((c) => c.compte_id)).toEqual(["c2"]);
    expect(filtrer(COMPTES, { ...f, canal: "ruul" }).map((c) => c.compte_id)).toEqual(["c3"]);
    expect(filtrer(COMPTES, { ...f, classement: "star" }).map((c) => c.compte_id)).toEqual(["c1"]);
    expect(filtrer(COMPTES, { ...f, recherche: "@alpha" }).map((c) => c.compte_id)).toEqual(["c4"]);
  });
});

describe("Posteurs → vue tableau : rendu", () => {
  it("lien TikTok, fiche dans un nouvel onglet, couleur, décision préparée ; filtre de classement", async () => {
    m.lignes = COMPTES.map((c) => ({
      id: c.compte_id, poster_id: c.poster_id, handle_tiktok: c.handle, pays: c.pays.toLowerCase(), classement: c.classement,
      profiles: { prenom: "Ana", nom: "B", cohorte_lundi: c.cohorte, canal_paie: c.canal, is_active: true },
      compte_labels: c.labels.map((l) => ({ labels: l })),
    }));
    m.brouillons.mockResolvedValue(new Map([["c2", { choix: "kill" }]]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><VueTableauPosteurs /></QueryClientProvider>);
    const tiktok = await screen.findByRole("link", { name: "@faible.fr" });
    expect(tiktok.getAttribute("href")).toBe("https://www.tiktok.com/@faible.fr");
    const puce = tiktok.closest("[data-compte]") as HTMLElement;
    expect(puce.dataset.classement).toBe("mauvaises_vues");
    expect(within(puce).getByTestId("choix-samedi").textContent).toBe("Kill samedi");
    const fiche = within(puce).getByLabelText("Fiche de Ana B");
    expect(fiche.getAttribute("href")).toBe("/admin/posters?fiche=p2");
    expect(fiche.getAttribute("target")).toBe("_blank");
    fireEvent.change(screen.getByLabelText("Classement"), { target: { value: "star" } });
    expect(screen.queryByRole("link", { name: "@faible.fr" })).toBeNull();
    expect(screen.getByRole("link", { name: "@star.fr" })).toBeTruthy();
  });
});
