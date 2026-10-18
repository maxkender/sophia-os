import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

import { REGLAGES_CHOIX_LABEL_DEFAUT } from "@/features/moteur/repartition/scoreLabel";

const lireMarchesApplications = vi.fn();
const lireMarchesRepartition = vi.fn();
const lireCibleRepartitionApps = vi.fn();
const lireProvenanceRecrutement = vi.fn();
const lireReglagesRepartition = vi.fn();

vi.mock("@/features/moteur/repartition/apiRepartition", () => ({
  PROVENANCE_JOURS: 30,
  ecrireCibleRepartitionApps: vi.fn(),
  lireCibleRepartitionApps: (slugs: readonly string[]) => lireCibleRepartitionApps(slugs),
  lireMarchesApplications: () => lireMarchesApplications(),
  lireMarchesRepartition: (id: string) => lireMarchesRepartition(id),
  lireProvenanceRecrutement: (jours: number) => lireProvenanceRecrutement(jours),
  lireReglagesRepartition: () => lireReglagesRepartition(),
}));

const APPS = [
  { id: "id-sophia", slug: "sophia", langues: null, actif: true },
  { id: "id-unswipe", slug: "unswipe", langues: ["fr", "en", "de"], actif: true },
  { id: "id-micabo", slug: "micabo", langues: ["fr", "de"], actif: true },
];

vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({
    applications: APPS,
    application: APPS[0],
    applicationId: "id-sophia",
    slug: "sophia",
    setSlug: vi.fn(),
    isPending: false,
  }),
}));

import { AdminRepartitionPage } from "./AdminRepartitionPage";

function stat(label_id: string) {
  return {
    label_id,
    label_nom: label_id,
    comptes_langue: 4,
    comptes_pays: 4,
    comptes_total: 20,
    passages_restants: 2000,
    demande_jour: 10,
    passages: 500,
    perf_label: 1,
    perf_flotte: 1,
    recents_langue: 0,
    recence_langue: 0,
    recents_pays: 0,
    recence_pays: 0,
  };
}

/** Trois marchés, dont le français : c'est là que la cohorte pèse vraiment. */
const MARCHES_APPS = [
  {
    langue: "fr",
    pays: "FR",
    parts: [
      { application_id: "id-sophia", slug: "sophia", comptes: 20 },
      { application_id: "id-unswipe", slug: "unswipe", comptes: 5 },
    ],
  },
  {
    langue: "de",
    pays: "DE",
    parts: [{ application_id: "id-sophia", slug: "sophia", comptes: 15 }],
  },
  {
    langue: "es",
    pays: "ES",
    parts: [{ application_id: "id-sophia", slug: "sophia", comptes: 7 }],
  },
];

const MARCHES_LABELS = MARCHES_APPS.map((m) => ({
  langue: m.langue,
  pays: m.pays,
  comptes: 10,
  stats: [stat("study"), stat("gym")],
}));

