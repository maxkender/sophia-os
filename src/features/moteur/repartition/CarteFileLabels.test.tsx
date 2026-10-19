/**
 * La File des créateurs sur la page Allocation.
 *
 * Ce qui compte ici n'est pas l'éditeur, déjà couvert par
 * `FileLabelsApplicationEditeur.test.tsx`, mais le branchement : la carte lit
 * le réglage, et surtout elle ÉCRIT sur une valeur RELUE en base. Une embauche
 * peut avoir tiré une entrée depuis l'ouverture de l'écran ; écrire
 * l'instantané de la page la ressusciterait.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const lireReglages = vi.fn();
const ecrireReglage = vi.fn();
const listerLabels = vi.fn();
const listerLabelIdsAvecUgc = vi.fn();

vi.mock("../api", () => ({
  lireReglages: () => lireReglages(),
  ecrireReglage: (cle: string, valeur: unknown) => ecrireReglage(cle, valeur),
  listerLabels: () => listerLabels(),
  listerLabelIdsAvecUgc: () => listerLabelIdsAvecUgc(),
}));

const listerApplicationsMulti = vi.fn();
const listerLiensLabels = vi.fn();
vi.mock("../apiMultiApp", () => ({
  listerApplicationsMulti: () => listerApplicationsMulti(),
  listerLiensLabels: () => listerLiensLabels(),
}));

import { CarteFileLabels } from "./CarteFileLabels";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const APPS = [
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "", langues: null, actif: true },
  {
    id: ID_UNSWIPE,
    slug: "unswipe",
    nom: "Unswipe",
    created_at: "",
    langues: ["fr", "de"],
    actif: true,
  },
];

/** `mentalmaxxing` ne sert qu'Unswipe, comme en prod. */
const MENTAL = { id: "l-mental", nom: "mentalmaxxing", slug: "mentalmaxxing", ugc_ai_video: false };
const LIENS = [{ label_id: MENTAL.id, application_id: ID_UNSWIPE }];

function reglages(file: unknown) {
  return { file_labels_comptes: file };
}

const FILE_VIDE = { items: [], par_langue: {}, par_application: {} };

function afficher() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CarteFileLabels />
    </QueryClientProvider>,
  );
}

describe("File des créateurs sur la page Allocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lireReglages.mockResolvedValue(reglages(FILE_VIDE));
    ecrireReglage.mockResolvedValue(undefined);
    listerLabels.mockResolvedValue([MENTAL]);
    listerLabelIdsAvecUgc.mockResolvedValue([]);
    listerApplicationsMulti.mockResolvedValue(APPS);
    listerLiensLabels.mockResolvedValue(LIENS);
  });

  it("la carte s'affiche avec son titre et l'éditeur", async () => {
    afficher();
    await screen.findByText(/File des créateurs|Creator queue/);
    // Le sélecteur d'application de l'éditeur : la preuve qu'il est monté.
    await waitFor(() => expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0));
  });

  it("une entrée ajoutée est écrite sur une valeur RELUE, pas sur l'instantané", async () => {
    afficher();
    await screen.findByText(/File des créateurs|Creator queue/);
    const selApp = await screen.findByLabelText(/^(Application|App)$/);

    // mentalmaxxing ne sert qu'Unswipe : c'est sa tranche qu'on amorce, et
    // c'est exactement le geste qui permet de tester un label neuf.
    fireEvent.change(selApp, { target: { value: "unswipe" } });
    const selAjout = screen.getByLabelText(/^(Ajouter un label|Add a label)$/);
    await waitFor(() =>
      expect(
        within(selAjout).getAllByRole("option").map((o) => (o as HTMLOptionElement).value),
      ).toContain(MENTAL.id),
    );

    // Entre-temps, une embauche a changé la File en base. La carte ne doit pas
    // écraser ça avec ce qu'elle avait affiché.
    const fraisEnBase = {
      items: [],
      par_langue: {},
      par_application: { sophia: { items: [{ label_id: "l-autre", ugc: false }], par_langue: {} } },
    };
    lireReglages.mockResolvedValue(reglages(fraisEnBase));

    fireEvent.change(selAjout, { target: { value: MENTAL.id } });
    fireEvent.click(screen.getByRole("button", { name: /^(Ajouter|Add)$/ }));

    await waitFor(() => expect(ecrireReglage).toHaveBeenCalled());
    const [cle, valeur] = ecrireReglage.mock.calls.at(-1)!;
    expect(cle).toBe("file_labels_comptes");
    const ecrit = valeur as typeof fraisEnBase & {
      par_application: Record<string, { items: Array<{ label_id: string }> }>;
    };
    // L'entrée arrivée entre-temps est TOUJOURS là : on est parti de la
    // relecture, pas de ce que la carte affichait.
    expect(ecrit.par_application.sophia.items.some((i) => i.label_id === "l-autre")).toBe(true);
    // Et la nouvelle entrée est bien dans la tranche d'Unswipe.
    expect(ecrit.par_application.unswipe.items.some((i) => i.label_id === MENTAL.id)).toBe(true);
  });

  it("la carte dit que chaque modification est enregistrée tout de suite", async () => {
    // Il n'y a pas de bouton Enregistrer : si la carte ne le disait pas, on
    // croirait avoir perdu son ajout en quittant l'écran.
    afficher();
    await screen.findByText(/File des créateurs|Creator queue/);
    expect(screen.getByText(/Enregistré immédiatement|Saved immediately/)).toBeTruthy();
  });
});
