import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@/locales/index";

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
  it("affiche le tableau, la recommandation et les objectifs préparés par HM (sans envoi)", async () => {
    rendre();
    expect(await screen.findByTestId("tableau-pays")).toBeTruthy();
    expect(screen.getByText("DE")).toBeTruthy();
    expect(screen.getByText("MX")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button").find((b) => /HM/.test(b.textContent ?? ""))!);
    const cibles = await screen.findByTestId("cibles-hm");
    expect(cibles.textContent).toContain("Regina N");
    expect(cibles.textContent).toMatch(/\+3/);
  });
});
