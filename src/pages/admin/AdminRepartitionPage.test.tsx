import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const lireChoixApplicationAuto = vi.fn();
const ecrireChoixApplicationAuto = vi.fn();
const lireReglagesChoixLabelPoses = vi.fn();
const ecrireReglagesChoixLabel = vi.fn();
const remettreReglagesChoixLabelDefaut = vi.fn();
const ecrireEtatManuelLabel = vi.fn();

vi.mock("@/features/moteur/repartition/apiRepartition", () => ({
  PROVENANCE_JOURS: 30,
  CLE_CHOIX_APPLICATION_AUTO: "choix_application_auto",
  CLE_CHOIX_LABELS: "choix_labels",
  lireChoixApplicationAuto: () => lireChoixApplicationAuto(),
  ecrireChoixApplicationAuto: (actif: boolean) => ecrireChoixApplicationAuto(actif),
  ecrireCibleRepartitionApps: vi.fn(),
  lireCibleRepartitionApps: (slugs: readonly string[]) => lireCibleRepartitionApps(slugs),
  lireMarchesApplications: () => lireMarchesApplications(),
  lireMarchesRepartition: (id: string) => lireMarchesRepartition(id),
  lireRecruesSite: (jours: number) => lireRecruesSite(jours),
  lireReglagesRepartition: () => lireReglagesRepartition(),
  lireReglagesChoixLabelPoses: () => lireReglagesChoixLabelPoses(),
  ecrireReglagesChoixLabel: (v: unknown) => ecrireReglagesChoixLabel(v),
  remettreReglagesChoixLabelDefaut: () => remettreReglagesChoixLabelDefaut(),
  ecrireEtatManuelLabel: (a: unknown) => ecrireEtatManuelLabel(a),
}));

const lireReglages = vi.fn();
vi.mock("@/features/moteur/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/api")>()),
  lireReglages: () => lireReglages(),
}));

