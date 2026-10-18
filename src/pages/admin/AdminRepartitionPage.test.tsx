import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

import { REGLAGES_CHOIX_LABEL_DEFAUT } from "@/features/moteur/repartition/scoreLabel";

const lireMarchesApplications = vi.fn();
const lireMarchesRepartition = vi.fn();
const lireCibleRepartitionApps = vi.fn();
const lireRecruesSite = vi.fn();
const lireReglagesRepartition = vi.fn();

vi.mock("@/features/moteur/repartition/apiRepartition", () => ({
  PROVENANCE_JOURS: 30,
  ecrireCibleRepartitionApps: vi.fn(),
  lireCibleRepartitionApps: (slugs: readonly string[]) => lireCibleRepartitionApps(slugs),
  lireMarchesApplications: () => lireMarchesApplications(),
  lireMarchesRepartition: (id: string) => lireMarchesRepartition(id),
  lireRecruesSite: (jours: number) => lireRecruesSite(jours),
  lireReglagesRepartition: () => lireReglagesRepartition(),
}));

const APPS = [
  { id: "id-sophia", slug: "sophia", langues: null, actif: true },
  { id: "id-unswipe", slug: "unswipe", langues: ["fr", "en", "de", "es"], actif: true },
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
  { langue: "fr", pays: "FR", recrues: 11, recruesSite: 5, siteParApp: { sophia: 5 } },
  { langue: "de", pays: "DE", recrues: 15, recruesSite: 0, siteParApp: {} },
  { langue: "es", pays: "ES", recrues: 2, recruesSite: 0, siteParApp: {} },
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

/** La ligne du tableau de la carte des recrues du site qui porte ce marché. */
function ligneSite(marche: RegExp): HTMLElement {
  const titre = screen.getByText(/Recrues venues du site|Recruits from the website/);
  const carte = titre.closest("div[class*='rounded']") as HTMLElement;
  const ligne = within(carte)
    .getAllByRole("row")
    .find((r) => marche.test(r.textContent ?? ""));
  if (!ligne) throw new Error(`ligne ${marche} absente de la carte des recrues du site`);
  return ligne;
}

describe("AdminRepartitionPage — recrues venues du site", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lireReglagesRepartition.mockResolvedValue(REGLAGES_CHOIX_LABEL_DEFAUT);
    lireMarchesApplications.mockResolvedValue(MARCHES_APPS);
    lireMarchesRepartition.mockResolvedValue(MARCHES_LABELS);
    lireRecruesSite.mockResolvedValue(PROVENANCE);
    lireCibleRepartitionApps.mockResolvedValue({
      source: "reglage",
      parts: { sophia: 60, unswipe: 25, micabo: 15 },
    });
  });

  it("la provenance est lue sur la même fenêtre que celle affichée", async () => {
    renderPage();
    await waitFor(() => expect(lireRecruesSite).toHaveBeenCalledWith(30));
  });

  it("le résumé donne les effectifs de la flotte, pas qu'un pourcentage", async () => {
    renderPage();
    // 11 + 15 + 2 = 28 recrues, dont 5 de la cohorte.
    await screen.findByText(/28 recrues sur 30 jours, dont 5 venues du site|28 recruits over 30 days, 5 of them from the website/);
  });

  it("le français montre ses 5 recrues sur 11 et sa part hors moteur", async () => {
    renderPage();
    await screen.findByText(/Recrues venues du site|Recruits from the website/);
    const ligne = ligneSite(/Français|French/);
    expect(ligne.textContent).toMatch(/45 %/);
    expect(within(ligne).getByText("5")).toBeTruthy();
  });

  it("un échantillon trop mince le dit, au lieu de faire parler deux comptes", async () => {
    renderPage();
    await screen.findByText(/Recrues venues du site|Recruits from the website/);
    expect(ligneSite(/Espagnol|Spanish/).textContent).toMatch(
      /la flotte \(échantillon trop mince\)|the fleet \(sample too thin\)/,
    );
    expect(ligneSite(/Français|French/).textContent).toMatch(/ce marché|this market/);
  });

  it("une cible atteignable est annoncée comme telle", async () => {
    renderPage();
    await screen.findByText(/Recrues venues du site|Recruits from the website/);
    // Cible Sophia 60 %, cohorte 45,5 % : il reste de la marge.
    expect(ligneSite(/Français|French/).textContent).toMatch(/Atteignable|Reachable/);
  });

  it("viser moins que ce que le site envoie déjà est signalé impossible", async () => {
    lireCibleRepartitionApps.mockResolvedValue({
      source: "reglage",
      parts: { sophia: 30, unswipe: 40, micabo: 30 },
    });
    renderPage();
    await screen.findByText(/Recrues venues du site|Recruits from the website/);
    // C'est le cœur de la carte : 30 % demandés, 45,5 % déjà promis.
    expect(ligneSite(/Français|French/).textContent).toMatch(
      /Impossible : sophia ≥ 45 %|Impossible: sophia ≥ 45 %/,
    );
    // L'allemand n'a aucune recrue de la cohorte : rien ne l'empêche.
    expect(ligneSite(/Allemand|German/).textContent).toMatch(/Atteignable|Reachable/);
  });

  it("sans cible posée, aucun verdict : on ne juge pas une cible que personne n'a choisie", async () => {
    // Sans réglage, la page calcule avec des parts ÉGALES pour montrer le
    // manque. En français, 33,3 % de Sophia contre 45,5 % promis ferait
    // « impossible » — un faux reproche adressé à une cible fictive.
    lireCibleRepartitionApps.mockResolvedValue({
      source: "defaut",
      parts: { sophia: 100 / 3, unswipe: 100 / 3, micabo: 100 / 3 },
    });
    renderPage();
    await screen.findByText(/Recrues venues du site|Recruits from the website/);
    const ligne = ligneSite(/Français|French/);
    expect(ligne.textContent).toMatch(/cible non posée|no target set/);
    expect(ligne.textContent).not.toMatch(/Impossible/);
    // Le plancher, lui, ne dépend pas de la cible : il reste affiché.
    expect(ligne.textContent).toMatch(/45 %/);
  });

  it("la projection dit combien des vingt prochaines recrues viennent du site", async () => {
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

  it("la page dit où le site a envoyé ses recrues", async () => {
    renderPage();
    await screen.findByText(/Le site les a envoyées sur : sophia 5|The website sent them to: sophia 5/);
  });

  it("le site envoie sur Unswipe : la page suit, sans rien d'écrit en dur", async () => {
    // C'est le site qui décide, candidat par candidat. Le jour où il envoie
    // ailleurs, le plancher change d'application tout seul.
    lireRecruesSite.mockResolvedValue([
      { langue: "fr", pays: "FR", recrues: 11, recruesSite: 5, siteParApp: { unswipe: 5 } },
      { langue: "de", pays: "DE", recrues: 15, recruesSite: 0, siteParApp: {} },
      { langue: "es", pays: "ES", recrues: 2, recruesSite: 0, siteParApp: {} },
    ]);
    lireCibleRepartitionApps.mockResolvedValue({
      source: "reglage",
      parts: { sophia: 90, unswipe: 5, micabo: 5 },
    });
    renderPage();
    await screen.findByText(/Recrues venues du site|Recruits from the website/);
    const ligne = ligneSite(/Français|French/);
    expect(ligne.textContent).toMatch(/unswipe 45 %/);
    // Et c'est Unswipe qui bloque la cible, pas Sophia.
    expect(ligne.textContent).toMatch(/Impossible : unswipe|Impossible: unswipe/);
  });

  it("pas de verdict rouge sur un échantillon emprunté à la flotte", async () => {
    // L'espagnol n'a que 2 recrues : sa part vient de la flotte. Déclarer sa
    // cible impossible sur un chiffre emprunté pousserait l'admin à la
    // gonfler pour rien.
    lireCibleRepartitionApps.mockResolvedValue({
      source: "reglage",
      parts: { sophia: 1, unswipe: 60, micabo: 39 },
    });
    renderPage();
    await screen.findByText(/Recrues venues du site|Recruits from the website/);
    const es = ligneSite(/Espagnol|Spanish/);
    expect(es.textContent).toMatch(/échantillon trop mince pour juger|sample too thin to judge/);
    expect(es.textContent).not.toMatch(/Impossible/);
    // Le français, lui, parle pour lui-même : le verdict franc est permis.
    expect(ligneSite(/Français|French/).textContent).toMatch(/Impossible/);
  });

  it("une erreur de droits reste lisible et ne laisse pas un tableau vide", async () => {
    lireRecruesSite.mockRejectedValue(new Error("reserve aux administrateurs"));
    renderPage();
    await screen.findByText("reserve aux administrateurs");
    expect(
      screen.queryByText(/Recrues venues du site|Recruits from the website/),
    ).toBeNull();
  });
});
