import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";

import i18next from "@/locales";

const FAMILLE = "f0000000-0000-4000-8000-000000000001";

// Quatre slideshows, du plus ancien (A) au plus récent (D) ; D n'est dans aucune famille BLEO.
const contenu = (id: string, jour: number) => ({
  id,
  titre: `Contenu ${id.toUpperCase()}`,
  created_at: `2026-10-0${jour}T00:00:00Z`,
  statut: "valide",
  tier: "S",
  tierEtat: null,
  labels: [],
  compte_reference_id: null,
  structure_slides: [],
  ugc_compatible: false,
  nb_posts: 2,
});

const ligneBleo = (id: string, b: Record<string, unknown>) => ({
  id,
  famille_id: FAMILLE,
  generation: 1,
  type_bleo: "declinaison",
  etat_bleo: "juge",
  verdict: "en_attente",
  n_passages: 3,
  vues_max: 20_000,
  vues_moyenne: null,
  r_median: null,
  r_moyen: null,
  valeur_max: null,
  n_langues: 1,
  dernier_passage: null,
  ...b,
});

const LIGNES_BLEO = [
  ligneBleo("a", { verdict: "gagnant", valeur_max: 1.5, vues_moyenne: 12_000, r_moyen: 0.8 }),
  ligneBleo("b", { verdict: "non_gagnant", valeur_max: 0.4, vues_moyenne: 30_000, r_moyen: 2.4 }),
  ligneBleo("c", { etat_bleo: "en_test", valeur_max: 2.25, vues_moyenne: 900, r_moyen: 1.1 }),
];

const listerInfosBleoContenus = vi.fn((ids: readonly string[]) =>
  Promise.resolve(LIGNES_BLEO.filter((l) => ids.includes(l.id))),
);

vi.mock("@/features/moteur/api", async (original) => ({
  ...(await original<typeof import("@/features/moteur/api")>()),
  listerContenus: () => Promise.resolve([contenu("a", 1), contenu("b", 2), contenu("c", 3), contenu("d", 4)]),
  listerSources: () => Promise.resolve([]),
  lireReglages: () => Promise.resolve({}),
  statsSlideshowsParSource: () =>
    Promise.resolve([{ compteReferenceId: null, handle: "", importes: 4, gardes: 4, rejetes: 0, encours: 0 }]),
  listerLabels: () => Promise.resolve([]),
}));

vi.mock("@/features/bleo/api", async (original) => ({
  ...(await original<typeof import("@/features/bleo/api")>()),
  listerInfosBleoContenus: (ids: readonly string[]) => listerInfosBleoContenus(ids),
  lireFamille: () => Promise.resolve({ id: FAMILLE, accroche: "5 habitudes qui changent tout", racine_titre: null }),
  listerValeursFamille: (ids: string[]) =>
    Promise.resolve(
      ids.includes("a")
        ? [
            { contenu_id: "a", langue: "en", forme: 1, n_post: 1, n_accroche: 0, facteur_age: 1, valeur: 0.6, calcule_le: "2026-11-02T03:00:00Z" },
            { contenu_id: "a", langue: "fr", forme: 1.5, n_post: 0, n_accroche: 0, facteur_age: 1, valeur: 1.5, calcule_le: "2026-11-02T03:00:00Z" },
          ]
        : [],
    ),
}));

// Les outils du bas de page lisent leurs propres tables : hors sujet ici.
vi.mock("@/features/moteur/NettoyageStickersLabelCard", () => ({ NettoyageStickersLabelCard: () => null }));

import { BlocBleoContenu } from "@/features/bleo/BlocBleoContenu";

import { AdminSlideshowsPage } from "./AdminSlideshowsPage";