/** La projection, espionnée : on vérifie ce que la page lui passe. */
const simulerTirages = vi.fn();
vi.mock("@/features/moteur/repartition/tirages", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/features/moteur/repartition/tirages")>();
  return {
    ...vrai,
    simulerTirages: (...args: unknown[]) => {
      simulerTirages(...args);
      // @ts-expect-error — on relaie les arguments tels quels à la vraie.
      return vrai.simulerTirages(...args);
    },
  };
});

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
    lireChoixApplicationAuto.mockResolvedValue(false);
    ecrireChoixApplicationAuto.mockResolvedValue(undefined);
    lireReglagesChoixLabelPoses.mockResolvedValue(false);
    ecrireReglagesChoixLabel.mockResolvedValue(undefined);
    remettreReglagesChoixLabelDefaut.mockResolvedValue(undefined);
    ecrireEtatManuelLabel.mockResolvedValue(undefined);
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

  it("l'interrupteur est refusé tant qu'aucune cible n'est posée", async () => {
    // Allumer sans cible ne ferait rien de bon : le serveur s'abstient et
    // tout repartirait sur Sophia. Mieux vaut l'interdire que de laisser
    // croire que c'est branché.
    lireCibleRepartitionApps.mockResolvedValue({
      source: "defaut",
      parts: { sophia: 100 / 3, unswipe: 100 / 3, micabo: 100 / 3 },
    });
    renderPage();
    const interrupteur = await screen.findByRole("switch", {
      name: /Le moteur choisit l'application|The engine picks the application/,
    });
    // Le Switch rend un <span role="switch"> : l'état désactivé passe par
    // aria-disabled, pas par l'attribut disabled d'un contrôle de formulaire.
    expect(interrupteur.getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getByText(/Pose d'abord une cible|Set a target first/),
    ).toBeTruthy();
  });

  it("avec une cible, l'interrupteur bascule et prévient de l'effet", async () => {
    renderPage();
    const interrupteur = await screen.findByRole("switch", {
      name: /Le moteur choisit l'application|The engine picks the application/,
    });
    // Il reste grisé le temps que l'état de l'interrupteur soit lu : on ne
    // propose pas de basculer avant de savoir où on en est.
    await waitFor(() => expect(interrupteur.getAttribute("aria-disabled")).not.toBe("true"));
    // Le clic utile est sur l'input caché du Switch, pas sur le span.
    const bouton = interrupteur.querySelector("input") ??
      interrupteur.parentElement?.querySelector("input");
    fireEvent.click(bouton!);
    await waitFor(() => expect(ecrireChoixApplicationAuto).toHaveBeenCalledWith(true));
  });

  it("allumé, la page dit que les prochains comptes sont répartis par le moteur", async () => {
    lireChoixApplicationAuto.mockResolvedValue(true);
    renderPage();
    await screen.findByText(/les prochains comptes créés sont répartis|the next accounts created are allocated/);
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

/**
 * La carte qui porte ce titre.
 *
 * On filtre sur l'ancêtre « carte » : le texte d'introduction de la page cite
 * les noms de deux cartes, donc une recherche par texte seul tombait dessus et
 * rendait un élément sans carte autour.
 */
function carte(titre: RegExp): HTMLElement {
  const trouve = screen
    .getAllByText(titre)
    .map((e) => e.closest("div[class*='rounded']"))
    .find((e): e is HTMLElement => e !== null);
  if (!trouve) throw new Error(`aucune carte ne porte le titre ${titre}`);
  return trouve;
}

describe("AdminRepartitionPage — les réglages de label s'éditent", () => {
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
    lireChoixApplicationAuto.mockResolvedValue(false);
    lireReglagesChoixLabelPoses.mockResolvedValue(false);
    ecrireReglagesChoixLabel.mockResolvedValue(undefined);
    remettreReglagesChoixLabelDefaut.mockResolvedValue(undefined);
    ecrireEtatManuelLabel.mockResolvedValue(undefined);
  });

  it("le bandeau ne prétend plus que la page ne touche à rien", async () => {
    renderPage();
    await screen.findByText(/Cette page agit sur le moteur|This page acts on the engine/);
    expect(screen.queryByText(/Lecture seule\.|Read only\./)).toBeNull();
  });

  it("sans valeur en base, la page dit que ce sont les défauts du code", async () => {
    renderPage();
    await screen.findByText(
      /Aucune valeur n'est posée en base|No value is stored/,
    );
  });

  it("une valeur modifiée part en base avec les onze autres", async () => {
    renderPage();
    const champ = await screen.findByLabelText(
      /Exposant de performance|Performance exponent/,
    );
    fireEvent.change(champ, { target: { value: "3" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Enregistrer les réglages|Save settings/ }),
    );
    await waitFor(() => expect(ecrireReglagesChoixLabel).toHaveBeenCalled());
    const envoye = ecrireReglagesChoixLabel.mock.calls[0][0];
    expect(envoye.perfExposant).toBe(3);
    // Les autres partent inchangés : on écrit les douze d'un bloc, jamais un
    // réglage isolé qui laisserait les autres dans un état incertain.
    expect(envoye.partMax).toBe(REGLAGES_CHOIX_LABEL_DEFAUT.partMax);
    expect(Object.keys(envoye)).toHaveLength(12);
  });

  it("une valeur que le moteur aurait réécrite bloque l'enregistrement", async () => {
    // `positif(0, 2)` rend 2 : laisser passer zéro afficherait 0 ici et
    // appliquerait 2 là-bas, sans que rien ne le dise.
    renderPage();
    const champ = await screen.findByLabelText(
      /Exposant de performance|Performance exponent/,
    );
    fireEvent.change(champ, { target: { value: "0" } });
    const bouton = screen.getByRole("button", {
      name: /Enregistrer les réglages|Save settings/,
    });
    await waitFor(() => expect(bouton).toBeDisabled());
    await screen.findByText(/Une valeur au moins est refusée|At least one value is refused/);
    fireEvent.click(bouton);
    expect(ecrireReglagesChoixLabel).not.toHaveBeenCalled();
  });

  it("une borne basse au-dessus de la haute est nommée, pas juste refusée", async () => {
    renderPage();
    fireEvent.change(
      await screen.findByLabelText(/Performance, borne basse|Performance, lower bound/),
      { target: { value: "5" } },
    );
    await screen.findByText(
      /La borne basse de performance dépasse la borne haute|The lower performance bound is above the upper one/,
    );
    expect(
      screen.getByRole("button", { name: /Enregistrer les réglages|Save settings/ }),
    ).toBeDisabled();
  });

  it("les réglages restent éditables même sans label à classer", async () => {
    // Ils valent pour TOUTES les applications : la carte n'a pas à
    // disparaître parce que celle affichée n'a aucun label.
    lireMarchesRepartition.mockResolvedValue([]);
    renderPage();
    await screen.findByText(/Réglages du choix de label|Label-choice settings/);
    expect(
      screen.getByRole("button", { name: /Enregistrer les réglages|Save settings/ }),
    ).toBeTruthy();
  });

  it("revenir aux défauts retire les clés au lieu de figer des nombres", async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Revenir aux valeurs par défaut|Back to default values/,
      }),
    );
    await waitFor(() => expect(remettreReglagesChoixLabelDefaut).toHaveBeenCalled());
    expect(ecrireReglagesChoixLabel).not.toHaveBeenCalled();
  });
});

