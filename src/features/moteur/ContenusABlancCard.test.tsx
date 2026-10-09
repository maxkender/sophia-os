import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import type { ContenusABlancResultat } from "./contenusABlanc";

const lancer = vi.fn();
const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const C1 = "c0000000-0000-4000-8000-000000000001";

vi.mock("@/features/moteur/api", () => ({
  listerApplications: () =>
    Promise.resolve([
      { id: "00000000-0000-4000-8000-000000000001", slug: "sophia", nom: "Sophia", created_at: "2026-01-01" },
      { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "2026-09-01" },
    ]),
  listerLabels: () => Promise.resolve([{ id: "L1", nom: "alpha_male" }, { id: "L2", nom: "smart_girl" }]),
  listerLabelIdsApplication: () => Promise.resolve(["L2"]),
  listerSlideshowsLabelABlanc: () =>
    Promise.resolve([
      { id: C1, titre: "Moins d'écrans", langue_source: "fr", vues_source: 120000, created_at: "2026-10-01" },
      { id: "c2", titre: "Crêpes", langue_source: "fr", vues_source: 5000, created_at: "2026-09-30" },
    ]),
  lancerContenusABlanc: (...args: unknown[]) => lancer(...args),
}));

import { ContenusABlancCard } from "./ContenusABlancCard";

function rendre(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

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
    deck: {
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
      hashtags: "#ecrans",
      appelsIA: { autorises: 1, bloques: 0 },
    },
    dureeMs: 9000,
  }],
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

describe("ContenusABlancCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    lancer.mockReset();
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
    expect(screen.queryByRole("option", { name: "Sophia" })).toBeNull();

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
    expect(screen.getByText("Évité · UPSERT contenu_pertinences (1)")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText(/71\.2/)).toBeInTheDocument();
    expect(screen.getByText(/(Tier d'entrée|Entry tier) A/)).toBeInTheDocument();
    expect(screen.getByText(/(slide|Slide) 2/)).toBeInTheDocument();
    const pub = document.querySelector("[data-pub=true]");
    expect(pub?.textContent).toContain("unswipe");
    expect(screen.getByText("contenu_langue_decks")).toBeInTheDocument();
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
