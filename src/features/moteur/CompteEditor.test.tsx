import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { CompteAvecDetails } from "@/features/moteur/types";

const majCompte = vi.fn(async () => {});
const majUpwork = vi.fn(async () => {});

vi.mock("@/features/moteur/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/api")>()),
  majCompte: (...args: unknown[]) => majCompte(...(args as [])),
  majUpwork: (...args: unknown[]) => majUpwork(...(args as [])),
  listerLanguesReference: async () => ["fr", "pt", "es"],
}));

import { InfosCompte } from "./CompteEditor";

function compte(over: Partial<CompteAvecDetails> = {}): CompteAvecDetails {
  return {
    id: "c1",
    poster_id: "p1",
    persona_nom: "Ines Martin",
    handle_tiktok: "ines.savoir817",
    handle_instagram: null,
    langue: "fr",
    profiles: { upwork_url: null },
    ...over,
  } as CompteAvecDetails;
}

function afficher(c: CompteAvecDetails) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (x: CompteAvecDetails) => (
    <QueryClientProvider client={client}>
      <InfosCompte compte={x} />
    </QueryClientProvider>
  );
  const rendu = render(ui(c));
  return { rerender: (x: CompteAvecDetails) => rendu.rerender(ui(x)) };
}

describe("InfosCompte", () => {
  it("langue changée ailleurs : pas de « Save » qui la remettrait", async () => {
    await i18n.changeLanguage("en");
    const { rerender } = afficher(compte());
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

    // Le sélecteur « Poster's language » de la fiche a enregistré « pt ».
    rerender(compte({ langue: "pt" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
  });

  it("n'envoie que le champ modifié", async () => {
    await i18n.changeLanguage("en");
    majCompte.mockClear();
    afficher(compte({ langue: "pt" }));

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Ines M." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(majCompte).toHaveBeenCalledWith("c1", { persona_nom: "Ines M." }));
  });
});
