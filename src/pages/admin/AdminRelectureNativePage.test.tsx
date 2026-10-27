import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const MICABO = "00000000-0000-4000-8000-000000000002";

const lireReglage = vi.fn();
const ecrireEspace = vi.fn();
const listerRelecteurs = vi.fn();
const listerToutesReponses = vi.fn();
const ajouterRelecteur = vi.fn();
const majRelecteur = vi.fn();
const supprimerRelecteur = vi.fn();
const listerFiches = vi.fn();
const enregistrerFiche = vi.fn();
const compterVersions = vi.fn();
const lireReponses = vi.fn();

vi.mock("@/features/relectureNative/api", () => ({
  lireReglageRelecture: () => lireReglage(),
  ecrireEspaceOuvert: (...a: unknown[]) => ecrireEspace(...a),
  listerRelecteurs: () => listerRelecteurs(),
  listerToutesReponses: () => listerToutesReponses(),
  ajouterRelecteur: (...a: unknown[]) => ajouterRelecteur(...a),
  majRelecteur: (...a: unknown[]) => majRelecteur(...a),
  supprimerRelecteur: (...a: unknown[]) => supprimerRelecteur(...a),
  listerFichesAppli: () => listerFiches(),
  enregistrerFicheAppli: (...a: unknown[]) => enregistrerFiche(...a),
  compterVersionsFiches: () => compterVersions(),
  lireReponses: (...a: unknown[]) => lireReponses(...a),
}));

vi.mock("@/features/moteur/api", () => ({
  listerPosters: () =>
    Promise.resolve([
      { id: "p1", prenom: "Ayşe", nom: "Yılmaz", email: "a@x.io", role: "poster", is_active: true, langues: [], comptes: [{ langue: "tr" }] },
      { id: "p2", prenom: "Admin", nom: "", email: "ad@x.io", role: "admin", is_active: true, langues: [], comptes: [] },
      { id: "p3", prenom: "Ancien", nom: "", email: "an@x.io", role: "poster", is_active: false, langues: [], comptes: [] },
    ]),
}));

vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({
    applications: [
      { id: SOPHIA, slug: "sophia", nom: "Sophia" },
      { id: MICABO, slug: "micabo", nom: "micabo" },
    ],
  }),
}));

import { AdminRelectureNativePage } from "./AdminRelectureNativePage";

function rendre() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminRelectureNativePage />
    </QueryClientProvider>,
  );
}

describe("AdminRelectureNativePage", () => {
  beforeEach(() => {
    void i18n.changeLanguage("fr");
    vi.clearAllMocks();
    lireReglage.mockResolvedValue({ espace_ouvert: false, production: false });
    ecrireEspace.mockResolvedValue(undefined);
    listerRelecteurs.mockResolvedValue([]);
    listerToutesReponses.mockResolvedValue([]);
    ajouterRelecteur.mockResolvedValue(undefined);
    listerFiches.mockResolvedValue([]);
    compterVersions.mockResolvedValue({});
    enregistrerFiche.mockResolvedValue(undefined);
  });

  it("montre l'espace fermé et la production coupée, et ouvre l'espace", async () => {
    rendre();
    expect(await screen.findByText(/Fermé : les relecteurs désignés/)).toBeInTheDocument();
    expect(screen.getByText("Coupée")).toBeInTheDocument();
    const interrupteur = screen.getByRole("switch", { name: "Espace relecteur" });
    // Grisé tant que l'état n'est pas lu : on ne bascule pas à l'aveugle.
    await waitFor(() => expect(interrupteur.getAttribute("aria-disabled")).not.toBe("true"));
    const bouton = interrupteur.querySelector("input") ?? interrupteur.parentElement?.querySelector("input");
    fireEvent.click(bouton!);
    await waitFor(() => expect(ecrireEspace).toHaveBeenCalledWith(true));
  });

  it("ajoute un posteur actif comme relecteur, dans la langue de son compte", async () => {
    rendre();
    const choix = await screen.findByRole("combobox", { name: "Posteur" });
    await waitFor(() => expect(within(choix).getAllByRole("option")).toHaveLength(2));
    fireEvent.change(choix, { target: { value: "p1" } });
    expect(screen.getByRole("combobox", { name: "Langue" })).toHaveValue("tr");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(ajouterRelecteur).toHaveBeenCalledWith("p1", "tr"));
  });

  it("écrit une fiche appli à partir du modèle et l'enregistre", async () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Fiches appli" }));
    const carte = await screen.findByTestId(`fiche-appli-${MICABO}`);
    fireEvent.click(within(carte).getByRole("button", { name: "Partir du modèle" }));
    const contenu = within(carte).getByLabelText("Fiche complète (Markdown)") as HTMLTextAreaElement;
    expect(contenu.value.startsWith("# micabo")).toBe(true);
    fireEvent.change(within(carte).getByLabelText("Présentation pour les relecteurs"), {
      target: { value: "micabo turns your notes into quizzes." },
    });
    fireEvent.click(within(carte).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(enregistrerFiche).toHaveBeenCalledWith(MICABO, contenu.value, "micabo turns your notes into quizzes."),
    );
  });
});
