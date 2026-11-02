import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/locales/index";

import { PageDecisionPays } from "./PageDecisionPays";
import type { TableauPays } from "./logique";

const semaines = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const tableau: TableauPays = {
  aujourdhui: "2026-11-02",
  lundi: "2026-11-02",
  semaines: semaines.flatMap((w) => [
    { pays: "DE", semaine: w, vues: 100_000, comptes: 10, sous_seuil: 1, proceeds: 400, proceeds_new: 390, transactions: 20, incomplet: false, cout_reel: 100, cout_estime: 100, comptes_publies: 10 },
    { pays: "MX", semaine: w, vues: 0, comptes: 0, sous_seuil: 0, proceeds: 300, proceeds_new: 300, transactions: 15, incomplet: false, cout_reel: null, cout_estime: null, comptes_publies: 0 },
  ]),
  pays: [
    { pays: "DE", zone: "A", zone_retiree: false, tarif: 14, objectif: null, note: null, premier_post: "2026-07-27", posteurs_actifs: 8, comptes_actifs: 10, cohorte_en_cours: 0, cohorte_suivante: 0, start_tuesday: 0, postpone: 0 },
    { pays: "MX", zone: null, zone_retiree: false, tarif: null, objectif: null, note: null, premier_post: null, posteurs_actifs: 0, comptes_actifs: 0, cohorte_en_cours: 0, cohorte_suivante: 0, start_tuesday: 0, postpone: 0 },
  ],
  offres: [],
  hms: [{ id: "h1", nom: "Regina N", zone: "Germany + Norway" }],
  reglages: { taux_usd_eur: 1, seuil_vues_semaine: 1000 },
  devise: "EUR",
  lecture: { at: "2026-11-02T13:53:30Z", ok: true, detail: null },
};

vi.mock("./api", () => ({
  lireTableauPays: vi.fn(async () => tableau),
  lireComptesPays: vi.fn(async () => []),
  fixerObjectifPays: vi.fn(),
  lireMetaPays: vi.fn(async () => ({
    releve_posts: "2026-11-02T00:18:00Z", releve_comptes: "2026-11-02T00:18:00Z", releve_post_metrics: "2026-10-20T18:00:00Z", jalons: null,
    annonces: [{ titre: "TikTok poster - Germany", pays: "DE", generique: false, vue_at: "2026-10-30T10:00:00Z", contrats_21j: 2 }],
  })),
  lireDetailPays: vi.fn(async () => ({
    comptes: [
      { compte_id: "c1", handle: "compte_a", poster: "Poster A", actif: true, vues_7j: 5000, mediane_post: 800, posts_28j: 20 },
      { compte_id: "c2", handle: "compte_b", poster: "Poster B", actif: true, vues_7j: 300, mediane_post: 40, posts_28j: 12 },
    ],
    top_posts: [{ passage_id: "p1", url: "https://www.tiktok.com/@compte_a/photo/1", vues: 42000, date: "2026-10-20", handle: "compte_a", app: "Sophia", j1: 1200, j3: 9000, j7: null }],
  })),
}));

function rendre() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PageDecisionPays />
    </QueryClientProvider>,
  );
}

describe("PageDecisionPays", () => {
  it("4 onglets : vue d'ensemble, pays (6 colonnes), recrutement (objectifs préparés, sans envoi), détail", async () => {
    await i18n.changeLanguage("fr");
    rendre();
    expect(await screen.findByTestId("a-faire")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(4);

    fireEvent.click(screen.getByRole("tab", { name: "Pays" }));
    const table = await screen.findByTestId("tableau-pays");
    expect(table.querySelectorAll("thead th")).toHaveLength(6);
    expect(table.textContent).toContain("Allemagne");
    expect(table.textContent).toContain("Mexique");

    fireEvent.click(screen.getByRole("tab", { name: "Recrutement" }));
    fireEvent.click(await screen.findByRole("button", { name: /Préparer les objectifs/ }));
    const cibles = await screen.findByTestId("cibles-hm");
    expect(cibles.textContent).toContain("Regina N");
    expect(cibles.textContent).toMatch(/\+3/);

    fireEvent.click(screen.getByRole("tab", { name: "Détail pays" }));
    await screen.findAllByText("@compte_a");
    const comptes = screen.getByTestId("comptes-pays");
    expect(comptes.textContent).toContain("@compte_a");
    expect(comptes.textContent).toContain("Bon");
    expect(comptes.textContent).toContain("Sous le seuil");
    expect((await screen.findByTestId("top-posts")).textContent).toContain("Sophia");
  });
});
