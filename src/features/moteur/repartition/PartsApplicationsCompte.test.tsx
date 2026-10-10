import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const listerApplicationsMulti = vi.fn();
const listerLiensLabels = vi.fn();
const majPartsApplicationsCompte = vi.fn();
vi.mock("../apiMultiApp", () => ({
  listerApplicationsMulti: () => listerApplicationsMulti(),
  listerLiensLabels: () => listerLiensLabels(),
  majPartsApplicationsCompte: (...args: unknown[]) => majPartsApplicationsCompte(...args),
}));

import type { CompteAvecDetails, Label } from "../types";
import { PartsApplicationsCompte } from "./PartsApplicationsCompte";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const APPS = [
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "", langues: null, actif: true },
  { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "", langues: ["fr"], actif: true },
];
const CLEAN = { id: "l-clean", slug: "clean-girl", nom: "Clean Girl" } as Label;
const CINEMA = { id: "l-cinema", slug: "cinema", nom: "Cinéma" } as Label;
const LIENS_PARTAGES = [
  { label_id: CLEAN.id, application_id: ID_SOPHIA },
  { label_id: CLEAN.id, application_id: ID_UNSWIPE },
];
/** Detox ne sert QU'Unswipe : un compte qui n'a que lui est « 100 % Unswipe ». */
const DETOX = { id: "l-detox", slug: "detox", nom: "Detox" } as Label;
const LIENS_AVEC_DETOX = [...LIENS_PARTAGES, { label_id: DETOX.id, application_id: ID_UNSWIPE }];

function compte(patch: Partial<CompteAvecDetails> = {}): CompteAvecDetails {
  return {
    id: "c1",
    langue: "fr",
    ugc_ai: false,
    ugc_ai_video: false,
    parts_applications: null,
    ...patch,
  } as CompteAvecDetails;
}

function rendre(c: CompteAvecDetails, labels: Label[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PartsApplicationsCompte compte={c} labels={labels} />
    </QueryClientProvider>,
  );
}

