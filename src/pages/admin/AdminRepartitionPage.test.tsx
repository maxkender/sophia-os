import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

import { REGLAGES_CHOIX_LABEL_DEFAUT } from "@/features/moteur/repartition/scoreLabel";

const lireMarchesApplications = vi.fn();
const lireMarchesRepartition = vi.fn();
const lireCibleRepartitionApps = vi.fn();
const lireRecruesSite = vi.fn();
const lireReglagesRepartition = vi.fn();
const lireApplicationsEnPreparation = vi.fn();

const lireChoixApplicationAuto = vi.fn();
const ecrireChoixApplicationAuto = vi.fn();
const lireReglagesChoixLabelPoses = vi.fn();
const ecrireReglagesChoixLabel = vi.fn();
const remettreReglagesChoixLabelDefaut = vi.fn();
const ecrireEtatManuelLabel = vi.fn();
const ecrireCibleRepartitionApps = vi.fn();
const reaffecterLabelFerme = vi.fn();
const reaffecterLabelFermeEnEntier = vi.fn();

vi.mock("@/features/moteur/repartition/apiRepartition", () => ({
  PROVENANCE_JOURS: 30,
  CLE_CHOIX_APPLICATION_AUTO: "choix_application_auto",
  CLE_CHOIX_LABELS: "choix_labels",
  lireApplicationsEnPreparation: () => lireApplicationsEnPreparation(),
  lireChoixApplicationAuto: () => lireChoixApplicationAuto(),
  ecrireChoixApplicationAuto: (actif: boolean) => ecrireChoixApplicationAuto(actif),
  ecrireCibleRepartitionApps: (p: unknown) => ecrireCibleRepartitionApps(p),
  lireCibleRepartitionApps: (slugs: readonly string[]) => lireCibleRepartitionApps(slugs),
  lireMarchesApplications: () => lireMarchesApplications(),
  lireMarchesRepartition: (id: string) => lireMarchesRepartition(id),
  lireRecruesSite: (jours: number) => lireRecruesSite(jours),
  lireReglagesRepartition: () => lireReglagesRepartition(),
  lireReglagesChoixLabelPoses: () => lireReglagesChoixLabelPoses(),
  ecrireReglagesChoixLabel: (v: unknown) => ecrireReglagesChoixLabel(v),
  remettreReglagesChoixLabelDefaut: () => remettreReglagesChoixLabelDefaut(),
  ecrireEtatManuelLabel: (a: unknown) => ecrireEtatManuelLabel(a),
  reaffecterLabelFerme: (id: string, dryRun: boolean) => reaffecterLabelFerme(id, dryRun),
  reaffecterLabelFermeEnEntier: (id: string) => reaffecterLabelFermeEnEntier(id),
}));

const lireReglages = vi.fn();
vi.mock("@/features/moteur/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/api")>()),
  lireReglages: () => lireReglages(),
}));