function rendre(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/slideshows"]}>
        <Routes>
          <Route path="/admin/slideshows" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const titresAffiches = () => screen.getAllByText(/^Contenu [A-D]$/).map((el) => el.textContent);

describe("page Slideshows : BLEO à la place du tier", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("fr");
  });

  it("chaque carte montre son verdict (lien vers la famille), son état, sa génération, sa valeur et ses vues ; « — » hors BLEO", async () => {
    rendre(<AdminSlideshowsPage />);
    const lien = await screen.findByRole("link", { name: "Gagnant" });
    expect(lien).toHaveAttribute("href", `/admin/bleo/familles/${FAMILLE}`);
    expect(screen.getByRole("link", { name: "Non gagnant" })).toHaveAttribute("href", `/admin/bleo/familles/${FAMILLE}`);
    expect(screen.getByText("valeur 1,50")).toBeInTheDocument();
    expect(screen.getByText("valeur 2,25")).toBeInTheDocument();
    expect(screen.getByText("12 k vues en moy.")).toBeInTheDocument();
    expect(screen.getAllByText("G1").length).toBe(3);
    expect(screen.getAllByTitle("Pas dans BLEO (rattaché à aucune famille)")).toHaveLength(2);
    // Une seule lecture BLEO, pour les ids chargés seulement.
    expect(listerInfosBleoContenus).toHaveBeenCalledTimes(1);
    expect(listerInfosBleoContenus).toHaveBeenCalledWith(["a", "b", "c", "d"]);
  });

  it("trie par valeur BLEO par défaut ; vues moyennes et r moyen remplacent le tri par tier", async () => {
    rendre(<AdminSlideshowsPage />);
    await screen.findByRole("link", { name: "Gagnant" });
    const tri = screen.getByRole("group", { name: "Tri" });
    expect(within(tri).getByRole("button", { name: "Valeur BLEO" })).toHaveAttribute("aria-pressed", "true");
    expect(within(tri).queryByRole("button", { name: "Tierlist" })).toBeNull();
    expect(titresAffiches()).toEqual(["Contenu C", "Contenu A", "Contenu B", "Contenu D"]);

    fireEvent.click(within(tri).getByRole("button", { name: "Vues moyennes" }));
    expect(titresAffiches()).toEqual(["Contenu B", "Contenu A", "Contenu C", "Contenu D"]);
    fireEvent.click(within(tri).getByRole("button", { name: "r moyen" }));
    expect(titresAffiches()).toEqual(["Contenu B", "Contenu C", "Contenu A", "Contenu D"]);
    fireEvent.click(within(tri).getByRole("button", { name: "Plus récents" }));
    expect(titresAffiches()).toEqual(["Contenu D", "Contenu C", "Contenu B", "Contenu A"]);
  });

  it("filtre par verdict et par état BLEO ; le résumé compte les verdicts et les états affichés", async () => {
    rendre(<AdminSlideshowsPage />);
    await screen.findByRole("link", { name: "Gagnant" });
    const tuile = screen.getByText("Gagnants BLEO").parentElement?.parentElement as HTMLElement;
    expect(within(tuile).getByText("1")).toBeInTheDocument();
    expect(tuile).toHaveTextContent("sur 4 affichés");
    expect(screen.getByText("Hors BLEO")).toBeInTheDocument();
    expect(screen.queryByText("Rangs S et S+")).toBeNull();

    const verdict = screen.getByRole("group", { name: "Verdict BLEO" });
    fireEvent.click(within(verdict).getByRole("button", { name: "Gagnant" }));
    expect(titresAffiches()).toEqual(["Contenu A"]);

    fireEvent.click(within(verdict).getByRole("button", { name: "Tous" }));
    const etat = screen.getByRole("group", { name: "État BLEO" });
    fireEvent.click(within(etat).getByRole("button", { name: "En test" }));
    expect(titresAffiches()).toEqual(["Contenu C"]);
    await waitFor(() => expect(tuile).toHaveTextContent("sur 1 affichés"));
  });
});

describe("détail d'un slideshow : le bloc BLEO", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("fr");
  });

  it("famille (lien), verdict, état, génération, valeur max et valeur par langue, vues et r moyen", async () => {
    rendre(<BlocBleoContenu contenuId="a" />);
    const lien = await screen.findByRole("link", { name: "5 habitudes qui changent tout" });
    expect(lien).toHaveAttribute("href", `/admin/bleo/familles/${FAMILLE}`);
    const bloc = screen.getByTestId("bloc-bleo");
    expect(within(bloc).getByText("Gagnant")).toBeInTheDocument();
    expect(within(bloc).getByText("Jugé")).toBeInTheDocument();
    expect(within(bloc).getByText("G1")).toBeInTheDocument();
    expect(within(bloc).getByText("12 k")).toBeInTheDocument();
    expect(within(bloc).getByText("0,80")).toBeInTheDocument();
    // La valeur max, puis les langues de la meilleure à la moins bonne.
    await within(bloc).findByText("Valeur par langue");
    const langues = within(bloc).getAllByRole("listitem").map((li) => li.textContent);
    expect(langues).toEqual([expect.stringContaining("fr1,50"), expect.stringContaining("en0,60")]);
  });

  it("hors BLEO, il le dit en une phrase", async () => {
    rendre(<BlocBleoContenu contenuId="d" />);
    expect(await screen.findByText("Pas dans BLEO : ce slideshow n'est rattaché à aucune famille.")).toBeInTheDocument();
  });
});
