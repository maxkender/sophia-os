import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import type { AngleTesteABlanc, ContenusABlancResultat, DeckTesteABlanc } from "./contenusABlanc";

const lancer = vi.fn();
const anglesEnBase = vi.fn();
const SOPHIA = "00000000-0000-4000-8000-000000000001";
const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const C1 = "c0000000-0000-4000-8000-000000000001";

vi.mock("@/features/moteur/api", () => ({
  listerApplications: () =>
    Promise.resolve([
      { id: SOPHIA, slug: "sophia", nom: "Sophia", created_at: "2026-01-01" },
      { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "2026-09-01" },
    ]),
  listerLabels: () => Promise.resolve([{ id: "L1", nom: "alpha_male" }, { id: "L2", nom: "smart_girl" }]),
  listerSlideshowsLabelABlanc: () =>
    Promise.resolve([
      { id: C1, titre: "Moins d'écrans", langue_source: "fr", vues_source: 120000, created_at: "2026-10-01" },
      { id: "c2", titre: "Crêpes", langue_source: "fr", vues_source: 5000, created_at: "2026-09-30" },
    ]),
  lancerContenusABlanc: (...args: unknown[]) => lancer(...args),
}));

// L2 sert Unswipe ; L1 n'a aucune ligne : il sert Sophia (héritage).
vi.mock("@/features/moteur/apiMultiApp", () => ({
  listerLiensLabels: () => Promise.resolve([{ label_id: "L2", application_id: UNSWIPE }]),
}));

vi.mock("@/features/moteur/apiAngles", () => ({
  listerAnglesPlacement: () => anglesEnBase(),
}));

const angleEnBase = (id: string, statut: "actif" | "test", texte: string, label_id = "L2", application_id = UNSWIPE) => ({
  id,
  label_id,
  application_id,
  texte,
  statut,
  created_at: "2026-10-14T08:00:00Z",
  updated_at: "2026-10-14T08:00:00Z",
});

import { ContenusABlancCard } from "./ContenusABlancCard";