/** La carte de la File, espionnée : on vérifie ce que la page lui passe. */
const carteFile = vi.fn();
vi.mock("@/features/moteur/repartition/CarteFileLabels", () => ({
  CarteFileLabels: (props: Record<string, unknown>) => {
    carteFile(props);
    return null;
  },
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

const APPS: Array<{ id: string; slug: string; langues: string[] | null; actif: boolean }> = [
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

// En français, 10 recrues sur 22 viennent du site de recrutement. En allemand
// et en espagnol, aucune. Un chiffre d'information : le moteur les place.
const PROVENANCE = [
  { langue: "fr", pays: "FR", recrues: 22, recruesSite: 10 },
  { langue: "de", pays: "DE", recrues: 30, recruesSite: 0 },
  { langue: "es", pays: "ES", recrues: 2, recruesSite: 0 },
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

/** Le bloc « Site de recrutement » de la carte des applications. */
async function blocSite(): Promise<HTMLElement> {
  return screen.findByTestId("bloc-site");
}

/** Déplie un marché et rend son détail (la ligne qui suit la sienne). */
async function detailMarche(cle: string): Promise<HTMLElement> {
  const ligne = await screen.findByTestId(`marche-${cle}`);
  fireEvent.click(ligne);
  const detail = ligne.nextElementSibling as HTMLElement | null;
  if (!detail) throw new Error(`le détail du marché ${cle} ne s'est pas ouvert`);
  return detail;
}

function poserDonnees() {
  vi.clearAllMocks();
  lireReglagesRepartition.mockResolvedValue(REGLAGES_CHOIX_LABEL_DEFAUT);
  lireApplicationsEnPreparation.mockResolvedValue([]);
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
  ecrireCibleRepartitionApps.mockResolvedValue(undefined);
  lireReglages.mockResolvedValue({ file_labels_comptes: { items: [], par_langue: {} } });
}

describe("AdminRepartitionPage — recrues venues du site", () => {
  beforeEach(poserDonnees);

  it("la provenance est lue sur la même fenêtre que celle affichée", async () => {
    renderPage();
    await waitFor(() => expect(lireRecruesSite).toHaveBeenCalledWith(30));
  });

  it("le résumé donne les effectifs de la flotte, pas qu'un pourcentage", async () => {
    renderPage();
    // 22 + 30 + 2 = 54 recrues, dont 10 venues du site.
    const bloc = await blocSite();
    expect(bloc.textContent).toMatch(/10 recrues sur 54 en 30 jours|10 of 54 recruits in 30 days/);
  });

  it("le site ne décide plus : la page dit que le moteur place ses recrues", async () => {
    // 19/11 : avant, le site choisissait l'application de ses candidats et la
    // page en tirait un plancher par application et un verdict sur la cible.
    renderPage();
    const bloc = await blocSite();
    expect(bloc.textContent).toMatch(/Le moteur les place comme les autres|The engine places them like the others/);
    expect(bloc.textContent).not.toMatch(/envoyées vers|sent to/);
    expect(bloc.textContent).not.toMatch(/atteignable|reachable|impossible/i);
  });

  it("une cible sous l'ancienne part du site n'est plus dite impossible", async () => {
    // Sophia à 0 % alors que 45 % des recrues françaises viennent du site :
    // c'était « impossible », c'est maintenant une cible comme une autre.
    lireCibleRepartitionApps.mockResolvedValue({
      source: "reglage",
      parts: { sophia: 0, unswipe: 60, micabo: 40 },
    });
    renderPage();
    const bloc = await blocSite();
    expect(bloc.textContent).not.toMatch(/reçoit déjà|already gets/);
    expect(screen.queryByText(/Cible impossible|Target impossible/)).toBeNull();
  });

  it("le parcours d'un compte n'a plus d'étape « Vient du site ? »", async () => {
    renderPage();
    await blocSite();
    expect(screen.queryByText(/Vient du site|From the website\?/)).toBeNull();
    // Il commence par la File, puis l'appli, puis le label.
    expect(screen.getByText(/Un label en File \?|A label in the Queue\?/)).toBeTruthy();
  });

  it("le détail d'un marché ne parle plus du site", async () => {
    renderPage();
    const detail = await detailMarche("fr|FR");
    expect(detail.textContent).toMatch(/Français|French/);
    expect(detail.textContent).not.toMatch(/site|Plancher|Floor/i);
    // Et la colonne « Du site » a disparu du tableau.
    expect(screen.queryByRole("columnheader", { name: /^(Du site|From site)$/ })).toBeNull();
  });

  it("sans cible posée, aucune barre « cible » inventée ni écart affiché", async () => {
    // Sans réglage, la page calcule avec des parts ÉGALES pour montrer le
    // manque : les dessiner les ferait passer pour une décision.
    lireCibleRepartitionApps.mockResolvedValue({
      source: "defaut",
      parts: { sophia: 100 / 3, unswipe: 100 / 3, micabo: 100 / 3 },
    });
    renderPage();
    const ligneSophia = (await screen.findByLabelText(/Cible de Sophia|Target for Sophia/)).closest("tr")!;
    expect(screen.queryByRole("img", { name: /^(Cible|Target) :/ })).toBeNull();
    expect(ligneSophia.textContent).not.toMatch(/pts/);
  });

  it("l'interrupteur est refusé tant qu'aucune cible n'est posée", async () => {
    // Allumer sans cible ne ferait rien de bon : le serveur s'abstient et
    // tout repartirait sur Sophia.
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
    expect(screen.getAllByText(/Pose d'abord une cible|Set a target first/).length).toBeGreaterThan(0);
  });

  it("avec une cible, l'interrupteur bascule", async () => {
    renderPage();
    const interrupteur = await screen.findByRole("switch", {
      name: /Le moteur choisit l'application|The engine picks the application/,
    });
    // Il reste grisé le temps que son état soit lu : on ne propose pas de
    // basculer avant de savoir où on en est.
    await waitFor(() => expect(interrupteur.getAttribute("aria-disabled")).not.toBe("true"));
    const bouton = interrupteur.querySelector("input") ?? interrupteur.parentElement?.querySelector("input");
    fireEvent.click(bouton!);
    await waitFor(() => expect(ecrireChoixApplicationAuto).toHaveBeenCalledWith(true));
  });

  it("allumé, la page dit que c'est le moteur qui choisit l'appli", async () => {
    lireChoixApplicationAuto.mockResolvedValue(true);
    renderPage();
    await screen.findByText(
      /Allumé : le moteur choisit l'appli de chaque nouveau compte|On: the engine picks the app of every new account/,
    );
  });

  it("une erreur de droits reste lisible et ne laisse pas un tableau vide", async () => {
    lireRecruesSite.mockRejectedValue(new Error("reserve aux administrateurs"));
    renderPage();
    await screen.findByText("reserve aux administrateurs");
    expect(screen.queryByTestId("bloc-site")).toBeNull();
  });
});

describe("AdminRepartitionPage — la cible et le réel", () => {
  beforeEach(poserDonnees);

  it("la cible s'édite dans le tableau et part en base", async () => {
    renderPage();
    const champ = await screen.findByLabelText(/Cible de Sophia|Target for Sophia/);
    // Rien à enregistrer tant qu'on n'a rien touché : pas de bouton grisé en permanence.
    expect(screen.queryByRole("button", { name: /Poser la cible|Set the target/ })).toBeNull();
    fireEvent.change(champ, { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: /Poser la cible|Set the target/ }));
    await waitFor(() =>
      expect(ecrireCibleRepartitionApps).toHaveBeenCalledWith({ sophia: 70, unswipe: 25, micabo: 15 }),
    );
  });

  it("l'écart se lit réel moins cible, dans le sens des barres", async () => {
    // Sophia porte 42 comptes sur 47, bien au-dessus de sa cible : l'écart
    // doit être POSITIF. L'ancienne page écrivait « cible − réel » et
    // affichait Sophia en négatif alors que sa barre dépassait.
    renderPage();
    const champ = await screen.findByLabelText(/Cible de Sophia|Target for Sophia/);
    const ligneSophia = champ.closest("tr")!;
    expect(ligneSophia.textContent).toMatch(/\+\d+ pts/);
    const ligneMicabo = (await screen.findByLabelText(/Cible de micabo|Target for micabo/)).closest("tr")!;
    expect(ligneMicabo.textContent).toMatch(/-\d+ pts/);
  });

  it("avec une appli restreinte, la visée est affichée et l'écart se lit contre elle", async () => {
    // micabo ne sert que fr et de : sur l'espagnol, sa part va aux autres. La
    // flotte vise donc 12,8 % de micabo et non les 15 % saisis, et l'écart doit
    // se déduire des chiffres de la ligne : 0 % réel − 13 % visé = −13.
    renderPage();
    await screen.findByRole("columnheader", { name: /^(Visée|Aimed)$/ });
    const ligneMicabo = (await screen.findByLabelText(/Cible de micabo|Target for micabo/)).closest("tr")!;
    const cellules = within(ligneMicabo).getAllByRole("cell").map((c) => c.textContent);
    expect(cellules.slice(2)).toEqual(["13 %", "0 %", "-13 pts"]);
  });

  it("sans appli restreinte, pas de colonne « visée » : elle répéterait la cible", async () => {
    // C'est le cas de la prod depuis le 21/10 : les trois applis servent toutes les langues.
    const avant = APPS.map((x) => x.langues);
    APPS.forEach((x) => (x.langues = null));
    try {
      renderPage();
      await screen.findByLabelText(/Cible de Sophia|Target for Sophia/);
      expect(screen.queryByRole("columnheader", { name: /^(Visée|Aimed)$/ })).toBeNull();
      expect(screen.getByRole("columnheader", { name: /^(vs cible|vs target)$/ })).toBeTruthy();
    } finally {
      APPS.forEach((x, i) => (x.langues = avant[i]));
    }
  });

  it("la règle « proposée » qui ne tourne nulle part n'est plus affichée", async () => {
    renderPage();
    await screen.findByTestId("marche-fr|FR");
    expect(screen.queryByText(/règle proposée|proposed rule/i)).toBeNull();
    expect(screen.queryByText(/^(Proposée|Proposed)$/)).toBeNull();
  });

  it("un marché se déplie au bouton, donc au clavier", async () => {
    renderPage();
    const bouton = await screen.findByRole("button", { name: /^(Détail :|Detail:) (Français|French)/ });
    expect(bouton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(bouton);
    expect(bouton.getAttribute("aria-expanded")).toBe("true");
    const ligne = screen.getByTestId("marche-fr|FR");
    expect((ligne.nextElementSibling as HTMLElement).textContent).toMatch(
      /Les 20 prochains comptes|The next 20 accounts/,
    );
  });

  it("les recrues sans label ouvert gardent leur place dans la barre des 20", async () => {
    // Un label FERMÉ est encore donné (le moteur ne laisse jamais une recrue
    // sans label) : une recrue n'est perdue que si aucune appli n'a de label.
    lireMarchesRepartition.mockResolvedValue(
      MARCHES_APPS.map((m) => ({ langue: m.langue, pays: m.pays, comptes: 10, stats: [] })),
    );
    renderPage();
    const ligne = await screen.findByTestId("marche-de|DE");
    await waitFor(() => expect(ligne.textContent).toMatch(/20 sans label ouvert|20 with no open label/));
    expect(within(ligne).getByRole("img", { name: /(Sans label ouvert|No open label) 20 (sur|of) 20/ })).toBeTruthy();
  });

  it("chaque marché donne son prochain compte", async () => {
    renderPage();
    const ligne = await screen.findByTestId("marche-de|DE");
    expect(ligne.textContent).toMatch(/study|gym/);
  });
});

/** Déplie la carte des réglages, repliée par défaut. */
async function ouvrirReglages() {
  fireEvent.click(await screen.findByRole("button", { name: /Réglages avancés|Advanced settings/ }));
}

describe("AdminRepartitionPage — une application en préparation", () => {
  // Atala au 19/11 : inactive (prompts en brouillon, pas de stock), mais ses
  // labels existent. On veut pouvoir lui envoyer les prochaines recrues.
  const ATALA = { id: "id-atala", slug: "atala", langues: null, actif: false };

  beforeEach(() => {
    poserDonnees();
    APPS.push(ATALA);
  });
  afterEach(() => {
    APPS.splice(APPS.indexOf(ATALA), 1);
  });

  it("inactive et sans label, elle reste hors de la répartition", async () => {
    renderPage();
    await screen.findByLabelText(/Cible de Sophia|Target for Sophia/);
    expect(screen.queryByLabelText(/Cible de Atala|Target for Atala/)).toBeNull();
    expect(lireCibleRepartitionApps).toHaveBeenLastCalledWith(["sophia", "micabo", "unswipe"]);
    expect(lireMarchesRepartition).not.toHaveBeenCalledWith("id-atala");
  });

  it("inactive mais dotée de labels, elle a sa ligne, marquée « Inactive »", async () => {
    lireApplicationsEnPreparation.mockResolvedValue(["id-atala"]);
    renderPage();
    const champ = await screen.findByLabelText(/Cible de Atala|Target for Atala/);
    expect(within(champ.closest("tr")!).getByTestId("inactive-atala").textContent).toMatch(/Inactive/);
    // Les applications actives, elles, ne portent pas la marque.
    expect(screen.queryByTestId("inactive-sophia")).toBeNull();
    // La cible et les labels se lisent sur la même liste que le moteur.
    expect(lireCibleRepartitionApps).toHaveBeenLastCalledWith(["sophia", "micabo", "unswipe", "atala"]);
    expect(lireMarchesRepartition).toHaveBeenCalledWith("id-atala");
    // Sans part, rien à signaler : elle ne reçoit aucun compte.
    expect(screen.queryByTestId("alerte-inactives")).toBeNull();
  });

  it("lui donner une part prévient avant d'enregistrer, puis part en base", async () => {
    lireApplicationsEnPreparation.mockResolvedValue(["id-atala"]);
    renderPage();
    const champ = await screen.findByLabelText(/Cible de Atala|Target for Atala/);
    fireEvent.change(champ, { target: { value: "100" } });
    const alerte = screen.getByTestId("alerte-inactives");
    expect(alerte.textContent).toMatch(/Atala est inactive|Atala is inactive/);
    expect(alerte.textContent).toMatch(/warm-up/);
    fireEvent.click(screen.getByRole("button", { name: /Poser la cible|Set the target/ }));
    await waitFor(() =>
      expect(ecrireCibleRepartitionApps).toHaveBeenCalledWith({ sophia: 60, unswipe: 25, micabo: 15, atala: 100 }),
    );
  });

  it("une cible déjà posée sur elle garde l'avertissement à l'écran", async () => {
    lireApplicationsEnPreparation.mockResolvedValue(["id-atala"]);
    lireCibleRepartitionApps.mockResolvedValue({
      source: "reglage",
      parts: { sophia: 0, unswipe: 0, micabo: 0, atala: 100 },
    });
    renderPage();
    expect((await screen.findByTestId("alerte-inactives")).textContent).toMatch(/Atala/);
  });

  it("sa File s'édite depuis la carte « File des créateurs », avec la cible sous les yeux", async () => {
    // Décider le label des prochains comptes d'Atala : il faut pouvoir choisir
    // sa File alors qu'elle est inactive, et savoir si elle sera lue.
    lireApplicationsEnPreparation.mockResolvedValue(["id-atala"]);
    renderPage();
    await screen.findByLabelText(/Cible de Atala|Target for Atala/);
    await waitFor(() => expect(carteFile).toHaveBeenCalled());
    const props = carteFile.mock.calls.at(-1)![0];
    expect(props.slugsEnPreparation).toEqual(["atala"]);
    // La cible posée (60 / 25 / 15, rien pour Atala) part telle quelle.
    expect(props.partsCible).toEqual({ sophia: 60, unswipe: 25, micabo: 15 });
  });

  it("sans cible posée, la carte de la File ne reçoit aucune part", async () => {
    lireCibleRepartitionApps.mockResolvedValue({
      source: "defaut",
      parts: { sophia: 100 / 3, unswipe: 100 / 3, micabo: 100 / 3 },
    });
    renderPage();
    await waitFor(() => expect(carteFile).toHaveBeenCalled());
    expect(carteFile.mock.calls.at(-1)![0].partsCible).toBeNull();
  });

  it("une lecture en panne se voit, elle ne retire pas l'application en silence", async () => {
    lireApplicationsEnPreparation.mockRejectedValue(new Error("applications_en_preparation : timeout"));
    renderPage();
    expect(await screen.findByText(/applications_en_preparation : timeout/)).toBeTruthy();
  });
});

describe("AdminRepartitionPage — les réglages de label s'éditent", () => {
  beforeEach(poserDonnees);

  it("la page ne se dit jamais en lecture seule", async () => {
    renderPage();
    await screen.findByRole("switch", { name: /Le moteur choisit l'application|The engine picks the application/ });
    expect(screen.queryByText(/Lecture seule|Read only/)).toBeNull();
  });

  it("sans valeur en base, la page dit que ce sont les défauts du code", async () => {
    renderPage();
    await screen.findByText(/Aucune valeur n'est posée en base|No value is stored/);
  });

  it("une valeur modifiée part en base avec les onze autres", async () => {
    renderPage();
    await ouvrirReglages();
    const champ = await screen.findByLabelText(/Exposant de performance|Performance exponent/);
    fireEvent.change(champ, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer les réglages|Save settings/ }));
    await waitFor(() => expect(ecrireReglagesChoixLabel).toHaveBeenCalled());
    const envoye = ecrireReglagesChoixLabel.mock.calls[0][0];
    expect(envoye.perfExposant).toBe(3);
    // Les autres partent inchangés : on écrit les douze d'un bloc.
    expect(envoye.partMax).toBe(REGLAGES_CHOIX_LABEL_DEFAUT.partMax);
    expect(Object.keys(envoye)).toHaveLength(15);
  });

  it("une valeur que le moteur aurait réécrite bloque l'enregistrement", async () => {
    // `positif(0, 2)` rend 2 : laisser passer zéro afficherait 0 ici et
    // appliquerait 2 là-bas, sans que rien ne le dise.
    renderPage();
    await ouvrirReglages();
    const champ = await screen.findByLabelText(/Exposant de performance|Performance exponent/);
    fireEvent.change(champ, { target: { value: "0" } });
    const bouton = screen.getByRole("button", { name: /Enregistrer les réglages|Save settings/ });
    await waitFor(() => expect(bouton).toBeDisabled());
    await screen.findByText(/Une valeur au moins est refusée|At least one value is refused/);
    fireEvent.click(bouton);
    expect(ecrireReglagesChoixLabel).not.toHaveBeenCalled();
  });

  it("une borne basse au-dessus de la haute est nommée, pas juste refusée", async () => {
    renderPage();
    await ouvrirReglages();
    fireEvent.change(await screen.findByLabelText(/Performance, borne basse|Performance, lower bound/), {
      target: { value: "5" },
    });
    await screen.findByText(
      /La borne basse de performance dépasse la borne haute|The lower performance bound is above the upper one/,
    );
    expect(screen.getByRole("button", { name: /Enregistrer les réglages|Save settings/ })).toBeDisabled();
  });

  it("les réglages restent éditables même sans label à classer", async () => {
    // Ils valent pour TOUTES les applications : la carte n'a pas à
    // disparaître parce qu'aucun label n'est à classer.
    lireMarchesRepartition.mockResolvedValue([]);
    renderPage();
    await ouvrirReglages();
    expect(screen.getByRole("button", { name: /Enregistrer les réglages|Save settings/ })).toBeTruthy();
  });

  it("revenir aux défauts retire les clés au lieu de figer des nombres", async () => {
    renderPage();
    await ouvrirReglages();
    fireEvent.click(await screen.findByRole("button", { name: /Revenir aux valeurs par défaut|Back to default values/ }));
    await waitFor(() => expect(remettreReglagesChoixLabelDefaut).toHaveBeenCalled());
    expect(ecrireReglagesChoixLabel).not.toHaveBeenCalled();
  });
});

describe("AdminRepartitionPage — ouvrir et fermer un label", () => {
  beforeEach(poserDonnees);

  /** La ligne du tableau des labels qui porte ce label. */
  async function ligneLabel(nom: string): Promise<HTMLElement> {
    return screen.findByTestId(`label-${nom}`);
  }

  it("fermer un label l'écrit pour l'application affichée, pas pour toutes", async () => {
    renderPage();
    const ligne = await ligneLabel("study");
    fireEvent.click(within(ligne).getByRole("button", { name: /^(Fermé|Closed)$/ }));
    await waitFor(() =>
      expect(ecrireEtatManuelLabel).toHaveBeenCalledWith({
        applicationId: "id-sophia",
        labelId: "study",
        etat: "ferme",
      }),
    );
  });

  it("l'onglet d'une autre appli décide pour elle", async () => {
    renderPage();
    await ligneLabel("study");
    fireEvent.click(screen.getByRole("tab", { name: /Unswipe/ }));
    const ligne = await ligneLabel("study");
    fireEvent.click(within(ligne).getByRole("button", { name: /^(Fermé|Closed)$/ }));
    await waitFor(() =>
      expect(ecrireEtatManuelLabel).toHaveBeenCalledWith({
        applicationId: "id-unswipe",
        labelId: "study",
        etat: "ferme",
      }),
    );
  });

  it("les onglets d'appli se parcourent aux flèches", async () => {
    renderPage();
    await ligneLabel("study");
    const sophia = screen.getByRole("tab", { name: /Sophia/ });
    expect(sophia.getAttribute("aria-selected")).toBe("true");
    expect(sophia.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    const micabo = screen.getByRole("tab", { name: /micabo/ });
    await waitFor(() => expect(micabo.getAttribute("aria-selected")).toBe("true"));
    expect(sophia.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(micabo.id);
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
    expect(within(ligne).getByRole("button", { name: /^(Auto)$/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(ligne).getByRole("button", { name: /^(Fermé|Closed)$/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("un label fermé est caché ; « Afficher » le montre avec sa décision (0794)", async () => {
    lireReglagesRepartition.mockResolvedValue({
      ...REGLAGES_CHOIX_LABEL_DEFAUT,
      fermesApp: ["id-sophia:study"],
    });
    renderPage();
    // Les autres labels sont là, pas le label fermé.
    const bouton = await screen.findByTestId("voir-labels-fermes");
    expect(screen.queryByTestId("label-study")).toBeNull();
    expect(bouton.textContent).toMatch(/1/);
    fireEvent.click(bouton);
    const ligne = await ligneLabel("study");
    expect(within(ligne).getByRole("button", { name: /^(Fermé|Closed)$/ }).getAttribute("aria-pressed")).toBe("true");
    expect(ligne.textContent).toMatch(/Fermé pour cette app|Closed for this app/);
    // On peut les recacher.
    fireEvent.click(screen.getByTestId("voir-labels-fermes"));
    await waitFor(() => expect(screen.queryByTestId("label-study")).toBeNull());
  });

  it("sans label fermé, pas de bouton « Afficher »", async () => {
    renderPage();
    await ligneLabel("study");
    expect(screen.queryByTestId("voir-labels-fermes")).toBeNull();
  });

  it("fermer un label propose de réaffecter ses comptes tout de suite, aperçu d'abord (0794)", async () => {
    ecrireEtatManuelLabel.mockResolvedValue(undefined);
    reaffecterLabelFerme.mockResolvedValue({
      dryRun: true,
      deplaces: [
        { compte_id: "c1", handle: "lea.notes1", langue: "fr", de: ["study"], vers: "clean_study", meme_theme: true },
        { compte_id: "c2", handle: "tom.focus2", langue: "en", de: ["study"], vers: "gym", meme_theme: false },
      ],
      retires: [],
      manuels: [],
      reportes: 0,
      erreurs: [],
    });
    reaffecterLabelFermeEnEntier.mockResolvedValue({
      dryRun: false,
      deplaces: [
        { compte_id: "c1", handle: "lea.notes1", langue: "fr", de: ["study"], vers: "clean_study", meme_theme: true },
        { compte_id: "c2", handle: "tom.focus2", langue: "en", de: ["study"], vers: "gym", meme_theme: false },
      ],
      retires: [],
      manuels: [],
      reportes: 0,
      erreurs: [],
    });
    renderPage();
    const ligne = await ligneLabel("study");
    fireEvent.click(within(ligne).getByRole("button", { name: /^(Fermé|Closed)$/ }));

    const panneau = await screen.findByTestId("reaffectation-label");
    await waitFor(() => expect(reaffecterLabelFerme).toHaveBeenCalledWith("study", true));
    expect(await within(panneau).findByText("lea.notes1")).toBeTruthy();
    expect(panneau.textContent).toMatch(/clean_study/);
    // Le compte sorti du thème est signalé.
    expect(panneau.textContent).toMatch(/hors thème|other theme/);
    // Rien n'est écrit avant le clic.
    expect(reaffecterLabelFermeEnEntier).not.toHaveBeenCalled();

    fireEvent.click(within(panneau).getByRole("button", { name: /Réaffecter 2|Reassign 2/ }));
    await waitFor(() => expect(reaffecterLabelFermeEnEntier).toHaveBeenCalledWith("study"));
    await waitFor(() => expect(panneau.textContent).toMatch(/2 compte\(s\) réaffecté|2 account\(s\) reassigned/));
  });

  it("un label livré absent d'une langue le signale, et garde son stock entier pour ses jours", async () => {
    // Depuis 0348, la réserve d'un label livré par un pod tombe à zéro dans
    // une langue sans deck. Sur la carte des labels, ça ne doit ni le faire
    // passer pour vide, ni passer inaperçu.
    lireMarchesRepartition.mockResolvedValue(
      MARCHES_APPS.map((m) => ({
        langue: m.langue,
        pays: m.pays,
        comptes: 10,
        stats: [stat("study"), { ...stat("gym"), passages_restants: m.langue === "de" ? 0 : 2000 }],
      })),
    );
    renderPage();
    const ligne = await ligneLabel("gym");
    expect(ligne.textContent).toMatch(/absent dans 1 langue|missing in 1 language/);
    // 2000 / (10 + 2) = 167 jours : le stock entier, pas le zéro allemand.
    expect(ligne.textContent).toMatch(/167 (j|d)/);
  });

  it("un label 100 % podz porte la marque pod et montre son remplissage, pas sa réserve", async () => {
    lireMarchesRepartition.mockResolvedValue(
      MARCHES_APPS.map((m, i) => ({
        langue: m.langue,
        pays: m.pays,
        comptes: 10,
        stats: [
          stat("study"),
          {
            ...stat("fathomly"),
            passages_restants: 8,
            comptes_langue: i,
            pod_seul: true,
            livre_langue: m.langue !== "de",
            niveau_pod: 0,
          },
        ],
      })),
    );
    renderPage();
    const ligne = await ligneLabel("fathomly");
    expect(within(ligne).getAllByText(/100 % podz|100% pods/).length).toBeGreaterThan(0);
    // Pas de réserve ni d'alerte de langue dans le tableau : tout est dans la carte 100 % podz.
    expect(within(ligne).getByTestId("remplissage-pod").textContent).toMatch(/100 % podz|100% pod labels/);
    expect(ligne.textContent).not.toMatch(/\d (j|d)\b/);
    expect(ligne.textContent).not.toMatch(/absent dans|missing in/);
    expect(within(screen.getByTestId("pod-fathomly")).getByText(/Pas livré en : DE|Not delivered in: DE/)).toBeTruthy();
    // Le label ordinaire, lui, n'a pas la marque.
    expect(within(await ligneLabel("study")).queryByText(/100 % podz|100% pods/)).toBeNull();
  });

  it("un label 100 % podz en test montre ses comptes et posts de test", async () => {
    lireMarchesRepartition.mockResolvedValue(
      MARCHES_APPS.map((m) => ({
        langue: m.langue,
        pays: m.pays,
        comptes: 10,
        stats: [
          stat("study"),
          { ...stat("fathomly"), comptes_total: 1, passages: 10, pod_seul: true, livre_langue: true, niveau_pod: 0 },
        ],
      })),
    );
    renderPage();
    const ligne = await ligneLabel("fathomly");
    expect(within(ligne).getByTestId("test-pod").textContent).toMatch(/1\/3 .*10\/30/);
  });

  it("la carte 100 % podz montre où on en est langue par langue", async () => {
    lireMarchesRepartition.mockResolvedValue(
      MARCHES_APPS.map((m) => ({
        langue: m.langue,
        pays: m.pays,
        comptes: 10,
        stats: [
          stat("study"),
          {
            ...stat("white_bg"),
            comptes_langue: m.langue === "fr" ? 3 : 0,
            comptes_total: 9,
            pod_seul: true,
            livre_langue: m.langue !== "de",
            niveau_pod: m.langue === "fr" ? 0 : 3,
          },
        ],
      })),
    );
    renderPage();
    const carte = await screen.findByTestId("carte-podz");
    const pod = within(carte).getByTestId("pod-white_bg");
    expect(within(pod).getByTestId("pod-langue-fr").getAttribute("data-prete")).toBe("non");
    expect(within(pod).getByTestId("pod-langue-es").getAttribute("data-prete")).toBe("oui");
    expect(within(pod).queryByTestId("pod-langue-de")).toBeNull();
    expect(pod.textContent).toMatch(/DE/);
    // Le label ordinaire n'y figure pas.
    expect(within(carte).queryByTestId("pod-study")).toBeNull();
  });

  it("un label 100 % podz en test qui a ses 3 comptes dit « Test complet », pas « Ouvert »", async () => {
    lireMarchesRepartition.mockResolvedValue(
      MARCHES_APPS.map((m) => ({
        langue: m.langue,
        pays: m.pays,
        comptes: 10,
        stats: [
          stat("study"),
          { ...stat("fathomly"), comptes_total: 3, passages: 10, pod_seul: true, livre_langue: true, niveau_pod: 0 },
        ],
      })),
    );
    renderPage();
    const ligne = await ligneLabel("fathomly");
    expect(within(ligne).getAllByText(/Test complet|Test full/).length).toBeGreaterThan(0);
    // Reste le seul bouton de décision « Ouvert » ; aucun badge « Ouvert ».
    const ouverts = (l: HTMLElement) => within(l).getAllByText(/^(Ouvert|Open)$/).length;
    expect(ouverts(ligne)).toBe(ouverts(await ligneLabel("study")) - 2);
  });

  it("la colonne comptes compte l'application affichée, le total toutes applis à côté", async () => {
    lireMarchesRepartition.mockResolvedValue(
      MARCHES_APPS.map((m) => ({
        langue: m.langue,
        pays: m.pays,
        comptes: 10,
        stats: [{ ...stat("study"), comptes_total: 45, comptes_app: 6 }, { ...stat("gym"), comptes_total: 6, comptes_app: 6 }],
      })),
    );
    renderPage();
    const cellule = within(await ligneLabel("study")).getByTestId("comptes-label");
    expect(cellule.textContent).toMatch(/^6/);
    expect(cellule.textContent).toMatch(/50/);
    expect(cellule.textContent).toMatch(/45 (toutes applis|across apps)/);
    // Total égal : pas de mention redondante.
    expect(within(await ligneLabel("gym")).getByTestId("comptes-label").textContent).not.toMatch(/toutes applis|across apps/);
  });
});

describe("AdminRepartitionPage — ce que la projection reçoit", () => {
  const FILE = {
    items: [],
    par_langue: {},
    par_application: { unswipe: { items: [], par_langue: { fr: [{ label_id: "study", ugc: false }] } } },
  };

  beforeEach(() => {
    poserDonnees();
    lireReglages.mockResolvedValue({ file_labels_comptes: FILE });
  });

  it("la File arrive jusqu'à la projection", async () => {
    // Elle passe avant le classement ET détourne l'application : une
    // projection qui ne la reçoit pas annonce la mauvaise paire.
    renderPage();
    await waitFor(() => expect(simulerTirages).toHaveBeenCalled());
    await waitFor(() => expect(simulerTirages.mock.calls.at(-1)![6].file).toEqual(FILE));
  });

  it("aucun tirage n'est réservé au site : toutes les recrues passent par le moteur", async () => {
    // Avant le 19/11, la projection recevait la part du site mesurée sur le
    // marché et lui réservait des tirages. Le moteur place tout le monde.
    renderPage();
    await waitFor(() => expect(simulerTirages).toHaveBeenCalled());
    for (const appel of simulerTirages.mock.calls) {
      expect(appel[6]).not.toHaveProperty("partSite");
      expect(appel[6]).not.toHaveProperty("siteParApp");
    }
    // En français, où 10 recrues sur 22 viennent du site, la ligne ne compte
    // plus de recrues « du site » parmi les vingt.
    const ligne = await screen.findByTestId("marche-fr|FR");
    expect(ligne.textContent).not.toMatch(/\/ 20/);
  });
});