describe("PartsApplicationsCompte", () => {
  beforeEach(() => {
    listerApplicationsMulti.mockReset();
    listerApplicationsMulti.mockResolvedValue(APPS);
    listerLiensLabels.mockReset();
    listerLiensLabels.mockResolvedValue(LIENS_PARTAGES);
    majPartsApplicationsCompte.mockReset();
    majPartsApplicationsCompte.mockResolvedValue(undefined);
  });

  it("n'affiche rien tant que les labels ne servent que Sophia", async () => {
    const { container } = rendre(compte(), [CINEMA]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(listerLiensLabels).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("enregistre Sophia = 100 − Unswipe, par pas de 10", async () => {
    rendre(compte(), [CLEAN]);
    const curseur = await screen.findByLabelText("Unswipe");
    fireEvent.change(curseur, { target: { value: "30" } });
    expect(screen.getByText("70 %")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer la répartition|Save split/ }));
    await waitFor(() =>
      expect(majPartsApplicationsCompte).toHaveBeenCalledWith("c1", { sophia: 70, unswipe: 30 }),
    );
  });

  it("réinitialise à 100 % Sophia (null)", async () => {
    rendre(compte({ parts_applications: { sophia: 70, unswipe: 30 } }), [CLEAN]);
    fireEvent.click(await screen.findByRole("button", { name: /Réinitialiser|Reset/ }));
    await waitFor(() => expect(majPartsApplicationsCompte).toHaveBeenCalledWith("c1", null));
  });

  it("prévient sans bloquer : langue non ciblée, compte UGC", async () => {
    rendre(compte({ langue: "de", ugc_ai: true, parts_applications: { sophia: 70, unswipe: 30 } }), [CLEAN]);
    expect(await screen.findByText(/Compte UGC|UGC account/)).toBeInTheDocument();
    expect(screen.getByText(/ne cible pas la langue|does not target this account's language/)).toBeInTheDocument();
    // Sophia servie : la part exclue lui revient, et le texte le dit (inchangé).
    expect(screen.getByText(/revient à Sophia|goes back to Sophia/)).toHaveClass("text-warning");
    expect(screen.queryByText(/ne publiera rien|will publish nothing/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Unswipe")).not.toBeDisabled();
  });

  it("signale une répartition qui n'a plus d'objet", async () => {
    rendre(compte({ parts_applications: { sophia: 70, unswipe: 30 } }), [CINEMA]);
    expect(
      await screen.findByText(/labels de ce compte ne servent plus|labels no longer serve/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réinitialiser|Reset/ })).toBeInTheDocument();
  });

  it("compte 100 % Unswipe servable : visible, sans curseur ni ligne Sophia", async () => {
    listerLiensLabels.mockResolvedValue(LIENS_AVEC_DETOX);
    rendre(compte(), [DETOX]);
    expect(await screen.findByText(/Unswipe 100 %/)).toBeInTheDocument();
    expect(screen.getByText(/ne sert Sophia|serves Sophia/)).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByText("Sophia")).not.toBeInTheDocument();
    expect(screen.queryByText(/prend le reste|takes the rest/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enregistrer la répartition|Save split/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/ne publiera rien|will publish nothing/)).not.toBeInTheDocument();
  });

  it("compte 100 % Unswipe, Unswipe éteinte : avertissement rouge, sans « revient à Sophia »", async () => {
    listerLiensLabels.mockResolvedValue(LIENS_AVEC_DETOX);
    listerApplicationsMulti.mockResolvedValue([APPS[0], { ...APPS[1], actif: false }]);
    rendre(compte(), [DETOX]);
    const bloque = await screen.findByText(/ne publiera rien|will publish nothing/);
    expect(bloque).toHaveClass("text-destructive");
    const cause = screen.getByText(/Unswipe est désactivée|Unswipe is switched off/);
    expect(cause).toHaveClass("text-destructive");
    expect(screen.queryByText(/revient à Sophia|goes back to Sophia/)).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("compte 100 % Unswipe hors langue ou UGC : la cause est dite", async () => {
    listerLiensLabels.mockResolvedValue(LIENS_AVEC_DETOX);
    const { unmount } = rendre(compte({ langue: "de" }), [DETOX]);
    expect(await screen.findByText(/ne publiera rien|will publish nothing/)).toBeInTheDocument();
    expect(screen.getByText(/ne cible pas la langue|does not target this account's language/)).toBeInTheDocument();
    expect(screen.queryByText(/revient à Sophia|goes back to Sophia/)).not.toBeInTheDocument();
    unmount();

    rendre(compte({ ugc_ai: true }), [DETOX]);
    expect(await screen.findByText(/ne publiera rien|will publish nothing/)).toBeInTheDocument();
    expect(screen.getByText(/Compte UGC|UGC account/)).toBeInTheDocument();
    expect(screen.queryByText(/reste 100 % Sophia|stays 100% Sophia/)).not.toBeInTheDocument();
  });

  it("compte 100 % Unswipe bloqué avec une répartition Sophia restée en base : « efface-la », jamais « revient aux autres »", async () => {
    listerLiensLabels.mockResolvedValue(LIENS_AVEC_DETOX);
    listerApplicationsMulti.mockResolvedValue([APPS[0], { ...APPS[1], actif: false }]);
    rendre(compte({ parts_applications: { sophia: 70, unswipe: 30 } }), [DETOX]);
    expect(await screen.findByText(/ne publiera rien|will publish nothing/)).toBeInTheDocument();
    expect(screen.getByText(/encore une part à Sophia|still gives a share to Sophia/)).toBeInTheDocument();
    expect(screen.queryByText(/revient aux autres|goes to the others/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Effacer la répartition|Clear the saved split/ })).toBeInTheDocument();
  });

  it("Unswipe désactivée ET sans langue (état de 0258) : les deux causes, pas seulement « désactivée »", async () => {
    listerLiensLabels.mockResolvedValue(LIENS_AVEC_DETOX);
    listerApplicationsMulti.mockResolvedValue([APPS[0], { ...APPS[1], actif: false, langues: [] }]);
    rendre(compte(), [DETOX]);
    expect(await screen.findByText(/Unswipe est désactivée|Unswipe is switched off/)).toBeInTheDocument();
    expect(screen.getByText(/ne cible pas la langue|does not target this account's language/)).toBeInTheDocument();
  });

  it("deux niveaux — label partagé réglé 100 % Unswipe : pas de repli Sophia annoncé", async () => {
    rendre(compte({ parts_applications: { unswipe: 100 } }), [CLEAN]);
    expect(await screen.findByText(/Unswipe 100 %/)).toBeInTheDocument();
    expect(screen.getByText(/donne 0 % à Sophia|gives Sophia 0%/)).toBeInTheDocument();
    expect(screen.getByText(/plus de repli sur Sophia|no more fallback to Sophia/)).toBeInTheDocument();
    expect(screen.queryByText(/prend le reste|takes the rest/)).not.toBeInTheDocument();
    expect(screen.queryByText(/revient à Sophia|goes back to Sophia/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ne publiera rien|will publish nothing/)).not.toBeInTheDocument();
  });

  it("deux niveaux — label partagé réglé 100 % Unswipe, Unswipe éteinte : rouge, sans « revient à Sophia »", async () => {
    listerApplicationsMulti.mockResolvedValue([APPS[0], { ...APPS[1], actif: false }]);
    rendre(compte({ parts_applications: { unswipe: 100 } }), [CLEAN]);
    const bloque = await screen.findByText(/ne publiera rien|will publish nothing/);
    expect(bloque).toHaveClass("text-destructive");
    expect(screen.getByText(/Unswipe est désactivée|Unswipe is switched off/)).toHaveClass("text-destructive");
    expect(screen.queryByText(/revient à Sophia|goes back to Sophia/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réinitialiser|Reset/ })).toBeInTheDocument();
  });

  it("deux niveaux — curseur Unswipe à 100 : prévient qu'il n'y aura plus de repli Sophia", async () => {
    rendre(compte(), [CLEAN]);
    const curseur = await screen.findByLabelText("Unswipe");
    expect(screen.queryByText(/plus de repli sur Sophia|no more fallback to Sophia/)).not.toBeInTheDocument();
    fireEvent.change(curseur, { target: { value: "100" } });
    expect(screen.getByText(/plus de repli sur Sophia|no more fallback to Sophia/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer la répartition|Save split/ }));
    await waitFor(() => expect(majPartsApplicationsCompte).toHaveBeenCalledWith("c1", { unswipe: 100 }));
  });

  it("deux niveaux — labels Sophia seuls avec une répartition enregistrée : la carte reste visible", async () => {
    const { unmount } = rendre(compte({ parts_applications: { sophia: 100 } }), [CINEMA]);
    expect(await screen.findByText(/Sophia 100 %/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réinitialiser|Reset/ })).toBeInTheDocument();
    expect(screen.queryByText(/ne publiera rien|will publish nothing/)).not.toBeInTheDocument();
    unmount();

    rendre(compte({ parts_applications: { unswipe: 100 } }), [CINEMA]);
    expect(await screen.findByText(/ne publiera rien|will publish nothing/)).toHaveClass("text-destructive");
    expect(screen.queryByText(/revient aux autres|goes to the others/)).not.toBeInTheDocument();
  });

  it("avant 0256 : l'erreur reste dans le bloc", async () => {
    listerLiensLabels.mockRejectedValue(new Error('relation "label_applications" does not exist'));
    rendre(compte(), [CLEAN]);
    expect(await screen.findByText(/label_applications/)).toBeInTheDocument();
  });
});