// Les chiffres de la prod au 18/10 : en français, 5 recrues sur 11 viennent
// de la cohorte. En allemand, aucune. En espagnol, l'échantillon est trop
// mince pour parler du marché.
const PROVENANCE = [
  { langue: "fr", pays: "FR", recrues: 11, recruesRuul: 5 },
  { langue: "de", pays: "DE", recrues: 15, recruesRuul: 0 },
  { langue: "es", pays: "ES", recrues: 2, recruesRuul: 0 },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminRepartitionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** La ligne du tableau de la carte cohorte qui porte ce marché. */
function ligneCohorte(marche: RegExp): HTMLElement {
  const titre = screen.getByText(/Recrues de la cohorte Ruul|Recruits from the Ruul cohort/);
  const carte = titre.closest("div[class*='rounded']") as HTMLElement;
  const ligne = within(carte)
    .getAllByRole("row")
    .find((r) => marche.test(r.textContent ?? ""));
  if (!ligne) throw new Error(`ligne ${marche} absente de la carte cohorte`);
  return ligne;
}

describe("AdminRepartitionPage — cohorte Ruul", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lireReglagesRepartition.mockResolvedValue(REGLAGES_CHOIX_LABEL_DEFAUT);
    lireMarchesApplications.mockResolvedValue(MARCHES_APPS);
    lireMarchesRepartition.mockResolvedValue(MARCHES_LABELS);
    lireProvenanceRecrutement.mockResolvedValue(PROVENANCE);
    lireCibleRepartitionApps.mockResolvedValue({
      source: "reglage",
      parts: { sophia: 60, unswipe: 25, micabo: 15 },
    });
  });

  it("la provenance est lue sur la même fenêtre que celle affichée", async () => {
    renderPage();
    await waitFor(() => expect(lireProvenanceRecrutement).toHaveBeenCalledWith(30));
  });

  it("le résumé donne les effectifs de la flotte, pas qu'un pourcentage", async () => {
    renderPage();
    // 11 + 15 + 2 = 28 recrues, dont 5 de la cohorte.
    await screen.findByText(/28 recrues sur 30 jours, dont 5 de la cohorte|28 recruits over 30 days, 5 of them from the cohort/);
  });

  it("le français montre ses 5 recrues sur 11 et sa part promise", async () => {
    renderPage();
    await screen.findByText(/Recrues de la cohorte Ruul|Recruits from the Ruul cohort/);
    const ligne = ligneCohorte(/Français|French/);
    expect(ligne.textContent).toMatch(/45,5 %/);
    expect(within(ligne).getByText("5")).toBeTruthy();
  });

  it("un échantillon trop mince le dit, au lieu de faire parler deux comptes", async () => {
    renderPage();
    await screen.findByText(/Recrues de la cohorte Ruul|Recruits from the Ruul cohort/);
    expect(ligneCohorte(/Espagnol|Spanish/).textContent).toMatch(
      /la flotte \(échantillon trop mince\)|the fleet \(sample too thin\)/,
    );
    expect(ligneCohorte(/Français|French/).textContent).toMatch(/ce marché|this market/);
  });

  it("une cible atteignable est annoncée comme telle", async () => {
    renderPage();
    await screen.findByText(/Recrues de la cohorte Ruul|Recruits from the Ruul cohort/);
    // Cible Sophia 60 %, cohorte 45,5 % : il reste de la marge.
    expect(ligneCohorte(/Français|French/).textContent).toMatch(/Atteignable|Reachable/);
  });

  it("viser moins de Sophia que la cohorte n'en fournit est signalé impossible", async () => {
    lireCibleRepartitionApps.mockResolvedValue({
      source: "reglage",
      parts: { sophia: 30, unswipe: 40, micabo: 30 },
    });
    renderPage();
    await screen.findByText(/Recrues de la cohorte Ruul|Recruits from the Ruul cohort/);
    // C'est le cœur de la carte : 30 % demandés, 45,5 % déjà promis.
    expect(ligneCohorte(/Français|French/).textContent).toMatch(
      /Impossible sous 45,5 %|Impossible below 45,5 %/,
    );
    // L'allemand n'a aucune recrue de la cohorte : rien ne l'empêche.
    expect(ligneCohorte(/Allemand|German/).textContent).toMatch(/Atteignable|Reachable/);
  });

  it("la projection dit combien des vingt prochaines recrues sont promises", async () => {
    renderPage();
    const titre = await screen.findByText(
      /Composition des 20 prochaines recrues|Mix of the next 20 hires/,
    );
    const carte = titre.closest("div[class*='rounded']") as HTMLElement;
    const ligne = within(carte)
      .getAllByRole("row")
      .find((r) => /Français|French/.test(r.textContent ?? ""));
    // 45,5 % de 20, soit 9 recrues que le moteur ne place pas.
    expect(ligne?.textContent).toMatch(/9 \/ 20/);
  });

  it("une erreur de droits reste lisible et ne laisse pas un tableau vide", async () => {
    lireProvenanceRecrutement.mockRejectedValue(new Error("reserve aux administrateurs"));
    renderPage();
    await screen.findByText("reserve aux administrateurs");
    expect(
      screen.queryByText(/Recrues de la cohorte Ruul|Recruits from the Ruul cohort/),
    ).toBeNull();
  });
});
