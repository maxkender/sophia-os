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
  { label_id: CLEAN.id, application_id: ID_SOPHIA, angle: null },
  { label_id: CLEAN.id, application_id: ID_UNSWIPE, angle: null },
];

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
    rendre(compte({ langue: "de", ugc_ai: true, parts_applications: { unswipe: 30 } }), [CLEAN]);
    expect(await screen.findByText(/Compte UGC|UGC account/)).toBeInTheDocument();
    expect(screen.getByText(/ne cible pas la langue|does not target this account's language/)).toBeInTheDocument();
    expect(screen.getByLabelText("Unswipe")).not.toBeDisabled();
  });

  it("signale une répartition qui n'a plus d'objet", async () => {
    rendre(compte({ parts_applications: { sophia: 70, unswipe: 30 } }), [CINEMA]);
    expect(
      await screen.findByText(/labels de ce compte ne servent plus|labels no longer serve/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réinitialiser|Reset/ })).toBeInTheDocument();
  });

  it("avant 0256 : l'erreur reste dans le bloc", async () => {
    listerLiensLabels.mockRejectedValue(new Error('relation "label_applications" does not exist'));
    rendre(compte(), [CLEAN]);
    expect(await screen.findByText(/label_applications/)).toBeInTheDocument();
  });
});
