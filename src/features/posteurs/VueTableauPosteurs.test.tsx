import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ brouillons: vi.fn(), lignes: [] as unknown[], metriques: [] as unknown[] }));
vi.mock("@/features/ckd/decisions/semaineComptes", async (orig) => ({
  ...(await orig<typeof import("@/features/ckd/decisions/semaineComptes")>()),
  lireBrouillonsSamedi: m.brouillons,
}));
vi.mock("@/lib/supabase/client", () => {
  const chaine = (table: string) => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "neq", "order", "gte"]) c[k] = () => c;
    c.range = () => Promise.resolve({ data: table === "comptes" ? m.lignes : [], error: null });
    return c;
  };
  return { supabase: { from: chaine, rpc: () => Promise.resolve({ data: m.metriques, error: null }) } };
});

import { type CompteTableau, filtrer, grille, tranche, VueTableauPosteurs } from "./VueTableauPosteurs";

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
  it("grille : labels en lignes, pays en colonnes, les plus vus d'abord ; un label masqué disparaît", () => {
    const comptes = [
      { ...COMPTES[0]!, vues_post: 500 }, { ...COMPTES[1]!, vues_post: 30_000 }, COMPTES[2]!, COMPTES[3]!,
    ];
    const g = grille(comptes);
    expect(g.labels.map((l) => l.nom)).toEqual(["smart_girl", "alpha_male"]);
    expect(g.pays.map((p) => p.code)).toEqual(["FR", "DE"]);
    expect(g.dans("l1", "FR").map((c) => c.handle)).toEqual(["faible.fr", "star.fr"]);
    expect(g.dans("l2", "DE")).toEqual([]);
    const sans = grille(comptes, new Set(["l1"]));
    expect(sans.labels.map((l) => l.nom)).toEqual(["alpha_male"]);
    expect(sans.pays.map((p) => p.code)).toEqual(["FR"]);
  });

  it("tranches de vues : un éventail du rouge au violet, gris si pas relevé", () => {
    expect(tranche(null)).toBe(-1);
    expect(tranche(120)).toBe(0);
    expect(tranche(1_500)).toBe(2);
    expect(tranche(12_000)).toBe(5);
    expect(tranche(250_000)).toBe(8);
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
  it("cases colorées par vues avec le @ (TikTok) et la fiche (nouvel onglet), labels masquables", async () => {
    m.lignes = COMPTES.map((c, i) => ({
      id: c.compte_id, poster_id: c.poster_id, handle_tiktok: c.handle, pays: c.pays.toLowerCase(), classement: c.classement,
      profiles: { prenom: ["Ana", "Bea", "Cy", "Dan"][i], nom: "B", cohorte_lundi: c.cohorte, canal_paie: c.canal, is_active: true },
      compte_labels: c.labels.map((l) => ({ labels: l })),
    }));
    m.metriques = [{ compte_id: "c2", vues_post: 200 }, { compte_id: "c1", vues_post: 30_000 }];
    m.brouillons.mockResolvedValue(new Map([["c2", { choix: "kill" }]]));
    const onFermer = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><VueTableauPosteurs onFermer={onFermer} /></QueryClientProvider>);
    const tiktok = await screen.findByRole("link", { name: "@faible.fr" });
    expect(tiktok.getAttribute("href")).toBe("https://www.tiktok.com/@faible.fr");
    const bea = tiktok.closest("[data-compte]") as HTMLElement;
    expect(bea.dataset.tranche).toBe("0");
    expect(within(bea).getByTestId("choix-samedi").textContent).toContain("Kill samedi");
    expect(bea.textContent).toContain("Bea B");
    expect((screen.getByRole("link", { name: "@star.fr" }).closest("[data-compte]") as HTMLElement).dataset.tranche).toBe("6");
    const fiche = within(bea).getByLabelText("Fiche de Bea B");
    expect(fiche.getAttribute("href")).toBe("/admin/posters?fiche=p2");
    expect(fiche.getAttribute("target")).toBe("_blank");
    fireEvent.click(screen.getByTestId("bouton-labels"));
    fireEvent.click(within(screen.getByTestId("choix-labels")).getByRole("button", { name: /alpha_male/ }));
    expect(screen.queryByRole("link", { name: "@alpha.fr" })).toBeNull();
    expect(screen.getByRole("link", { name: "@star.fr" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Classement"), { target: { value: "star" } });
    expect(screen.queryByRole("link", { name: "@faible.fr" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Retour à la liste/ }));
    expect(onFermer).toHaveBeenCalled();
  });
});
