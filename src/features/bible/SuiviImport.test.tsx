import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { SourceBible } from "./sources";
import type { LigneContenu, LigneFile, LigneJournal } from "./suiviImport";

const lecture = vi.hoisted(() => ({ lireSuiviImport: vi.fn() }));
vi.mock("./suiviImport", async (orig) => ({ ...(await orig<typeof import("./suiviImport")>()), ...lecture }));

import { suivreSource } from "./suiviImport";
import { SuiviImport } from "./SuiviImport";

const now = Date.now();
const min = (m: number) => new Date(now - m * 60_000).toISOString();
const url = (n: number) => `https://www.tiktok.com/@mondorunning/photo/76000000000000${String(n).padStart(4, "0")}`;
const neuve = { compteReferenceId: "s1", handle: "mondorunning", essais: 1, echec: null, lanceeLe: min(30), releve: true, enTraitement: 3, enfilees: 6 };
const source = (o: Partial<SourceBible>): SourceBible => ({
  id: "s1", handle: "mondorunning", langue: "en", actif: true, labels: [], slides: [], importes: 4, valides: 1, perf: null, essaiMax: 30, essaiVerdict: null,
  dernierImport: null, neuve, attente: null, sequence: null, restant: 0, semaine: null, etape: "en_import", ...o,
});
const c = (n: number, o: Partial<LigneContenu>): LigneContenu => ({
  id: `c${n}`, compte_reference_id: "s1", source_url: url(n), statut: "brouillon", import_statut: "pending", import_etape: null, import_erreur: null,
  import_tentatives: 0, import_lease_until: null, pertinence_score: null, created_at: min(20), ...o,
});
const f = (n: number, o: Partial<LigneFile>): LigneFile => ({
  id: `f${n}`, compte_reference_id: "s1", post_url: url(n), statut: "done", erreur: null, tentatives: 0, created_at: min(25), updated_at: min(24), lease_until: null, contenu_id: `c${n}`, ...o,
});
const j = (id: number, at: string, niveau: LigneJournal["niveau"], etape: string, message: string, post?: number): LigneJournal => ({
  id, at, compte_reference_id: "s1", contenu_id: null, post_url: post ? url(post) : null, niveau, etape, message,
});

describe("suivi de « En import »", () => {
  it("une carte par source : relevé, avancement, étapes, erreurs ; le journal et les slideshows se déplient", async () => {
    const s1 = source({});
    const s2 = source({ id: "s2", handle: "sslowrisee", neuve: { ...neuve, compteReferenceId: "s2", handle: "sslowrisee", releve: false, lanceeLe: null, echec: "Apify 402", essais: 2, enfilees: null } });
    const lignes = {
      file: [f(1, {}), f(2, {}), f(3, {}), f(4, {}), f(5, { statut: "pending", contenu_id: null, erreur: "Report (capacité fournisseur) — Apify 402" })],
      contenus: [
        c(1, { import_statut: "done", import_etape: "done", statut: "valide" }),
        c(2, { import_statut: "done", import_etape: "elo_insuffisant", statut: "rejete", import_erreur: "note 31 < 40" }),
        c(3, { import_statut: "running", import_etape: "nettoyage", import_lease_until: min(-6) }),
        c(4, { import_statut: "failed", import_etape: "elo", import_tentatives: 2, import_erreur: "Gemini 503" }),
      ],
      journal: [
        j(5, min(1), "info", "nettoyage", "Post 000003 : nettoyage des slides", 3),
        j(4, min(3), "erreur", "echec", "Post 000004 : échec à l'étape elo (passage 2 sur 8) : Gemini 503", 4),
        j(3, min(5), "warn", "fin", "Post 000002 : écarté : note trop basse", 2),
        j(2, min(8), "ok", "fin", "Post 000001 : gardé : validé, en stock", 1),
        j(1, min(29), "ok", "releve", "Profil relevé : 6 slideshows mis dans la file"),
      ],
    };
    lecture.lireSuiviImport.mockResolvedValue({
      suivis: [suivreSource(s1, lignes, now), suivreSource(s2, { file: [], contenus: [], journal: [] }, now)], journalDisponible: true, lu: now,
    });
    render(<QueryClientProvider client={new QueryClient()}><SuiviImport sources={[s1, s2, source({ id: "w", handle: "hebdo", etape: "weekly" })]} /></QueryClientProvider>);

    const carte = await screen.findByTestId("suivi-mondorunning");
    expect(lecture.lireSuiviImport).toHaveBeenCalledWith([s1, s2]);
    expect(carte).toHaveTextContent("Profil relevé : 6 slideshows mis dans la file");
    expect(carte).toHaveTextContent("2 / 6 traités");
    expect(carte).toHaveTextContent("≈ 1 h 00 restantes");
    expect(carte).toHaveTextContent("À récupérer 2");
    expect(carte).toHaveTextContent("Nettoyage 1");
    expect(carte).toHaveTextContent("Note 1");
    expect(carte).toHaveTextContent("Gardés 1");
    expect(carte).toHaveTextContent("1 en erreur (repris)");
    expect(carte).toHaveTextContent("1 reporté (Apify saturé)");
    expect(within(carte).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    // toutes deux coincent quelque part (une erreur reprise, un relevé raté) : en haut, par nom
    expect(screen.getAllByTestId(/^suivi-/).filter((e) => e.tagName === "LI").map((e) => e.dataset.testid)).toEqual(["suivi-mondorunning", "suivi-sslowrisee"]);
    expect(screen.getByTestId("suivi-sslowrisee")).toHaveTextContent("Relevé du profil raté : Apify 402 (essai 2 sur 5)");

    fireEvent.click(within(carte).getByRole("button", { name: /Journal et slideshows/ }));
    const journal = within(carte).getByTestId("journal-import");
    expect(within(journal).getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(within(carte).getByRole("button", { name: /Problèmes \(2\)/ }));
    expect(within(within(carte).getByTestId("journal-import")).getAllByRole("listitem").map((l) => l.textContent)).toEqual([
      expect.stringContaining("échec à l'étape elo (passage 2 sur 8) : Gemini 503"),
      expect.stringContaining("écarté : note trop basse"),
    ]);

    fireEvent.click(within(carte).getByRole("tab", { name: /Slideshows \(5\)/ }));
    const liste = within(carte).getByTestId("slideshows-import");
    expect(liste).toHaveTextContent("Échec 2 sur 8, repris : Gemini 503");
    expect(liste).toHaveTextContent("Reporté (fournisseur saturé)");
    fireEvent.click(within(liste).getByRole("button", { name: /Voir les 2 terminés/ }));
    expect(liste).toHaveTextContent("note trop basse : note 31 < 40");
  });

  it("sans la migration du journal : l'avancement reste, le journal le dit", async () => {
    const s1 = source({});
    lecture.lireSuiviImport.mockResolvedValue({ suivis: [suivreSource(s1, { file: [], contenus: [], journal: null }, now)], journalDisponible: false, lu: now });
    render(<QueryClientProvider client={new QueryClient()}><SuiviImport sources={[s1]} /></QueryClientProvider>);
    expect(await screen.findByText(/Journal horodaté pas encore activé/)).toBeInTheDocument();
    expect(screen.getByTestId("suivi-mondorunning")).toHaveTextContent("0 / 6 traités");
  });
});
