/**
 * « Application du compte » dans « Ajouter un compte » : invisible et sans
 * effet quand le choix n'est pas permis ou qu'il n'y a qu'une application
 * active (même corps, aucune lecture de plus) ; Sophia par défaut = corps
 * d'avant ; autre application = { slug: 100 }, jamais de label ; envoi bloqué
 * si aucun label ne sert l'application.
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
const ID_ZEN = "00000000-0000-4000-8000-000000000009";
const APPS = [
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "", langues: null, actif: true },
  { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "", langues: ["fr", "de"], actif: true },
  { id: ID_ZEN, slug: "zen", nom: "Zen", created_at: "", langues: null, actif: false },
];
const SMART = { id: "l-smart", slug: "smart_girl", nom: "Smart Girl", ugc_ai_video: false };
const CLASSIC = { id: "l-classic", slug: "classic-study", nom: "Classic Study", ugc_ai_video: false };
const LIENS = [{ label_id: CLASSIC.id, application_id: ID_UNSWIPE }];

const CORPS_AVANT = {
  posterId: "p1",
  type_compte: "perso",
  langue: "fr",
  posts_par_jour: 2,
  handle_tiktok: "",
};

function rendre(choixApplications?: boolean, langues = ["fr", "en"]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FormulaireAjouterCompte posterId="p1" languesProposees={langues} choixApplications={choixApplications} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un compte|Add an account/ }));
}

const bouton = () => screen.getByRole("button", { name: /^(Créer le compte|Create account)$/ });
const selectApplication = () => screen.getByLabelText(/^(Application du compte|Account app)$/);

describe("FormulaireAjouterCompte × application du compte", () => {
  beforeEach(() => {
    ajouterCompte.mockReset();
    ajouterCompte.mockResolvedValue({ ok: true, compteId: "c-new" });
    listerLabels.mockReset();
    listerLabels.mockResolvedValue([SMART, CLASSIC]);
    listerApplicationsMulti.mockReset();
    listerApplicationsMulti.mockResolvedValue(APPS);
    listerLiensLabels.mockReset();
    listerLiensLabels.mockResolvedValue(LIENS);
  });

  it("choix non permis : aucun bloc, aucune lecture de plus, corps d'avant à l'identique", async () => {
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
    expect(ajouterCompte.mock.calls[0]![0]).toStrictEqual(CORPS_AVANT);
  });

  it("Sophia par défaut, sélectionnée, sans choix de label : corps d'avant à l'octet près", async () => {
    rendre(true);
    await waitFor(() => expect(selectApplication()).toBeInTheDocument());
    expect(selectApplication()).toHaveValue("sophia");
    // Une option par application ACTIVE, rien d'autre.
    const options = screen.getAllByRole("option").filter((o) => o.closest("select") === selectApplication());
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(["sophia", "unswipe"]);
    // Plus de choix de label ni de répartition.
    expect(screen.queryByText(/Label du compte|Account label/)).toBeNull();
    expect(screen.queryByText(/Répartition des posts|Post split/)).toBeNull();
    expect(screen.getByText(/File des créateurs de Sophia|Sophia creators queue/)).toBeInTheDocument();

    fireEvent.click(bouton());
    await waitFor(() => expect(ajouterCompte).toHaveBeenCalledTimes(1));
    expect(ajouterCompte.mock.calls[0]![0]).toStrictEqual(CORPS_AVANT);
  });

  it("Unswipe : partsApplications { unswipe: 100 }, jamais labelId", async () => {
    rendre(true);
    await waitFor(() => expect(screen.getByRole("option", { name: "Unswipe" })).toBeInTheDocument());
    fireEvent.change(selectApplication(), { target: { value: "unswipe" } });
    expect(screen.getByText(/File des créateurs de Unswipe|Unswipe creators queue/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("labels-application")).toHaveTextContent("Classic Study"),
    );
    expect(bouton()).toBeEnabled();

    fireEvent.click(bouton());
    await waitFor(() => expect(ajouterCompte).toHaveBeenCalledTimes(1));
    const corps = ajouterCompte.mock.calls[0]![0] as Record<string, unknown>;
    expect(corps).toStrictEqual({ ...CORPS_AVANT, partsApplications: { unswipe: 100 } });
    expect("labelId" in corps).toBe(false);
  });

  it("aucun label ne sert l'application : message clair et envoi bloqué", async () => {
    listerLiensLabels.mockResolvedValue([]);
    rendre(true);
    await waitFor(() => expect(screen.getByRole("option", { name: "Unswipe" })).toBeInTheDocument());
    fireEvent.change(selectApplication(), { target: { value: "unswipe" } });
    expect(
      await screen.findByText(/Aucun label slideshow ne sert Unswipe.*Pilotage → Labels|No slideshow label serves Unswipe.*Pilotage → Labels/),
    ).toBeInTheDocument();
    expect(bouton()).toBeDisabled();
    // Retour à Sophia : débloqué.
    fireEvent.change(selectApplication(), { target: { value: "sophia" } });
    expect(bouton()).toBeEnabled();
  });

  it("application qui ne cible pas la langue du compte : info, pas de blocage", async () => {
    rendre(true, ["en", "fr"]);
    await waitFor(() => expect(screen.getByRole("option", { name: "Unswipe" })).toBeInTheDocument());
    fireEvent.change(selectApplication(), { target: { value: "unswipe" } });
    expect(await screen.findByText(/Unswipe ne cible pas|Unswipe does not target/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("labels-application")).toBeInTheDocument());
    expect(bouton()).toBeEnabled();
  });

  it("une seule application active : aucun bloc, corps d'avant", async () => {
    listerApplicationsMulti.mockResolvedValue([APPS[0], APPS[2]]);
    rendre(true);
    await waitFor(() => expect(listerApplicationsMulti).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(screen.queryByTestId("choix-applications-creation")).toBeNull();
    fireEvent.click(bouton());
    await waitFor(() => expect(ajouterCompte).toHaveBeenCalledTimes(1));
    expect(ajouterCompte.mock.calls[0]![0]).toStrictEqual(CORPS_AVANT);
  });

  it("erreur manage-users du contrat : message lisible", async () => {
    ajouterCompte.mockRejectedValue(new Error("NO_LABELS_APPLICATION"));
    rendre(true);
    await waitFor(() => expect(screen.getByRole("option", { name: "Unswipe" })).toBeInTheDocument());
    fireEvent.change(selectApplication(), { target: { value: "unswipe" } });
    await waitFor(() => expect(screen.getByTestId("labels-application")).toBeInTheDocument());
    fireEvent.click(bouton());
    expect(
      await screen.findByText(/Aucun label ne sert l’application choisie|No label serves the chosen app/),
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
  it("fr et en ont les mêmes clés de File par application", () => {
    const cles = [
      "fileApp",
      "fileDesc",
      "fileApplication",
      "fileApplicationAide",
      "fileHorsApplication",
      "fileLangueNonCiblee",
      "fileJamaisUgc",
      "fileAucunLabelApplication",
    ] as const;
    const avecApp = new Set(["fileApp", "fileDesc", "fileHorsApplication", "fileJamaisUgc", "fileAucunLabelApplication"]);
    for (const cle of cles) {
      for (const bloc of [fr.translation.warmup, en.translation.warmup]) {
        expect(bloc[cle]).toBeTruthy();
        if (avecApp.has(cle)) expect(bloc[cle]).toContain("{{app}}");
      }
    }
  });
});
