import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { SemaineSources, SourceLundi } from "./api";

const sourcesDeLaSemaine = vi.fn();

vi.mock("@/features/moteur/api", () => ({
  sourcesDeLaSemaine: () => sourcesDeLaSemaine(),
}));

import { LundiSourcesPanel } from "./LundiSourcesPanel";
import { trierSourcesLundi } from "./lundiSources";

function source(
  handle: string,
  decision: SourceLundi["decision"],
  r: number | null,
  importes = 0,
  valides = 0,
  extra: Partial<SourceLundi> = {},
): SourceLundi {
  return {
    compteReferenceId: handle,
    handle,
    langue: "en",
    label: "smart_girl",
    posts: r === null ? 0 : 40,
    r,
    rVsLabel: r,
    decision,
    raison: decision === "maj" ? "r" : decision === "peu_de_mesures" ? "neuve" : null,
    meilleurVues: null,
    lanceeLe: decision === "pas_maj" ? null : "2026-11-10T11:00:00Z",
    importes,
    valides,
    ...extra,
  };
}

const SEMAINE: SemaineSources = {
  semaine: "2026-11-10",
  sources: [
    source("faible", "pas_maj", 0.84),
    source("coup", "maj", 0.94, 0, 0, { raison: "100k", meilleurVues: 367400, lanceeLe: null }),
    source("neuve", "peu_de_mesures", null, 3, 2),
    source("moyenne", "maj", 1.05, 4, 3),
    source("forte", "maj", 1.41, 12, 9),
  ],
};

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LundiSourcesPanel />
    </QueryClientProvider>,
  );
}

describe("LundiSourcesPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
  });

  it("résume le lundi : sources mises à jour, sautées, slideshows importés et validés", async () => {
    sourcesDeLaSemaine.mockResolvedValue(SEMAINE);
    rendre();
    const resume = await screen.findByTestId("lundi-sources-resume");
    expect(resume.textContent).toContain("4 source(s) mise(s) à jour, 1 pas cette semaine");
    expect(resume.textContent).toContain("19 slideshow(s) importé(s), 14 validé(s)");
    expect(resume.textContent).toContain("1 source attend son lot (6 par jour).");
  });

  it("met les sources mises à jour d'abord, la meilleure en tête, et ne compte pas d'import pour une source sautée", async () => {
    sourcesDeLaSemaine.mockResolvedValue(SEMAINE);
    rendre();
    const lignes = await screen.findAllByTestId("lundi-source");
    expect(lignes.map((l) => within(l).getAllByRole("cell")[0].textContent)).toEqual([
      "@forte",
      "@moyenne",
      "@coup",
      "@neuve",
      "@faible",
    ]);
    expect(within(lignes[0]).getByText("Mise à jour")).toBeTruthy();
    expect(within(lignes[0]).getByText("r au-dessus de 1")).toBeTruthy();
    expect(within(lignes[0]).getByText("12 (9 validés)")).toBeTruthy();
    expect(within(lignes[2]).getByText(/un post à 367\s400 vues/)).toBeTruthy();
    expect(within(lignes[2]).getByText("lot à venir")).toBeTruthy();
    expect(within(lignes[3]).getByText("Source neuve")).toBeTruthy();
    expect(within(lignes[4]).getByText("Pas cette semaine")).toBeTruthy();
    expect(within(lignes[4]).getAllByRole("cell")[5].textContent).toBe("—");
  });

  it("dit quand aucun lundi n'a encore tourné", async () => {
    sourcesDeLaSemaine.mockResolvedValue(null);
    rendre();
    expect(await screen.findByText("Pas encore de mise à jour du lundi.")).toBeTruthy();
  });

  it("trie sans r en dernier dans une même décision", () => {
    const tri = trierSourcesLundi([source("b", "maj", null), source("a", "maj", 1.2)]);
    expect(tri.map((s) => s.handle)).toEqual(["a", "b"]);
  });
});