describe("AdminRepartitionPage — ouvrir et fermer un label", () => {
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
    lireChoixApplicationAuto.mockResolvedValue(false);
    lireReglagesChoixLabelPoses.mockResolvedValue(false);
    ecrireEtatManuelLabel.mockResolvedValue(undefined);
  });

  /** La ligne du tableau « État des labels » qui porte ce label. */
  async function ligneLabel(nom: string): Promise<HTMLElement> {
    // On attend LA CARTE, pas son nom : le texte d'introduction de la page
    // cite les deux cartes qui suivent le sélecteur, donc attendre un texte
    // rendait la main avant que les données soient là.
    await waitFor(() => carte(/État des labels|Label status/));
    // Le nom du label ouvre la ligne, collé au premier chiffre : `\b` ne
    // tient pas entre « study » et « 1,00 », les deux sont des caractères de
    // mot. On ancre au début.
    const ligne = within(carte(/État des labels|Label status/))
      .getAllByRole("row")
      .find((r) => (r.textContent ?? "").startsWith(nom));
    if (!ligne) throw new Error(`ligne ${nom} absente du tableau des labels`);
    return ligne;
  }

  it("fermer un label l'écrit pour l'application affichée, pas pour toutes", async () => {
    renderPage();
    const ligne = await ligneLabel("study");
    fireEvent.click(
      within(ligne).getByRole("button", { name: /^(Fermé|Closed)$/ }),
    );
    await waitFor(() =>
      expect(ecrireEtatManuelLabel).toHaveBeenCalledWith({
        applicationId: "id-sophia",
        labelId: "study",
        etat: "ferme",
      }),
    );
  });

  it("le troisième bouton rend le label à l'automatique", async () => {
    lireReglagesRepartition.mockResolvedValue({
      ...REGLAGES_CHOIX_LABEL_DEFAUT,
      ouvertsApp: ["id-sophia:gym"],
    });
    renderPage();
    const ligne = await ligneLabel("gym");
    fireEvent.click(within(ligne).getByRole("button", { name: /^(Auto)$/ }));
    await waitFor(() =>
      expect(ecrireEtatManuelLabel).toHaveBeenCalledWith({
        applicationId: "id-sophia",
        labelId: "gym",
        etat: "auto",
      }),
    );
  });

  it("recliquer l'état en cours n'écrit rien", async () => {
    // Le bouton reste cliquable pour rester lisible, mais reposer la même
    // décision n'a rien à dire à la base.
    renderPage();
    const ligne = await ligneLabel("study");
    fireEvent.click(within(ligne).getByRole("button", { name: /^(Auto)$/ }));
    await new Promise((r) => setTimeout(r, 20));
    expect(ecrireEtatManuelLabel).not.toHaveBeenCalled();
  });

  it("l'état en cours est celui qui est enfoncé", async () => {
    // Sans décision posée, c'est « Auto » : un label que personne n'a touché
    // ne doit pas avoir l'air protégé.
    renderPage();
    const ligne = await ligneLabel("study");
    expect(
      within(ligne).getByRole("button", { name: /^(Auto)$/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(ligne).getByRole("button", { name: /^(Fermé|Closed)$/ }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("un label fermé à la main montre sa décision au rechargement", async () => {
    lireReglagesRepartition.mockResolvedValue({
      ...REGLAGES_CHOIX_LABEL_DEFAUT,
      fermesApp: ["id-sophia:study"],
    });
    renderPage();
    const ligne = await ligneLabel("study");
    expect(
      within(ligne).getByRole("button", { name: /^(Fermé|Closed)$/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    // Et l'état calculé suit : la colonne de gauche dit pourquoi.
    expect(ligne.textContent).toMatch(/Fermé pour cette app|Closed for this app/);
  });
});

describe("AdminRepartitionPage — ce que la projection reçoit", () => {
  const FILE = {
    items: [],
    par_langue: {},
    par_application: { unswipe: { items: [], par_langue: { fr: [{ label_id: "study", ugc: false }] } } },
  };

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
    lireChoixApplicationAuto.mockResolvedValue(false);
    lireReglagesChoixLabelPoses.mockResolvedValue(false);
    lireReglages.mockResolvedValue({ file_labels_comptes: FILE });
  });

  it("la File arrive jusqu'à la projection", async () => {
    // Elle passe avant le classement ET détourne l'application : une
    // projection qui ne la reçoit pas annonce la mauvaise paire.
    renderPage();
    await waitFor(() => expect(simulerTirages).toHaveBeenCalled());
    const options = simulerTirages.mock.calls.at(-1)![6];
    expect(options.file).toEqual(FILE);
  });

  it("une part du site empruntée à la flotte ne réserve aucun tirage", async () => {
    // L'espagnol n'a que 2 recrues : sa part vient de la flotte. La réserver
    // ici donnerait des tirages à un guichet qui n'a peut-être jamais envoyé
    // personne sur ce marché.
    renderPage();
    await waitFor(() => expect(simulerTirages).toHaveBeenCalled());
    const parMarche = new Map(
      simulerTirages.mock.calls.map((c) => [`${c[0].langue}|${c[0].pays ?? ""}`, c[6]]),
    );
    expect(parMarche.get("es|ES").partSite).toBe(0);
    // Le français, lui, est mesuré sur son propre marché : 5 recrues sur 11.
    expect(parMarche.get("fr|FR").partSite).toBeCloseTo(5 / 11);
  });
});
