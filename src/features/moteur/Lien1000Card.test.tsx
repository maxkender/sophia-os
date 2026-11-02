import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import i18n from "@/locales";

// jsdom n'a pas PointerEvent ; l'interrupteur (base-ui) en construit un au clic.
if (typeof window.PointerEvent === "undefined") {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

const lister = vi.fn();
const envoyer = vi.fn();
const lireAuto = vi.fn();
const ecrireAuto = vi.fn();

vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("@/features/moteur/lien1000", async (importer) => ({
  ...(await importer<typeof import("./lien1000")>()),
  listerLien1000: () => lister(),
  envoyerLien1000: () => envoyer(),
  lireEnvoiAutoLien1000: () => lireAuto(),
  ecrireEnvoiAutoLien1000: (v: boolean) => ecrireAuto(v),
}));

import { Lien1000Card } from "./Lien1000Card";

const base = {
  poster: "Lea Klar",
  langue: "de",
  bio_lien: null,
  application: "sophia",
  lien: "taap.it/sophia",
  message_at: null,
  relance_at: null,
  fait_at: null,
  releve_at: "2026-10-20T22:00:00Z",
};

const LIGNES = [
  { ...base, compte_id: "c1", handle: "lea.klarheit", abonnes: 1500, action: "message" },
  { ...base, compte_id: "c2", handle: "lea.studium381", abonnes: 1200, application: "micabo", lien: "taap.it/micabo", bio_lien: "https://taap.it/micabo", action: "lien_en_place" },
  { ...base, compte_id: "c3", handle: "asya.akilli518", abonnes: 2000, application: "unswipe", lien: "taap.it/unswipe", action: "message" },
];

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Lien1000Card />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Lien1000Card", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    lister.mockResolvedValue(LIGNES);
    envoyer.mockResolvedValue([]);
    lireAuto.mockResolvedValue(false);
    ecrireAuto.mockResolvedValue(undefined);
    await i18n.changeLanguage("fr");
  });

  it("la liste à blanc : ce qui partirait d'abord, le lien attendu et l'actuel", async () => {
    rendre();
    const carte = await screen.findByTestId("carte-lien-1000");
    await waitFor(() => expect(within(carte).getByText("À envoyer · 2")).toBeInTheDocument());
    expect(within(carte).getByText("Lien déjà en place · 1")).toBeInTheDocument();
    expect(within(carte).getByText(/Envoi éteint/)).toBeInTheDocument();
    const lignes = within(carte).getAllByTestId(/^lien-1000-/);
    expect(lignes.map((l) => l.getAttribute("data-testid"))).toEqual([
      "lien-1000-asya.akilli518",
      "lien-1000-lea.klarheit",
      "lien-1000-lea.studium381",
    ]);
    expect(within(lignes[0]).getByText("taap.it/unswipe")).toBeInTheDocument();
    expect(within(lignes[2]).getByText("https://taap.it/micabo")).toBeInTheDocument();
    expect(within(lignes[0]).getByRole("link")).toHaveAttribute("href", "/admin/createurs/c3");
  });

  it("envoyer demande confirmation, puis envoie", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    rendre();
    const bouton = await screen.findByRole("button", { name: "Envoyer maintenant (2)" });
    fireEvent.click(bouton);
    expect(envoyer).not.toHaveBeenCalled();
    fireEvent.click(bouton);
    await waitFor(() => expect(envoyer).toHaveBeenCalledTimes(1));
    expect(confirmer).toHaveBeenCalledTimes(2);
  });

  it("l'interrupteur allume l'envoi automatique", async () => {
    rendre();
    const carte = await screen.findByTestId("carte-lien-1000");
    const interrupteur = within(carte).getByRole("switch");
    await waitFor(() => expect(interrupteur).not.toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(interrupteur);
    await waitFor(() => expect(ecrireAuto).toHaveBeenCalledWith(true));
  });
});