function rendre(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const DECK: DeckTesteABlanc = {
  promptCle: "placement_unswipe",
  statut: "pret",
  raison: null,
  base: [
    { position: 1, texte: "trop d'écrans ?", pub: false },
    { position: 2, texte: "j'utilise opal", pub: false },
  ],
  slides: [
    { position: 1, texte: "trop d'écrans ?", pub: false },
    { position: 2, texte: "j'utilise l'appli unswipe", pub: true },
  ],
  slidePub: 2,
  positionImposee: 2,
  mode: "confession",
  variantes: ["j'utilise l'appli unswipe", "unswipe m'aide"],
  varianteRetenue: 0,
  angle: null,
  hashtags: "#ecrans",
  appelsIA: { autorises: 1, bloques: 0 },
};

/** Le deck de la référence avec une autre slide pub, pour un angle en test. */
const deckAngle = (angle: string, pub: string): DeckTesteABlanc => ({
  ...DECK,
  angle,
  slides: [DECK.slides[0], { position: 2, texte: pub, pub: true }],
  variantes: [pub],
});

const RESULTAT: ContenusABlancResultat = {
  aBlanc: true,
  mode: "contenus",
  ia: true,
  dureeMs: 12_300,
  resume: "1 slideshow(s) testé(s) : 1 éligible(s), 1 deck(s) prêt(s) — rien n'a été écrit",
  application: { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", actif: false, langues: null },
  prompts: {
    pertinence: { cle: "pertinence_unswipe", present: true },
    placement: { cle: "placement_unswipe", present: true },
  },
  scoring: { seuil: 55, plancher: 50, poidsVues: 0.7, poidsSource: 0.45 },
  contenus: [{
    id: C1,
    titre: "Moins d'écrans",
    statut: "valide",
    importStatut: "done",
    langueSource: "fr",
    langue: "fr",
    vues: 120000,
    pisteSource: 80,
    avertissements: [],
    pertinence: {
      promptCle: "pertinence_unswipe",
      score: 82,
      raison: "parle de temps d'écran",
      accroche: "trop d'écrans ?",
      note: 71.234,
      seuil: 55,
      plancher: 50,
      eligible: true,
      motifs: [],
      forcee: false,
      tier: "A",
      passages: 4,
      enBase: null,
      appelsIA: { autorises: 1, bloques: 0 },
    },
    deck: null as unknown as DeckTesteABlanc,
    angles: [],
    anglesNonTestes: 0,
    dureeMs: 9000,
  }],
  notation: true,
  ecrituresEvitees: [
    { table: "contenu_pertinences", operation: "upsert", requetes: 1, lignes: 1 },
    { table: "contenu_langue_decks", operation: "upsert", requetes: 1, lignes: 1 },
  ],
  appelsBloques: [],
  appelsIA: { autorises: 2, bloques: 0 },
  plafondIA: 15,
  lectures: 30,
  limites: ["Le modèle n'est pas déterministe"],
};

RESULTAT.contenus[0].deck = DECK;
RESULTAT.contenus[0].angles = [{ source: "reference", angleId: null, angle: null, deck: DECK }];

/** RESULTAT avec ces angles pour le contenu (le deck affiché est celui de la référence). */
const avecAngles = (angles: AngleTesteABlanc[], extra: Partial<ContenusABlancResultat["contenus"][number]> = {}) => ({
  ...RESULTAT,
  contenus: [{ ...RESULTAT.contenus[0], deck: angles[0]?.deck ?? null, angles, ...extra }],
});

async function choisirLabelEtLancer(labelId: string, applicationId = UNSWIPE) {
  const app = (await screen.findByLabelText(/^application$/i)) as HTMLSelectElement;
  await waitFor(() => expect(app.options.length).toBe(2));
  if (app.value !== applicationId) fireEvent.change(app, { target: { value: applicationId } });
  const label = screen.getByLabelText(/^label$/i) as HTMLSelectElement;
  await waitFor(() => expect(label.options.length).toBe(3));
  fireEvent.change(label, { target: { value: labelId } });
  const liste = await screen.findByTestId("liste-slideshows");
  await waitFor(() => expect(liste.querySelectorAll("input[type=checkbox]")).toHaveLength(2));
  fireEvent.click(liste.querySelectorAll("input[type=checkbox]")[0]);
  fireEvent.click(screen.getByRole("button", { name: /nothing is saved|rien n'est enregistré/i }));
  return screen.findByTestId("resultat-contenus-a-blanc");
}

describe("ContenusABlancCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    lancer.mockReset();
    anglesEnBase.mockReset();
    anglesEnBase.mockResolvedValue([]);
    lancer.mockImplementation((_a: string, _ids: string[], _l: string | null, onLog?: (l: unknown) => void) => {
      onLog?.({ at: "2026-10-09T12:00:00Z", detail: "Évité · UPSERT contenu_pertinences (1)", etape: "a_blanc" });
      return Promise.resolve(RESULTAT);
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Unswipe par défaut, label qui sert l'application en tête, sélection puis résultat lisible", async () => {
    rendre(<ContenusABlancCard />);
    const app = (await screen.findByLabelText(/^application$/i)) as HTMLSelectElement;
    await waitFor(() => expect(app.value).toBe(UNSWIPE));
    expect(screen.getByRole("option", { name: "Sophia" })).toBeInTheDocument();

    const label = screen.getByLabelText(/^label$/i) as HTMLSelectElement;
    await waitFor(() => expect(label.options.length).toBe(3));
    expect(label.options[1].textContent).toMatch(/smart_girl/);
    fireEvent.change(label, { target: { value: "L2" } });

    const liste = await screen.findByTestId("liste-slideshows");
    await waitFor(() => expect(liste.querySelectorAll("input[type=checkbox]")).toHaveLength(2));
    fireEvent.click(liste.querySelectorAll("input[type=checkbox]")[0]);
    expect(screen.getByTestId("selection").textContent).toContain("Moins d'écrans");

    fireEvent.click(screen.getByRole("button", { name: /nothing is saved|rien n'est enregistré/i }));
    await screen.findByTestId("resultat-contenus-a-blanc");
    expect(lancer).toHaveBeenCalledWith(UNSWIPE, [C1], null, expect.any(Function));
    expect(lancer.mock.calls[0]).toHaveLength(4);
    expect(screen.getByTestId("angle-utilise").textContent).toMatch(/Sans angle|No angle/);
    expect(screen.queryByTestId("comparatif-angles")).toBeNull();
    expect(screen.getByText("Évité · UPSERT contenu_pertinences (1)")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText(/71\.2/)).toBeInTheDocument();
    expect(screen.getByText(/(Tier d'entrée|Entry tier) A/)).toBeInTheDocument();
    expect(screen.getByText(/(slide|Slide) 2/)).toBeInTheDocument();
    const pub = document.querySelector("[data-pub=true]");
    expect(pub?.textContent).toContain("unswipe");
    expect(screen.getByText("contenu_langue_decks")).toBeInTheDocument();
  });

  it("angles du label : la référence (actif) et le nombre d'angles en test sont annoncés avant le test", async () => {
    anglesEnBase.mockResolvedValue([
      angleEnBase("a", "actif", "insister sur le temps récupéré"),
      angleEnBase("t1", "test", "montrer la fierté"),
      angleEnBase("t2", "test", "parler du soir"),
      angleEnBase("s", "test", "angle Sophia", "L2", SOPHIA),
    ]);
    rendre(<ContenusABlancCard />);
    const label = (await screen.findByLabelText(/^label$/i)) as HTMLSelectElement;
    await waitFor(() => expect(label.options.length).toBe(3));
    fireEvent.change(label, { target: { value: "L2" } });
    const bloc = await screen.findByTestId("angles-a-blanc");
    await waitFor(() => expect(bloc.textContent).toContain("insister sur le temps récupéré"));
    expect(bloc.textContent).toMatch(/2 (angles en test|test angles)/);
    expect(bloc.querySelector("a")?.getAttribute("href")).toBe("/admin/angles");
  });

  it("label qui ne sert pas l'application : ses angles ne sont pas lus, c'est dit", async () => {
    anglesEnBase.mockResolvedValue([angleEnBase("t1", "test", "montrer la fierté", "L1")]);
    rendre(<ContenusABlancCard />);
    const label = (await screen.findByLabelText(/^label$/i)) as HTMLSelectElement;
    await waitFor(() => expect(label.options.length).toBe(3));
    fireEvent.change(label, { target: { value: "L1" } });
    const bloc = await screen.findByTestId("angles-a-blanc");
    await waitFor(() => expect(bloc.textContent).toMatch(/ne sert pas Unswipe|does not serve Unswipe/));
  });

  it("comparatif : la référence puis une colonne par angle en test, chacune avec sa slide pub", async () => {
    lancer.mockImplementation(() =>
      Promise.resolve(
        avecAngles(
          [
            { source: "reference", angleId: null, angle: "insister sur le temps récupéré", deck: deckAngle("insister sur le temps récupéré", "je récupère 2 h par jour avec unswipe") },
            { source: "test", angleId: "t1", angle: "montrer la fierté", deck: deckAngle("montrer la fierté", "fière d'avoir tenu grâce à unswipe") },
            { source: "test", angleId: "t2", angle: "parler du soir", deck: null, erreur: "placement : délai dépassé" },
          ],
          { anglesNonTestes: 1 },
        ),
      ),
    );
    rendre(<ContenusABlancCard />);
    await choisirLabelEtLancer("L2");
    const comparatif = screen.getByTestId("comparatif-angles");
    expect(comparatif.textContent).toMatch(/3 versions/);
    const colonnes = screen.getAllByTestId("angle-teste");
    expect(colonnes.map((c) => c.getAttribute("data-source"))).toEqual(["reference", "test", "test"]);
    expect(colonnes[0].textContent).toContain("insister sur le temps récupéré");
    expect(colonnes[0].querySelector("[data-testid=pub-angle]")?.textContent).toContain("je récupère 2 h par jour");
    expect(colonnes[1].querySelector("[data-testid=pub-angle]")?.textContent).toContain("fière d'avoir tenu");
    expect(colonnes[2].textContent).toContain("délai dépassé");
    expect(comparatif.textContent).toMatch(/1 (angle en test au-delà|test angle beyond)/);
    expect(screen.queryByTestId("angle-utilise")).toBeNull();
  });

  it("Sophia : proposée, placement seul — ni notation ni alerte d'éligibilité", async () => {
    lancer.mockImplementation(() =>
      Promise.resolve({
        ...avecAngles([{ source: "reference", angleId: null, angle: null, deck: { ...DECK, promptCle: "placement_sophia" } }], {
          pertinence: null,
        }),
        application: { id: SOPHIA, slug: "sophia", nom: "Sophia", actif: true, langues: null },
        prompts: {
          pertinence: { cle: "pertinence", present: false },
          placement: { cle: "placement_sophia", present: true },
        },
        scoring: null,
        notation: false,
      }),
    );
    rendre(<ContenusABlancCard />);
    await choisirLabelEtLancer("L1", SOPHIA);
    expect(lancer).toHaveBeenCalledWith(SOPHIA, [C1], null, expect.any(Function));
    const r = screen.getByTestId("resultat-contenus-a-blanc");
    expect(r.textContent).not.toMatch(/pertinence » vide|"pertinence" prompt|Pertinence pour|Relevance for/i);
    expect(r.textContent).not.toMatch(/non éligible|not eligible/i);
    expect(r.textContent).toMatch(/Sophia placement|Placement Sophia/);
    expect(r.textContent).not.toMatch(/2\. (Sophia placement|Placement Sophia)/);
  });

  it("3 au hasard : jamais plus de 3, et le résultat affiche un prompt vide clairement", async () => {
    lancer.mockImplementation(() =>
      Promise.resolve({
        ...RESULTAT,
        prompts: { ...RESULTAT.prompts!, placement: { cle: "placement_unswipe", present: false } },
        contenus: [{ ...RESULTAT.contenus[0], deck: { ...RESULTAT.contenus[0].deck!, statut: "echec", raison: "prompt placement_unswipe manquant", slides: [], slidePub: null } }],
      }),
    );
    rendre(<ContenusABlancCard />);
    const label = (await screen.findByLabelText(/^label$/i)) as HTMLSelectElement;
    await waitFor(() => expect(label.options.length).toBe(3));
    fireEvent.change(label, { target: { value: "L1" } });
    await waitFor(() =>
      expect(screen.getByTestId("liste-slideshows").querySelectorAll("input[type=checkbox]")).toHaveLength(2),
    );
    fireEvent.click(screen.getByRole("button", { name: /3 (au hasard|at random)/i }));
    expect(screen.getByTestId("selection").querySelectorAll("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /nothing is saved|rien n'est enregistré/i }));
    await screen.findByTestId("resultat-contenus-a-blanc");
    expect(screen.getAllByText(/placement_unswipe/).length).toBeGreaterThan(0);
  });
});
