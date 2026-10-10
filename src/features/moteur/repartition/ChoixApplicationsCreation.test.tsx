/**
 * Choix label + répartition dans « Ajouter un compte » : invisible et sans
 * effet pour un recruteur (même corps, aucune lecture de plus), deux niveaux
 * pour l'admin / le Head of Ops, envoi bloqué tant que le choix est invalide.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import { en } from "@/locales/en";
import { fr } from "@/locales/fr";

const ajouterCompte = vi.fn();
const listerLabels = vi.fn();
vi.mock("../api", () => ({
  ajouterCompte: (...args: unknown[]) => ajouterCompte(...args),
  listerLabels: () => listerLabels(),
  lireIdentifiantsCm: vi.fn(),
  majIdentifiantsCm: vi.fn(),
}));
const listerApplicationsMulti = vi.fn();
const listerLiensLabels = vi.fn();
vi.mock("../apiMultiApp", () => ({
  listerApplicationsMulti: () => listerApplicationsMulti(),
  listerLiensLabels: () => listerLiensLabels(),
}));

import { FormulaireAjouterCompte } from "../FormulaireAjouterCompte";
import { CODES_ERREUR_CHOIX_COMPTE } from "./choixCreation";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const APPS = [
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "", langues: null, actif: true },
  { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "", langues: ["fr"], actif: true },
];
const CLEAN = { id: "l-clean", slug: "clean-girl", nom: "Clean Girl", ugc_ai_video: false };
const DETOX = { id: "l-detox", slug: "detox", nom: "Detox", ugc_ai_video: false };
const LIENS = [
  { label_id: CLEAN.id, application_id: ID_SOPHIA },
  { label_id: CLEAN.id, application_id: ID_UNSWIPE },
  { label_id: DETOX.id, application_id: ID_UNSWIPE },
];

function rendre(choixApplications?: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FormulaireAjouterCompte
        posterId="p1"
        languesProposees={["fr", "en"]}
        choixApplications={choixApplications}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un compte|Add an account/ }));
}

const bouton = () => screen.getByRole("button", { name: /^(Créer le compte|Create account)$/ });
const selectRepartition = () => screen.getByLabelText(/Répartition des posts|Post split/);

describe("FormulaireAjouterCompte × choix des applications", () => {
  beforeEach(() => {
    ajouterCompte.mockReset();
    ajouterCompte.mockResolvedValue({ ok: true, compteId: "c-new" });
    listerLabels.mockReset();
    listerLabels.mockResolvedValue([CLEAN, DETOX]);
    listerApplicationsMulti.mockReset();
    listerApplicationsMulti.mockResolvedValue(APPS);
    listerLiensLabels.mockReset();
    listerLiensLabels.mockResolvedValue(LIENS);
  });

  it("recruteur : aucun bloc, aucune lecture de plus, corps d'avant à l'identique", async () => {
    rendre();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(screen.queryByTestId("choix-applications-creation")).toBeNull();
    expect(listerApplicationsMulti).not.toHaveBeenCalled();
    expect(listerLiensLabels).not.toHaveBeenCalled();
    expect(listerLabels).not.toHaveBeenCalled();

    fireEvent.click(bouton());
    await waitFor(() => expect(ajouterCompte).toHaveBeenCalledTimes(1));
    expect(ajouterCompte.mock.calls[0]![0]).toStrictEqual({
      posterId: "p1",
      type_compte: "perso",
      langue: "fr",
      posts_par_jour: 2,
      handle_tiktok: "",
    });
  });

  it("admin sans rien choisir : même corps qu'un recruteur", async () => {
    rendre(true);
    await screen.findByRole("button", { name: /Clean Girl/ });
    fireEvent.click(bouton());
    await waitFor(() => expect(ajouterCompte).toHaveBeenCalledTimes(1));
    expect(ajouterCompte.mock.calls[0]![0]).toStrictEqual({
      posterId: "p1",
      type_compte: "perso",
      langue: "fr",
      posts_par_jour: 2,
      handle_tiktok: "",
    });
  });

  it("deux niveaux : label Sophia+Unswipe réglé 100 % Unswipe → label_id + { unswipe: 100 }", async () => {
    rendre(true);
    const clean = await screen.findByRole("button", { name: /Clean Girl/ });
    // Les applications servies sont affichées à côté du label.
    await waitFor(() => expect(clean).toHaveTextContent("Sophia, Unswipe"));
    fireEvent.click(clean);
    expect(clean).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(selectRepartition(), { target: { value: "app:unswipe" } });
    expect(screen.getByText(/ne publiera que pour Unswipe|only publish for Unswipe/)).toBeInTheDocument();

    fireEvent.click(bouton());
    await waitFor(() => expect(ajouterCompte).toHaveBeenCalledTimes(1));
    expect(ajouterCompte.mock.calls[0]![0]).toMatchObject({
      posterId: "p1",
      labelId: CLEAN.id,
      partsApplications: { unswipe: 100 },
    });
  });

  it("personnalisée : somme ≠ 100 bloque l'envoi, 70/30 passe", async () => {
    rendre(true);
    await screen.findByRole("button", { name: /Clean Girl/ });
    await waitFor(() => expect(screen.getByRole("option", { name: /Personnalisée|Custom/ })).toBeInTheDocument());
    fireEvent.change(selectRepartition(), { target: { value: "perso" } });
    const sophia = screen.getByLabelText("Sophia");
    const unswipe = screen.getByLabelText("Unswipe");
    expect(sophia).toHaveValue(100);
    fireEvent.change(unswipe, { target: { value: "30" } });
    expect(screen.getByText(/exactement 100 %.*130 %|exactly 100%.*130%/)).toBeInTheDocument();
    expect(bouton()).toBeDisabled();

    fireEvent.change(sophia, { target: { value: "70" } });
    expect(bouton()).toBeEnabled();
    // Label Automatique : manage-users choisira un label qui sert les deux.
    expect(screen.getByText(/sera choisi automatiquement|will be picked automatically/)).toBeInTheDocument();
    fireEvent.click(bouton());
    await waitFor(() => expect(ajouterCompte).toHaveBeenCalledTimes(1));
    const corps = ajouterCompte.mock.calls[0]![0] as Record<string, unknown>;
    expect(corps.partsApplications).toEqual({ sophia: 70, unswipe: 30 });
    expect("labelId" in corps).toBe(false);
  });

  it("label qui ne sert pas l'application choisie : message et envoi bloqué", async () => {
    rendre(true);
    fireEvent.click(await screen.findByRole("button", { name: /Detox/ }));
    await waitFor(() => expect(screen.getByRole("option", { name: /100 % Sophia|100% Sophia/ })).toBeInTheDocument());
    // Par défaut, Detox (Unswipe seul) donne 100 % Unswipe.
    expect(screen.getByRole("option", { name: /Par défaut — 100 % Unswipe|Default — 100% Unswipe/ })).toBeInTheDocument();
    fireEvent.change(selectRepartition(), { target: { value: "app:sophia" } });
    expect(screen.getByText(/« Detox » ne sert pas Sophia|“Detox” does not serve Sophia/)).toBeInTheDocument();
    expect(bouton()).toBeDisabled();
  });

  it("erreur manage-users du contrat : message lisible", async () => {
    ajouterCompte.mockRejectedValue(new Error("LABEL_INCOMPATIBLE"));
    rendre(true);
    fireEvent.click(await screen.findByRole("button", { name: /Clean Girl/ }));
    fireEvent.click(bouton());
    expect(
      await screen.findByText(/Ce label ne sert pas toutes|This label does not serve every/),
    ).toBeInTheDocument();
  });
});

describe("textes du choix", () => {
  it("fr et en ont les mêmes clés, dont les 5 codes d'erreur", () => {
    const frBloc = fr.translation.choixCompteCreation;
    const enBloc = en.translation.choixCompteCreation;
    expect(Object.keys(enBloc).sort()).toEqual(Object.keys(frBloc).sort());
    for (const code of CODES_ERREUR_CHOIX_COMPTE) {
      expect(frBloc.erreurs[code]).toBeTruthy();
      expect(enBloc.erreurs[code]).toBeTruthy();
    }
  });
});
