import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const SOPHIA = "00000000-0000-4000-8000-000000000001";

const lister = vi.fn();
const activer = vi.fn();
const creer = vi.fn();
const modifier = vi.fn();
const enTest = vi.fn();
const supprimer = vi.fn();

vi.mock("@/features/moteur/apiAngles", () => ({
  listerAnglesPlacement: () => lister(),
  activerAnglePlacement: (...a: unknown[]) => activer(...a),
  creerAnglePlacement: (...a: unknown[]) => creer(...a),
  modifierTexteAngle: (...a: unknown[]) => modifier(...a),
  passerAngleEnTest: (...a: unknown[]) => enTest(...a),
  supprimerAnglePlacement: (...a: unknown[]) => supprimer(...a),
}));

vi.mock("@/features/moteur/apiMultiApp", () => ({
  listerLiensLabels: () =>
    Promise.resolve([
      { label_id: "w", application_id: UNSWIPE },
      { label_id: "w", application_id: SOPHIA },
      { label_id: "b", application_id: UNSWIPE },
      { label_id: "s", application_id: SOPHIA },
    ]),
}));

vi.mock("@/features/moteur/api", () => ({
  listerLabels: () =>
    Promise.resolve([
      { id: "w", nom: "weird_alpha", slug: "weird-alpha" },
      { id: "b", nom: "beau_smart_girl", slug: "beau-smart-girl" },
      { id: "s", nom: "smart_girl", slug: "smart-girl" },
    ]),
}));

vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({
    applications: [],
    application: { id: UNSWIPE, slug: "unswipe", nom: "Unswipe" },
    applicationId: UNSWIPE,
    slug: "unswipe",
    setSlug: () => undefined,
    isPending: false,
  }),
}));

import { AdminAnglesPage } from "./AdminAnglesPage";

const ligne = (id: string, label_id: string, statut: "actif" | "test", texte: string, minute: number) => ({
  id,
  label_id,
  application_id: UNSWIPE,
  texte,
  statut,
  created_at: `2026-10-14T08:${String(minute).padStart(2, "0")}:00Z`,
  updated_at: `2026-10-14T08:${String(minute).padStart(2, "0")}:00Z`,
});

const ANGLES = [
  ligne("a1", "w", "actif", "insister sur le temps récupéré", 1),
  ligne("t1", "w", "test", "montrer la fierté", 2),
  ligne("t2", "w", "test", "parler du soir", 3),
  ligne("x1", "s", "test", "label qui ne sert plus", 4),
];

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminAnglesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function carte(nom: string) {
  await waitFor(() => expect(document.querySelector(`[data-label="${nom}"]`)).not.toBeNull());
  return document.querySelector(`[data-label="${nom}"]`) as HTMLElement;
}

describe("AdminAnglesPage", () => {
  beforeEach(() => {
    for (const f of [lister, activer, creer, modifier, enTest, supprimer]) f.mockReset();
    lister.mockResolvedValue(ANGLES);
    for (const f of [activer, creer, modifier, enTest, supprimer]) f.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("une carte par label qui sert l'application, l'actif puis les tests, et le label qui ne sert plus en dernier", async () => {
    rendre();
    const cartes = await waitFor(() => {
      const c = screen.getAllByTestId("carte-angles");
      expect(c).toHaveLength(3);
      return c;
    });
    expect(cartes.map((c) => c.getAttribute("data-label"))).toEqual(["beau_smart_girl", "weird_alpha", "smart_girl"]);
    const w = await carte("weird_alpha");
    expect(within(w).getAllByTestId("angle").map((a) => a.getAttribute("data-statut"))).toEqual(["actif", "test", "test"]);
    expect(w.textContent).toContain("insister sur le temps récupéré");
    expect(within(await carte("smart_girl")).getByText(/(ne sert plus|no longer serves) Unswipe/i)).toBeInTheDocument();
    expect(within(await carte("beau_smart_girl")).queryAllByTestId("angle")).toHaveLength(0);
  });

  it("activer un angle en test, repasser l'actif en test", async () => {
    rendre();
    const w = await carte("weird_alpha");
    const [actif, test1] = within(w).getAllByTestId("angle");
    fireEvent.click(within(test1).getByRole("button", { name: /^(activer|activate)$/i }));
    await waitFor(() => expect(activer).toHaveBeenCalledWith("t1"));
    fireEvent.click(within(actif).getByRole("button", { name: /passer en test|back to test/i }));
    await waitFor(() => expect(enTest).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(lister.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("ajouter un angle en test ou directement actif", async () => {
    rendre();
    const b = await carte("beau_smart_girl");
    const saisie = within(b).getByRole("textbox", { name: /nouvel angle|new angle/i });
    const boutonTest = within(b).getByRole("button", { name: /ajouter en test|add in test/i });
    expect(boutonTest).toBeDisabled();
    fireEvent.change(saisie, { target: { value: "  parler de discipline  " } });
    fireEvent.click(boutonTest);
    await waitFor(() => expect(creer).toHaveBeenCalledWith("b", UNSWIPE, "  parler de discipline  ", "test"));
    await waitFor(() => expect((saisie as HTMLTextAreaElement).value).toBe(""));
    fireEvent.change(saisie, { target: { value: "autre" } });
    fireEvent.click(within(b).getByRole("button", { name: /ajouter actif|add as active/i }));
    await waitFor(() => expect(creer).toHaveBeenCalledWith("b", UNSWIPE, "autre", "actif"));
  });

  it("modifier le texte d'un angle", async () => {
    rendre();
    const w = await carte("weird_alpha");
    const test1 = within(w).getAllByTestId("angle")[1];
    fireEvent.click(within(test1).getByRole("button", { name: /^(modifier|edit)$/i }));
    const zone = within(test1).getByRole("textbox");
    const enregistrer = within(test1).getByRole("button", { name: /enregistrer|save/i });
    expect(enregistrer).toBeDisabled();
    fireEvent.change(zone, { target: { value: "montrer la fierté d'avoir tenu" } });
    fireEvent.click(enregistrer);
    await waitFor(() => expect(modifier).toHaveBeenCalledWith("t1", "montrer la fierté d'avoir tenu"));
  });

  it("supprimer demande confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    rendre();
    const w = await carte("weird_alpha");
    const test2 = within(w).getAllByTestId("angle")[2];
    fireEvent.click(within(test2).getByRole("button", { name: /supprimer|delete/i }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(supprimer).not.toHaveBeenCalled();
    fireEvent.click(within(test2).getByRole("button", { name: /supprimer|delete/i }));
    await waitFor(() => expect(supprimer).toHaveBeenCalledWith("t2"));
  });

  it("une erreur d'action reste sur la ligne, la page tient", async () => {
    activer.mockRejectedValueOnce(new Error("refus RLS"));
    rendre();
    const w = await carte("weird_alpha");
    const test1 = within(w).getAllByTestId("angle")[1];
    fireEvent.click(within(test1).getByRole("button", { name: /^(activer|activate)$/i }));
    expect(await within(test1).findByRole("alert")).toHaveTextContent("refus RLS");
  });

  it("lecture des angles en panne : message, pas de carte", async () => {
    lister.mockRejectedValue(new Error("table absente"));
    rendre();
    expect(await screen.findByRole("alert")).toHaveTextContent("table absente");
    expect(screen.queryAllByTestId("carte-angles")).toHaveLength(0);
  });
});
