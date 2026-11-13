import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lireCatalogue: vi.fn(),
  lireCatalogueAutres: vi.fn(),
  lireATrier: vi.fn(),
  trancher: vi.fn(),
  enregistrerAutre: vi.fn(),
  lireDocuments: vi.fn(),
  enregistrerDocument: vi.fn(),
  lireTests: vi.fn(),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { type EntreeAutre, questionSeule, reponseSeule } from "./api";
import { CatalogueAutres, ListeATrier } from "./CatalogueComplet";
import { Documents } from "./Documents";

function rendu(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
}

const autre = (x: Partial<EntreeAutre>): EntreeAutre => ({
  source: "ctx", id: "x1", question: "Hi what to answer here?", reponse: "Question : Hi what to answer here?\n\nRéponse : Do not answer",
  categorie: null, portee: "tous", actif: true, audience: "poster", situation: null, maj_at: null, ...x,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.lireCatalogue.mockResolvedValue([{ id: "ro1", question: "DMs and comments", formulations: [], reponse: "No need to reply.", action: null, niveau: "bot",
    portee: "tous", categorie: null, actif: true, valide_at: "2026-11-12", ordre: 1, maj_at: "2026-11-12" }]);
  api.lireCatalogueAutres.mockResolvedValue([
    autre({}),
    autre({ source: "faq", id: "f1", question: "When do I start?", reponse: "You start on Monday {lundi_debut}.", situation: "Ready, waiting for Monday", portee: "upwork" }),
  ]);
  api.lireATrier.mockResolvedValue([{ id: "t1", sujet: "Messages privés", type: "contradiction", raison: "Deux réponses différentes.",
    elements: [{ source: "ro", id: "ro1" }, { source: "ctx", id: "x1" }], statut: "a_trier", garder: null, tranche_at: null }]);
  api.trancher.mockResolvedValue(undefined);
  api.enregistrerAutre.mockResolvedValue(undefined);
});

describe("0680 : le bot FAQ dans Support", () => {
  it("lit la question complète et la réponse seule d'une ligne du bot FAQ", () => {
    expect(questionSeule("Hi Team! I have a qu", "Question : Hi Team! I have a question about the text?\n\nRéponse : Keep it readable.")).toBe("Hi Team! I have a question about the text?");
    expect(questionSeule("Titre", "Juste un texte")).toBe("Titre");
    expect(reponseSeule("Question : x\n\nRéponse : Do not answer")).toBe("Do not answer");
  });

  it("À trier : rien n'est éteint sans choix ; décocher un élément l'éteint, le reste est gardé", async () => {
    rendu(<ListeATrier />);
    const carte = await screen.findByTestId("a-trier-carte");
    expect(within(carte).getByText("Contradiction")).toBeTruthy();
    await waitFor(() => expect(within(carte).getByText("Do not answer")).toBeTruthy());
    expect(within(carte).getByRole("button", { name: "Tout garder" })).toBeTruthy();
    fireEvent.click(within(carte).getByLabelText("Garder : Hi what to answer here?"));
    fireEvent.click(within(carte).getByRole("button", { name: "Garder 1, éteindre 1" }));
    await waitFor(() => expect(api.trancher).toHaveBeenCalledWith("t1", ["ro1"]));
  });

  it("les réponses du bot FAQ et la FAQ par situation sont listées et modifiables", async () => {
    rendu(<CatalogueAutres />);
    await screen.findByText("Hi what to answer here?");
    expect(screen.getByText("Ready, waiting for Monday")).toBeTruthy();
    expect(screen.getByText("Upwork")).toBeTruthy();
    fireEvent.click(screen.getByText("Hi what to answer here?"));
    fireEvent.change(screen.getByLabelText("Réponse"), { target: { value: "Don't reply." } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.enregistrerAutre).toHaveBeenCalledWith(expect.objectContaining({
      source: "ctx", id: "x1", reponse: "Question : Hi what to answer here?\n\nRéponse : Don't reply.", actif: true,
    })));
  });

  it("Documents : on lit, on ajoute ; les documents des HM sont cachés par défaut", async () => {
    api.lireDocuments.mockResolvedValue([
      { source: "support", id: "d1", titre: "Comment fonctionne Vik Studios", contenu: "Deux plateformes, jamais mélangées", audience: "poster", actif: true, maj_at: null },
      { source: "notion", id: "n1", titre: "Hiring Manager Guide › Offers", contenu: "x", audience: "hm", actif: true, maj_at: null },
    ]);
    api.enregistrerDocument.mockResolvedValue("d2");
    rendu(<Documents />);
    fireEvent.click(await screen.findByRole("button", { name: "Comment fonctionne Vik Studios" }));
    expect(screen.getByText("Deux plateformes, jamais mélangées")).toBeTruthy();
    expect(screen.queryByText("Hiring Manager Guide › Offers")).toBeNull();
    fireEvent.click(screen.getByTestId("document-ajouter"));
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Nouveau" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.enregistrerDocument).toHaveBeenCalledWith(expect.objectContaining({ source: "support", id: null, titre: "Nouveau" })));
  });
});
