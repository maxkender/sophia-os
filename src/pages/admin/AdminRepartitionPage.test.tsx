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
const ecrireCibleRepartitionApps = vi.fn();

vi.mock("@/features/moteur/repartition/apiRepartition", () => ({
  PROVENANCE_JOURS: 30,
  CLE_CHOIX_APPLICATION_AUTO: "choix_application_auto",
  CLE_CHOIX_LABELS: "choix_labels",
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
    // 11 + 15 + 2 = 28 recrues, dont 5 venues du site.
    const bloc = await blocSite();
    expect(bloc.textContent).toMatch(/5 recrues sur 28 en 30 jours|5 of 28 recruits in 30 days/);
  });

  it("le français montre ses 5 recrues sur 11 et sa part hors moteur", async () => {
    renderPage();
    const detail = await detailMarche("fr|FR");
    expect(detail.textContent).toMatch(
      /5 recrues sur 11 venues du site \(45 %\)|5 of 11 recruits came from the website \(45 %\)/,
    );
  });

  it("un échantillon trop mince le dit, au lieu de faire parler deux comptes", async () => {
    renderPage();
    const es = await detailMarche("es|ES");
    expect(es.textContent).toMatch(/la flotte \(échantillon trop mince\)|the fleet \(sample too thin\)/);
    // Les effectifs affichés sont ceux de l'Espagne (2), pas ceux de la flotte (28).
    expect(es.textContent).toMatch(/Seulement 2 recrues ici|Only 2 recruits here/);
    expect(es.textContent).not.toMatch(/sur 28|of 28/);
    expect((await detailMarche("fr|FR")).textContent).toMatch(/ce marché|this market/);
  });

  it("une cible atteignable est annoncée comme telle", async () => {
    renderPage();
    // Cible Sophia 60 %, site 45,5 % : il reste de la marge.
    expect((await detailMarche("fr|FR")).textContent).toMatch(/Cible atteignable|Target reachable/);
    expect((await blocSite()).textContent).toMatch(
      /atteignable sur tous les marchés|reachable in every market/,
    );
  });

  it("viser moins que ce que le site envoie déjà est signalé impossible", async () => {
    lireCibleRepartitionApps.mockResolvedValue({
      source: "reglage",
      parts: { sophia: 30, unswipe: 40, micabo: 30 },
    });
    renderPage();
    // C'est le cœur du bloc : 30 % demandés, 45,5 % déjà promis par le site.
    const bloc = await blocSite();
    await waitFor(() =>
      expect(bloc.textContent).toMatch(
        /Sophia reçoit déjà au moins 45 % via le site|Sophia already gets at least 45 % from the website/,
      ),
    );
    expect(bloc.textContent).toMatch(/Français|French/);
    // L'allemand n'a aucune recrue du site : rien ne l'empêche.
    expect(bloc.textContent).not.toMatch(/Allemand|German/);
    expect((await detailMarche("de|DE")).textContent).toMatch(/Cible atteignable|Target reachable/);
  });

  it("sans cible posée, aucun verdict : on ne juge pas une cible que personne n'a choisie", async () => {
    // Sans réglage, la page calcule avec des parts ÉGALES pour montrer le
    // manque. En français, 33,3 % de Sophia contre 45,5 % promis ferait
    // « impossible » : un faux reproche adressé à une cible fictive.
    lireCibleRepartitionApps.mockResolvedValue({
      source: "defaut",
      parts: { sophia: 100 / 3, unswipe: 100 / 3, micabo: 100 / 3 },
    });
    renderPage();
    const detail = await detailMarche("fr|FR");
    expect(detail.textContent).toMatch(/cible non posée|no target set/);
    expect(detail.textContent).not.toMatch(/reçoit déjà|already gets/);
    // Le plancher, lui, ne dépend pas de la cible : il reste affiché.
    expect(detail.textContent).toMatch(/Plancher : Sophia 45 %|Floor: Sophia 45 %/);
    expect((await blocSite()).textContent).not.toMatch(/reçoit déjà|already gets/);
    // Et aucune barre « cible » dessinée avec des parts égales inventées.
    expect(screen.queryByRole("img", { name: /^(Cible|Target) :/ })).toBeNull();
    const ligneSophia = (await screen.findByLabelText(/Cible de Sophia|Target for Sophia/)).closest("tr")!;
    expect(ligneSophia.textContent).not.toMatch(/pts/);
  });

  it("la projection dit combien des vingt prochaines recrues viennent du site", async () => {
    renderPage();
    // 45,5 % de 20, soit 9 recrues que le moteur ne place pas.
    const ligne = await screen.findByTestId("marche-fr|FR");
    expect(ligne.textContent).toMatch(/9 \/ 20/);
  });

  it("la page dit où le site a envoyé ses recrues", async () => {
    renderPage();
    const bloc = await blocSite();
    expect(bloc.textContent).toMatch(/(envoyées vers|sent to)\s*Sophia\s*5/);
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
    const detail = await detailMarche("fr|FR");
    expect(detail.textContent).toMatch(/Plancher : Unswipe 45 %|Floor: Unswipe 45 %/);
    // Et c'est Unswipe qui bloque la cible, pas Sophia.
    expect(detail.textContent).toMatch(/Unswipe reçoit déjà au moins|Unswipe already gets at least/);
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
    const es = await detailMarche("es|ES");
    expect(es.textContent).toMatch(/Échantillon trop mince pour juger|Sample too thin to judge/);
    expect(es.textContent).not.toMatch(/reçoit déjà|already gets/);
    // Le français, lui, parle pour lui-même : le verdict franc est permis.
    expect((await detailMarche("fr|FR")).textContent).toMatch(/reçoit déjà|already gets/);
    // Et le bloc du site ne liste que lui.
    const bloc = await blocSite();
    expect(bloc.textContent).toMatch(/Français|French/);
    expect(bloc.textContent).not.toMatch(/Espagnol|Spanish/);
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
    expect((ligne.nextElementSibling as HTMLElement).textContent).toMatch(/Plancher|Floor/);
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

  it("des marchés trop minces pour juger ne font pas dire « atteignable partout »", async () => {
    lireRecruesSite.mockResolvedValue([
      { langue: "fr", pays: "FR", recrues: 3, recruesSite: 3, siteParApp: { sophia: 3 } },
      { langue: "de", pays: "DE", recrues: 15, recruesSite: 0, siteParApp: {} },
      { langue: "es", pays: "ES", recrues: 2, recruesSite: 0, siteParApp: {} },
    ]);
    lireCibleRepartitionApps.mockResolvedValue({ source: "reglage", parts: { sophia: 10, unswipe: 60, micabo: 30 } });
    renderPage();
    const bloc = await blocSite();
    await waitFor(() =>
      expect(bloc.textContent).toMatch(/2 marchés sont trop minces pour juger|2 markets are too thin to judge/),
    );
    expect(bloc.textContent).not.toMatch(/sur tous les marchés\.|in every market\./);
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
    expect(Object.keys(envoye)).toHaveLength(14);
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

  it("un label fermé à la main montre sa décision au rechargement", async () => {
    lireReglagesRepartition.mockResolvedValue({
      ...REGLAGES_CHOIX_LABEL_DEFAUT,
      fermesApp: ["id-sophia:study"],
    });
    renderPage();
    const ligne = await ligneLabel("study");
    expect(within(ligne).getByRole("button", { name: /^(Fermé|Closed)$/ }).getAttribute("aria-pressed")).toBe("true");
    expect(ligne.textContent).toMatch(/Fermé pour cette app|Closed for this app/);
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

  it("une part du site empruntée à la flotte ne réserve aucun tirage", async () => {
    // L'espagnol n'a que 2 recrues : sa part vient de la flotte. La réserver
    // ici donnerait des tirages à un site qui n'a peut-être jamais envoyé
    // personne sur ce marché.
    renderPage();
    await waitFor(() => expect(simulerTirages).toHaveBeenCalled());
    // Seuls les tirages de VINGT portent la part du site ; celui d'un seul
    // compte (le prochain, placé par le moteur) n'en a pas, par construction.
    const parMarche = new Map(
      simulerTirages.mock.calls
        .filter((c) => c[5] === 20)
        .map((c) => [`${c[0].langue}|${c[0].pays ?? ""}`, c[6]]),
    );
    expect(parMarche.get("es|ES").partSite).toBe(0);
    // Le français, lui, est mesuré sur son propre marché : 5 recrues sur 11.
    expect(parMarche.get("fr|FR").partSite).toBeCloseTo(5 / 11);
  });
});
